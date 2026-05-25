import { Router } from 'express';
import { 
  fetchEnquiryDetails, 
  fetchEnquiryById,
  preFetchBookingData,
  populateEnquiryById,
  fetchPreBooking,
  fetchModelParts,
  setBookingLineItem,
  saveBooking,
  submitVoucher,
  loadVehicleFrames,
  performAllotment,
  saveBookingAfterAllotment,
  searchBooking,
  getCachedEnquiry,
  listCachedEnquiries,
  checkApiConfig,
  generateToken,
  clearTokenCache,
  syncFormatVehicleTemplate,
  getFormatVehicleTemplateStatus,
  formatVehicleModel,
} from '../controllers/external-api.controller';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// Playwright automation sync (no JWT — uses X-Automation-Sync-Key)
router.post('/format-vehicle-template/sync', syncFormatVehicleTemplate);

// All routes below require authentication
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

// Fetch model parts by MODEL_ID from TVS API and populate VehicleCatalog
router.post('/fetch-model-parts', requireRole('MANAGER', 'ASSOCIATE', 'INSURANCE_EXECUTIVE'), fetchModelParts);

// Set Booking Line Item (model/part selection before SaveBooking)
router.post('/set-booking-line-item', requireRole('MANAGER', 'ASSOCIATE'), setBookingLineItem);

// Save Booking via TVS API
router.post('/save-booking', requireRole('MANAGER', 'ASSOCIATE'), saveBooking);

// Submit Voucher (constructs voucher from SaveBooking response + branch config)
router.post('/submit-voucher', requireRole('MANAGER', 'ASSOCIATE'), submitVoucher);

// Load vehicle frames (chassis numbers) for allotment dropdown
router.post('/load-vehicle-frames', requireRole('MANAGER', 'ASSOCIATE', 'INSURANCE_EXECUTIVE'), loadVehicleFrames);

// Perform vehicle allotment (GetHoUnlockPDIDetails)
router.post('/perform-allotment', requireRole('MANAGER', 'ASSOCIATE'), performAllotment);

// Save booking after allotment (re-calls SaveBooking with ALLOTED_QTY=1, VEHICLE_ID, etc.)
router.post('/save-booking-after-allotment', requireRole('MANAGER', 'ASSOCIATE'), saveBookingAfterAllotment);

// Search bookings by phone number (BookedDetailsAwaitingAllotment)
router.post('/search-booking', requireRole('MANAGER', 'ASSOCIATE', 'INSURANCE_EXECUTIVE'), searchBooking);

// FormatVehicleModel — SubModel dropdown (uses template captured by Playwright)
router.get('/format-vehicle-template/status', requireRole('MANAGER', 'ASSOCIATE', 'INSURANCE_EXECUTIVE'), getFormatVehicleTemplateStatus);
router.post('/format-vehicle-model', requireRole('MANAGER', 'ASSOCIATE', 'INSURANCE_EXECUTIVE'), formatVehicleModel);

// Get cached enquiry data
router.get('/enquiry-cache/:enquiryId', requireRole('MANAGER', 'ASSOCIATE', 'INSURANCE_EXECUTIVE'), getCachedEnquiry);

// List all cached enquiries
router.get('/enquiry-cache', requireRole('MANAGER', 'ASSOCIATE', 'INSURANCE_EXECUTIVE'), listCachedEnquiries);

export default router;

