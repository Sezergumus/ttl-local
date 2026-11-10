import { describe, it, expect, beforeEach } from 'vitest';
import ttlStorage, {
  setItem,
  getItem,
  removeItem,
  clear,
  has,
  getRemainingTTL,
  getWithExpiry,
  touch,
  prune,
  getAllKeys,
} from '../src/index';

describe('Singleton & Standalone Helper Functions', () => {
  beforeEach(() => {
    clear();
  });

  it('should store and read values via standalone functions', () => {
    setItem('name', 'Antigravity', 5000);
    expect(getItem<string>('name')).toBe('Antigravity');
    expect(has('name')).toBe(true);
  });

  it('should remove items via removeItem', () => {
    setItem('temp', '123', 5000);
    expect(has('temp')).toBe(true);

    removeItem('temp');
    expect(getItem('temp')).toBeNull();
    expect(has('temp')).toBe(false);
  });

  it('should clear all items via clear', () => {
    setItem('a', 1, 5000);
    setItem('b', 2, 5000);

    clear();
    expect(getItem('a')).toBeNull();
    expect(getItem('b')).toBeNull();
  });

  it('should return remaining TTL and metadata', () => {
    setItem('expiry_check', 'data', 10000);

    const ttl = getRemainingTTL('expiry_check');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(10000);

    const meta = getWithExpiry<string>('expiry_check');
    expect(meta?.value).toBe('data');
    expect(meta?.remainingMs).toBeGreaterThan(0);
  });

  it('should update TTL using touch', () => {
    setItem('session', 'active', 1000);
    const touched = touch('session', 20000);

    expect(touched).toBe(true);
    const newTtl = getRemainingTTL('session');
    expect(newTtl).toBeGreaterThan(15000);
  });

  it('should list all active keys with getAllKeys', () => {
    setItem('keyA', 'valA', 10000);
    setItem('keyB', 'valB', 10000);

    const keys = getAllKeys();
    expect(keys).toContain('keyA');
    expect(keys).toContain('keyB');
  });

  it('should prune expired items via prune', () => {
    setItem('expired', 'value', 0);
    const count = prune();
    expect(count).toBe(1);
  });

  it('should allow accessing the default instance directly', () => {
    expect(ttlStorage).toBeDefined();
    expect(typeof ttlStorage.setItem).toBe('function');
  });
});
