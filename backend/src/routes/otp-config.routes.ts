import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getOtp, updateOtp } from '../controllers/otp-config.controller';

const router = Router();

// All authenticated users can access these endpoints
router.get('/', authenticate, getOtp);
router.put('/', authenticate, updateOtp);

export default router;
