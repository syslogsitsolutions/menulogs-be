import { Request, Response, NextFunction } from 'express';
import analyticsService from '../services/analytics.service';
import prisma from '../config/database';
import { logger } from '../utils/logger.util';

export class AnalyticsController {
  /**
   * GET /api/v1/locations/:locationId/analytics
   * Get analytics for a location
   */
  async getAnalytics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { locationId } = req.params;
      const userId = req.user!.userId;
      const { startDate, endDate } = req.query;

      // Verify ownership
      const location = await prisma.location.findFirst({
        where: {
          id: locationId,
          business: { ownerId: userId },
        },
      });

      if (!location) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }

      // Parse date range if provided
      let start: Date | undefined;
      let end: Date | undefined;

      if (startDate) {
        start = new Date(startDate as string);
        start.setHours(0, 0, 0, 0);
      }

      if (endDate) {
        end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
      }

      // If one date is provided, both should be provided
      if ((start && !end) || (!start && end)) {
        res.status(400).json({ error: 'Both startDate and endDate must be provided together' });
        return;
      }

      const analytics = await analyticsService.getAnalytics(locationId, start, end);

      res.json({
        success: true,
        data: analytics,
      });
    } catch (error: any) {
      logger.error('Error fetching analytics:', error);
      next(error);
    }
  }

  /**
   * GET /api/v1/locations/:locationId/reports/summary
   * Get summary report for a location
   */
  async getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { locationId } = req.params;
      const userId = req.user!.userId;
      const { period = '7d' } = req.query; // 7d, 30d, 90d, 1y

      // Verify ownership
      const location = await prisma.location.findFirst({
        where: {
          id: locationId,
          business: { ownerId: userId },
        },
      });

      if (!location) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }

      // Calculate date range based on period
      const endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
      const startDate = new Date();

      switch (period) {
        case '7d':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(endDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(endDate.getDate() - 90);
          break;
        case '1y':
          startDate.setFullYear(endDate.getFullYear() - 1);
          break;
        default:
          startDate.setDate(endDate.getDate() - 7);
      }

      startDate.setHours(0, 0, 0, 0);

      const analytics = await analyticsService.getAnalytics(locationId, startDate, endDate);

      res.json({
        success: true,
        data: {
          period,
          ...analytics,
        },
      });
    } catch (error: any) {
      logger.error('Error fetching summary report:', error);
      next(error);
    }
  }
}

export default new AnalyticsController();

