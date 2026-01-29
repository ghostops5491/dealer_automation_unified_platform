import { Router } from 'express';
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  addUserField,
  deleteUserField,
  extendUserValidity,
  resetUserPassword,
} from '../controllers/user.controller';
import { authenticate, requireSuperAdmin } from '../middleware/auth';

const router = Router();

// All routes require authentication and superadmin
router.use(authenticate);
router.use(requireSuperAdmin);

router.get('/', getAllUsers);
router.get('/:id', getUserById);
router.post('/', createUser);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);

// User fields
router.post('/:id/fields', addUserField);
router.delete('/:id/fields/:fieldId', deleteUserField);

// User management
router.put('/:id/validity', extendUserValidity);
router.put('/:id/password', resetUserPassword);

export default router;

