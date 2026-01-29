import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import {
  csvUpload,
  uploadCatalog,
  getCatalog,
  getBrands,
  getModels,
  getVariants,
  getColours,
  getFuelTypes,
  deleteCatalog,
  getCatalogSummary,
  downloadTemplate,
} from '../controllers/vehicle-catalog.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Template download (accessible to all authenticated users)
router.get('/template', downloadTemplate);

// Cascading dropdown endpoints (accessible to all authenticated users)
router.get('/brands', getBrands);
router.get('/models', getModels);
router.get('/variants', getVariants);
router.get('/colours', getColours);
router.get('/fuel-types', getFuelTypes);

// Summary (for dashboard display)
router.get('/summary', getCatalogSummary);

// Full catalog (manager only)
router.get('/', requireRole('MANAGER'), getCatalog);

// Upload CSV (manager only)
router.post('/upload', requireRole('MANAGER'), csvUpload.single('file'), uploadCatalog);

// Delete catalog (manager only)
router.delete('/', requireRole('MANAGER'), deleteCatalog);

export default router;
