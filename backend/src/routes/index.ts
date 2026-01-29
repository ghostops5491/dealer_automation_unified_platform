import { Router } from 'express';
import authRoutes from './auth.routes';
import organizationRoutes from './organization.routes';
import branchRoutes from './branch.routes';
import userRoutes from './user.routes';
import screenRoutes from './screen.routes';
import flowRoutes from './flow.routes';
import formRoutes from './form.routes';
import historyRoutes from './history.routes';
import uploadRoutes from './upload.routes';
import jobRoutes from './job.routes';
import externalApiRoutes from './external-api.routes';
import vehicleCatalogRoutes from './vehicle-catalog.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/organizations', organizationRoutes);
router.use('/branches', branchRoutes);
router.use('/users', userRoutes);
router.use('/screens', screenRoutes);
router.use('/flows', flowRoutes);
router.use('/forms', formRoutes);
router.use('/history', historyRoutes);
router.use('/upload', uploadRoutes);
router.use('/jobs', jobRoutes);
router.use('/external', externalApiRoutes);
router.use('/vehicle-catalog', vehicleCatalogRoutes);

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;

