import { Router } from 'express';
import {
  getAllOrganizations,
  getOrganizationById,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  addOrganizationField,
  deleteOrganizationField,
} from '../controllers/organization.controller';
import { authenticate, requireSuperAdmin } from '../middleware/auth';

const router = Router();

// All routes require authentication and superadmin
router.use(authenticate);
router.use(requireSuperAdmin);

router.get('/', getAllOrganizations);
router.get('/:id', getOrganizationById);
router.post('/', createOrganization);
router.put('/:id', updateOrganization);
router.delete('/:id', deleteOrganization);

// Organization fields
router.post('/:id/fields', addOrganizationField);
router.delete('/:id/fields/:fieldId', deleteOrganizationField);

export default router;

