import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { z } from 'zod';
import { logger } from '../utils/logger.util';
import { generateAccessToken } from '../utils/jwt.util';

// Validation schemas
const createStaffSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  role: z.enum(['MANAGER', 'CASHIER', 'WAITER', 'KITCHEN']).default('WAITER'),
  pin: z.string().min(4).max(6).regex(/^\d+$/, 'PIN must be numeric').optional(),
});

const updateStaffSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  role: z.enum(['MANAGER', 'CASHIER', 'WAITER', 'KITCHEN']).optional(),
  pin: z.string().min(4).max(6).regex(/^\d+$/, 'PIN must be numeric').optional(),
  isActive: z.boolean().optional(),
});

const pinLoginSchema = z.object({
  locationId: z.string().uuid(),
  pin: z.string().min(4).max(6).regex(/^\d+$/, 'PIN must be numeric'),
});

export class StaffController {
  // GET /api/v1/locations/:locationId/staff
  async listByLocation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { locationId } = req.params;
      const userId = req.user!.userId;
      const { includeInactive } = req.query;

      // Verify ownership
      const location = await prisma.location.findFirst({
        where: { id: locationId, business: { ownerId: userId } },
      });

      if (!location) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }

      const where: any = { locationId };
      if (includeInactive !== 'true') {
        where.isActive = true;
      }

      const staff = await prisma.staff.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
          shifts: {
            where: {
              clockOut: null,
            },
            orderBy: { clockIn: 'desc' },
            take: 1,
          },
        },
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
      });

      // Get today's stats for each staff
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const staffWithStats = await Promise.all(
        staff.map(async (member) => {
          const orders = await prisma.order.findMany({
            where: {
              createdById: member.userId || '',
              createdAt: { gte: today },
              status: { not: 'CANCELLED' },
            },
            select: { totalAmount: true },
          });

          const ordersToday = orders.length;
          const revenueToday = orders.reduce(
            (sum, o) => sum + parseFloat(o.totalAmount.toString()),
            0
          );

          return {
            ...member,
            currentShift: member.shifts[0] || null,
            shifts: undefined,
            stats: {
              ordersToday,
              revenueToday,
              averageOrderValue: ordersToday > 0 ? revenueToday / ordersToday : 0,
            },
          };
        })
      );

      res.json({ staff: staffWithStats, total: staff.length });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/staff/:id
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      const staff = await prisma.staff.findFirst({
        where: { id, location: { business: { ownerId: userId } } },
        include: {
          user: { select: { id: true, name: true, email: true } },
          shifts: {
            orderBy: { clockIn: 'desc' },
            take: 10,
          },
        },
      });

      if (!staff) {
        res.status(404).json({ error: 'Staff member not found' });
        return;
      }

      res.json({ staff });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v1/locations/:locationId/staff
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { locationId } = req.params;
      const userId = req.user!.userId;

      // Verify ownership
      const location = await prisma.location.findFirst({
        where: { id: locationId, business: { ownerId: userId } },
      });

      if (!location) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }

      const data = createStaffSchema.parse(req.body);

      // Hash PIN if provided
      let hashedPin: string | undefined;
      if (data.pin) {
        // Check if PIN is unique for this location
        const existingPin = await prisma.staff.findFirst({
          where: { locationId, pin: data.pin },
        });
        if (existingPin) {
          res.status(400).json({ error: 'PIN already in use' });
          return;
        }
        hashedPin = data.pin; // In production, consider hashing
      }

      const staff = await prisma.staff.create({
        data: {
          ...data,
          pin: hashedPin || '',
          locationId,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });

      logger.info(`Staff member ${staff.name} created for location ${locationId}`);
      res.status(201).json({ message: 'Staff member created', staff });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', errors: error.errors });
        return;
      }
      next(error);
    }
  }

  // PATCH /api/v1/staff/:id
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      const existing = await prisma.staff.findFirst({
        where: { id, location: { business: { ownerId: userId } } },
      });

      if (!existing) {
        res.status(404).json({ error: 'Staff member not found' });
        return;
      }

      const data = updateStaffSchema.parse(req.body);

      // Check PIN uniqueness if changing
      if (data.pin && data.pin !== existing.pin) {
        const existingPin = await prisma.staff.findFirst({
          where: { locationId: existing.locationId, pin: data.pin, id: { not: id } },
        });
        if (existingPin) {
          res.status(400).json({ error: 'PIN already in use' });
          return;
        }
      }

      const staff = await prisma.staff.update({
        where: { id },
        data,
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });

      res.json({ message: 'Staff member updated', staff });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', errors: error.errors });
        return;
      }
      next(error);
    }
  }

  // DELETE /api/v1/staff/:id
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      const existing = await prisma.staff.findFirst({
        where: { id, location: { business: { ownerId: userId } } },
      });

      if (!existing) {
        res.status(404).json({ error: 'Staff member not found' });
        return;
      }

      await prisma.staff.delete({ where: { id } });

      logger.info(`Staff member ${existing.name} deleted`);
      res.json({ message: 'Staff member deleted' });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v1/staff/pin-login
  async pinLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { locationId, pin } = pinLoginSchema.parse(req.body);

      const staff = await prisma.staff.findFirst({
        where: { locationId, pin, isActive: true },
        include: {
          location: {
            include: {
              business: true,
            },
          },
        },
      });

      if (!staff) {
        res.status(401).json({ error: 'Invalid PIN' });
        return;
      }

      // Generate token for staff (limited access)
      const token = generateAccessToken({
        userId: staff.userId || staff.id,
        staffId: staff.id,
        locationId: staff.locationId,
        role: staff.role,
      });

      // Auto clock-in if not already clocked in
      const activeShift = await prisma.staffShift.findFirst({
        where: { staffId: staff.id, clockOut: null },
      });

      if (!activeShift) {
        await prisma.staffShift.create({
          data: {
            staffId: staff.id,
            clockIn: new Date(),
          },
        });
      }

      logger.info(`Staff ${staff.name} logged in via PIN at location ${locationId}`);
      res.json({
        message: 'Login successful',
        staff: {
          id: staff.id,
          name: staff.name,
          role: staff.role,
          locationId: staff.locationId,
          locationName: staff.location.name,
        },
        token,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', errors: error.errors });
        return;
      }
      next(error);
    }
  }

  // POST /api/v1/staff/:id/clock-in
  async clockIn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      const staff = await prisma.staff.findFirst({
        where: { id, location: { business: { ownerId: userId } } },
      });

      if (!staff) {
        res.status(404).json({ error: 'Staff member not found' });
        return;
      }

      // Check if already clocked in
      const activeShift = await prisma.staffShift.findFirst({
        where: { staffId: id, clockOut: null },
      });

      if (activeShift) {
        res.status(400).json({ error: 'Already clocked in' });
        return;
      }

      const shift = await prisma.staffShift.create({
        data: {
          staffId: id,
          clockIn: new Date(),
        },
      });

      logger.info(`Staff ${staff.name} clocked in`);
      res.json({ message: 'Clocked in', shift });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v1/staff/:id/clock-out
  async clockOut(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const { notes } = req.body;

      const staff = await prisma.staff.findFirst({
        where: { id, location: { business: { ownerId: userId } } },
      });

      if (!staff) {
        res.status(404).json({ error: 'Staff member not found' });
        return;
      }

      // Find active shift
      const activeShift = await prisma.staffShift.findFirst({
        where: { staffId: id, clockOut: null },
      });

      if (!activeShift) {
        res.status(400).json({ error: 'Not clocked in' });
        return;
      }

      const shift = await prisma.staffShift.update({
        where: { id: activeShift.id },
        data: {
          clockOut: new Date(),
          notes,
        },
      });

      logger.info(`Staff ${staff.name} clocked out`);
      res.json({ message: 'Clocked out', shift });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/staff/:id/shifts
  async getShifts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const { startDate, endDate } = req.query;

      const staff = await prisma.staff.findFirst({
        where: { id, location: { business: { ownerId: userId } } },
      });

      if (!staff) {
        res.status(404).json({ error: 'Staff member not found' });
        return;
      }

      const where: any = { staffId: id };
      if (startDate) where.clockIn = { gte: new Date(startDate as string) };
      if (endDate) {
        where.clockIn = {
          ...where.clockIn,
          lte: new Date(endDate as string),
        };
      }

      const shifts = await prisma.staffShift.findMany({
        where,
        orderBy: { clockIn: 'desc' },
      });

      // Calculate duration for each shift
      const shiftsWithDuration = shifts.map(shift => ({
        ...shift,
        duration: shift.clockOut
          ? Math.floor((shift.clockOut.getTime() - shift.clockIn.getTime()) / 60000)
          : null,
      }));

      res.json({ shifts: shiftsWithDuration });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/staff/:id/stats
  async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const { period = 'today' } = req.query;

      const staff = await prisma.staff.findFirst({
        where: { id, location: { business: { ownerId: userId } } },
      });

      if (!staff) {
        res.status(404).json({ error: 'Staff member not found' });
        return;
      }

      // Calculate date range
      let startDate = new Date();
      startDate.setHours(0, 0, 0, 0);

      if (period === 'week') {
        startDate.setDate(startDate.getDate() - 7);
      } else if (period === 'month') {
        startDate.setMonth(startDate.getMonth() - 1);
      }

      const orders = await prisma.order.findMany({
        where: {
          createdById: staff.userId || '',
          createdAt: { gte: startDate },
          status: { not: 'CANCELLED' },
        },
        select: { totalAmount: true },
      });

      const ordersCount = orders.length;
      const revenue = orders.reduce(
        (sum, o) => sum + parseFloat(o.totalAmount.toString()),
        0
      );

      res.json({
        stats: {
          ordersToday: ordersCount,
          revenueToday: revenue,
          averageOrderValue: ordersCount > 0 ? revenue / ordersCount : 0,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/v1/staff/:id/pin
  async resetPin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const { pin } = z.object({
        pin: z.string().min(4).max(6).regex(/^\d+$/, 'PIN must be numeric'),
      }).parse(req.body);

      const staff = await prisma.staff.findFirst({
        where: { id, location: { business: { ownerId: userId } } },
      });

      if (!staff) {
        res.status(404).json({ error: 'Staff member not found' });
        return;
      }

      // Check PIN uniqueness
      const existingPin = await prisma.staff.findFirst({
        where: { locationId: staff.locationId, pin, id: { not: id } },
      });

      if (existingPin) {
        res.status(400).json({ error: 'PIN already in use' });
        return;
      }

      await prisma.staff.update({
        where: { id },
        data: { pin },
      });

      res.json({ message: 'PIN updated' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', errors: error.errors });
        return;
      }
      next(error);
    }
  }

  // GET /api/v1/staff/:id/orders
  async getStaffOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const { date, status } = req.query;

      const staff = await prisma.staff.findFirst({
        where: { id, location: { business: { ownerId: userId } } },
      });

      if (!staff) {
        res.status(404).json({ error: 'Staff member not found' });
        return;
      }

      const where: any = {
        OR: [
          { createdById: staff.userId },
          { servedById: staff.userId },
        ],
      };

      if (date) {
        const startDate = new Date(date as string);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(date as string);
        endDate.setHours(23, 59, 59, 999);
        where.createdAt = { gte: startDate, lte: endDate };
      }

      if (status) {
        where.status = status;
      }

      const orders = await prisma.order.findMany({
        where,
        include: {
          table: { select: { id: true, number: true, name: true } },
          items: {
            include: {
              menuItem: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      res.json({ orders });
    } catch (error) {
      next(error);
    }
  }
}

export default new StaffController();

