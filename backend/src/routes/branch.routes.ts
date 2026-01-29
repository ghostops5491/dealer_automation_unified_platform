import { Router } from 'express';
import {
  getAllBranches,
  getBranchById,
  createBranch,
  updateBranch,
  deleteBranch,
  addBranchField,
  deleteBranchField,
  updateRoleTimeline,
} from '../controllers/branch.controller';
import { authenticate, requireSuperAdmin } from '../middleware/auth';

const router = Router();

// All routes require authentication and superadmin
router.use(authenticate);
router.use(requireSuperAdmin);

router.get('/', getAllBranches);
router.get('/:id', getBranchById);
router.post('/', createBranch);
router.put('/:id', updateBranch);
router.delete('/:id', deleteBranch);

// Branch fields
router.post('/:id/fields', addBranchField);
router.delete('/:id/fields/:fieldId', deleteBranchField);

// Timeline management
router.put('/:id/timeline', updateRoleTimeline);

export default router;

