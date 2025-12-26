// Socket.IO Event Type Definitions
// Ensures type safety for all real-time events

import { OrderStatus, OrderItemStatus, TableStatus, StaffRole } from '@prisma/client';

// ============================================
// USER & SOCKET DATA
// ============================================

export interface SocketData {
  userId: string;
  locationId?: string;
  staffId?: string;
  role: string;
  email?: string;
}

// ============================================
// ORDER EVENTS
// ============================================

export interface OrderCreatedEvent {
  type: 'order:created';
  data: {
    order: {
      id: string;
      orderNumber: number;
      type: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
      status: OrderStatus;
      tableId?: string;
      tableName?: string;
      tableNumber?: number;
      customerName?: string;
      customerPhone?: string;
      items: Array<{
        id: string;
        menuItemId: string;
        menuItemName: string;
        quantity: number;
        unitPrice: number;
        totalPrice: number;
        notes?: string;
        status: OrderItemStatus;
      }>;
      subtotal: number;
      taxAmount: number;
      totalAmount: number;
      notes?: string;
      createdAt: string;
      createdBy: {
        id: string;
        name: string;
        role: string;
      };
    };
    metadata: {
      locationId: string;
      timestamp: string;
    };
  };
}

export interface OrderStatusChangedEvent {
  type: 'order:status-changed';
  data: {
    orderId: string;
    orderNumber: number;
    oldStatus: OrderStatus;
    newStatus: OrderStatus;
    changedBy: {
      id: string;
      name: string;
      role: string;
    };
    timestamp: string;
  };
}

export interface OrderItemStatusChangedEvent {
  type: 'order-item:status-changed';
  data: {
    orderId: string;
    orderNumber: number;
    itemId: string;
    menuItemName: string;
    quantity: number;
    oldStatus: OrderItemStatus;
    newStatus: OrderItemStatus;
    changedBy?: {
      id: string;
      name: string;
      role: string;
    };
    timestamp: string;
  };
}

export interface OrderCancelledEvent {
  type: 'order:cancelled';
  data: {
    orderId: string;
    orderNumber: number;
    reason?: string;
    cancelledBy: {
      id: string;
      name: string;
      role: string;
    };
    timestamp: string;
  };
}

export interface OrderPaymentCompletedEvent {
  type: 'order:payment-completed';
  data: {
    orderId: string;
    orderNumber: number;
    amount: number;
    method: 'CASH' | 'CARD' | 'UPI' | 'OTHER';
    timestamp: string;
  };
}

export interface OrderItemAddedEvent {
  type: 'order:item-added';
  data: {
    orderId: string;
    orderNumber: number;
    item: {
      id: string;
      menuItemName: string;
      quantity: number;
      unitPrice: number;
    };
    timestamp: string;
  };
}

// ============================================
// TABLE EVENTS
// ============================================

export interface TableStatusChangedEvent {
  type: 'table:status-changed';
  data: {
    tableId: string;
    tableName: string;
    tableNumber: number;
    oldStatus: TableStatus;
    newStatus: TableStatus;
    changedBy?: {
      id: string;
      name: string;
    };
    timestamp: string;
  };
}

export interface TableAssignedEvent {
  type: 'table:assigned';
  data: {
    tableId: string;
    tableName: string;
    tableNumber: number;
    assignedTo: {
      id: string;
      name: string;
    };
    timestamp: string;
  };
}

// ============================================
// STAFF EVENTS
// ============================================

export interface StaffClockEvent {
  type: 'staff:clock-in' | 'staff:clock-out';
  data: {
    staffId: string;
    staffName: string;
    role: StaffRole;
    locationId: string;
    timestamp: string;
  };
}

// ============================================
// KITCHEN EVENTS
// ============================================

export interface KitchenAlertEvent {
  type: 'kitchen:alert';
  data: {
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    message: string;
    orderId?: string;
    orderNumber?: number;
    action?: string;
    timestamp: string;
  };
}

// ============================================
// SYSTEM EVENTS
// ============================================

export interface NotificationEvent {
  type: 'notification';
  data: {
    id: string;
    title: string;
    message: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    action?: {
      type: 'NAVIGATE' | 'OPEN_ORDER' | 'CUSTOM';
      payload: any;
    };
    timestamp: string;
  };
}

export interface LocationSettingsUpdatedEvent {
  type: 'location:settings-updated';
  data: {
    locationId: string;
    updatedFields: string[];
    timestamp: string;
  };
}

// ============================================
// UNION TYPE FOR ALL EVENTS
// ============================================

export type SocketEvent =
  | OrderCreatedEvent
  | OrderStatusChangedEvent
  | OrderItemStatusChangedEvent
  | OrderCancelledEvent
  | OrderPaymentCompletedEvent
  | OrderItemAddedEvent
  | TableStatusChangedEvent
  | TableAssignedEvent
  | StaffClockEvent
  | KitchenAlertEvent
  | NotificationEvent
  | LocationSettingsUpdatedEvent;

// ============================================
// CLIENT-TO-SERVER EVENTS
// ============================================

export interface ClientToServerEvents {
  'join-location': (locationId: string) => void;
  'leave-location': (locationId: string) => void;
  'join-kitchen': (locationId: string) => void;
  'leave-kitchen': (locationId: string) => void;
  'order:subscribe': (orderId: string) => void;
  'order:unsubscribe': (orderId: string) => void;
}

// ============================================
// SERVER-TO-CLIENT EVENTS
// ============================================

export interface ServerToClientEvents {
  // Order events
  'order:created': (data: OrderCreatedEvent['data']) => void;
  'order:status-changed': (data: OrderStatusChangedEvent['data']) => void;
  'order-item:status-changed': (data: OrderItemStatusChangedEvent['data']) => void;
  'order:cancelled': (data: OrderCancelledEvent['data']) => void;
  'order:payment-completed': (data: OrderPaymentCompletedEvent['data']) => void;
  'order:item-added': (data: OrderItemAddedEvent['data']) => void;

  // Table events
  'table:status-changed': (data: TableStatusChangedEvent['data']) => void;
  'table:assigned': (data: TableAssignedEvent['data']) => void;

  // Staff events
  'staff:clock-in': (data: StaffClockEvent['data']) => void;
  'staff:clock-out': (data: StaffClockEvent['data']) => void;

  // Kitchen events
  'kitchen:alert': (data: KitchenAlertEvent['data']) => void;

  // System events
  notification: (data: NotificationEvent['data']) => void;
  'location:settings-updated': (data: LocationSettingsUpdatedEvent['data']) => void;

  // Connection events
  'joined-location': (data: { locationId: string; success: boolean }) => void;
  'joined-kitchen': (data: { locationId: string; success: boolean }) => void;
  error: (data: { message: string }) => void;
}

