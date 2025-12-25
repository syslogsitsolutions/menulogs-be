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

    // Test Redis connection
    await redis.ping();
    logger.info('✅ Redis connected...');

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

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
});

startServer();

