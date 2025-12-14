/**
 * Upload Service
 * 
 * Manages file uploads to S3 and tracks uploads in database.
 * 
 * @module services/upload
 */

import s3, { S3_BUCKET } from '../config/s3';
import prisma from '../config/database';
import { logger } from '../utils/logger.util';
import { v4 as uuidv4 } from 'uuid';
import { getExtensionFromMimeType } from '../utils/image.util';

export type EntityType = 'business' | 'category' | 'menu-item' | 'banner' | 'location' | 'featured-section';

export interface UploadFileParams {
  file: Express.Multer.File;
  entityType: EntityType;
  entityId: string;
  userId: string;
  filename?: string;
  locationId?: string; // Optional location ID for S3 key prefix
}

export interface UploadFileResult {
  url: string;
  key: string;
  uploadId: string;
}

/**
 * Generates S3 key for file storage
 * Format: {locationId}/{entityType}/{entityId}/{filename}-{timestamp}.{ext}
 * Note: locationId is optional (e.g., for business logos)
 */
export function generateS3Key(
  entityType: EntityType,
  entityId: string,
  filename: string,
  mimeType: string,
  locationId?: string
): string {
  const timestamp = Date.now();
  const ext = getExtensionFromMimeType(mimeType);
  const sanitizedFilename = filename
    .replace(/[^a-zA-Z0-9.-]/g, '-')
    .toLowerCase()
    .replace(/\.[^/.]+$/, ''); // Remove existing extension

  // If locationId is provided, include it as prefix
  if (locationId) {
    return `${entityType}/${locationId}/${entityId}/${sanitizedFilename}-${timestamp}.${ext}`;
  }
  
  // For entities without location (e.g., business logo)
  return `${entityType}/${entityId}/${sanitizedFilename}-${timestamp}.${ext}`;
}

/**
 * Uploads a file to S3
 * @param params Upload parameters
 * @returns Upload result with URL, key, and upload record ID
 */
export async function uploadToS3(params: UploadFileParams): Promise<UploadFileResult> {
  const { file, entityType, entityId, userId, filename, locationId } = params;

  try {
    // Generate S3 key
    const s3Key = generateS3Key(
      entityType,
      entityId,
      filename || file.originalname || 'image',
      file.mimetype,
      locationId
    );

    // Upload to S3
    // Note: ACLs are disabled on modern S3 buckets by default
    // Public access should be controlled via bucket policies instead
    const uploadParams: AWS.S3.PutObjectRequest = {
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: file.buffer,
      ContentType: file.mimetype,
      // ACL removed - use bucket policy for public access control
    };

    const uploadResult = await s3.upload(uploadParams).promise();

    // Use the URL from S3 response (it's automatically generated correctly)
    const url = uploadResult.Location;

    // Create upload record in database
    const upload = await prisma.upload.create({
      data: {
        id: uuidv4(),
        userId,
        filename: s3Key.split('/').pop() || file.originalname,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        s3Key,
        s3Bucket: S3_BUCKET,
        s3Url: url,
        entityType,
        entityId,
      },
    });

    logger.info(`File uploaded to S3: ${s3Key}`, {
      uploadId: upload.id,
      entityType,
      entityId,
    });

    return {
      url,
      key: s3Key,
      uploadId: upload.id,
    };
  } catch (error) {
    logger.error('S3 upload error:', error);
    throw new Error('Failed to upload file to S3');
  }
}

/**
 * Deletes a file from S3
 * @param s3Key S3 object key
 */
export async function deleteFromS3(s3Key: string): Promise<void> {
  try {
    await s3
      .deleteObject({
        Bucket: S3_BUCKET,
        Key: s3Key,
      })
      .promise();

    logger.info(`File deleted from S3: ${s3Key}`);
  } catch (error) {
    logger.error('S3 delete error:', error);
    // Don't throw - we want to continue even if delete fails
    // This prevents blocking operations if S3 is temporarily unavailable
  }
}

/**
 * Deletes multiple files from S3
 * @param s3Keys Array of S3 object keys
 */
export async function deleteMultipleFromS3(s3Keys: string[]): Promise<void> {
  if (s3Keys.length === 0) return;

  try {
    const objects = s3Keys.map((key) => ({ Key: key }));
    await s3
      .deleteObjects({
        Bucket: S3_BUCKET,
        Delete: { Objects: objects },
      })
      .promise();

    logger.info(`Deleted ${s3Keys.length} files from S3`);
  } catch (error) {
    logger.error('S3 batch delete error:', error);
    // Don't throw - continue even if delete fails
  }
}

/**
 * Extracts S3 key from a URL
 * @param url S3 URL
 * @returns S3 key or null if not a valid S3 URL
 */
export function extractS3KeyFromUrl(url: string): string | null {
  try {
    // Handle different S3 URL formats
    // https://bucket.s3.region.amazonaws.com/key
    // https://s3.region.amazonaws.com/bucket/key
    // https://bucket.s3.amazonaws.com/key

    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    // Extract key from pathname (remove leading slash)
    let key = urlObj.pathname.substring(1);

    // If hostname contains bucket name, use pathname as key
    if (hostname.startsWith(S3_BUCKET)) {
      return key;
    }

    // Otherwise, check if pathname starts with bucket name
    if (key.startsWith(S3_BUCKET + '/')) {
      return key.substring(S3_BUCKET.length + 1);
    }

    return key || null;
  } catch (error) {
    logger.error('Failed to extract S3 key from URL:', error);
    return null;
  }
}

/**
 * Creates an upload record in database
 * @param data Upload record data
 * @returns Created upload record
 */
export async function createUploadRecord(data: {
  userId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  s3Key: string;
  s3Bucket: string;
  s3Url: string;
  entityType?: EntityType;
  entityId?: string;
}) {
  return await prisma.upload.create({
    data: {
      id: uuidv4(),
      ...data,
    },
  });
}

/**
 * Deletes an upload record from database
 * @param uploadId Upload record ID
 */
export async function deleteUploadRecord(uploadId: string): Promise<void> {
  try {
    await prisma.upload.delete({
      where: { id: uploadId },
    });
  } catch (error) {
    logger.error('Failed to delete upload record:', error);
    // Don't throw - continue even if record deletion fails
  }
}

/**
 * Gets upload records by entity
 * @param entityType Entity type
 * @param entityId Entity ID
 * @returns Array of upload records
 */
export async function getUploadsByEntity(
  entityType: EntityType,
  entityId: string
) {
  return await prisma.upload.findMany({
    where: {
      entityType,
      entityId,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

/**
 * Deletes all uploads for an entity
 * @param entityType Entity type
 * @param entityId Entity ID
 */
export async function deleteUploadsByEntity(
  entityType: EntityType,
  entityId: string
): Promise<void> {
  const uploads = await getUploadsByEntity(entityType, entityId);

  if (uploads.length === 0) return;

  // Extract S3 keys
  const s3Keys = uploads.map((upload) => upload.s3Key).filter((key) => key);

  // Delete from S3
  if (s3Keys.length > 0) {
    await deleteMultipleFromS3(s3Keys);
  }

  // Delete records from database
  await prisma.upload.deleteMany({
    where: {
      entityType,
      entityId,
    },
  });

  logger.info(`Deleted ${uploads.length} upload records for ${entityType}:${entityId}`);
}

