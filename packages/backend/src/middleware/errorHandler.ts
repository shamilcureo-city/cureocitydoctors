import type { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

function getKnexErrorResponse(err: Record<string, unknown>): {
  statusCode: number;
  message: string;
  code: string;
} | null {
  const pgCode = err.code as string | undefined;

  // Unique constraint violation
  if (pgCode === '23505') {
    const detail = (err.detail as string) || '';
    const match = detail.match(/Key \((.+?)\)/);
    const field = match ? match[1] : 'field';
    return {
      statusCode: 409,
      message: `A record with this ${field} already exists`,
      code: 'DUPLICATE_ENTRY',
    };
  }

  // Foreign key violation
  if (pgCode === '23503') {
    return {
      statusCode: 400,
      message: 'Referenced record does not exist',
      code: 'FK_VIOLATION',
    };
  }

  // Not null violation
  if (pgCode === '23502') {
    const column = (err.column as string) || 'field';
    return {
      statusCode: 400,
      message: `Missing required field: ${column}`,
      code: 'MISSING_FIELD',
    };
  }

  return null;
}

export function errorHandler(
  err: Error & Record<string, unknown>,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error(`[ERROR] ${err.message}`, err.stack);

  // Handle AppError
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.code,
      },
    });
    return;
  }

  // Handle Knex / pg errors
  const knexResponse = getKnexErrorResponse(err);
  if (knexResponse) {
    res.status(knexResponse.statusCode).json({
      error: {
        message: knexResponse.message,
        code: knexResponse.code,
      },
    });
    return;
  }

  // Fallback
  const statusCode = (err.statusCode as number) || 500;
  const message =
    config.nodeEnv === 'production' && statusCode === 500
      ? 'Internal server error'
      : err.message;

  res.status(statusCode).json({
    error: {
      message,
      code: 'INTERNAL_ERROR',
      ...(config.nodeEnv !== 'production' && { stack: err.stack }),
    },
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      code: 'NOT_FOUND',
    },
  });
}
