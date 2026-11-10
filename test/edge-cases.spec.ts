import { describe, it, expect, beforeEach } from 'vitest';
import { TtlStorage } from '../src/ttl-storage';
import { MemoryStorageAdapter } from '../src/adapters/storage-adapter';

describe('Edge Cases, Validation & Error Handling', () => {
  let customStorage: MemoryStorageAdapter;
  let storage: TtlStorage;

  beforeEach(() => {
    customStorage = new MemoryStorageAdapter();
    storage = new TtlStorage({
      storage: customStorage,
      prefix: 'edge:',
    });
  });

  describe('Key validation', () => {
    it('should throw TypeError on invalid or empty keys', () => {
      // @ts-expect-error test runtime validation
      expect(() => storage.setItem('', 'val', 1000)).toThrow(TypeError);
      // @ts-expect-error test runtime validation
      expect(() => storage.setItem('   ', 'val', 1000)).toThrow(TypeError);
      // @ts-expect-error test runtime validation
      expect(() => storage.setItem(null, 'val', 1000)).toThrow(TypeError);
      // @ts-expect-error test runtime validation
      expect(() => storage.setItem(123, 'val', 1000)).toThrow(TypeError);
      // @ts-expect-error test runtime validation
      expect(() => storage.setItem({}, 'val', 1000)).toThrow(TypeError);

      // @ts-expect-error test runtime validation
      expect(() => storage.getItem('')).toThrow(TypeError);
      // @ts-expect-error test runtime validation
      expect(() => storage.removeItem('')).toThrow(TypeError);
      // @ts-expect-error test runtime validation
      expect(() => storage.touch('', 1000)).toThrow(TypeError);
      // @ts-expect-error test runtime validation
      expect(() => storage.getWithExpiry('')).toThrow(TypeError);
    });
  });

  describe('TTL validation', () => {
    it('should throw TypeError on invalid TTL values', () => {
      // @ts-expect-error test runtime validation
      expect(() => storage.setItem('key', 'val', -10)).toThrow(TypeError);
      // @ts-expect-error test runtime validation
      expect(() => storage.setItem('key', 'val', NaN)).toThrow(TypeError);
      // @ts-expect-error test runtime validation
      expect(() => storage.setItem('key', 'val', '1000')).toThrow(TypeError);

      // @ts-expect-error test runtime validation
      expect(() => storage.touch('key', -50)).toThrow(TypeError);
    });

    it('should throw TypeError if defaultTtlMs is negative or NaN in constructor', () => {
      expect(
        () => new TtlStorage({ storage: customStorage, defaultTtlMs: -100 })
      ).toThrow(TypeError);

      expect(
        () => new TtlStorage({ storage: customStorage, defaultTtlMs: NaN })
      ).toThrow(TypeError);
    });
  });

  describe('Serialization errors', () => {
    it('should throw TypeError when serializing circular references', () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;

      expect(() => storage.setItem('circ', circular, 5000)).toThrow(TypeError);
    });
  });

  describe('Corrupted data handling', () => {
    it('should clean up and return null when storage contains non-JSON corrupted data', () => {
      customStorage.setItem('edge:corrupt', '{not valid json');

      const result = storage.getItem('corrupt');
      expect(result).toBeNull();
      // Verify corrupted entry was deleted
      expect(customStorage.getItem('edge:corrupt')).toBeNull();
    });

    it('should clean up and return null when item is not a TTL envelope', () => {
      customStorage.setItem(
        'edge:foreign',
        JSON.stringify({ regularKey: 'unwrapped' })
      );

      const result = storage.getItem('foreign');
      expect(result).toBeNull();
      expect(customStorage.getItem('edge:foreign')).toBeNull();
    });

    it('should clean up and return null from getWithExpiry on corrupted data', () => {
      customStorage.setItem('edge:broken', '{invalid');
      expect(storage.getWithExpiry('broken')).toBeNull();
      expect(customStorage.getItem('edge:broken')).toBeNull();

      customStorage.setItem('edge:not_envelope', JSON.stringify({ a: 1 }));
      expect(storage.getWithExpiry('not_envelope')).toBeNull();
      expect(customStorage.getItem('edge:not_envelope')).toBeNull();
    });

    it('should purge corrupted entries during prune()', () => {
      customStorage.setItem('edge:bad1', '{corrupt1');
      customStorage.setItem('edge:bad2', '{corrupt2');

      const count = storage.prune();
      expect(count).toBe(2);
      expect(customStorage.getItem('edge:bad1')).toBeNull();
      expect(customStorage.getItem('edge:bad2')).toBeNull();
    });
  });

  describe('Custom serializers & deserializers', () => {
    it('should support custom serializer and deserializer', () => {
      const customStore = new TtlStorage({
        storage: customStorage,
        prefix: 'custom:',
        serialize: (val) => `prefix::${JSON.stringify(val)}`,
        deserialize: (str) => JSON.parse(str.replace(/^prefix::/, '')),
      });

      customStore.setItem('customKey', { secret: 'pass' }, 5000);
      const raw = customStorage.getItem('custom:customKey');
      expect(raw?.startsWith('prefix::{')).toBe(true);

      const retrieved = customStore.getItem<{ secret: string }>('customKey');
      expect(retrieved).toEqual({ secret: 'pass' });
    });
  });

  describe('QuotaExceededError recovery', () => {
    it('should auto-prune expired items and retry successfully when storage quota is exceeded', () => {
      let quotaTripped = false;
      let mockTime = 1000;

      const mockQuotaStorage = {
        store: new Map<string, string>(),
        getItem(k: string) {
          return this.store.get(k) ?? null;
        },
        setItem(k: string, v: string) {
          // If trying to set new key while expired key exists, simulate QuotaExceededError
          if (!quotaTripped && this.store.size >= 1) {
            quotaTripped = true;
            const err = new Error('QuotaExceededError');
            err.name = 'QuotaExceededError';
            throw err;
          }
          this.store.set(k, v);
        },
        removeItem(k: string) {
          this.store.delete(k);
        },
        clear() {
          this.store.clear();
        },
        key(i: number) {
          return Array.from(this.store.keys())[i] ?? null;
        },
        get length() {
          return this.store.size;
        },
      };

      const quotaStore = new TtlStorage({
        storage: mockQuotaStorage,
        prefix: 'quota:',
        now: () => mockTime,
      });

      // Set item 1 that expires in 100ms
      quotaStore.setItem('item1', 'old_val', 100);
      expect(mockQuotaStorage.length).toBe(1);

      // Advance time so item1 is now expired
      mockTime += 200;

      // Setting item2 will trigger QuotaExceededError, which prunes expired item1 and succeeds on retry!
      quotaStore.setItem('item2', 'new_val', 5000);

      expect(quotaStore.getItem('item2')).toBe('new_val');
      expect(mockQuotaStorage.getItem('quota:item1')).toBeNull();
    });

    it('should rethrow original QuotaExceededError if retry also throws', () => {
      let mockTime = 1000;
      let setAttempts = 0;

      const failingRetryStorage = {
        store: new Map<string, string>(),
        getItem(k: string) {
          return this.store.get(k) ?? null;
        },
        setItem() {
          setAttempts++;
          const err = new Error('Quota exceeded permanently');
          err.name = 'QuotaExceededError';
          throw err;
        },
        removeItem(k: string) {
          this.store.delete(k);
        },
        clear() {
          this.store.clear();
        },
        key(i: number) {
          return Array.from(this.store.keys())[i] ?? null;
        },
        get length() {
          return this.store.size;
        },
      };

      const failingStore = new TtlStorage({
        storage: failingRetryStorage,
        prefix: 'fail:',
        now: () => mockTime,
      });

      // Manually plant an expired item so prune() returns > 0
      failingRetryStorage.store.set(
        'fail:old',
        JSON.stringify({ value: 1, expiresAt: 500, createdAt: 100, __ttl__: true })
      );

      expect(() => failingStore.setItem('newKey', 'value', 1000)).toThrow(
        /Quota exceeded permanently/
      );
      expect(setAttempts).toBe(2); // First attempt + 1 retry
    });

    it('should safely handle keys that return null during prune', () => {
      const mockStorage = {
        store: new Map<string, string>([['test:phantom', '']]),
        getItem() {
          return null; // Simulate key disappearing concurrently
        },
        setItem() {},
        removeItem() {},
        clear() {},
        key(i: number) {
          return i === 0 ? 'test:phantom' : null;
        },
        length: 1,
      };

      const store = new TtlStorage({
        storage: mockStorage,
        prefix: 'test:',
      });

      expect(store.prune()).toBe(0);
    });

    it('should rethrow non-quota errors immediately', () => {
      const errorStorage = {
        getItem: () => null,
        setItem: () => {
          throw new Error('Disk IO failure');
        },
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        length: 0,
      };

      const errorStore = new TtlStorage({ storage: errorStorage });
      expect(() => errorStore.setItem('test', 'data', 1000)).toThrow(
        'Disk IO failure'
      );
    });

    it('should handle non-Error thrown exceptions during setItem', () => {
      const stringThrowStorage = {
        getItem: () => null,
        setItem: () => {
          // eslint-disable-next-line @typescript-eslint/no-throw-literal
          throw 'String exception';
        },
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        length: 0,
      };

      const throwStore = new TtlStorage({ storage: stringThrowStorage });
      expect(() => throwStore.setItem('test', 'data', 1000)).toThrow(
        'String exception'
      );
    });

    it('should recognize NS_ERROR_DOM_QUOTA_REACHED and code 22 as Quota errors', () => {
      let throwGecko = false;
      let throwCode22 = false;
      let mockTime = 1000;

      const geckoQuotaStorage = {
        store: new Map<string, string>(),
        getItem(k: string) {
          return this.store.get(k) ?? null;
        },
        setItem(k: string, v: string) {
          if (throwGecko) {
            throwGecko = false;
            const err = new Error('Firefox quota reached');
            err.name = 'NS_ERROR_DOM_QUOTA_REACHED';
            throw err;
          }
          if (throwCode22) {
            throwCode22 = false;
            const err = new Error('Legacy quota reached');
            (err as unknown as { code: number }).code = 22;
            throw err;
          }
          this.store.set(k, v);
        },
        removeItem(k: string) {
          this.store.delete(k);
        },
        clear() {
          this.store.clear();
        },
        key(i: number) {
          return Array.from(this.store.keys())[i] ?? null;
        },
        get length() {
          return this.store.size;
        },
      };

      const geckoStore = new TtlStorage({
        storage: geckoQuotaStorage,
        prefix: 'gecko:',
        now: () => mockTime,
      });

      // 1. Set item to expire
      geckoStore.setItem('old1', 'val', 100);
      mockTime += 200; // expired

      // 2. Enable gecko quota throw, set new1 -> catches quota error, prunes old1, retries and succeeds!
      throwGecko = true;
      geckoStore.setItem('new1', 'val1', 1000);
      expect(geckoStore.getItem('new1')).toBe('val1');

      // 3. Set another to expire
      geckoStore.setItem('old2', 'val', 100);
      mockTime += 200; // expired

      // 4. Enable code 22 throw, set new2 -> catches quota error, prunes old2, retries and succeeds!
      throwCode22 = true;
      geckoStore.setItem('new2', 'val2', 1000);
      expect(geckoStore.getItem('new2')).toBe('val2');
    });
  });
});
