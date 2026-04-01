import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types/index.js';
import { AppError } from '../middleware/errorHandler.js';

export async function listConditions(
  _req: AuthenticatedRequest,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  // Stub: will be populated when kbe-engine package is integrated
  res.status(200).json([]);
}

export async function getCondition(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    throw new AppError(
      `Condition '${req.params.id}' not found. KBE engine is not yet integrated.`,
      404,
      'NOT_FOUND',
    );
  } catch (err) {
    next(err);
  }
}
