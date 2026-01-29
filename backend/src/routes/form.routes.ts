import { Router } from 'express';
import {
  getAllSubmissions,
  getSubmissionById,
  startSubmission,
  saveTabData,
  submitForApproval,
  processApproval,
  processInsuranceApproval,
  getPendingApprovals,
  getPendingInsuranceApprovals,
  getMySubmissions,
  deleteSubmission,
  getBranchStats,
} from '../controllers/form.controller';
import { authenticate, requireSuperAdminOrRole, requireRole } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// User routes (including Insurance Executive)
router.get('/stats', requireSuperAdminOrRole('MANAGER', 'ASSOCIATE', 'VIEWER', 'INSURANCE_EXECUTIVE'), getBranchStats);
router.get('/my-submissions', requireSuperAdminOrRole('MANAGER', 'ASSOCIATE', 'VIEWER', 'INSURANCE_EXECUTIVE'), getMySubmissions);
router.post('/start', requireSuperAdminOrRole('MANAGER', 'ASSOCIATE', 'INSURANCE_EXECUTIVE'), startSubmission);
router.put('/:id/tab', requireSuperAdminOrRole('MANAGER', 'ASSOCIATE', 'INSURANCE_EXECUTIVE'), saveTabData);
router.post('/:id/submit', requireSuperAdminOrRole('MANAGER', 'ASSOCIATE', 'INSURANCE_EXECUTIVE'), submitForApproval);
router.delete('/:id', requireSuperAdminOrRole('MANAGER', 'ASSOCIATE', 'INSURANCE_EXECUTIVE'), deleteSubmission);

// Manager approval routes
router.get('/pending-approvals', requireSuperAdminOrRole('MANAGER'), getPendingApprovals);
router.post('/:id/approve', requireSuperAdminOrRole('MANAGER'), processApproval);

// Insurance Executive approval routes
router.get('/pending-insurance-approvals', requireSuperAdminOrRole('INSURANCE_EXECUTIVE'), getPendingInsuranceApprovals);
router.post('/:id/insurance-approve', requireSuperAdminOrRole('INSURANCE_EXECUTIVE'), processInsuranceApproval);

// All submissions (superadmin sees all, managers see their branch)
router.get('/', requireSuperAdminOrRole('MANAGER', 'ASSOCIATE', 'VIEWER', 'INSURANCE_EXECUTIVE'), getAllSubmissions);
router.get('/:id', requireSuperAdminOrRole('MANAGER', 'ASSOCIATE', 'VIEWER', 'INSURANCE_EXECUTIVE'), getSubmissionById);

export default router;

