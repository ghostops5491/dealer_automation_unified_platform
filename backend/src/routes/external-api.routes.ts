import { Router } from 'express';
import { 
  fetchEnquiryDetails, 
  fetchEnquiryById,
  checkApiConfig,
  generateToken,
  clearTokenCache
} from '../controllers/external-api.controller';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Check if API is configured for current user
router.get('/config', checkApiConfig);

// Generate token (for testing configuration)
router.post('/generate-token', requireRole('MANAGER', 'ASSOCIATE', 'INSURANCE_EXECUTIVE'), generateToken);

// Clear cached token (force refresh)
router.post('/clear-token', requireRole('MANAGER', 'ASSOCIATE', 'INSURANCE_EXECUTIVE'), clearTokenCache);

// Fetch enquiry details by enquiry number or mobile
router.post('/fetch-enquiry', requireRole('MANAGER', 'ASSOCIATE', 'INSURANCE_EXECUTIVE'), fetchEnquiryDetails);

// Fetch specific enquiry by ID (when selecting from multiple results)
router.post('/fetch-enquiry-by-id', requireRole('MANAGER', 'ASSOCIATE', 'INSURANCE_EXECUTIVE'), fetchEnquiryById);

export default router;

