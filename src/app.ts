// Import types first to ensure Express augmentations are loaded
import './types';

import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.middleware';
import { apiLimiter } from './middleware/rateLimiter.middleware';
import routes from './routes';

const app: Application = express();

// CORS configuration - MUST be before all other middleware
// When credentials are included, cannot use wildcard origin - must specify exact origins
const allowedOrigins = [
  process.env.FRONTEND_URL, // Frontend URL from environment variable
  'https://menulogs.in', // Production frontend
  'http://localhost:5173', // Local development (Vite default)
  'http://localhost:3000', // Alternative dev port
  'http://localhost:5174', // Alternative dev port
].filter(Boolean) as string[]; // Filter out undefined values

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies/credentials to be sent
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Authorization'],
}));

// Security middleware - Configure helmet to not interfere with CORS
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false, // Disable to allow CORS
  crossOriginOpenerPolicy: false, // Disable to allow CORS
}));

// Body parsers - Increased limit to 50MB to accommodate 3 base64-encoded images
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Rate limiting
app.use('/api/', apiLimiter);

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API routes
app.use('/api/v1', routes);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

export default app;

