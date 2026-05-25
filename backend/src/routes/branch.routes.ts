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
import {
  getAutomationConfig,
  updateAutomationConfig,
} from '../controllers/automation-config.controller';
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

// TVS Playwright automation credentials (per branch)
router.get('/:id/automation-config', getAutomationConfig);
router.put('/:id/automation-config', updateAutomationConfig);

export default router;

