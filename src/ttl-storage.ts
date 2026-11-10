import type {
  StorageAdapter,
  StorageEnvelope,
  StorageItemWithMeta,
  TtlStorageOptions,
} from './types';
import {
  createDefaultStorageAdapter,
  MemoryStorageAdapter,
} from './adapters/storage-adapter';

/**
 * Production-ready, zero-dependency localStorage wrapper with Time-to-Live (TTL) expiration support.
 * Features safe SSR fallback, custom prefixes, automatic cleanup, and strict TypeScript generics.
 */
export class TtlStorage {
  private readonly storage: StorageAdapter;
  private readonly prefix: string;
  private readonly defaultTtlMs?: number;
  private readonly serialize: (value: unknown) => string;
  private readonly deserialize: (raw: string) => unknown;
  private readonly now: () => number;

  /**
   * Creates a new instance of TtlStorage.
   *
   * @param options - Configuration options for the storage wrapper.
   */
  constructor(options: TtlStorageOptions = {}) {
    const {
      prefix = 'ttl:',
      storage,
      fallbackToMemory = true,
      defaultTtlMs,
      serialize = JSON.stringify,
      deserialize = JSON.parse,
      now = Date.now,
    } = options;

    if (defaultTtlMs !== undefined) {
      this.validateTtl(defaultTtlMs, 'defaultTtlMs');
    }

    this.prefix = prefix;
    this.defaultTtlMs = defaultTtlMs;
    this.serialize = serialize;
    this.deserialize = deserialize;
    this.now = now;

    if (storage) {
      this.storage = storage;
    } else {
      this.storage = createDefaultStorageAdapter(fallbackToMemory);
    }
  }

  /**
   * Stores a value in storage wrapped with an expiration timestamp.
   *
   * @template T - The type of value being stored.
   * @param key - Unique identifier for the item.
   * @param value - Any serializable value to store.
   * @param ttlMs - Time-to-live in milliseconds. If omitted, uses `defaultTtlMs` (or persists indefinitely).
   * @throws {TypeError} If key is invalid or ttlMs is not a non-negative number.
   */
  public setItem<T = unknown>(key: string, value: T, ttlMs?: number): void {
    this.validateKey(key);

    const effectiveTtl = ttlMs !== undefined ? ttlMs : this.defaultTtlMs;
    if (effectiveTtl !== undefined) {
      this.validateTtl(effectiveTtl, 'ttlMs');
    }

    const currentTime = this.now();
    const expiresAt =
      effectiveTtl !== undefined && Number.isFinite(effectiveTtl)
        ? currentTime + effectiveTtl
        : null;

    const envelope: StorageEnvelope<T> = {
      value,
      expiresAt,
      createdAt: currentTime,
      __ttl__: true,
    };

    let serialized: string;
    try {
      serialized = this.serialize(envelope);
    } catch (err) {
      throw new TypeError(
        `Failed to serialize value for key "${key}": ${(err as Error).message}`
      );
    }

    const storageKey = this.toStorageKey(key);

    try {
      this.storage.setItem(storageKey, serialized);
    } catch (err) {
      // If quota is exceeded, prune expired keys and retry once
      if (this.isQuotaExceededError(err)) {
        const prunedCount = this.prune();
        if (prunedCount > 0) {
          try {
            this.storage.setItem(storageKey, serialized);
            return;
          } catch {
            // Re-throw original if retry still fails
          }
        }
      }
      throw err;
    }
  }

  /**
   * Reads a value from storage.
   * If the item has expired, it is automatically removed from storage and `null` is returned.
   *
   * @template T - Expected type of the stored value.
   * @param key - Unique identifier for the item.
   * @returns The stored value if active, or `null` if expired or not found.
   * @throws {TypeError} If key is invalid.
   */
  public getItem<T = unknown>(key: string): T | null {
    this.validateKey(key);
    const storageKey = this.toStorageKey(key);

    const raw = this.storage.getItem(storageKey);
    if (raw === null) {
      return null;
    }

    let envelope: StorageEnvelope<T>;
    try {
      envelope = this.deserialize(raw) as StorageEnvelope<T>;
    } catch {
      // Corrupted non-JSON data under this key; clean up and return null
      this.storage.removeItem(storageKey);
      return null;
    }

    if (!envelope || typeof envelope !== 'object' || !envelope.__ttl__) {
      // Non-envelope data; clean up and return null
      this.storage.removeItem(storageKey);
      return null;
    }

    // Check expiration
    if (envelope.expiresAt !== null && this.now() >= envelope.expiresAt) {
      this.storage.removeItem(storageKey);
      return null;
    }

    return envelope.value;
  }

  /**
   * Reads a value from storage along with its full expiration metadata.
   * Automatically deletes and returns `null` if the item has expired.
   *
   * @template T - Expected type of the stored value.
   * @param key - Unique identifier for the item.
   * @returns StorageItemWithMeta containing value, expiresAt, createdAt, and remainingMs, or `null`.
   */
  public getWithExpiry<T = unknown>(key: string): StorageItemWithMeta<T> | null {
    this.validateKey(key);
    const storageKey = this.toStorageKey(key);

    const raw = this.storage.getItem(storageKey);
    if (raw === null) {
      return null;
    }

    let envelope: StorageEnvelope<T>;
    try {
      envelope = this.deserialize(raw) as StorageEnvelope<T>;
    } catch {
      this.storage.removeItem(storageKey);
      return null;
    }

    if (!envelope || typeof envelope !== 'object' || !envelope.__ttl__) {
      this.storage.removeItem(storageKey);
      return null;
    }

    const currentTime = this.now();
    if (envelope.expiresAt !== null && currentTime >= envelope.expiresAt) {
      this.storage.removeItem(storageKey);
      return null;
    }

    const remainingMs =
      envelope.expiresAt !== null
        ? Math.max(0, envelope.expiresAt - currentTime)
        : null;

    return {
      value: envelope.value,
      expiresAt: envelope.expiresAt,
      createdAt: envelope.createdAt,
      remainingMs,
    };
  }

  /**
   * Deletes the item identified by the key from storage.
   *
   * @param key - Unique identifier of the item to remove.
   * @throws {TypeError} If key is invalid.
   */
  public removeItem(key: string): void {
    this.validateKey(key);
    const storageKey = this.toStorageKey(key);
    this.storage.removeItem(storageKey);
  }

  /**
   * Clears all keys managed by this TtlStorage instance (matching its prefix).
   * Non-prefixed keys or keys belonging to other applications/namespaces are preserved safely.
   */
  public clear(): void {
    if (this.prefix === '') {
      this.storage.clear();
      return;
    }

    const keysToRemove = this.getManagedStorageKeys();
    for (const storageKey of keysToRemove) {
      this.storage.removeItem(storageKey);
    }
  }

  /**
   * Checks whether an item exists and has not yet expired.
   * Automatically purges the item if it has expired.
   *
   * @param key - Unique identifier to check.
   * @returns `true` if active, `false` otherwise.
   */
  public has(key: string): boolean {
    return this.getItem(key) !== null;
  }

  /**
   * Returns the remaining time-to-live for a given key in milliseconds.
   *
   * @param key - Unique identifier for the item.
   * @returns Remaining milliseconds until expiration, `Infinity` if persistent, or `null` if expired/missing.
   */
  public getRemainingTTL(key: string): number | null {
    const item = this.getWithExpiry(key);
    if (!item) {
      return null;
    }
    return item.remainingMs !== null ? item.remainingMs : Infinity;
  }

  /**
   * Updates or extends the TTL of an existing active item without modifying its value.
   *
   * @param key - Unique identifier for the item.
   * @param ttlMs - New time-to-live in milliseconds from now.
   * @returns `true` if updated successfully, `false` if the item does not exist or is expired.
   */
  public touch(key: string, ttlMs: number): boolean {
    this.validateKey(key);
    this.validateTtl(ttlMs, 'ttlMs');

    const meta = this.getWithExpiry(key);
    if (!meta) {
      return false;
    }

    this.setItem(key, meta.value, ttlMs);
    return true;
  }

  /**
   * Scans and purges all expired keys managed by this instance.
   *
   * @returns The number of expired items pruned from storage.
   */
  public prune(): number {
    let pruned = 0;
    const keys = this.getManagedStorageKeys();
    const currentTime = this.now();

    for (const storageKey of keys) {
      const raw = this.storage.getItem(storageKey);
      if (raw === null) {
        continue;
      }

      try {
        const envelope = this.deserialize(raw) as StorageEnvelope<unknown>;
        if (
          envelope &&
          typeof envelope === 'object' &&
          envelope.__ttl__ &&
          envelope.expiresAt !== null &&
          currentTime >= envelope.expiresAt
        ) {
          this.storage.removeItem(storageKey);
          pruned++;
        }
      } catch {
        // Corrupted item, purge it
        this.storage.removeItem(storageKey);
        pruned++;
      }
    }

    return pruned;
  }

  /**
   * Returns a list of all active (unexpired) user keys managed by this instance (without the prefix).
   *
   * @returns An array of active keys.
   */
  public getAllKeys(): string[] {
    const storageKeys = this.getManagedStorageKeys();
    const activeKeys: string[] = [];

    for (const storageKey of storageKeys) {
      const userKey = this.fromStorageKey(storageKey);
      if (userKey !== null && this.getItem(userKey) !== null) {
        activeKeys.push(userKey);
      }
    }

    return activeKeys;
  }

  /**
   * Returns the prefix configured for this instance.
   */
  public getPrefix(): string {
    return this.prefix;
  }

  /**
   * Returns whether the storage adapter is currently using the in-memory fallback.
   */
  public isUsingMemoryFallback(): boolean {
    return this.storage instanceof MemoryStorageAdapter;
  }

  /**
   * Resolves the storage key prefixed with the instance namespace.
   */
  private toStorageKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  /**
   * Extracts the user key from a prefixed storage key, or null if it doesn't match the prefix.
   */
  private fromStorageKey(storageKey: string): string | null {
    if (this.prefix === '') {
      return storageKey;
    }
    if (storageKey.startsWith(this.prefix)) {
      return storageKey.slice(this.prefix.length);
    }
    return null;
  }

  /**
   * Retrieves all underlying storage keys currently matching this instance's prefix.
   */
  private getManagedStorageKeys(): string[] {
    const keys: string[] = [];
    const length = this.storage.length;

    if (typeof length === 'number' && typeof this.storage.key === 'function') {
      for (let i = 0; i < length; i++) {
        const k = this.storage.key(i);
        if (k !== null && (this.prefix === '' || k.startsWith(this.prefix))) {
          keys.push(k);
        }
      }
    }

    return keys;
  }

  /**
   * Validates that the key is a non-empty string.
   */
  private validateKey(key: unknown): asserts key is string {
    if (typeof key !== 'string' || key.trim() === '') {
      throw new TypeError('Storage key must be a non-empty string.');
    }
  }

  /**
   * Validates that TTL is a non-negative number.
   */
  private validateTtl(ttl: unknown, fieldName: string): void {
    if (typeof ttl !== 'number' || Number.isNaN(ttl) || ttl < 0) {
      throw new TypeError(`${fieldName} must be a non-negative number.`);
    }
  }

  /**
   * Detects if an error is a QuotaExceededError across browsers.
   */
  private isQuotaExceededError(err: unknown): boolean {
    if (!(err instanceof Error)) {
      return false;
    }
    const hasCode = 'code' in err && typeof (err as { code: unknown }).code === 'number';
    return (
      err.name === 'QuotaExceededError' ||
      err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      (hasCode && (err as { code: number }).code === 22)
    );
  }
}
