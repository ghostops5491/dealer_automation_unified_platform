import { Router } from 'express';
import { authenticate, requireSuperAdminOrRole } from '../middleware/auth';
import {
  runJobForAllEntries,
  runJobForLastEntry,
  runBookingJob,
  runEnquiryJob,
  getJobStatus,
  stopJob,
  getAllJobs
} from '../controllers/job.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Run job for all entries (Manager only)
router.post('/run-all', requireSuperAdminOrRole('MANAGER'), runJobForAllEntries);

// Run job for last entry (Manager only)
router.post('/run-last', requireSuperAdminOrRole('MANAGER'), runJobForLastEntry);

// Run booking job - available to all authenticated users
router.post('/run-booking', runBookingJob);

// Run enquiry search job - available to all authenticated users
router.post('/run-enquiry', runEnquiryJob);

// Get all jobs - available to all authenticated users (for viewing their own job status)
router.get('/', getAllJobs);

// Get job status - available to all authenticated users
router.get('/:jobId', getJobStatus);

// Stop a running job (Manager only)
router.post('/:jobId/stop', requireSuperAdminOrRole('MANAGER'), stopJob);

export default router;



