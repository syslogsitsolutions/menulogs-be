import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { logger } from '../utils/logger.util';

export class PrintController {
  // GET /api/v1/orders/:id/kot
  async getKOT(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      // Get order with all necessary relations
      const order = await prisma.order.findFirst({
        where: {
          id,
          location: {
            business: { ownerId: userId },
          },
        },
        include: {
          location: {
            include: {
              business: {
                select: {
                  id: true,
                  name: true,
                  logo: true,
                },
              },
            },
          },
          table: {
            select: {
              id: true,
              number: true,
              name: true,
            },
          },
          items: {
            include: {
              menuItem: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                },
              },
            },
            orderBy: {
              createdAt: 'asc',
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!order) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }

      // Transform to KOT format
      const kot = {
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          type: order.type,
          createdAt: order.createdAt.toISOString(),
          table: order.table
            ? {
                number: order.table.number,
                name: order.table.name,
              }
            : null,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          items: order.items.map((item) => ({
            id: item.id,
            menuItemName: item.menuItem.name,
            quantity: item.quantity,
            notes: item.notes,
            modifiers: item.modifiers,
            status: item.status,
          })),
          createdBy: {
            name: order.createdBy.name,
          },
        },
        location: {
          name: order.location.name,
          address: order.location.address,
          city: order.location.city,
          state: order.location.state,
          zipCode: order.location.zipCode,
          phone: order.location.phone,
          email: order.location.email,
        },
        business: {
          name: order.location.business.name,
          logo: order.location.business.logo,
        },
      };

      logger.info(`KOT generated for order #${order.orderNumber}`);

      res.json({ kot });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/orders/:id/bill
  async getBill(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      // Get order with all necessary relations
      const order = await prisma.order.findFirst({
        where: {
          id,
          location: {
            business: { ownerId: userId },
          },
        },
        include: {
          location: {
            include: {
              business: {
                select: {
                  id: true,
                  name: true,
                  logo: true,
                },
              },
            },
          },
          table: {
            select: {
              id: true,
              number: true,
              name: true,
            },
          },
          items: {
            include: {
              menuItem: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                },
              },
            },
            orderBy: {
              createdAt: 'asc',
            },
          },
          payments: {
            orderBy: {
              createdAt: 'asc',
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!order) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }

      // Transform to Bill format
      const bill = {
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          type: order.type,
          createdAt: order.createdAt.toISOString(),
          completedAt: order.completedAt?.toISOString(),
          table: order.table
            ? {
                number: order.table.number,
                name: order.table.name,
              }
            : null,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          customerEmail: order.customerEmail,
          items: order.items.map((item) => ({
            id: item.id,
            menuItemName: item.menuItem.name,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice),
            totalPrice: Number(item.totalPrice),
            notes: item.notes,
          })),
          subtotal: Number(order.subtotal),
          taxAmount: Number(order.taxAmount),
          taxRate: 0, // TODO: Add taxRate to Location model if needed
          discountAmount: Number(order.discountAmount),
          tipAmount: Number(order.tipAmount),
          totalAmount: Number(order.totalAmount),
          notes: order.notes,
        },
        payments: order.payments.map((payment) => ({
          id: payment.id,
          method: payment.method,
          amount: Number(payment.amount),
          transactionId: payment.transactionId,
          createdAt: payment.createdAt.toISOString(),
        })),
        location: {
          name: order.location.name,
          address: order.location.address,
          city: order.location.city,
          state: order.location.state,
          zipCode: order.location.zipCode,
          phone: order.location.phone,
          email: order.location.email,
        },
        business: {
          name: order.location.business.name,
          logo: order.location.business.logo,
        },
      };

      logger.info(`Bill generated for order #${order.orderNumber}`);

      res.json({ bill });
    } catch (error) {
      next(error);
    }
  }
}

const printController = new PrintController();

export default {
  getKOT: printController.getKOT.bind(printController),
  getBill: printController.getBill.bind(printController),
};

