import { describe, it, expect } from 'vitest';
import { normalisePhone } from '../patients.js';

describe('normalisePhone', () => {
  it('formats a 10-digit Indian mobile', () => {
    expect(normalisePhone('9876543210')).toBe('+919876543210');
  });
  it('formats with spaces and dashes', () => {
    expect(normalisePhone('98765 43210')).toBe('+919876543210');
    expect(normalisePhone('98765-43210')).toBe('+919876543210');
  });
  it('preserves a valid E.164 input', () => {
    expect(normalisePhone('+919876543210')).toBe('+919876543210');
  });
  it('handles E.164 with formatting', () => {
    expect(normalisePhone('+91 98765 43210')).toBe('+919876543210');
  });
  it('returns null for empty / invalid input', () => {
    expect(normalisePhone('')).toBeNull();
    expect(normalisePhone(null)).toBeNull();
    expect(normalisePhone('abc')).toBeNull();
    expect(normalisePhone('123')).toBeNull();
  });
});
