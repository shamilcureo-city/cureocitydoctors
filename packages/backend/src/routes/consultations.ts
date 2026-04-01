import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import * as consultationsController from '../controllers/consultations.js';

const router = Router();

// All consultation routes are protected
router.use(authenticate as any);

router.post('/', consultationsController.create as any);
router.get('/:id', consultationsController.getById as any);
router.patch('/:id', consultationsController.update as any);
router.post('/:id/sign', consultationsController.sign as any);
router.get('/:id/safety-net', consultationsController.getSafetyNet as any);
router.get('/:id/gaps', consultationsController.getGaps as any);
router.post('/:id/prescription', consultationsController.createPrescription as any);
router.post('/:id/lab-orders', consultationsController.createLabOrders as any);
router.post('/:id/vitals', consultationsController.recordVitals as any);
router.post('/:id/diagnoses', consultationsController.addDiagnosis as any);

// Phase 1 – AI-powered endpoints
router.post('/:id/extract-entities', consultationsController.extractEntities as any);
router.post('/:id/soap-note', consultationsController.generateSOAP as any);
router.post('/:id/run-safety-checks', consultationsController.triggerSafetyChecks as any);
router.post('/:id/safety-net/:alertId/action', consultationsController.handleAlertAction as any);

// Follow-ups
router.post('/:id/follow-ups', consultationsController.createFollowUp as any);
router.get('/:id/follow-ups', consultationsController.getFollowUps as any);
router.patch('/:id/follow-ups/:followUpId', consultationsController.updateFollowUp as any);

export default router;
