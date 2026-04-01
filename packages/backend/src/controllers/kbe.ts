import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types/index.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  allConditions,
  rebuildCorpusAndRescore,
} from '@cureocity/kbe-engine';
import type { KBEState } from '@cureocity/kbe-engine';

export async function listConditions(
  _req: AuthenticatedRequest,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  res.status(200).json(allConditions);
}

export async function getCondition(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const condition = allConditions.find((c) => c.id === req.params.id);
    if (!condition) {
      throw new AppError(
        `Condition '${req.params.id}' not found`,
        404,
        'NOT_FOUND',
      );
    }
    res.status(200).json(condition);
  } catch (err) {
    next(err);
  }
}

export async function scoreSymptoms(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const state = req.body as KBEState;
    const result = rebuildCorpusAndRescore(state, allConditions);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
