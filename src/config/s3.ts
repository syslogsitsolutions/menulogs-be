import AWS from 'aws-sdk';
import { logger } from '../utils/logger.util';

const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = process.env.AWS_REGION || 'ap-south-1';
const AWS_S3_ENDPOINT = process.env.AWS_S3_ENDPOINT;
const AWS_S3_FORCE_PATH_STYLE = process.env.AWS_S3_FORCE_PATH_STYLE === 'true';

export const S3_BUCKET = process.env.AWS_S3_BUCKET || 'menulogs-dev';

// Check if S3 is configured
export const isS3Configured = (): boolean => {
  return !!(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY);
};

// Initialize S3 only if credentials are provided
const s3Config: AWS.S3.Types.ClientConfiguration = {
  region: AWS_REGION,
  ...(AWS_S3_ENDPOINT && { endpoint: AWS_S3_ENDPOINT }),
  ...(AWS_S3_FORCE_PATH_STYLE && { s3ForcePathStyle: true }),
};

if (AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY) {
  s3Config.accessKeyId = AWS_ACCESS_KEY_ID;
  s3Config.secretAccessKey = AWS_SECRET_ACCESS_KEY;
} else if (process.env.NODE_ENV === 'production') {
  logger.warn('AWS S3 credentials not configured. File upload features will be disabled.');
}

const s3 = new AWS.S3(s3Config);

export default s3;

