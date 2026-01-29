import { Response } from 'express';
import { AuthRequest, ApiResponse } from '../types';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Create date-based subdirectory
    const dateDir = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const targetDir = path.join(uploadsDir, dateDir);
    
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueId = uuidv4();
    const ext = path.extname(file.originalname);
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${uniqueId}-${safeName}`);
  },
});

// File filter - allowed file types
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Allow PDF, JPEG, PNG, GIF, and WebP
  const allowedMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed. Only PDF, JPEG, PNG, GIF, and WebP files are accepted.`));
  }
};

// Multer upload configuration
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 4 * 1024 * 1024, // 4MB max file size
  },
});

// Upload single file
export const uploadFile = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
      return;
    }

    const file = req.file;
    const dateDir = new Date().toISOString().split('T')[0];
    
    // Generate file URL
    const fileUrl = `/uploads/${dateDir}/${file.filename}`;
    
    res.json({
      success: true,
      data: {
        filename: file.filename,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        url: fileUrl,
      },
      message: 'File uploaded successfully',
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload file',
    });
  }
};

// Upload multiple files
export const uploadMultipleFiles = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      res.status(400).json({
        success: false,
        error: 'No files uploaded',
      });
      return;
    }

    const dateDir = new Date().toISOString().split('T')[0];
    const uploadedFiles = req.files.map((file) => ({
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      url: `/uploads/${dateDir}/${file.filename}`,
    }));

    res.json({
      success: true,
      data: uploadedFiles,
      message: `${uploadedFiles.length} file(s) uploaded successfully`,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload files',
    });
  }
};

// Delete file
export const deleteFile = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { filepath } = req.body;

    if (!filepath) {
      res.status(400).json({
        success: false,
        error: 'File path is required',
      });
      return;
    }

    // Security check - ensure the path is within uploads directory
    const fullPath = path.join(process.cwd(), filepath);
    if (!fullPath.startsWith(uploadsDir)) {
      res.status(403).json({
        success: false,
        error: 'Invalid file path',
      });
      return;
    }

    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      res.json({
        success: true,
        message: 'File deleted successfully',
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'File not found',
      });
    }
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete file',
    });
  }
};

// Get file info
export const getFileInfo = async (
  req: AuthRequest,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const { filepath } = req.params;

    if (!filepath) {
      res.status(400).json({
        success: false,
        error: 'File path is required',
      });
      return;
    }

    const decodedPath = decodeURIComponent(filepath);
    const fullPath = path.join(uploadsDir, decodedPath);
    
    // Security check
    if (!fullPath.startsWith(uploadsDir)) {
      res.status(403).json({
        success: false,
        error: 'Invalid file path',
      });
      return;
    }

    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      res.json({
        success: true,
        data: {
          exists: true,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
        },
      });
    } else {
      res.json({
        success: true,
        data: {
          exists: false,
        },
      });
    }
  } catch (error) {
    console.error('Get file info error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get file info',
    });
  }
};

