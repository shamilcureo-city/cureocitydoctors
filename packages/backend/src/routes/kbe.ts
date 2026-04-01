import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import * as kbeController from '../controllers/kbe.js';

const router = Router();

// All KBE routes are protected
router.use(authenticate as any);

router.get('/conditions', kbeController.listConditions as any);
router.get('/conditions/:id', kbeController.getCondition as any);

export default router;
