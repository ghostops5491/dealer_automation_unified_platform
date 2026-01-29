import { Router } from 'express';
import { 
  upload, 
  uploadFile, 
  uploadMultipleFiles, 
  deleteFile,
  getFileInfo 
} from '../controllers/upload.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Upload single file
router.post('/single', upload.single('file'), uploadFile);

// Upload multiple files (max 10)
router.post('/multiple', upload.array('files', 10), uploadMultipleFiles);

// Delete file
router.delete('/', deleteFile);

// Get file info
router.get('/info/:filepath(*)', getFileInfo);

export default router;


