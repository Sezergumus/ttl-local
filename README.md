# ttl-local

> Production-ready, zero-dependency, dual-format (ESM/CJS) TypeScript localStorage wrapper with Time-to-Live (TTL) expiration support and safe SSR fallback.

[![npm version](https://img.shields.io/npm/v/ttl-local.svg?style=flat-square)](https://www.npmjs.com/package/ttl-local)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg?style=flat-square)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Dual ESM/CJS](https://img.shields.io/badge/module-ESM%20%2B%20CJS-orange.svg?style=flat-square)](#)
[![Coverage](https://img.shields.io/badge/coverage-99.7%25-brightgreen.svg?style=flat-square)](#)

---

## Features

- ⚡ **Zero External Dependencies**: Lightweight, performant, and footprint-free.
- ⏳ **Accurate TTL Expiration**: Specify TTL in milliseconds. Expired keys are automatically evicted upon access or via periodic pruning.
- 🛡️ **Safe SSR & Private Browsing Fallback**: Works gracefully in Node.js, Next.js, Nuxt, Remix, and Safari Private Browsing mode with transparent in-memory fallback.
- 🔒 **Namespace & Prefix Isolation**: Keeps keys grouped and prevents `clear()` from clobbering other localStorage items from the same origin.
- 📦 **Dual Module Format**: Native support for modern ESM (`import`) and legacy CommonJS (`require`) with complete TypeScript declarations (`.d.ts` and `.d.cts`).
- 🦾 **Strict TypeScript Support**: Built-in generics `<T>` for full type safety across complex data structures.
- 🔄 **Smart Quota Recovery**: Automatically cleans up expired items to free space whenever browser storage quotas are exceeded.

---

## Installation

```bash
# npm
npm install ttl-local

# pnpm
pnpm add ttl-local

# yarn
yarn add ttl-local

# bun
bun add ttl-local
```

---

## Quick Start

### 1. Direct Helper Functions

You can use the default singleton instance right out of the box:

```typescript
import { setItem, getItem, removeItem, clear } from 'ttl-local';

// Store a value that expires in 10 seconds (10,000 ms)
setItem('sessionToken', 'xyz789', 10000);

// Retrieve value (returns 'xyz789' before expiration, null after)
const token = getItem<string>('sessionToken');

// Manually remove a key
removeItem('sessionToken');

// Clear all keys managed by this library (prefixed)
clear();
```

### 2. Custom Instance (`TtlStorage`)

Create isolated storage instances with custom prefixes, default TTLs, or custom time providers:

```typescript
import { TtlStorage } from 'ttl-local';

const userCache = new TtlStorage({
  prefix: 'app:user:',
  defaultTtlMs: 5 * 60 * 1000, // 5 minutes default
});

interface UserProfile {
  id: number;
  name: string;
  roles: string[];
}

// Stores with 5-minute default TTL
userCache.setItem<UserProfile>('profile', {
  id: 1,
  name: 'Alice',
  roles: ['admin'],
});

// Type-safe retrieval
const profile = userCache.getItem<UserProfile>('profile');
console.log(profile?.roles); // ['admin']
```

---

## API Reference

### `setItem<T>(key: string, value: T, ttlMs?: number): void`
Stores any serializable value wrapped with an expiration timestamp.

- **`key`**: Unique string identifier.
- **`value`**: Value to store (objects, arrays, primitives, booleans, etc.).
- **`ttlMs`**: Time-to-live in milliseconds. If omitted, falls back to `defaultTtlMs` (or persists indefinitely if no default is configured). Pass `Infinity` for indefinite storage.

```typescript
setItem('theme', 'dark', 3600000); // 1 hour
```

### `getItem<T>(key: string): T | null`
Retrieves a value. If the key has expired, it is automatically removed from storage and `null` is returned.

```typescript
const theme = getItem<string>('theme');
```

### `removeItem(key: string): void`
Immediately deletes the given key from storage.

```typescript
removeItem('theme');
```

### `clear(): void`
Removes all keys matching this instance's prefix. Unprefixed keys and keys belonging to other applications are safely preserved.

```typescript
clear();
```

### `has(key: string): boolean`
Checks whether an unexpired key exists. Automatically purges the item if it has expired.

```typescript
if (has('sessionToken')) {
  // Session is active
}
```

### `getRemainingTTL(key: string): number | null`
Returns the remaining time-to-live in milliseconds.
- Returns `number` (remaining milliseconds) if active.
- Returns `Infinity` if the item has no expiration.
- Returns `null` if the item is expired or does not exist.

```typescript
const msLeft = getRemainingTTL('sessionToken');
console.log(`Expires in ${msLeft} ms`);
```

### `getWithExpiry<T>(key: string): StorageItemWithMeta<T> | null`
Returns the stored value along with its complete expiration metadata:

```typescript
const meta = getWithExpiry<UserProfile>('profile');

if (meta) {
  console.log(meta.value);       // UserProfile
  console.log(meta.expiresAt);   // Timestamp in ms
  console.log(meta.createdAt);   // Creation timestamp in ms
  console.log(meta.remainingMs); // Remaining time in ms
}
```

### `touch(key: string, ttlMs: number): boolean`
Renews or updates the TTL of an existing, unexpired item without modifying its value. Returns `true` if updated, or `false` if the item does not exist or has expired.

```typescript
// Extend session by 15 minutes
const refreshed = touch('sessionToken', 15 * 60 * 1000);
```

### `prune(): number`
Scans all keys managed by this instance, deletes any expired or corrupted keys, and returns the total count of pruned items.

```typescript
const prunedCount = prune();
console.log(`Cleaned up ${prunedCount} expired items.`);
```

### `getAllKeys(): string[]`
Returns an array of all active (unexpired) user keys (with prefix stripped).

```typescript
const keys = getAllKeys();
console.log(keys); // ['profile', 'settings']
```

---

## Configuration Options

When instantiating `new TtlStorage(options)`, you can configure:

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `prefix` | `string` | `'ttl:'` | Prefix applied to all keys in the underlying storage adapter. |
| `storage` | `StorageAdapter` | `localStorage` / memory | Custom storage adapter (implements `getItem`, `setItem`, `removeItem`, `clear`, etc.). |
| `fallbackToMemory` | `boolean` | `true` | When `true`, automatically falls back to an in-memory `Map` when running in SSR or when `localStorage` is blocked. |
| `defaultTtlMs` | `number` | `undefined` | Default TTL in milliseconds used when `ttlMs` is omitted in `setItem`. |
| `serialize` | `(value: unknown) => string` | `JSON.stringify` | Custom serialization function. |
| `deserialize` | `(raw: string) => unknown` | `JSON.parse` | Custom deserialization function. |
| `now` | `() => number` | `Date.now` | Custom time provider. Useful for deterministic testing and clock synchronization. |

---

## SSR & Framework Compatibility

In Server-Side Rendering (SSR) environments such as **Next.js**, **Nuxt**, **Remix**, **Astro**, or plain **Node.js**, `window.localStorage` is not available.

`ttl-local` detects this automatically and switches seamlessly to an in-memory adapter (`MemoryStorageAdapter`). Your application will never throw `ReferenceError: window is not defined` or crash in SSR contexts.

```typescript
import { ttlStorage } from 'ttl-local';

// In Node.js / Server Component:
console.log(ttlStorage.isUsingMemoryFallback()); // true (safe in-memory store)

// In Browser / Client Component:
console.log(ttlStorage.isUsingMemoryFallback()); // false (persists to localStorage)
```

---

## TypeScript Support

Written in 100% strict TypeScript with first-class generic support:

```typescript
import { TtlStorage, type StorageItemWithMeta } from 'ttl-local';

interface CartItem {
  id: string;
  quantity: number;
}

const storage = new TtlStorage();

// Type is inferred and validated
storage.setItem<CartItem[]>('cart', [
  { id: 'sku_1', quantity: 2 },
]);

const items = storage.getItem<CartItem[]>('cart');
// items has type: CartItem[] | null
```

---

## CommonJS & ESM Import Compatibility

```javascript
// ECMAScript Modules (ESM)
import { setItem, getItem, TtlStorage } from 'ttl-local';

// CommonJS (CJS)
const { setItem, getItem, TtlStorage } = require('ttl-local');
```

---

## License

[MIT](LICENSE) © [Sezer Gümüş](https://github.com/sezer2004)
