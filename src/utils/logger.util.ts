import winston from 'winston';
import fs from 'fs';
import path from 'path';

const LOG_DIR = process.env.LOG_DIR || 'logs';
const LOG_ERROR_FILE = process.env.LOG_ERROR_FILE || path.join(LOG_DIR, 'error.log');
const LOG_COMBINED_FILE = process.env.LOG_COMBINED_FILE || path.join(LOG_DIR, 'combined.log');

// Ensure log directory exists in production
if (process.env.NODE_ENV === 'production') {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

// File logging in production
if (process.env.NODE_ENV === 'production') {
  logger.add(
    new winston.transports.File({ filename: LOG_ERROR_FILE, level: 'error' })
  );
  logger.add(new winston.transports.File({ filename: LOG_COMBINED_FILE }));
}

export { logger };
export default logger;

