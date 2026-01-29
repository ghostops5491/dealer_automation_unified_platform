import { Router } from 'express';
import {
  getAllScreens,
  getScreenById,
  createScreen,
  updateScreen,
  deleteScreen,
  addScreenField,
  updateScreenField,
  deleteScreenField,
  reorderScreenFields,
} from '../controllers/screen.controller';
import { authenticate, requireSuperAdmin } from '../middleware/auth';

const router = Router();

// All routes require authentication and superadmin
router.use(authenticate);
router.use(requireSuperAdmin);

router.get('/', getAllScreens);
router.get('/:id', getScreenById);
router.post('/', createScreen);
router.put('/:id', updateScreen);
router.delete('/:id', deleteScreen);

// Screen fields
router.post('/fields', addScreenField);
router.put('/fields/:fieldId', updateScreenField);
router.delete('/fields/:fieldId', deleteScreenField);

// Reorder fields
router.put('/:id/reorder', reorderScreenFields);

export default router;

