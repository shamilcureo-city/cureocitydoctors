import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  // Database
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/cureocity_dev',

  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production',
  jwtRefreshSecret:
    process.env.JWT_REFRESH_SECRET ||
    'dev-jwt-refresh-secret-change-in-production',
  jwtExpiry: process.env.JWT_EXPIRY || '15m',
  jwtRefreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',

  // OTP
  otpExpiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES || '5', 10),
  otpLength: parseInt(process.env.OTP_LENGTH || '6', 10),

  // Gemini AI
  geminiApiKey: process.env.GEMINI_API_KEY || '',
} as const;

export type Config = typeof config;
