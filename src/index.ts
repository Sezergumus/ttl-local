import { TtlStorage } from './ttl-storage';

export * from './types';
export * from './adapters/storage-adapter';
export { TtlStorage } from './ttl-storage';

/**
 * Default singleton instance of TtlStorage with standard options.
 */
export const ttlStorage = new TtlStorage();

/**
 * Stores a value in storage wrapped with an expiration timestamp using the default storage instance.
 *
 * @template T - The type of value being stored.
 * @param key - Unique identifier for the item.
 * @param value - Any serializable value to store.
 * @param ttlMs - Time-to-live in milliseconds.
 */
export const setItem = <T = unknown>(
  key: string,
  value: T,
  ttlMs?: number
): void => ttlStorage.setItem(key, value, ttlMs);

/**
 * Reads a value from storage using the default storage instance.
 * If the item has expired, it is automatically removed and null is returned.
 *
 * @template T - Expected type of the stored value.
 * @param key - Unique identifier for the item.
 * @returns The stored value if active, or null if expired/not found.
 */
export const getItem = <T = unknown>(key: string): T | null =>
  ttlStorage.getItem<T>(key);

/**
 * Deletes the item identified by the key from storage using the default storage instance.
 *
 * @param key - Unique identifier of the item to remove.
 */
export const removeItem = (key: string): void => ttlStorage.removeItem(key);

/**
 * Clears all keys managed by the default storage instance.
 */
export const clear = (): void => ttlStorage.clear();

/**
 * Checks whether an item exists and has not yet expired using the default storage instance.
 *
 * @param key - Unique identifier to check.
 */
export const has = (key: string): boolean => ttlStorage.has(key);

/**
 * Returns the remaining time-to-live for a given key in milliseconds using the default storage instance.
 *
 * @param key - Unique identifier for the item.
 */
export const getRemainingTTL = (key: string): number | null =>
  ttlStorage.getRemainingTTL(key);

/**
 * Reads a value from storage along with its full expiration metadata using the default storage instance.
 *
 * @template T - Expected type of the stored value.
 * @param key - Unique identifier for the item.
 */
export const getWithExpiry = <T = unknown>(key: string) =>
  ttlStorage.getWithExpiry<T>(key);

/**
 * Updates or extends the TTL of an existing active item without modifying its value using the default storage instance.
 *
 * @param key - Unique identifier for the item.
 * @param ttlMs - New time-to-live in milliseconds from now.
 */
export const touch = (key: string, ttlMs: number): boolean =>
  ttlStorage.touch(key, ttlMs);

/**
 * Scans and purges all expired keys from the default storage instance.
 */
export const prune = (): number => ttlStorage.prune();

/**
 * Returns a list of all active (unexpired) user keys in the default storage instance.
 */
export const getAllKeys = (): string[] => ttlStorage.getAllKeys();

export default ttlStorage;
