import { Router } from 'express';
import { getPreBookingConfig, updatePreBookingConfig } from '../controllers/branch-config.controller';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/pre-booking', requireRole('MANAGER', 'ASSOCIATE'), getPreBookingConfig);
router.put('/pre-booking', requireRole('MANAGER'), updatePreBookingConfig);

export default router;
