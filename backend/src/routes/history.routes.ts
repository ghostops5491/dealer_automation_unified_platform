import { Router } from 'express';
import { 
  getSubmissionHistory, 
  getBranchHistory, 
  getAnalytics 
} from '../controllers/history.controller';
import { authenticate, requireSuperAdminOrRole } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get analytics/statistics - accessible by Manager and Associate
router.get(
  '/analytics',
  requireSuperAdminOrRole('MANAGER', 'ASSOCIATE'),
  getAnalytics
);

// Get all history for the branch - accessible by Manager and Associate
router.get(
  '/branch',
  requireSuperAdminOrRole('MANAGER', 'ASSOCIATE'),
  getBranchHistory
);

// Get history for a specific submission
router.get(
  '/submission/:submissionId',
  requireSuperAdminOrRole('MANAGER', 'ASSOCIATE', 'VIEWER'),
  getSubmissionHistory
);

export default router;

