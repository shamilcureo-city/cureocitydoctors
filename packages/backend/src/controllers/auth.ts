import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { config } from '../config/index.js';
import { AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../types/index.js';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------
const sendOtpSchema = z.object({
  phone: z
    .string()
    .min(10, 'Phone number must be at least 10 digits')
    .max(15, 'Phone number must be at most 15 digits')
    .regex(/^\+?[0-9]+$/, 'Invalid phone number format'),
});

const verifyOtpSchema = z.object({
  phone: z.string().min(10).max(15),
  code: z.string().length(6, 'OTP must be 6 digits'),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function generateOtp(length: number): string {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[crypto.randomInt(0, digits.length)];
  }
  return otp;
}

function generateAccessToken(doctor: { id: string; phone: string; role: string }): string {
  return jwt.sign(
    { doctor_id: doctor.id, phone: doctor.phone, role: doctor.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiry as any },
  );
}

function generateRefreshToken(): string {
  return crypto.randomBytes(40).toString('hex');
}

// ---------------------------------------------------------------------------
// Controllers
// ---------------------------------------------------------------------------
export async function sendOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = sendOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        parsed.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR',
      );
    }

    const { phone } = parsed.data;
    const code = generateOtp(config.otpLength);
    const expiresAt = new Date(Date.now() + config.otpExpiryMinutes * 60 * 1000);

    await db('otp_codes').insert({
      phone,
      code,
      expires_at: expiresAt,
    });

    const response: Record<string, unknown> = {
      message: 'OTP sent successfully',
    };

    // In dev mode, include the OTP for testing
    if (config.nodeEnv === 'development') {
      response.otp = code;
    }

    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

export async function verifyOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = verifyOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        parsed.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR',
      );
    }

    const { phone, code } = parsed.data;

    // Find valid OTP
    const otpRecord = await db('otp_codes')
      .where({ phone, code, used: false })
      .where('expires_at', '>', new Date())
      .orderBy('created_at', 'desc')
      .first();

    if (!otpRecord) {
      throw new AppError('Invalid or expired OTP', 401, 'INVALID_OTP');
    }

    // Mark OTP as used
    await db('otp_codes').where({ id: otpRecord.id }).update({ used: true });

    // Find or create doctor
    let doctor = await db('doctors').where({ phone }).first();

    if (!doctor) {
      const [newDoctor] = await db('doctors')
        .insert({
          phone,
          name: 'Doctor',
          registration_number: `TEMP-${phone}`,
        })
        .returning('*');
      doctor = newDoctor;
    }

    const role = 'doctor';

    // Generate tokens
    const accessToken = generateAccessToken({ id: doctor.id, phone: doctor.phone, role });
    const refreshToken = generateRefreshToken();

    // Store refresh token
    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await db('refresh_tokens').insert({
      doctor_id: doctor.id,
      token: refreshToken,
      expires_at: refreshExpiresAt,
    });

    res.status(200).json({
      accessToken,
      refreshToken,
      doctor: {
        id: doctor.id,
        name: doctor.name,
        phone: doctor.phone,
        specialization: doctor.specialization,
        registration_number: doctor.registration_number,
        clinic_id: doctor.clinic_id,
        email: doctor.email,
        subscription_tier: doctor.subscription_tier,
        is_active: doctor.is_active,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = refreshTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        parsed.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR',
      );
    }

    const { refreshToken: token } = parsed.data;

    const record = await db('refresh_tokens')
      .where({ token, revoked: false })
      .where('expires_at', '>', new Date())
      .first();

    if (!record) {
      throw new AppError('Invalid or expired refresh token', 401, 'INVALID_REFRESH_TOKEN');
    }

    const doctor = await db('doctors').where({ id: record.doctor_id }).first();
    if (!doctor) {
      throw new AppError('Doctor not found', 404, 'NOT_FOUND');
    }

    const accessToken = generateAccessToken({
      id: doctor.id,
      phone: doctor.phone,
      role: 'doctor',
    });

    res.status(200).json({ accessToken });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = logoutSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        parsed.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR',
      );
    }

    const { refreshToken: token } = parsed.data;

    await db('refresh_tokens').where({ token }).update({ revoked: true });

    res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

export async function getMe(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const doctor = await db('doctors').where({ id: req.doctor.id }).first();

    if (!doctor) {
      throw new AppError('Doctor not found', 404, 'NOT_FOUND');
    }

    res.status(200).json({
      id: doctor.id,
      name: doctor.name,
      phone: doctor.phone,
      specialization: doctor.specialization,
      registration_number: doctor.registration_number,
      clinic_id: doctor.clinic_id,
      email: doctor.email,
      preferences: doctor.preferences,
      subscription_tier: doctor.subscription_tier,
      is_active: doctor.is_active,
      created_at: doctor.created_at,
    });
  } catch (err) {
    next(err);
  }
}
