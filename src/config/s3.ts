import AWS from 'aws-sdk';
import { logger } from '../utils/logger.util';

const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = process.env.AWS_REGION || 'ap-south-1';
const AWS_S3_ENDPOINT = process.env.AWS_S3_ENDPOINT;
// Default to path-style addressing to avoid DNS/certificate issues
// Set AWS_S3_FORCE_PATH_STYLE=false to use virtual-hosted style
const AWS_S3_FORCE_PATH_STYLE = process.env.AWS_S3_FORCE_PATH_STYLE !== 'false';

// Get bucket name from environment, ensuring it doesn't contain paths
const rawBucketName = process.env.AWS_S3_BUCKET || 'menulogs-dev';
// Remove any leading/trailing slashes and paths - bucket name should be just the name
export const S3_BUCKET = rawBucketName.split('/')[0].trim();

// Warn if bucket name appears to contain a path
if (rawBucketName !== S3_BUCKET) {
  logger.warn(`AWS_S3_BUCKET appears to contain a path: "${rawBucketName}". Using bucket name only: "${S3_BUCKET}"`);
}

// Check if S3 is configured
export const isS3Configured = (): boolean => {
  return !!(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY);
};

// Initialize S3 only if credentials are provided
// Use path-style addressing by default to avoid DNS/certificate issues with bucket names
const s3Config: AWS.S3.Types.ClientConfiguration = {
  region: AWS_REGION,
  s3ForcePathStyle: AWS_S3_FORCE_PATH_STYLE, // Defaults to true to avoid hostname/certificate issues
  ...(AWS_S3_ENDPOINT && { endpoint: AWS_S3_ENDPOINT }),
};

if (AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY) {
  s3Config.accessKeyId = AWS_ACCESS_KEY_ID;
  s3Config.secretAccessKey = AWS_SECRET_ACCESS_KEY;
} else if (process.env.NODE_ENV === 'production') {
  logger.warn('AWS S3 credentials not configured. File upload features will be disabled.');
}

const s3 = new AWS.S3(s3Config);

export default s3;

