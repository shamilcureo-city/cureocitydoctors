import type { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import type { AuthenticatedRequest } from '../types/index.js';

interface JwtPayload {
  doctor_id: string;
  phone: string;
  role: string;
}

export function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: { message: 'Missing or invalid authorization header', code: 'UNAUTHORIZED' },
    });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;

    req.doctor = {
      id: decoded.doctor_id,
      phone: decoded.phone,
      role: decoded.role,
    };

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        error: { message: 'Token expired', code: 'TOKEN_EXPIRED' },
      });
      return;
    }

    res.status(401).json({
      error: { message: 'Invalid token', code: 'INVALID_TOKEN' },
    });
  }
}
