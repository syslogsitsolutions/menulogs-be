import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { Decimal } from 'decimal.js';
import { z } from 'zod';
import { logger } from '../utils/logger.util';
import { emitToLocation, emitToKitchen, emitToStaff } from '../socket';

// Validation schemas
const orderItemSchema = z.object({
  menuItemId: z.string().uuid(),
  quantity: z.number().int().positive(),
  notes: z.string().optional(),
  modifiers: z.record(z.any()).optional(),
});

const createOrderSchema = z.object({
  tableId: z.string().uuid().optional(),
  type: z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY']).default('DINE_IN'),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  customerEmail: z.string().email().optional(),
  items: z.array(orderItemSchema).min(1),
  notes: z.string().optional(),
  specialRequests: z.string().optional(),
  status: z.enum(['PENDING', 'CONFIRMED']).optional(), // Allow setting initial status
});

const updateStatusSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED']),
});

const addItemSchema = orderItemSchema;

const paymentSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(['cash', 'card', 'upi', 'razorpay']),
  transactionId: z.string().optional(),
});

export class OrderController {
  // Helper: Generate order number (sequential per day per location)
  private async generateOrderNumber(locationId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastOrder = await prisma.order.findFirst({
      where: {
        locationId,
        createdAt: { gte: today },
      },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });

    return (lastOrder?.orderNumber || 0) + 1;
  }

  // Helper: Calculate order totals
  private calculateTotals(
    items: { unitPrice: Decimal; quantity: number }[],
    taxRate: Decimal | null
  ): { subtotal: Decimal; taxAmount: Decimal; totalAmount: Decimal } {
    const subtotal = items.reduce(
      (sum, item) => sum.add(item.unitPrice.mul(item.quantity)),
      new Decimal(0)
    );
    const taxAmount = taxRate ? subtotal.mul(taxRate).div(100) : new Decimal(0);
    const totalAmount = subtotal.add(taxAmount);

    return { subtotal, taxAmount, totalAmount };
  }

  // GET /api/v1/locations/:locationId/orders
  async listByLocation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { locationId } = req.params;
      const userId = req.user!.userId;
      const { status, type, tableId, startDate, endDate, search, page = '1', limit = '50' } = req.query;

      // Verify ownership
      const location = await prisma.location.findFirst({
        where: { id: locationId, business: { ownerId: userId } },
      });

      if (!location) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }

      const where: any = { locationId };

      if (status) where.status = status;
      if (type) where.type = type;
      if (tableId) where.tableId = tableId;
      if (startDate) where.createdAt = { gte: new Date(startDate as string) };
      if (endDate) {
        where.createdAt = {
          ...where.createdAt,
          lte: new Date(endDate as string),
        };
      }
      if (search) {
        where.OR = [
          { orderNumber: { equals: parseInt(search as string) || -1 } },
          { customerName: { contains: search as string, mode: 'insensitive' } },
          { customerPhone: { contains: search as string } },
        ];
      }

      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

      const [orders, total] = await Promise.all([
        prisma.order.findMany({
          where,
          include: {
            table: { select: { id: true, number: true, name: true } },
            items: {
              include: {
                menuItem: { select: { id: true, name: true, image: true, price: true } },
              },
            },
            createdBy: { select: { id: true, name: true } },
            servedBy: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: parseInt(limit as string),
        }),
        prisma.order.count({ where }),
      ]);

      res.json({
        orders,
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/orders/:id
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      const order = await prisma.order.findFirst({
        where: { id, location: { business: { ownerId: userId } } },
        include: {
          table: { select: { id: true, number: true, name: true } },
          items: {
            include: {
              menuItem: { select: { id: true, name: true, image: true, price: true } },
            },
          },
          timeline: { orderBy: { createdAt: 'asc' } },
          payments: { orderBy: { createdAt: 'asc' } },
          createdBy: { select: { id: true, name: true } },
          servedBy: { select: { id: true, name: true } },
        },
      });

      if (!order) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }

      res.json({ order });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v1/locations/:locationId/orders
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

      const data = createOrderSchema.parse(req.body);

      // Validate table if provided
      if (data.tableId) {
        const table = await prisma.table.findFirst({
          where: { id: data.tableId, locationId },
        });
        if (!table) {
          res.status(400).json({ error: 'Table not found' });
          return;
        }
      }

      // Fetch menu items and validate
      const menuItemIds = data.items.map(item => item.menuItemId);
      const menuItems = await prisma.menuItem.findMany({
        where: { id: { in: menuItemIds }, locationId, availability: 'IN_STOCK' },
      });

      if (menuItems.length !== menuItemIds.length) {
        res.status(400).json({ error: 'Some menu items are not available' });
        return;
      }

      const menuItemMap = new Map(menuItems.map(item => [item.id, item]));

      // Generate order number
      const orderNumber = await this.generateOrderNumber(locationId);

      // Prepare order items with prices
      const orderItems = data.items.map(item => {
        const menuItem = menuItemMap.get(item.menuItemId)!;
        return {
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          unitPrice: menuItem.price,
          totalPrice: menuItem.price.mul(item.quantity),
          notes: item.notes,
          modifiers: item.modifiers,
        };
      });

      // Calculate totals
      const { subtotal, taxAmount, totalAmount } = this.calculateTotals(
        orderItems,
        null // TODO: Add taxRate to Location model if needed
      );

      // Determine initial status: CONFIRMED if sent directly to kitchen, PENDING if needs confirmation
      const initialStatus = data.status || 'PENDING';
      
      // Set confirmedAt timestamp if status is CONFIRMED
      const confirmedAt = initialStatus === 'CONFIRMED' ? new Date() : undefined;

      // Create order with items
      const order = await prisma.order.create({
        data: {
          locationId,
          tableId: data.tableId,
          orderNumber,
          type: data.type,
          status: initialStatus,
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          customerEmail: data.customerEmail,
          notes: data.notes,
          specialRequests: data.specialRequests,
          subtotal,
          taxAmount,
          totalAmount,
          createdById: userId,
          confirmedAt,
          items: {
            create: orderItems,
          },
          timeline: {
            create: {
              action: initialStatus === 'CONFIRMED' ? 'confirmed' : 'created',
              description: initialStatus === 'CONFIRMED' 
                ? `Order #${orderNumber} confirmed and sent to kitchen`
                : `Order #${orderNumber} created - pending confirmation`,
              userId,
            },
          },
        },
        include: {
          table: { select: { id: true, number: true, name: true } },
          items: {
            include: {
              menuItem: { select: { id: true, name: true, image: true, price: true } },
            },
          },
          createdBy: { select: { id: true, name: true } },
        },
      });

      // Update table status if dine-in
      if (data.tableId && data.type === 'DINE_IN') {
        await prisma.table.update({
          where: { id: data.tableId },
          data: { status: 'OCCUPIED' },
        });
      }

      logger.info(`Order #${orderNumber} created for location ${locationId}`);

      // Emit WebSocket event
      emitToLocation(locationId, 'order:created', {
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          type: order.type,
          status: order.status,
          tableId: order.tableId,
          tableName: order.table?.name,
          tableNumber: order.table?.number,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          items: order.items.map(item => ({
            id: item.id,
            menuItemId: item.menuItemId,
            menuItemName: item.menuItem.name,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice),
            totalPrice: Number(item.totalPrice),
            notes: item.notes,
            status: item.status,
          })),
          subtotal: Number(order.subtotal),
          taxAmount: Number(order.taxAmount),
          totalAmount: Number(order.totalAmount),
          notes: order.notes,
          createdAt: order.createdAt.toISOString(),
          createdBy: {
            id: order.createdBy.id,
            name: order.createdBy.name,
            role: req.user!.role,
          },
        },
        metadata: {
          locationId,
          timestamp: new Date().toISOString(),
        },
      });

      // Only emit to kitchen if order is CONFIRMED (not PENDING - those need confirmation first)
      if (order.status === 'CONFIRMED') {
        emitToKitchen(locationId, 'order:created', {
          order: {
            id: order.id,
            orderNumber: order.orderNumber,
            type: order.type,
            status: order.status,
            tableId: order.tableId,
            tableName: order.table?.name,
            tableNumber: order.table?.number,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            items: order.items.map(item => ({
              id: item.id,
              menuItemId: item.menuItemId,
              menuItemName: item.menuItem.name,
              quantity: item.quantity,
              unitPrice: Number(item.unitPrice),
              totalPrice: Number(item.totalPrice),
              notes: item.notes,
              status: item.status,
            })),
            subtotal: Number(order.subtotal),
            taxAmount: Number(order.taxAmount),
            totalAmount: Number(order.totalAmount),
            notes: order.notes,
            createdAt: order.createdAt.toISOString(),
            createdBy: {
              id: order.createdBy.id,
              name: order.createdBy.name,
              role: req.user!.role,
            },
          },
          metadata: {
            locationId,
            timestamp: new Date().toISOString(),
          },
        });
      }

      res.status(201).json({ message: 'Order created', order });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', errors: error.errors });
        return;
      }
      next(error);
    }
  }

  // PATCH /api/v1/orders/:id/status
  async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      const existing = await prisma.order.findFirst({
        where: { id, location: { business: { ownerId: userId } } },
        include: { table: true },
      });

      if (!existing) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }

      const { status } = updateStatusSchema.parse(req.body);

      // Build update data with timestamps
      const updateData: any = { status };
      const now = new Date();

      switch (status) {
        case 'CONFIRMED':
          updateData.confirmedAt = now;
          break;
        case 'PREPARING':
          updateData.preparingAt = now;
          break;
        case 'READY':
          updateData.readyAt = now;
          break;
        case 'SERVED':
          updateData.servedAt = now;
          updateData.servedById = userId;
          break;
        case 'COMPLETED':
          updateData.completedAt = now;
          break;
        case 'CANCELLED':
          updateData.cancelledAt = now;
          break;
      }

      const order = await prisma.order.update({
        where: { id },
        data: updateData,
        include: {
          table: { select: { id: true, number: true, name: true } },
          items: {
            include: {
              menuItem: { select: { id: true, name: true, image: true, price: true } },
            },
          },
        },
      });

      // Add timeline entry
      await prisma.orderTimeline.create({
        data: {
          orderId: id,
          action: 'status_changed',
          description: `Order status changed to ${status}`,
          userId,
        },
      });

      // Update table status if completed or cancelled
      if (existing.tableId && ['COMPLETED', 'CANCELLED'].includes(status)) {
        // Check if table has other active orders
        const activeOrders = await prisma.order.count({
          where: {
            tableId: existing.tableId,
            id: { not: id },
            status: {
              in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED'],
            },
          },
        });

        if (activeOrders === 0) {
          await prisma.table.update({
            where: { id: existing.tableId },
            data: { status: 'CLEANING' },
          });
        }
      }

      logger.info(`Order #${order.orderNumber} status updated to ${status}`);

      // Emit WebSocket event
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });

      const statusChangeData = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        oldStatus: existing.status,
        newStatus: status,
        changedBy: {
          id: userId,
          name: user?.name || 'Unknown',
          role: req.user!.role,
        },
        timestamp: new Date().toISOString(),
      };

      // Emit to location room (for Orders page, POS, etc.)
      emitToLocation(existing.locationId, 'order:status-changed', statusChangeData);

      // Emit to kitchen room (for Kitchen Display)
      emitToKitchen(existing.locationId, 'order:status-changed', statusChangeData);

      // If status is READY, notify staff who created the order
      if (status === 'READY' && existing.createdById) {
        emitToStaff(existing.createdById, 'order:status-changed', statusChangeData);
      }

      res.json({ message: 'Order status updated', order });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', errors: error.errors });
        return;
      }
      next(error);
    }
  }

  // POST /api/v1/orders/:id/items
  async addItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      const existing = await prisma.order.findFirst({
        where: { id, location: { business: { ownerId: userId } } },
        include: { location: true },
      });

      if (!existing) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }

      // Can only add items to non-completed orders
      if (['COMPLETED', 'CANCELLED'].includes(existing.status)) {
        res.status(400).json({ error: 'Cannot add items to completed or cancelled orders' });
        return;
      }

      const data = addItemSchema.parse(req.body);

      // Validate menu item
      const menuItem = await prisma.menuItem.findFirst({
        where: { id: data.menuItemId, locationId: existing.locationId, availability: 'IN_STOCK' },
      });

      if (!menuItem) {
        res.status(400).json({ error: 'Menu item not available' });
        return;
      }

      // Create order item
      await prisma.orderItem.create({
        data: {
          orderId: id,
          menuItemId: data.menuItemId,
          quantity: data.quantity,
          unitPrice: menuItem.price,
          totalPrice: menuItem.price.mul(data.quantity),
          notes: data.notes,
          modifiers: data.modifiers,
        },
      });

      // Recalculate totals
      const items = await prisma.orderItem.findMany({
        where: { orderId: id },
      });

      const { subtotal, taxAmount, totalAmount } = this.calculateTotals(
        items,
        null // TODO: Add taxRate to Location model if needed
      );

      const order = await prisma.order.update({
        where: { id },
        data: { subtotal, taxAmount, totalAmount },
        include: {
          table: { select: { id: true, number: true, name: true } },
          items: {
            include: {
              menuItem: { select: { id: true, name: true, image: true, price: true } },
            },
          },
        },
      });

      // Add timeline entry
      await prisma.orderTimeline.create({
        data: {
          orderId: id,
          action: 'item_added',
          description: `Added ${data.quantity}x ${menuItem.name}`,
          userId,
        },
      });

      res.json({ message: 'Item added', order });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', errors: error.errors });
        return;
      }
      next(error);
    }
  }

  // DELETE /api/v1/order-items/:id
  async removeItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      const item = await prisma.orderItem.findFirst({
        where: { id },
        include: {
          order: {
            include: {
              location: { include: { business: true } },
            },
          },
          menuItem: true,
        },
      });

      if (!item || item.order.location.business.ownerId !== userId) {
        res.status(404).json({ error: 'Order item not found' });
        return;
      }

      // Can only remove items from non-completed orders
      if (['COMPLETED', 'CANCELLED'].includes(item.order.status)) {
        res.status(400).json({ error: 'Cannot remove items from completed or cancelled orders' });
        return;
      }

      await prisma.orderItem.delete({ where: { id } });

      // Recalculate totals
      const items = await prisma.orderItem.findMany({
        where: { orderId: item.orderId },
      });

      const { subtotal, taxAmount, totalAmount } = this.calculateTotals(
        items,
        null // TODO: Add taxRate to Location model if needed
      );

      await prisma.order.update({
        where: { id: item.orderId },
        data: { subtotal, taxAmount, totalAmount },
      });

      // Add timeline entry
      await prisma.orderTimeline.create({
        data: {
          orderId: item.orderId,
          action: 'item_removed',
          description: `Removed ${item.quantity}x ${item.menuItem.name}`,
          userId,
        },
      });

      res.json({ message: 'Item removed' });
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/v1/order-items/:id/status
  async updateItemStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      const item = await prisma.orderItem.findFirst({
        where: { id },
        include: {
          order: {
            include: {
              location: { include: { business: true } },
            },
          },
        },
      });

      if (!item || item.order.location.business.ownerId !== userId) {
        res.status(404).json({ error: 'Order item not found' });
        return;
      }

      const { status } = z.object({
        status: z.enum(['PENDING', 'SENT_TO_KITCHEN', 'PREPARING', 'READY', 'SERVED', 'CANCELLED']),
      }).parse(req.body);

      // Build update data with timestamps
      const updateData: any = { status };
      const now = new Date();

      switch (status) {
        case 'SENT_TO_KITCHEN':
          updateData.sentToKitchenAt = now;
          break;
        case 'PREPARING':
          updateData.startedAt = now;
          break;
        case 'READY':
        case 'SERVED':
          updateData.completedAt = now;
          break;
      }

      const orderItem = await prisma.orderItem.update({
        where: { id },
        data: updateData,
        include: {
          menuItem: { select: { id: true, name: true, image: true, price: true } },
        },
      });

      res.json({ message: 'Item status updated', orderItem });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', errors: error.errors });
        return;
      }
      next(error);
    }
  }

  // POST /api/v1/orders/:id/payments
  async addPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      const existing = await prisma.order.findFirst({
        where: { id, location: { business: { ownerId: userId } } },
        include: { payments: true },
      });

      if (!existing) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }

      const data = paymentSchema.parse(req.body);

      // Create payment
      await prisma.orderPayment.create({
        data: {
          orderId: id,
          amount: new Decimal(data.amount),
          method: data.method,
          transactionId: data.transactionId,
        },
      });

      // Calculate total paid
      const payments = await prisma.orderPayment.findMany({
        where: { orderId: id, status: 'completed' },
      });

      const totalPaid = payments.reduce(
        (sum, p) => sum.add(p.amount),
        new Decimal(0)
      );

      // Update payment status
      let paymentStatus: 'PENDING' | 'PARTIAL' | 'PAID' = 'PENDING';
      if (totalPaid.gte(existing.totalAmount)) {
        paymentStatus = 'PAID';
      } else if (totalPaid.gt(0)) {
        paymentStatus = 'PARTIAL';
      }

      const order = await prisma.order.update({
        where: { id },
        data: {
          paymentStatus,
          paymentMethod: data.method,
        },
        include: {
          table: { select: { id: true, number: true, name: true } },
          items: {
            include: {
              menuItem: { select: { id: true, name: true, image: true, price: true } },
            },
          },
          payments: true,
        },
      });

      // Add timeline entry
      await prisma.orderTimeline.create({
        data: {
          orderId: id,
          action: 'payment_added',
          description: `Payment of $${data.amount} received via ${data.method}`,
          userId,
        },
      });

      logger.info(`Payment of $${data.amount} added to order #${order.orderNumber}`);
      res.json({ message: 'Payment added', order });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', errors: error.errors });
        return;
      }
      next(error);
    }
  }

  // GET /api/v1/orders/:id/timeline
  async getTimeline(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      const order = await prisma.order.findFirst({
        where: { id, location: { business: { ownerId: userId } } },
      });

      if (!order) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }

      const timeline = await prisma.orderTimeline.findMany({
        where: { orderId: id },
        orderBy: { createdAt: 'asc' },
      });

      res.json({ timeline });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/locations/:locationId/kitchen-orders
  async getKitchenOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
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

      const orders = await prisma.order.findMany({
        where: {
          locationId,
          status: {
            in: ['CONFIRMED', 'PREPARING'],
          },
        },
        include: {
          table: { select: { id: true, number: true, name: true } },
          items: {
            where: {
              status: {
                in: ['PENDING', 'SENT_TO_KITCHEN', 'PREPARING'],
              },
            },
            include: {
              menuItem: { select: { id: true, name: true, image: true } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      // Only return orders that have items to prepare
      const ordersWithItems = orders.filter(order => order.items.length > 0);

      res.json({ orders: ordersWithItems });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v1/orders/:id/cancel
  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const { reason } = req.body;

      const existing = await prisma.order.findFirst({
        where: { id, location: { business: { ownerId: userId } } },
      });

      if (!existing) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }

      if (['COMPLETED', 'CANCELLED'].includes(existing.status)) {
        res.status(400).json({ error: 'Order cannot be cancelled' });
        return;
      }

      const order = await prisma.order.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
        },
        include: {
          table: { select: { id: true, number: true, name: true } },
          items: {
            include: {
              menuItem: { select: { id: true, name: true, image: true, price: true } },
            },
          },
        },
      });

      // Update all items to cancelled
      await prisma.orderItem.updateMany({
        where: { orderId: id },
        data: { status: 'CANCELLED' },
      });

      // Add timeline entry
      await prisma.orderTimeline.create({
        data: {
          orderId: id,
          action: 'cancelled',
          description: reason || 'Order cancelled',
          userId,
        },
      });

      // Update table status if needed
      if (existing.tableId) {
        const activeOrders = await prisma.order.count({
          where: {
            tableId: existing.tableId,
            id: { not: id },
            status: {
              in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED'],
            },
          },
        });

        if (activeOrders === 0) {
          await prisma.table.update({
            where: { id: existing.tableId },
            data: { status: 'AVAILABLE' },
          });
        }
      }

      logger.info(`Order #${order.orderNumber} cancelled`);
      res.json({ message: 'Order cancelled', order });
    } catch (error) {
      next(error);
    }
  }
}

const orderController = new OrderController();

// Bind all methods to preserve 'this' context
export default {
  listByLocation: orderController.listByLocation.bind(orderController),
  getKitchenOrders: orderController.getKitchenOrders.bind(orderController),
  getById: orderController.getById.bind(orderController),
  getTimeline: orderController.getTimeline.bind(orderController),
  create: orderController.create.bind(orderController),
  updateStatus: orderController.updateStatus.bind(orderController),
  addItem: orderController.addItem.bind(orderController),
  removeItem: orderController.removeItem.bind(orderController),
  updateItemStatus: orderController.updateItemStatus.bind(orderController),
  addPayment: orderController.addPayment.bind(orderController),
  cancel: orderController.cancel.bind(orderController),
};

