/**
 * Analytics Service
 * 
 * Provides analytics and reporting capabilities for restaurant locations.
 * Calculates views, orders, revenue, popular items, category performance, etc.
 * 
 * @module services/analytics
 */

import prisma from '../config/database';
import { Decimal } from 'decimal.js';

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface PeriodComparison {
  viewsChange: number;
  ordersChange: number;
  revenueChange: number;
}

export interface PopularItem {
  itemId: string;
  itemName: string;
  views: number;
  orders: number;
}

export interface CategoryPerformance {
  categoryId: string;
  categoryName: string;
  views: number;
  items: number;
  orders?: number;
  revenue?: number;
}

export interface RecentActivity {
  id: string;
  type: 'view' | 'order' | 'update';
  description: string;
  timestamp: string;
}

export interface AnalyticsResponse {
  totalViews: number;
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  popularItems: PopularItem[];
  categoryPerformance: CategoryPerformance[];
  recentActivity: RecentActivity[];
  periodComparison: PeriodComparison;
  viewsData: Array<{ name: string; views: number; orders: number }>;
  categoryOrderData: Array<{ name: string; orders: number; revenue: number }>;
}

export class AnalyticsService {
  /**
   * Get default date range (last 7 days)
   */
  private getDefaultDateRange(): DateRange {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    return { startDate, endDate };
  }

  /**
   * Get previous period date range for comparison
   */
  private getPreviousPeriodDateRange(currentRange: DateRange): DateRange {
    const duration = currentRange.endDate.getTime() - currentRange.startDate.getTime();
    const startDate = new Date(currentRange.startDate.getTime() - duration);
    const endDate = new Date(currentRange.startDate.getTime() - 1);
    return { startDate, endDate };
  }

  /**
   * Get analytics for a location
   */
  async getAnalytics(
    locationId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<AnalyticsResponse> {
    const dateRange = startDate && endDate
      ? { startDate, endDate }
      : this.getDefaultDateRange();

    // Ensure dates are properly set
    dateRange.startDate.setHours(0, 0, 0, 0);
    dateRange.endDate.setHours(23, 59, 59, 999);

    // Verify location exists
    const location = await prisma.location.findUnique({
      where: { id: locationId },
    });

    if (!location) {
      throw new Error('Location not found');
    }

    // Get current period data
    const [
      totalViews,
      totalOrders,
      totalRevenue,
      popularItems,
      categoryPerformance,
      recentActivity,
      viewsData,
      categoryOrderData,
    ] = await Promise.all([
      this.getTotalViews(locationId, dateRange),
      this.getTotalOrders(locationId, dateRange),
      this.getTotalRevenue(locationId, dateRange),
      this.getPopularItems(locationId, dateRange),
      this.getCategoryPerformance(locationId, dateRange),
      this.getRecentActivity(locationId, dateRange),
      this.getViewsChartData(locationId, dateRange),
      this.getCategoryOrderChartData(locationId, dateRange),
    ]);

    // Get previous period for comparison
    const previousRange = this.getPreviousPeriodDateRange(dateRange);
    const [
      previousViews,
      previousOrders,
      previousRevenue,
    ] = await Promise.all([
      this.getTotalViews(locationId, previousRange),
      this.getTotalOrders(locationId, previousRange),
      this.getTotalRevenue(locationId, previousRange),
    ]);

    // Calculate period comparison
    const periodComparison: PeriodComparison = {
      viewsChange: previousViews > 0
        ? ((totalViews - previousViews) / previousViews) * 100
        : totalViews > 0 ? 100 : 0,
      ordersChange: previousOrders > 0
        ? ((totalOrders - previousOrders) / previousOrders) * 100
        : totalOrders > 0 ? 100 : 0,
      revenueChange: previousRevenue.gt(0)
        ? ((Number(totalRevenue) - Number(previousRevenue)) / Number(previousRevenue)) * 100
        : Number(totalRevenue) > 0
        ? 100
        : 0,
    };

    const averageOrderValue = totalOrders > 0
      ? Number(totalRevenue) / totalOrders
      : 0;

    return {
      totalViews,
      totalOrders,
      totalRevenue: Number(totalRevenue),
      averageOrderValue,
      popularItems,
      categoryPerformance,
      recentActivity,
      periodComparison,
      viewsData,
      categoryOrderData,
    };
  }

  /**
   * Get total views for a location in date range
   */
  private async getTotalViews(locationId: string, dateRange: DateRange): Promise<number> {
    const result = await prisma.analytics.aggregate({
      where: {
        locationId,
        type: { in: ['MENU_VIEW', 'ITEM_VIEW', 'CATEGORY_VIEW'] },
        date: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
      _sum: {
        count: true,
      },
    });

    return result._sum.count || 0;
  }

  /**
   * Get total orders for a location in date range
   */
  private async getTotalOrders(locationId: string, dateRange: DateRange): Promise<number> {
    const result = await prisma.order.aggregate({
      where: {
        locationId,
        status: { not: 'CANCELLED' },
        createdAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
      _count: {
        id: true,
      },
    });

    return result._count.id || 0;
  }

  /**
   * Get total revenue for a location in date range
   */
  private async getTotalRevenue(locationId: string, dateRange: DateRange): Promise<Decimal> {
    const orders = await prisma.order.findMany({
      where: {
        locationId,
        status: { not: 'CANCELLED' },
        paymentStatus: { in: ['PAID', 'PARTIAL'] },
        createdAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
      select: {
        totalAmount: true,
        paymentStatus: true,
      },
    });

    return orders.reduce((sum, order) => {
      if (order.paymentStatus === 'PAID') {
        return sum.add(order.totalAmount);
      } else if (order.paymentStatus === 'PARTIAL') {
        // For partial payments, sum only paid amounts
        // This is simplified - in production, you might want to track actual paid amounts
        return sum.add(order.totalAmount.mul(0.5)); // Assuming 50% paid for partial
      }
      return sum;
    }, new Decimal(0));
  }

  /**
   * Get popular items with views and orders
   */
  private async getPopularItems(
    locationId: string,
    dateRange: DateRange
  ): Promise<PopularItem[]> {
    // Get item views
    const itemViews = await prisma.analytics.groupBy({
      by: ['entityId'],
      where: {
        locationId,
        type: 'ITEM_VIEW',
        entityId: { not: null },
        date: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
      _sum: {
        count: true,
      },
      orderBy: {
        _sum: {
          count: 'desc',
        },
      },
      take: 10,
    });

    // Get item orders
    const orders = await prisma.order.findMany({
      where: {
        locationId,
        status: { not: 'CANCELLED' },
        createdAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
      include: {
        items: {
          include: {
            menuItem: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    // Count orders per item
    const itemOrderCounts = new Map<string, number>();
    orders.forEach((order) => {
      order.items.forEach((item) => {
        const itemId = item.menuItemId;
        const currentCount = itemOrderCounts.get(itemId) || 0;
        itemOrderCounts.set(itemId, currentCount + item.quantity);
      });
    });

    // Get menu items to get names
    const itemIds = itemViews.map((v) => v.entityId!);
    const menuItems = await prisma.menuItem.findMany({
      where: {
        id: { in: itemIds },
        locationId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    const menuItemMap = new Map(menuItems.map((item) => [item.id, item.name]));

    // Combine views and orders
    const popularItems: PopularItem[] = itemViews
      .map((view) => ({
        itemId: view.entityId!,
        itemName: menuItemMap.get(view.entityId!) || 'Unknown Item',
        views: view._sum.count || 0,
        orders: itemOrderCounts.get(view.entityId!) || 0,
      }))
      .filter((item) => item.views > 0 || item.orders > 0)
      .sort((a, b) => (b.views + b.orders * 5) - (a.views + a.orders * 5))
      .slice(0, 10);

    return popularItems;
  }

  /**
   * Get category performance
   */
  private async getCategoryPerformance(
    locationId: string,
    dateRange: DateRange
  ): Promise<CategoryPerformance[]> {
    const categories = await prisma.category.findMany({
      where: { locationId },
      include: {
        _count: {
          select: { menuItems: true },
        },
      },
    });

    // Get category views
    const categoryViews = await prisma.analytics.groupBy({
      by: ['entityId'],
      where: {
        locationId,
        type: 'CATEGORY_VIEW',
        entityId: { not: null },
        date: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
      _sum: {
        count: true,
      },
    });

    // Get orders with items grouped by category
    const orders = await prisma.order.findMany({
      where: {
        locationId,
        status: { not: 'CANCELLED' },
        createdAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
      include: {
        items: {
          include: {
            menuItem: {
              select: {
                categoryId: true,
                price: true,
              },
            },
          },
        },
      },
    });

    // Calculate orders and revenue per category
    const categoryStats = new Map<string, { orders: number; revenue: number }>();
    orders.forEach((order) => {
      order.items.forEach((item) => {
        const categoryId = item.menuItem.categoryId;
        if (!categoryId) return;

        const stats = categoryStats.get(categoryId) || { orders: 0, revenue: 0 };
        stats.orders += item.quantity;
        stats.revenue += Number(item.unitPrice) * item.quantity;
        categoryStats.set(categoryId, stats);
      });
    });

    const viewMap = new Map(
      categoryViews.map((v) => [v.entityId!, v._sum.count || 0])
    );

    return categories.map((category) => ({
      categoryId: category.id,
      categoryName: category.name,
      views: viewMap.get(category.id) || 0,
      items: category._count.menuItems,
      orders: categoryStats.get(category.id)?.orders || 0,
      revenue: categoryStats.get(category.id)?.revenue || 0,
    }));
  }

  /**
   * Get recent activity
   */
  private async getRecentActivity(
    locationId: string,
    dateRange: DateRange
  ): Promise<RecentActivity[]> {
    const activities: RecentActivity[] = [];

    // Get recent views
    const recentViews = await prisma.analytics.findMany({
      where: {
        locationId,
        type: { in: ['MENU_VIEW', 'ITEM_VIEW', 'CATEGORY_VIEW'] },
        date: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
      orderBy: { date: 'desc' },
      take: 10,
    });

    recentViews.forEach((view) => {
      let description = '';
      if (view.type === 'MENU_VIEW') {
        description = 'Menu viewed by customer';
      } else if (view.type === 'ITEM_VIEW') {
        description = 'Menu item viewed';
      } else if (view.type === 'CATEGORY_VIEW') {
        description = 'Category viewed';
      }

      activities.push({
        id: view.id,
        type: 'view',
        description,
        timestamp: view.date.toISOString(),
      });
    });

    // Get recent orders
    const recentOrders = await prisma.order.findMany({
      where: {
        locationId,
        createdAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        items: {
          take: 1,
          include: {
            menuItem: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    recentOrders.forEach((order) => {
      const itemName = order.items[0]?.menuItem.name || 'items';
      activities.push({
        id: order.id,
        type: 'order',
        description: `New order #${order.orderNumber} - ${itemName}${order.items.length > 1 ? ` +${order.items.length - 1} more` : ''}`,
        timestamp: order.createdAt.toISOString(),
      });
    });

    // Sort by timestamp and return top 20
    return activities
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 20);
  }

  /**
   * Get views chart data (daily breakdown)
   */
  private async getViewsChartData(
    locationId: string,
    dateRange: DateRange
  ): Promise<Array<{ name: string; views: number; orders: number }>> {
    const days: string[] = [];
    const dayMap = new Map<string, { views: number; orders: number }>();

    // Initialize all days in range
    const currentDate = new Date(dateRange.startDate);
    while (currentDate <= dateRange.endDate) {
      const dayKey = currentDate.toISOString().split('T')[0];
      days.push(dayKey);
      dayMap.set(dayKey, { views: 0, orders: 0 });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Get daily views - fetch and group manually since Prisma groupBy on DateTime groups by exact timestamp
    const views = await prisma.analytics.findMany({
      where: {
        locationId,
        type: { in: ['MENU_VIEW', 'ITEM_VIEW', 'CATEGORY_VIEW'] },
        date: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
      select: {
        date: true,
        count: true,
      },
    });

    views.forEach((view) => {
      const dayKey = view.date.toISOString().split('T')[0];
      const dayData = dayMap.get(dayKey);
      if (dayData) {
        dayData.views += view.count || 0;
      }
    });

    // Get daily orders - we need to fetch and group manually since Prisma groupBy doesn't support date extraction
    const orders = await prisma.order.findMany({
      where: {
        locationId,
        status: { not: 'CANCELLED' },
        createdAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
      select: {
        createdAt: true,
      },
    });

    orders.forEach((order) => {
      const dayKey = order.createdAt.toISOString().split('T')[0];
      const dayData = dayMap.get(dayKey);
      if (dayData) {
        dayData.orders += 1;
      }
    });

    // Format for chart
    return days.map((dayKey) => {
      const dayName = new Date(dayKey).toLocaleDateString('en-US', { weekday: 'short' });
      const data = dayMap.get(dayKey) || { views: 0, orders: 0 };
      return {
        name: dayName,
        views: data.views,
        orders: data.orders,
      };
    });
  }

  /**
   * Get category order chart data
   */
  private async getCategoryOrderChartData(
    locationId: string,
    dateRange: DateRange
  ): Promise<Array<{ name: string; orders: number; revenue: number }>> {
    const categories = await prisma.category.findMany({
      where: { locationId },
      select: {
        id: true,
        name: true,
      },
    });

    // Get orders with items
    const orders = await prisma.order.findMany({
      where: {
        locationId,
        status: { not: 'CANCELLED' },
        createdAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
      include: {
        items: {
          include: {
            menuItem: {
              select: {
                categoryId: true,
                price: true,
              },
            },
          },
        },
      },
    });

    // Calculate stats per category
    const categoryStats = new Map<string, { orders: number; revenue: number }>();
    categories.forEach((cat) => {
      categoryStats.set(cat.id, { orders: 0, revenue: 0 });
    });

    orders.forEach((order) => {
      order.items.forEach((item) => {
        const categoryId = item.menuItem.categoryId;
        if (!categoryId) return;

        const stats = categoryStats.get(categoryId);
        if (stats) {
          stats.orders += item.quantity;
          stats.revenue += Number(item.unitPrice) * item.quantity;
        }
      });
    });

    const categoryMap = new Map(categories.map((cat) => [cat.id, cat.name]));

    return Array.from(categoryStats.entries())
      .map(([categoryId, stats]) => ({
        name: categoryMap.get(categoryId) || 'Unknown',
        orders: stats.orders,
        revenue: stats.revenue,
      }))
      .filter((item) => item.orders > 0)
      .sort((a, b) => b.orders - a.orders);
  }
}

export default new AnalyticsService();

