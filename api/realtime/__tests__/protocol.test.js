import { describe, it, expect } from 'vitest';
import { validateClientEvent, PROTOCOL_VERSION, CLIENT_EVENT_TYPES, SERVER_EVENT_TYPES } from '../session.js';

describe('realtime protocol', () => {
  it('exposes a version', () => {
    expect(PROTOCOL_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('lists expected client events', () => {
    expect(CLIENT_EVENT_TYPES).toEqual([
      'session.start', 'audio.chunk', 'session.commit', 'session.cancel',
    ]);
  });

  it('lists expected server events', () => {
    expect(SERVER_EVENT_TYPES).toContain('transcript.delta');
    expect(SERVER_EVENT_TYPES).toContain('red_flag.detected');
  });
});

describe('validateClientEvent', () => {
  it('rejects non-objects', () => {
    expect(validateClientEvent(null).ok).toBe(false);
    expect(validateClientEvent('hi').ok).toBe(false);
  });

  it('rejects unknown type', () => {
    const r = validateClientEvent({ type: 'something' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/unknown_type/);
  });

  it('session.start requires consultationId', () => {
    const r = validateClientEvent({ type: 'session.start' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('consultationId_required');
  });

  it('session.start requires sample rate', () => {
    const r = validateClientEvent({ type: 'session.start', consultationId: 'x' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/sampleRate/);
  });

  it('session.start happy path', () => {
    const r = validateClientEvent({
      type: 'session.start', consultationId: 'x',
      audio: { sampleRate: 16000 },
    });
    expect(r.ok).toBe(true);
  });

  it('audio.chunk requires sequence and b64', () => {
    expect(validateClientEvent({ type: 'audio.chunk' }).ok).toBe(false);
    expect(validateClientEvent({ type: 'audio.chunk', sequence: 0 }).ok).toBe(false);
    expect(validateClientEvent({ type: 'audio.chunk', sequence: 0, b64: 'abc' }).ok).toBe(true);
  });

  it('audio.chunk rejects oversize', () => {
    const big = 'a'.repeat(2 * 1024 * 1024 + 1);
    const r = validateClientEvent({ type: 'audio.chunk', sequence: 0, b64: big });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('chunk_too_large');
  });

  it('session.commit needs no fields', () => {
    expect(validateClientEvent({ type: 'session.commit' }).ok).toBe(true);
  });
});
