/**
 * Image Utilities
 * 
 * Provides image validation, processing, and metadata extraction.
 * 
 * @module utils/image
 */

import sharp from 'sharp';
import { logger } from './logger.util';

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  size: number;
}

export interface ImageProcessingOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'jpeg' | 'jpg' | 'png' | 'webp';
}

/**
 * Validates an image file
 * @param file Express Multer file object
 * @throws Error if validation fails
 */
export async function validateImageFile(file: Express.Multer.File): Promise<void> {
  // Check if file exists
  if (!file) {
    throw new Error('No file provided');
  }

  // Validate file type
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedMimeTypes.includes(file.mimetype)) {
    throw new Error(`Invalid file type. Allowed types: ${allowedMimeTypes.join(', ')}`);
  }

  // Validate file size (max 10MB)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    throw new Error(`File size exceeds maximum allowed size of 10MB`);
  }

  // Validate that it's actually an image using sharp
  try {
    await sharp(file.buffer).metadata();
  } catch (error) {
    logger.error('Image validation error:', error);
    throw new Error('Invalid image file or corrupted image');
  }
}

/**
 * Processes an image (resize, optimize, convert format)
 * @param buffer Image buffer
 * @param options Processing options
 * @returns Processed image buffer
 */
export async function processImage(
  buffer: Buffer,
  options: ImageProcessingOptions = {}
): Promise<Buffer> {
  try {
    let sharpInstance = sharp(buffer);

    // Resize if max dimensions provided
    if (options.maxWidth || options.maxHeight) {
      sharpInstance = sharpInstance.resize(options.maxWidth, options.maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    // Convert format and apply quality settings
    if (options.format) {
      if (options.format === 'jpeg' || options.format === 'jpg') {
        sharpInstance = sharpInstance.jpeg({ quality: options.quality || 85 });
      } else if (options.format === 'png') {
        sharpInstance = sharpInstance.png({ quality: options.quality || 85 });
      } else if (options.format === 'webp') {
        sharpInstance = sharpInstance.webp({ quality: options.quality || 85 });
      }
    } else {
      // Apply quality to existing format if JPEG or WebP
      const metadata = await sharp(buffer).metadata();
      if (metadata.format === 'jpeg' || metadata.format === 'jpg') {
        sharpInstance = sharpInstance.jpeg({ quality: options.quality || 85 });
      } else if (metadata.format === 'webp') {
        sharpInstance = sharpInstance.webp({ quality: options.quality || 85 });
      }
    }

    return await sharpInstance.toBuffer();
  } catch (error) {
    logger.error('Image processing error:', error);
    throw new Error('Failed to process image');
  }
}

/**
 * Extracts metadata from an image
 * @param buffer Image buffer
 * @returns Image metadata
 */
export async function getImageMetadata(buffer: Buffer): Promise<ImageMetadata> {
  try {
    const metadata = await sharp(buffer).metadata();
    return {
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: metadata.format || 'unknown',
      size: buffer.length,
    };
  } catch (error) {
    logger.error('Image metadata extraction error:', error);
    throw new Error('Failed to extract image metadata');
  }
}

/**
 * Gets file extension from mime type
 * @param mimeType MIME type string
 * @returns File extension without dot
 */
export function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };

  return mimeToExt[mimeType] || 'jpg';
}

