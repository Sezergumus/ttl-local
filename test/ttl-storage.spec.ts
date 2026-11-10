import { describe, it, expect, beforeEach } from 'vitest';
import { TtlStorage } from '../src/ttl-storage';
import { MemoryStorageAdapter } from '../src/adapters/storage-adapter';

describe('TtlStorage - Core & TTL Operations', () => {
  let mockTime = 1000000;
  let customStorage: MemoryStorageAdapter;
  let storage: TtlStorage;

  beforeEach(() => {
    mockTime = 1000000;
    customStorage = new MemoryStorageAdapter();
    storage = new TtlStorage({
      storage: customStorage,
      prefix: 'test:',
      now: () => mockTime,
    });
  });

  describe('setItem & getItem', () => {
    it('should store and retrieve primitive string values', () => {
      storage.setItem('greeting', 'hello world', 5000);
      expect(storage.getItem<string>('greeting')).toBe('hello world');
    });

    it('should store and retrieve complex objects with generics', () => {
      interface UserProfile {
        id: number;
        name: string;
        roles: string[];
      }

      const user: UserProfile = {
        id: 42,
        name: 'Alice',
        roles: ['admin', 'editor'],
      };

      storage.setItem<UserProfile>('user:42', user, 10000);
      const retrieved = storage.getItem<UserProfile>('user:42');

      expect(retrieved).toEqual(user);
      expect(retrieved?.id).toBe(42);
      expect(retrieved?.roles).toContain('admin');
    });

    it('should store boolean, number, and null values', () => {
      storage.setItem('flag', true, 5000);
      storage.setItem('count', 12345, 5000);
      storage.setItem('empty', null, 5000);

      expect(storage.getItem<boolean>('flag')).toBe(true);
      expect(storage.getItem<number>('count')).toBe(12345);
      expect(storage.getItem<null>('empty')).toBeNull();
    });

    it('should return null for non-existent keys', () => {
      expect(storage.getItem('non_existent')).toBeNull();
    });

    it('should return value before expiration and null after expiration', () => {
      storage.setItem('temp', 'fleeting value', 1000); // Expires at mockTime + 1000

      // Advance by 500ms - still valid
      mockTime += 500;
      expect(storage.getItem('temp')).toBe('fleeting value');

      // Advance to exact expiration timestamp (1000ms elapsed) - should be expired
      mockTime += 500;
      expect(storage.getItem('temp')).toBeNull();

      // Underlying key should be automatically deleted
      expect(customStorage.getItem('test:temp')).toBeNull();
    });

    it('should automatically delete expired items from the underlying adapter on read', () => {
      storage.setItem('key1', 'val1', 200);
      expect(customStorage.getItem('test:key1')).not.toBeNull();

      // Advance time beyond TTL
      mockTime += 201;

      const result = storage.getItem('key1');
      expect(result).toBeNull();
      expect(customStorage.getItem('test:key1')).toBeNull();
    });

    it('should handle item with 0 TTL as immediately expired', () => {
      storage.setItem('zero_ttl', 'instant', 0);
      expect(storage.getItem('zero_ttl')).toBeNull();
    });

    it('should support indefinite storage when ttlMs is Infinity', () => {
      storage.setItem('infinite', 'forever', Infinity);
      mockTime += 10000000000;
      expect(storage.getItem('infinite')).toBe('forever');
    });

    it('should use defaultTtlMs when ttlMs is not provided', () => {
      const storageWithDefault = new TtlStorage({
        storage: customStorage,
        prefix: 'def:',
        defaultTtlMs: 3000,
        now: () => mockTime,
      });

      storageWithDefault.setItem('auto', 'value');

      // Advance 2000ms -> still valid
      mockTime += 2000;
      expect(storageWithDefault.getItem('auto')).toBe('value');

      // Advance another 1001ms -> expired
      mockTime += 1001;
      expect(storageWithDefault.getItem('auto')).toBeNull();
    });
  });

  describe('removeItem', () => {
    it('should delete existing items', () => {
      storage.setItem('to_delete', 'value', 5000);
      expect(storage.getItem('to_delete')).toBe('value');

      storage.removeItem('to_delete');
      expect(storage.getItem('to_delete')).toBeNull();
      expect(customStorage.getItem('test:to_delete')).toBeNull();
    });

    it('should not throw when deleting non-existent key', () => {
      expect(() => storage.removeItem('does_not_exist')).not.toThrow();
    });
  });

  describe('clear', () => {
    it('should clear only keys matching its prefix and preserve others', () => {
      storage.setItem('item1', 'val1', 5000);
      storage.setItem('item2', 'val2', 5000);

      // Foreign key in underlying storage
      customStorage.setItem('other:app_data', 'keep_me');
      customStorage.setItem('unprefixed', 'also_keep');

      expect(storage.getItem('item1')).toBe('val1');
      expect(storage.getItem('item2')).toBe('val2');

      storage.clear();

      expect(storage.getItem('item1')).toBeNull();
      expect(storage.getItem('item2')).toBeNull();
      expect(customStorage.getItem('other:app_data')).toBe('keep_me');
      expect(customStorage.getItem('unprefixed')).toBe('also_keep');
    });

    it('should wipe entire storage when prefix is empty string', () => {
      const fullStorage = new TtlStorage({
        storage: customStorage,
        prefix: '',
        now: () => mockTime,
      });

      fullStorage.setItem('itemA', 'valA', 5000);
      customStorage.setItem('external', 'valExternal');

      fullStorage.clear();

      expect(customStorage.getItem('itemA')).toBeNull();
      expect(customStorage.getItem('external')).toBeNull();
    });
  });

  describe('has', () => {
    it('should return true if active key exists', () => {
      storage.setItem('exists', 'yes', 5000);
      expect(storage.has('exists')).toBe(true);
    });

    it('should return false if key does not exist', () => {
      expect(storage.has('nope')).toBe(false);
    });

    it('should return false and purge if key has expired', () => {
      storage.setItem('expiring', 'bye', 100);
      mockTime += 150;
      expect(storage.has('expiring')).toBe(false);
      expect(customStorage.getItem('test:expiring')).toBeNull();
    });
  });

  describe('getRemainingTTL & getWithExpiry', () => {
    it('should return remaining TTL in milliseconds', () => {
      storage.setItem('timed', 'value', 5000);

      expect(storage.getRemainingTTL('timed')).toBe(5000);

      mockTime += 1500;
      expect(storage.getRemainingTTL('timed')).toBe(3500);
    });

    it('should return Infinity for persistent items without expiration', () => {
      storage.setItem('permanent', 'value', Infinity);
      expect(storage.getRemainingTTL('permanent')).toBe(Infinity);
    });

    it('should return null for expired or missing items', () => {
      expect(storage.getRemainingTTL('missing')).toBeNull();

      storage.setItem('soon', 'val', 200);
      mockTime += 300;
      expect(storage.getRemainingTTL('soon')).toBeNull();
    });

    it('should return full metadata using getWithExpiry', () => {
      storage.setItem('meta_test', { foo: 'bar' }, 4000);
      const meta = storage.getWithExpiry<{ foo: string }>('meta_test');

      expect(meta).not.toBeNull();
      expect(meta?.value).toEqual({ foo: 'bar' });
      expect(meta?.createdAt).toBe(1000000);
      expect(meta?.expiresAt).toBe(1004000);
      expect(meta?.remainingMs).toBe(4000);
    });

    it('should return null from getWithExpiry if expired', () => {
      storage.setItem('expire_meta', 'data', 100);
      mockTime += 150;
      expect(storage.getWithExpiry('expire_meta')).toBeNull();
    });
  });

  describe('touch', () => {
    it('should extend TTL for active items', () => {
      storage.setItem('session', 'active_user', 1000);

      mockTime += 800; // 200ms remaining
      expect(storage.getRemainingTTL('session')).toBe(200);

      // Extend by 5000ms
      const success = storage.touch('session', 5000);
      expect(success).toBe(true);

      expect(storage.getRemainingTTL('session')).toBe(5000);

      // Advance by another 1000ms (would have expired previously)
      mockTime += 1000;
      expect(storage.getItem('session')).toBe('active_user');
      expect(storage.getRemainingTTL('session')).toBe(4000);
    });

    it('should return false when touching non-existent or expired item', () => {
      expect(storage.touch('missing_key', 1000)).toBe(false);

      storage.setItem('already_dead', 'val', 100);
      mockTime += 200;
      expect(storage.touch('already_dead', 1000)).toBe(false);
    });
  });

  describe('prune & getAllKeys', () => {
    it('should purge all expired keys and return count of pruned items', () => {
      storage.setItem('alive1', 'v1', 10000);
      storage.setItem('dead1', 'v2', 500);
      storage.setItem('dead2', 'v3', 800);
      storage.setItem('alive2', 'v4', 20000);

      mockTime += 1000; // dead1 and dead2 are now expired

      const prunedCount = storage.prune();
      expect(prunedCount).toBe(2);

      expect(storage.getItem('alive1')).toBe('v1');
      expect(storage.getItem('alive2')).toBe('v4');
      expect(customStorage.getItem('test:dead1')).toBeNull();
      expect(customStorage.getItem('test:dead2')).toBeNull();
    });

    it('should return list of all active user keys (without prefix)', () => {
      storage.setItem('k1', 'v1', 5000);
      storage.setItem('k2', 'v2', 5000);
      storage.setItem('expired_k', 'v3', 500);

      mockTime += 600;

      const keys = storage.getAllKeys();
      expect(keys.sort()).toEqual(['k1', 'k2']);
    });

    it('should return all keys when prefix is empty string', () => {
      const unprefixedStorage = new TtlStorage({
        storage: customStorage,
        prefix: '',
        now: () => mockTime,
      });

      unprefixedStorage.setItem('u1', 'val1', 5000);
      unprefixedStorage.setItem('u2', 'val2', 5000);

      expect(unprefixedStorage.getAllKeys().sort()).toEqual(['u1', 'u2']);
    });
  });

  describe('Prefix & Namespace isolation', () => {
    it('should isolate keys between instances with different prefixes', () => {
      const storeA = new TtlStorage({
        storage: customStorage,
        prefix: 'appA:',
        now: () => mockTime,
      });

      const storeB = new TtlStorage({
        storage: customStorage,
        prefix: 'appB:',
        now: () => mockTime,
      });

      storeA.setItem('theme', 'dark', 5000);
      storeB.setItem('theme', 'light', 5000);

      expect(storeA.getItem('theme')).toBe('dark');
      expect(storeB.getItem('theme')).toBe('light');

      storeA.clear();
      expect(storeA.getItem('theme')).toBeNull();
      expect(storeB.getItem('theme')).toBe('light');
    });

    it('should return configured prefix', () => {
      expect(storage.getPrefix()).toBe('test:');
    });
  });
});
