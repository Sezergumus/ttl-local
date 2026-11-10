import type { StorageAdapter } from '../types';

/**
 * In-memory storage adapter that mimics Web Storage (Storage).
 * Useful for SSR (Node.js/Next.js/Nuxt), unit tests, or environments where localStorage is disabled or restricted.
 */
export class MemoryStorageAdapter implements StorageAdapter {
  private readonly store = new Map<string, string>();

  public getItem(key: string): string | null {
    const value = this.store.get(key);
    return value !== undefined ? value : null;
  }

  public setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  public removeItem(key: string): void {
    this.store.delete(key);
  }

  public clear(): void {
    this.store.clear();
  }

  public key(index: number): string | null {
    if (index < 0 || index >= this.store.size) {
      return null;
    }
    const keys = Array.from(this.store.keys());
    return keys[index] ?? null;
  }

  public get length(): number {
    return this.store.size;
  }
}

/**
 * Checks whether Web Storage (localStorage) is accessible and operational in the current environment.
 * Performs a safe write/read/remove probe to catch security exceptions (e.g., Safari private mode or disabled cookies).
 */
export function isLocalStorageAvailable(): boolean {
  try {
    if (typeof window === 'undefined' || !('localStorage' in window)) {
      return false;
    }
    const storage = window.localStorage;
    if (!storage) {
      return false;
    }
    const probeKey = '__ttl_local_probe__';
    storage.setItem(probeKey, '1');
    const probeVal = storage.getItem(probeKey);
    storage.removeItem(probeKey);
    return probeVal === '1';
  } catch {
    return false;
  }
}

/**
 * Wrapper for the native `window.localStorage`.
 * Ensures safe interaction and consistent StorageAdapter interface.
 */
export class LocalStorageAdapter implements StorageAdapter {
  private get rawStorage(): Storage {
    if (typeof window === 'undefined' || !window.localStorage) {
      throw new Error(
        'window.localStorage is not accessible in this environment. Ensure code is running in a browser or enable memory fallback.'
      );
    }
    return window.localStorage;
  }

  public getItem(key: string): string | null {
    try {
      return this.rawStorage.getItem(key);
    } catch {
      return null;
    }
  }

  public setItem(key: string, value: string): void {
    this.rawStorage.setItem(key, String(value));
  }

  public removeItem(key: string): void {
    try {
      this.rawStorage.removeItem(key);
    } catch {
      // Ignored for safety in restricted environments
    }
  }

  public clear(): void {
    try {
      this.rawStorage.clear();
    } catch {
      // Ignored for safety in restricted environments
    }
  }

  public key(index: number): string | null {
    try {
      return this.rawStorage.key(index);
    } catch {
      return null;
    }
  }

  public get length(): number {
    try {
      return this.rawStorage.length;
    } catch {
      return 0;
    }
  }
}

/**
 * Resolves the appropriate storage adapter based on environment capability and configuration.
 *
 * @param fallbackToMemory - Whether to automatically use MemoryStorageAdapter if localStorage is unavailable.
 * @returns An initialized StorageAdapter.
 */
export function createDefaultStorageAdapter(fallbackToMemory = true): StorageAdapter {
  if (isLocalStorageAvailable()) {
    return new LocalStorageAdapter();
  }

  if (fallbackToMemory) {
    return new MemoryStorageAdapter();
  }

  throw new Error(
    'localStorage is not available in the current environment and fallbackToMemory is disabled.'
  );
}
