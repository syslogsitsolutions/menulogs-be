import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import app from './app';
import prisma from './config/database';
import redis from './config/redis';
import logger from './utils/logger.util';
import { initializeMonthlyUsageResetJob } from './jobs/monthlyUsageReset.job';
import { initializeSubscriptionExpiryJob } from './jobs/subscriptionExpiry.job';
import { initializeTrialExpiryJob } from './jobs/trialExpiry.job';
import { initializeSocket } from './socket';

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info('✅ Database connected...');

    // Test Redis connection with proper error handling
    try {
      await redis.ping();
      logger.info('✅ Redis connected...');
    } catch (redisError: any) {
      logger.error('❌ Redis connection failed:', redisError.message);
      if (redisError.message.includes('NOAUTH') || redisError.message.includes('Authentication required')) {
        logger.error('⚠️ Redis requires authentication. Please set REDIS_PASSWORD or REDIS_URL environment variable.');
        logger.warn('⚠️ Server will continue without Redis caching. Some features may be limited.');
      } else {
        logger.warn('⚠️ Redis connection failed. Server will continue without Redis caching.');
      }
      // Don't exit - allow server to start without Redis
    }

    // Create HTTP server
    const httpServer = http.createServer(app);

    // Initialize Socket.IO
    await initializeSocket(httpServer);
    logger.info('✅ Socket.IO initialized...');

    // Initialize scheduled jobs
    initializeMonthlyUsageResetJob();
    initializeSubscriptionExpiryJob();
    initializeTrialExpiryJob();

    // Start server
    httpServer.listen(PORT, () => {
      logger.info(`🚀 Server running on http://localhost:${PORT}`);
      logger.info(`🔌 WebSocket server ready`);
      logger.info(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections (like Redis errors)
process.on('unhandledRejection', (reason: any, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason?.message || reason);
  // Don't exit - log and continue
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await prisma.$disconnect();
  try {
    await redis.quit();
  } catch (error) {
    logger.warn('Error closing Redis connection:', error);
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await prisma.$disconnect();
  try {
    await redis.quit();
  } catch (error) {
    logger.warn('Error closing Redis connection:', error);
  }
  process.exit(0);
});

startServer();

