import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { z } from 'zod';
import { logger } from '../utils/logger.util';

// Validation schemas
const createTableSchema = z.object({
  number: z.number().int().positive(),
  name: z.string().optional(),
  capacity: z.number().int().positive().default(4),
});

const updateTableSchema = z.object({
  number: z.number().int().positive().optional(),
  name: z.string().optional().nullable(),
  capacity: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING']),
});

export class TableController {
  // GET /api/v1/locations/:locationId/tables
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

      const tables = await prisma.table.findMany({
        where,
        include: {
          orders: {
            where: {
              status: {
                in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED'],
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              orderNumber: true,
              totalAmount: true,
              createdAt: true,
              status: true,
            },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { number: 'asc' }],
      });

      // Transform to include currentOrder
      const tablesWithCurrentOrder = tables.map(table => ({
        ...table,
        currentOrder: table.orders[0] || null,
        orders: undefined,
      }));

      res.json({ tables: tablesWithCurrentOrder, total: tables.length });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/tables/:id
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const { includeOrder } = req.query;

      const table = await prisma.table.findFirst({
        where: { id, location: { business: { ownerId: userId } } },
        include: includeOrder === 'true' ? {
          orders: {
            where: {
              status: {
                in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED'],
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: {
              items: {
                include: {
                  menuItem: {
                    select: { id: true, name: true, image: true, price: true },
                  },
                },
              },
            },
          },
        } : undefined,
      });

      if (!table) {
        res.status(404).json({ error: 'Table not found' });
        return;
      }

      res.json({ table });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v1/locations/:locationId/tables
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

      const data = createTableSchema.parse(req.body);

      // Check if table number already exists
      const existingTable = await prisma.table.findFirst({
        where: { locationId, number: data.number },
      });

      if (existingTable) {
        res.status(400).json({ error: `Table number ${data.number} already exists` });
        return;
      }

      // Get max sort order
      const maxOrder = await prisma.table.findFirst({
        where: { locationId },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });

      const table = await prisma.table.create({
        data: {
          ...data,
          locationId,
          sortOrder: (maxOrder?.sortOrder || 0) + 1,
        },
      });

      logger.info(`Table ${table.number} created for location ${locationId}`);
      res.status(201).json({ message: 'Table created', table });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', errors: error.errors });
        return;
      }
      next(error);
    }
  }

  // PATCH /api/v1/tables/:id
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      const existing = await prisma.table.findFirst({
        where: { id, location: { business: { ownerId: userId } } },
      });

      if (!existing) {
        res.status(404).json({ error: 'Table not found' });
        return;
      }

      const data = updateTableSchema.parse(req.body);

      // If changing number, check it doesn't conflict
      if (data.number && data.number !== existing.number) {
        const conflicting = await prisma.table.findFirst({
          where: { locationId: existing.locationId, number: data.number, id: { not: id } },
        });
        if (conflicting) {
          res.status(400).json({ error: `Table number ${data.number} already exists` });
          return;
        }
      }

      const table = await prisma.table.update({
        where: { id },
        data,
      });

      res.json({ message: 'Table updated', table });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', errors: error.errors });
        return;
      }
      next(error);
    }
  }

  // PATCH /api/v1/tables/:id/status
  async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      const existing = await prisma.table.findFirst({
        where: { id, location: { business: { ownerId: userId } } },
      });

      if (!existing) {
        res.status(404).json({ error: 'Table not found' });
        return;
      }

      const { status } = updateStatusSchema.parse(req.body);

      const table = await prisma.table.update({
        where: { id },
        data: { status },
      });

      logger.info(`Table ${table.number} status updated to ${status}`);
      res.json({ message: 'Table status updated', table });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', errors: error.errors });
        return;
      }
      next(error);
    }
  }

  // DELETE /api/v1/tables/:id
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      const existing = await prisma.table.findFirst({
        where: { id, location: { business: { ownerId: userId } } },
        include: {
          orders: {
            where: {
              status: {
                in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED'],
              },
            },
          },
        },
      });

      if (!existing) {
        res.status(404).json({ error: 'Table not found' });
        return;
      }

      // Don't allow deletion if there are active orders
      if (existing.orders.length > 0) {
        res.status(400).json({ error: 'Cannot delete table with active orders' });
        return;
      }

      await prisma.table.delete({ where: { id } });

      logger.info(`Table ${existing.number} deleted`);
      res.json({ message: 'Table deleted' });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v1/locations/:locationId/tables/bulk
  async bulkCreate(req: Request, res: Response, next: NextFunction): Promise<void> {
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

      const { count, startNumber, capacity } = z.object({
        count: z.number().int().positive().max(50),
        startNumber: z.number().int().positive(),
        capacity: z.number().int().positive().default(4),
      }).parse(req.body);

      // Get max sort order
      const maxOrder = await prisma.table.findFirst({
        where: { locationId },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });

      let currentSortOrder = (maxOrder?.sortOrder || 0) + 1;
      const tables = [];

      for (let i = 0; i < count; i++) {
        const tableNumber = startNumber + i;
        
        // Check if table number exists
        const existing = await prisma.table.findFirst({
          where: { locationId, number: tableNumber },
        });

        if (!existing) {
          const table = await prisma.table.create({
            data: {
              locationId,
              number: tableNumber,
              capacity,
              sortOrder: currentSortOrder++,
            },
          });
          tables.push(table);
        }
      }

      res.status(201).json({ 
        message: `${tables.length} tables created`, 
        tables,
        skipped: count - tables.length,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', errors: error.errors });
        return;
      }
      next(error);
    }
  }

  // POST /api/v1/locations/:locationId/tables/reorder
  async reorder(req: Request, res: Response, next: NextFunction): Promise<void> {
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

      const { tableIds } = z.object({
        tableIds: z.array(z.string().uuid()),
      }).parse(req.body);

      // Update sort orders
      await Promise.all(
        tableIds.map((id, index) =>
          prisma.table.update({
            where: { id },
            data: { sortOrder: index },
          })
        )
      );

      res.json({ message: 'Tables reordered' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', errors: error.errors });
        return;
      }
      next(error);
    }
  }
}

export default new TableController();

