import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MemoryStorageAdapter,
  LocalStorageAdapter,
  isLocalStorageAvailable,
  createDefaultStorageAdapter,
} from '../src/adapters/storage-adapter';
import { TtlStorage } from '../src/ttl-storage';

describe('Storage Adapters & SSR Fallbacks', () => {
  describe('MemoryStorageAdapter', () => {
    let adapter: MemoryStorageAdapter;

    beforeEach(() => {
      adapter = new MemoryStorageAdapter();
    });

    it('should set, get, and delete values', () => {
      expect(adapter.getItem('a')).toBeNull();
      adapter.setItem('a', 'apple');
      expect(adapter.getItem('a')).toBe('apple');
      expect(adapter.length).toBe(1);

      adapter.removeItem('a');
      expect(adapter.getItem('a')).toBeNull();
      expect(adapter.length).toBe(0);
    });

    it('should clear all values', () => {
      adapter.setItem('a', '1');
      adapter.setItem('b', '2');
      expect(adapter.length).toBe(2);

      adapter.clear();
      expect(adapter.length).toBe(0);
      expect(adapter.getItem('a')).toBeNull();
      expect(adapter.getItem('b')).toBeNull();
    });

    it('should support key(index) access', () => {
      adapter.setItem('first', '1');
      adapter.setItem('second', '2');

      expect(adapter.key(0)).toBe('first');
      expect(adapter.key(1)).toBe('second');
      expect(adapter.key(2)).toBeNull();
      expect(adapter.key(-1)).toBeNull();
    });
  });

  describe('isLocalStorageAvailable & createDefaultStorageAdapter', () => {
    const originalWindow = globalThis.window;

    afterEach(() => {
      if (originalWindow === undefined) {
        // @ts-expect-error cleanup
        delete globalThis.window;
      } else {
        globalThis.window = originalWindow;
      }
    });

    it('should return false when window is undefined (SSR / Node.js)', () => {
      // @ts-expect-error simulate SSR
      delete globalThis.window;
      expect(isLocalStorageAvailable()).toBe(false);
    });

    it('should automatically fall back to MemoryStorageAdapter in SSR', () => {
      // @ts-expect-error simulate SSR
      delete globalThis.window;

      const adapter = createDefaultStorageAdapter(true);
      expect(adapter).toBeInstanceOf(MemoryStorageAdapter);

      const storage = new TtlStorage();
      expect(storage.isUsingMemoryFallback()).toBe(true);
    });

    it('should throw when localStorage is unavailable and fallbackToMemory is false', () => {
      // @ts-expect-error simulate SSR
      delete globalThis.window;

      expect(() => createDefaultStorageAdapter(false)).toThrow(
        /localStorage is not available/
      );
    });

    it('should return false if localStorage probe throws (e.g. Safari Private Mode)', () => {
      const mockStorage = {
        setItem: vi.fn().mockImplementation(() => {
          throw new Error('SecurityError: The operation is insecure.');
        }),
        getItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        key: vi.fn(),
        length: 0,
      };

      // @ts-expect-error mock window
      globalThis.window = {
        localStorage: mockStorage,
      };

      expect(isLocalStorageAvailable()).toBe(false);
    });

    it('should return true when localStorage is fully working in browser', () => {
      const map = new Map<string, string>();
      const workingStorage = {
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => map.set(k, String(v)),
        removeItem: (k: string) => map.delete(k),
        clear: () => map.clear(),
        key: (i: number) => Array.from(map.keys())[i] ?? null,
        get length() {
          return map.size;
        },
      };

      // @ts-expect-error mock window
      globalThis.window = {
        localStorage: workingStorage,
      };

      expect(isLocalStorageAvailable()).toBe(true);

      const adapter = createDefaultStorageAdapter(true);
      expect(adapter).toBeInstanceOf(LocalStorageAdapter);
    });
  });

  describe('LocalStorageAdapter with mocked window.localStorage', () => {
    let map: Map<string, string>;
    let mockStorage: Storage;

    beforeEach(() => {
      map = new Map<string, string>();
      mockStorage = {
        getItem: vi.fn((k: string) => map.get(k) ?? null),
        setItem: vi.fn((k: string, v: string) => {
          map.set(k, String(v));
        }),
        removeItem: vi.fn((k: string) => {
          map.delete(k);
        }),
        clear: vi.fn(() => {
          map.clear();
        }),
        key: vi.fn((i: number) => Array.from(map.keys())[i] ?? null),
        get length() {
          return map.size;
        },
      } as unknown as Storage;

      // @ts-expect-error mock window
      globalThis.window = {
        localStorage: mockStorage,
      };
    });

    afterEach(() => {
      // @ts-expect-error cleanup
      delete globalThis.window;
    });

    it('should proxy calls to window.localStorage', () => {
      const adapter = new LocalStorageAdapter();

      adapter.setItem('key1', 'val1');
      expect(mockStorage.setItem).toHaveBeenCalledWith('key1', 'val1');

      expect(adapter.getItem('key1')).toBe('val1');
      expect(mockStorage.getItem).toHaveBeenCalledWith('key1');

      expect(adapter.length).toBe(1);
      expect(adapter.key(0)).toBe('key1');

      adapter.removeItem('key1');
      expect(mockStorage.removeItem).toHaveBeenCalledWith('key1');
      expect(adapter.getItem('key1')).toBeNull();

      adapter.setItem('k2', 'v2');
      adapter.clear();
      expect(mockStorage.clear).toHaveBeenCalled();
      expect(adapter.length).toBe(0);
    });

    it('should safely handle exceptions from rawStorage calls', () => {
      const throwingStorage = {
        getItem: vi.fn().mockImplementation(() => {
          throw new Error('Quota or Access denied');
        }),
        setItem: vi.fn().mockImplementation(() => {
          throw new Error('Access denied');
        }),
        removeItem: vi.fn().mockImplementation(() => {
          throw new Error('Access denied');
        }),
        clear: vi.fn().mockImplementation(() => {
          throw new Error('Access denied');
        }),
        key: vi.fn().mockImplementation(() => {
          throw new Error('Access denied');
        }),
        get length() {
          throw new Error('Access denied');
        },
      };

      // @ts-expect-error mock window
      globalThis.window = { localStorage: throwingStorage };

      const adapter = new LocalStorageAdapter();

      expect(adapter.getItem('any')).toBeNull();
      expect(() => adapter.removeItem('any')).not.toThrow();
      expect(() => adapter.clear()).not.toThrow();
      expect(adapter.key(0)).toBeNull();
      expect(adapter.length).toBe(0);
    });

    it('should throw descriptive error if rawStorage accessed when window is undefined', () => {
      // @ts-expect-error cleanup
      delete globalThis.window;

      const adapter = new LocalStorageAdapter();
      expect(() => adapter.setItem('a', 'b')).toThrow(/window\.localStorage is not accessible/);
    });
  });
});
