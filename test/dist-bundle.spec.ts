import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
// @ts-expect-error testing compiled ESM bundle output directly
import * as esmBundle from '../dist/index.mjs';

const require = createRequire(import.meta.url);
const cjsBundle = require('../dist/index.cjs');

describe('Dual-Format Bundle Verification (ESM & CJS)', () => {
  it('should export all essential functions and classes in ESM bundle', () => {
    expect(esmBundle.TtlStorage).toBeDefined();
    expect(esmBundle.ttlStorage).toBeDefined();
    expect(typeof esmBundle.setItem).toBe('function');
    expect(typeof esmBundle.getItem).toBe('function');
    expect(typeof esmBundle.removeItem).toBe('function');
    expect(typeof esmBundle.clear).toBe('function');
    expect(typeof esmBundle.has).toBe('function');
    expect(typeof esmBundle.touch).toBe('function');
    expect(typeof esmBundle.prune).toBe('function');
    expect(typeof esmBundle.getAllKeys).toBe('function');
    expect(typeof esmBundle.getRemainingTTL).toBe('function');
    expect(typeof esmBundle.getWithExpiry).toBe('function');
  });

  it('should correctly execute operations using ESM bundle', () => {
    esmBundle.setItem('esm_test', { score: 100 }, 5000);
    expect(esmBundle.getItem<{ score: number }>('esm_test')).toEqual({ score: 100 });
    expect(esmBundle.has('esm_test')).toBe(true);
    esmBundle.removeItem('esm_test');
    expect(esmBundle.getItem('esm_test')).toBeNull();
  });

  it('should export all essential functions and classes in CJS bundle', () => {
    expect(cjsBundle.TtlStorage).toBeDefined();
    expect(cjsBundle.ttlStorage).toBeDefined();
    expect(typeof cjsBundle.setItem).toBe('function');
    expect(typeof cjsBundle.getItem).toBe('function');
    expect(typeof cjsBundle.removeItem).toBe('function');
    expect(typeof cjsBundle.clear).toBe('function');
    expect(typeof cjsBundle.has).toBe('function');
    expect(typeof cjsBundle.touch).toBe('function');
    expect(typeof cjsBundle.prune).toBe('function');
    expect(typeof cjsBundle.getAllKeys).toBe('function');
    expect(typeof cjsBundle.getRemainingTTL).toBe('function');
    expect(typeof cjsBundle.getWithExpiry).toBe('function');
  });

  it('should correctly execute operations using CJS bundle', () => {
    cjsBundle.setItem('cjs_test', 'cjs_value', 5000);
    expect(cjsBundle.getItem('cjs_test')).toBe('cjs_value');
    expect(cjsBundle.has('cjs_test')).toBe(true);
    cjsBundle.removeItem('cjs_test');
    expect(cjsBundle.getItem('cjs_test')).toBeNull();
  });
});
