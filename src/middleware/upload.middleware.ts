/**
 * Upload Middleware
 * 
 * Multer configuration for handling file uploads.
 * 
 * @module middleware/upload
 */

import multer from 'multer';
import { Request } from 'express';

// Configure multer to use memory storage (buffers in memory)
const storage = multer.memoryStorage();

// File filter to only allow images
const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  // Allow only image files
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'));
  }
};

// Configure multer
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
});

// Single file upload middleware
export const uploadSingle = upload.single('image');

// Multiple files upload middleware (max 10 files)
export const uploadMultiple = upload.array('images', 10);

// Fields upload middleware (for multiple named fields)
export const uploadFields = upload.fields([
  { name: 'image', maxCount: 1 }, // Logo
  { name: 'images', maxCount: 10 },
  { name: 'aboutImage', maxCount: 1 }, // About hero image
  { name: 'contactImage', maxCount: 1 }, // Contact hero image
]);

export default upload;

