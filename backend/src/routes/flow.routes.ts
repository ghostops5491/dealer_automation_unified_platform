import { Router } from 'express';
import {
  getAllFlows,
  getFlowById,
  getFlowForUser,
  createFlow,
  updateFlow,
  deleteFlow,
  addFlowScreen,
  updateFlowScreen,
  removeFlowScreen,
  reorderFlowScreens,
  assignFlowToBranch,
  unassignFlowFromBranch,
  getMyFlows,
} from '../controllers/flow.controller';
import { authenticate, requireSuperAdmin, requireSuperAdminOrRole } from '../middleware/auth';

const router = Router();

// Protected routes
router.use(authenticate);

// User route - get flows assigned to current user
router.get('/my-flows', requireSuperAdminOrRole('MANAGER', 'ASSOCIATE', 'VIEWER'), getMyFlows);

// User route - get a specific flow (with access check)
router.get('/view/:id', requireSuperAdminOrRole('MANAGER', 'ASSOCIATE', 'VIEWER'), getFlowForUser);

// Superadmin routes
router.get('/', requireSuperAdmin, getAllFlows);
router.get('/:id', requireSuperAdmin, getFlowById);
router.post('/', requireSuperAdmin, createFlow);
router.put('/:id', requireSuperAdmin, updateFlow);
router.delete('/:id', requireSuperAdmin, deleteFlow);

// Flow screens (tabs)
router.post('/screens', requireSuperAdmin, addFlowScreen);
router.put('/screens/:flowScreenId', requireSuperAdmin, updateFlowScreen);
router.delete('/screens/:flowScreenId', requireSuperAdmin, removeFlowScreen);
router.put('/:id/reorder-screens', requireSuperAdmin, reorderFlowScreens);

// Flow assignments
router.post('/assignments', requireSuperAdmin, assignFlowToBranch);
router.delete('/assignments/:assignmentId', requireSuperAdmin, unassignFlowFromBranch);

export default router;

