import { Router } from 'express';
import { loginSuperAdmin, loginUser, getMe } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// Public routes
router.post('/superadmin/login', loginSuperAdmin);
router.post('/user/login', loginUser);

// Protected routes
router.get('/me', authenticate, getMe);

export default router;

