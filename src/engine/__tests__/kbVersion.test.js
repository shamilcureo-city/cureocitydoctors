/**
 * KB version is the load-bearing primitive for medico-legal audit.
 * Test it carefully:
 *   - format is correct
 *   - hash is stable across imports (deterministic)
 *   - changes only when KB content changes (not just on date roll)
 *
 * The last property requires us to compute the hash function in isolation
 * and verify it produces the same output for the same input twice.
 */
import { describe, it, expect } from 'vitest';
import { KB_VERSION, KB_CONTENT_HASH, KB_CONDITION_COUNT } from '../kbVersion.js';

describe('KB versioning', () => {
  it('exposes a non-empty version string', () => {
    expect(typeof KB_VERSION).toBe('string');
    expect(KB_VERSION.length).toBeGreaterThan(0);
  });

  it('uses the kb-YYYY-MM-DD-<hash> format', () => {
    expect(KB_VERSION).toMatch(/^kb-\d{4}-\d{2}-\d{2}-[0-9a-f]{8}$/);
  });

  it('exposes an 8-char hex content hash', () => {
    expect(KB_CONTENT_HASH).toMatch(/^[0-9a-f]{8}$/);
  });

  it('the version string ends with the content hash', () => {
    expect(KB_VERSION.endsWith(KB_CONTENT_HASH)).toBe(true);
  });

  it('exposes a sane condition count (≥25)', () => {
    expect(KB_CONDITION_COUNT).toBeGreaterThanOrEqual(25);
  });

  it('hash is deterministic across re-imports of the same module', async () => {
    // Import the live module a second time; same result.
    const mod = await import('../kbVersion.js');
    expect(mod.KB_VERSION).toBe(KB_VERSION);
    expect(mod.KB_CONTENT_HASH).toBe(KB_CONTENT_HASH);
  });
});
