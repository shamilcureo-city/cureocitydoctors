import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import * as authController from '../controllers/auth.js';

const router = Router();

// Public routes
router.post('/send-otp', authController.sendOtp);
router.post('/verify-otp', authController.verifyOtp);
router.post('/refresh', authController.refreshToken);
router.post('/logout', authController.logout);

// Protected routes
router.get('/me', authenticate as any, authController.getMe as any);

export default router;
