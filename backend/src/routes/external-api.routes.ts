import { Router } from 'express';
import { 
  fetchEnquiryDetails, 
  fetchEnquiryById,
  preFetchBookingData,
  populateEnquiryById,
  fetchPreBooking,
  getCachedEnquiry,
  listCachedEnquiries,
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

// Pre-fetch booking data (SearchEnquiry) for Amounts & Tax pre-fill
router.post('/pre-fetch-booking', requireRole('MANAGER', 'ASSOCIATE', 'INSURANCE_EXECUTIVE'), preFetchBookingData);

// Populate enquiry details by ID (calls PopulateEnquiryDetailsById and caches response)
router.post('/populate-enquiry', requireRole('MANAGER', 'ASSOCIATE', 'INSURANCE_EXECUTIVE'), populateEnquiryById);

// Fetch pre-booking data (calls SelectedEnquiryByID with full booking body and caches response)
router.post('/fetch-pre-booking', requireRole('MANAGER', 'ASSOCIATE', 'INSURANCE_EXECUTIVE'), fetchPreBooking);

// Get cached enquiry data
router.get('/enquiry-cache/:enquiryId', requireRole('MANAGER', 'ASSOCIATE', 'INSURANCE_EXECUTIVE'), getCachedEnquiry);

// List all cached enquiries
router.get('/enquiry-cache', requireRole('MANAGER', 'ASSOCIATE', 'INSURANCE_EXECUTIVE'), listCachedEnquiries);

export default router;

