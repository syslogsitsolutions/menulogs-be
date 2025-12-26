// Metrics Routes - Monitor system health and WebSocket connections

import { Router, Request, Response } from 'express';
import { getSocketStats } from '../socket';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

/**
 * GET /metrics/websocket
 * Get WebSocket connection statistics
 */
router.get('/websocket', authenticate, async (_req: Request, res: Response) => {
  try {
    const stats = getSocketStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve WebSocket stats',
    });
  }
});

/**
 * GET /metrics/health
 * System health check
 */
router.get('/health', async (_req: Request, res: Response) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

export default router;

