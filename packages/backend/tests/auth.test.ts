import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

// ── Constants matching the dev config defaults ──────────────────────────────
const JWT_SECRET = 'dev-jwt-secret-change-in-production';

// ── Mock helpers ────────────────────────────────────────────────────────────

function createMockReq(overrides: Record<string, unknown> = {}) {
  return {
    headers: {},
    body: {},
    method: 'GET',
    path: '/',
    ...overrides,
  } as any;
}

function createMockRes() {
  const res: any = {
    statusCode: 200,
    _json: null as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res._json = body;
      return res;
    },
  };
  return res;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Auth Middleware
// ─────────────────────────────────────────────────────────────────────────────

// We mock the config module so `authenticate` uses our known secret.
vi.mock('../src/config/index.js', () => ({
  config: {
    jwtSecret: 'dev-jwt-secret-change-in-production',
    jwtRefreshSecret: 'dev-jwt-refresh-secret-change-in-production',
    jwtExpiry: '15m',
    jwtRefreshExpiry: '7d',
    nodeEnv: 'test',
    port: 3001,
    frontendUrl: 'http://localhost:5173',
    databaseUrl: 'postgresql://localhost/test',
    redisUrl: 'redis://localhost:6379',
    otpExpiryMinutes: 5,
    otpLength: 6,
    geminiApiKey: '',
  },
}));

import { authenticate } from '../src/middleware/auth.js';

describe('authenticate middleware', () => {
  it('should reject requests without Authorization header', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res._json.error.code).toBe('UNAUTHORIZED');
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject requests with non-Bearer Authorization header', () => {
    const req = createMockReq({
      headers: { authorization: 'Basic abc123' },
    });
    const res = createMockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res._json.error.code).toBe('UNAUTHORIZED');
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject requests with an invalid token', () => {
    const req = createMockReq({
      headers: { authorization: 'Bearer invalid.token.value' },
    });
    const res = createMockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res._json.error.code).toBe('INVALID_TOKEN');
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject expired tokens', () => {
    const token = jwt.sign(
      { doctor_id: 'd001', phone: '+919876543210', role: 'doctor' },
      JWT_SECRET,
      { expiresIn: '-1s' },
    );
    const req = createMockReq({
      headers: { authorization: `Bearer ${token}` },
    });
    const res = createMockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res._json.error.code).toBe('TOKEN_EXPIRED');
    expect(next).not.toHaveBeenCalled();
  });

  it('should accept a valid token and set req.doctor', () => {
    const payload = {
      doctor_id: 'd0000000-0000-0000-0000-000000000001',
      phone: '+919876543210',
      role: 'doctor',
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
    const req = createMockReq({
      headers: { authorization: `Bearer ${token}` },
    });
    const res = createMockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(); // called without error
    expect(req.doctor).toBeDefined();
    expect(req.doctor.id).toBe(payload.doctor_id);
    expect(req.doctor.phone).toBe(payload.phone);
    expect(req.doctor.role).toBe(payload.role);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Validate Middleware
// ─────────────────────────────────────────────────────────────────────────────

import { validate } from '../src/middleware/validate.js';
import { z } from 'zod';

describe('validate middleware', () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.number().int().positive(),
  });

  it('should call next() for a valid body', () => {
    const req = createMockReq({ body: { name: 'Rajesh', age: 45 } });
    const res = createMockRes();
    const next = vi.fn();

    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200); // not changed
  });

  it('should return 400 for an invalid body', () => {
    const req = createMockReq({ body: { name: '', age: -5 } });
    const res = createMockRes();
    const next = vi.fn();

    validate(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res._json.error.code).toBe('VALIDATION_ERROR');
    expect(res._json.error.details.length).toBeGreaterThan(0);
  });

  it('should return 400 when required fields are missing', () => {
    const req = createMockReq({ body: {} });
    const res = createMockRes();
    const next = vi.fn();

    validate(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res._json.error.code).toBe('VALIDATION_ERROR');
  });

  it('should set req.body to the parsed data on success', () => {
    const req = createMockReq({ body: { name: 'Meera', age: 28, extra: 'ignored' } });
    const res = createMockRes();
    const next = vi.fn();

    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalled();
    // Zod strips unknown keys by default
    expect(req.body).toEqual({ name: 'Meera', age: 28 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Error Handler
// ─────────────────────────────────────────────────────────────────────────────

import { AppError, errorHandler } from '../src/middleware/errorHandler.js';

describe('AppError', () => {
  it('should create an error with the given properties', () => {
    const err = new AppError('Not found', 404, 'NOT_FOUND');
    expect(err.message).toBe('Not found');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.isOperational).toBe(true);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });

  it('should default to 500 and INTERNAL_ERROR', () => {
    const err = new AppError('Something broke');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
  });
});

describe('errorHandler middleware', () => {
  beforeEach(() => {
    // Silence console.error during tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should handle AppError and return proper JSON', () => {
    const err = new AppError('Resource not found', 404, 'NOT_FOUND') as any;
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    errorHandler(err, req, res, next);

    expect(res.statusCode).toBe(404);
    expect(res._json).toEqual({
      error: {
        message: 'Resource not found',
        code: 'NOT_FOUND',
      },
    });
  });

  it('should handle generic errors with a 500 status', () => {
    const err = new Error('kaboom') as any;
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    errorHandler(err, req, res, next);

    expect(res.statusCode).toBe(500);
    expect(res._json.error.code).toBe('INTERNAL_ERROR');
  });

  it('should handle Postgres unique constraint violation (23505)', () => {
    const err = {
      message: 'duplicate key',
      code: '23505',
      detail: 'Key (phone)=(+919876543210) already exists.',
      stack: '',
    } as any;
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    errorHandler(err, req, res, next);

    expect(res.statusCode).toBe(409);
    expect(res._json.error.code).toBe('DUPLICATE_ENTRY');
    expect(res._json.error.message).toContain('phone');
  });

  it('should handle Postgres FK violation (23503)', () => {
    const err = {
      message: 'fk violation',
      code: '23503',
      stack: '',
    } as any;
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    errorHandler(err, req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res._json.error.code).toBe('FK_VIOLATION');
  });
});
