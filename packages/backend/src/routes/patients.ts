import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import * as patientsController from '../controllers/patients.js';

const router = Router();

// All patient routes are protected
router.use(authenticate as any);

router.get('/', patientsController.search as any);
router.post('/', patientsController.create as any);
router.get('/:id', patientsController.getById as any);
router.patch('/:id', patientsController.update as any);
router.get('/:id/history', patientsController.getHistory as any);

export default router;
