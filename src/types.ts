/**
 * Represents the storage adapter interface compatible with standard Web Storage (Storage).
 */
export interface StorageAdapter {
  /**
   * Returns the current value associated with the given key, or null if the key does not exist.
   */
  getItem(key: string): string | null;

  /**
   * Sets the value of the pair identified by key to value.
   */
  setItem(key: string, value: string): void;

  /**
   * Removes the key/value pair with the given key.
   */
  removeItem(key: string): void;

  /**
   * Removes all key/value pairs for this storage adapter.
   */
  clear(): void;

  /**
   * Returns the name of the nth key in the storage, or null if the index is greater than or equal to the total number of key/value pairs.
   */
  key?(index: number): string | null;

  /**
   * Returns the number of key/value pairs currently present in the list associated with the object.
   */
  readonly length?: number;
}

/**
 * Metadata envelope stored in the underlying storage adapter.
 */
export interface StorageEnvelope<T> {
  /**
   * The actual value stored by the user.
   */
  value: T;

  /**
   * Expiration timestamp in milliseconds since Unix epoch (null if persistent/no expiration).
   */
  expiresAt: number | null;

  /**
   * Timestamp in milliseconds when this item was created or last updated.
   */
  createdAt: number;

  /**
   * Internal metadata signature to distinguish enveloped items from raw items.
   */
  __ttl__: boolean;
}

/**
 * Result returned when retrieving an item along with its expiration metadata.
 */
export interface StorageItemWithMeta<T> {
  /**
   * The retrieved value.
   */
  value: T;

  /**
   * Expiration timestamp in milliseconds since Unix epoch, or null if indefinite.
   */
  expiresAt: number | null;

  /**
   * Timestamp in milliseconds when this item was created or updated.
   */
  createdAt: number;

  /**
   * Remaining time-to-live in milliseconds, or null if indefinite.
   */
  remainingMs: number | null;
}

/**
 * Options to configure a `TtlStorage` instance.
 */
export interface TtlStorageOptions {
  /**
   * Prefix applied to all keys in the underlying storage to prevent collisions.
   * Defaults to `'ttl:'`.
   */
  prefix?: string;

  /**
   * Custom storage adapter (e.g., custom localStorage, sessionStorage, or custom database).
   * Defaults to a safe localStorage adapter with automatic in-memory fallback.
   */
  storage?: StorageAdapter;

  /**
   * Whether to fallback automatically to an in-memory storage adapter when
   * `localStorage` is not available (e.g., in SSR environments or private browsing mode).
   * Defaults to `true`.
   */
  fallbackToMemory?: boolean;

  /**
   * Default time-to-live in milliseconds if not specified when calling `setItem`.
   * If omitted, items without a specified TTL will default to indefinite storage (or require explicit TTL).
   */
  defaultTtlMs?: number;

  /**
   * Custom serializer function to convert data into string for storage.
   * Defaults to `JSON.stringify`.
   */
  serialize?: (value: unknown) => string;

  /**
   * Custom deserializer function to parse data string from storage.
   * Defaults to `JSON.parse`.
   */
  deserialize?: (raw: string) => unknown;

  /**
   * Custom time provider returning the current timestamp in milliseconds.
   * Defaults to `Date.now`. Useful for deterministic testing.
   */
  now?: () => number;
}
