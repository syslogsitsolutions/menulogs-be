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

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow cross-origin requests
}));

// CORS configuration - must be before other middleware
// Allow multiple origins for dev and prod
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'https://app.menulogs.in',
  'https://app-dev.menulogs.in',
].filter(Boolean); // Remove undefined values

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, Postman, curl)
      if (!origin) return callback(null, true);
      
      // Normalize origin (remove trailing slash, convert to lowercase for comparison)
      const normalizedOrigin = origin.toLowerCase().replace(/\/$/, '');
      const normalizedAllowed = allowedOrigins.map(o => o?.toLowerCase().replace(/\/$/, ''));
      
      if (normalizedAllowed.includes(normalizedOrigin)) {
        callback(null, true);
      } else {
        // In production, be strict; in development, allow all
        if (process.env.NODE_ENV === 'production') {
          console.warn(`CORS blocked origin: ${origin}`);
          callback(new Error('Not allowed by CORS'));
        } else {
          callback(null, true);
        }
      }
    },
    credentials: true, // Allow cookies to be sent
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'Access-Control-Request-Method',
      'Access-Control-Request-Headers',
    ],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 86400, // 24 hours - cache preflight requests
  })
);

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

