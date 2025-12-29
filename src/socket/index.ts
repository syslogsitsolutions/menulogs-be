// Socket.IO Server Implementation for MenuLogs
// Handles real-time communication across POS, Kitchen Display, and Mobile App

import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { verifyAccessToken } from '../utils/jwt.util';
import { logger } from '../utils/logger.util';
import prisma from '../config/database';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from './types/events.types';

// Type-safe Socket.IO Server
export type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  {},
  SocketData
>;

export let io: Server<
  ClientToServerEvents,
  ServerToClientEvents,
  {},
  SocketData
>;

/**
 * Initialize Socket.IO server with Redis adapter for multi-server support
 */
export async function initializeSocket(httpServer: any) {
  logger.info('🔌 Initializing Socket.IO server...');

  // CORS configuration - match Express app configuration
  const allowedOrigins = [
    process.env.FRONTEND_URL,
    'https://menulogs.in',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:5174',
  ].filter(Boolean) as string[];

  // Initialize Socket.IO with CORS
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or Postman)
        if (!origin) {
          logger.info('✅ Socket.IO: Allowing request with no origin');
          return callback(null, true);
        }
        
        logger.info(`🔍 Socket.IO CORS check - Origin: ${origin}, NODE_ENV: ${process.env.NODE_ENV}`);
        
        // Check exact match first
        if (allowedOrigins.includes(origin)) {
          logger.info(`✅ Socket.IO: Allowing origin (exact match): ${origin}`);
          return callback(null, true);
        }
        
        // Allow all menulogs.in subdomains (works in both dev and production)
        // Matches: https://menulogs.in, https://www.menulogs.in, https://app.menulogs.in, etc.
        const menulogsRegex = /^https?:\/\/([a-zA-Z0-9-]+\.)?menulogs\.in(:\d+)?$/;
        if (menulogsRegex.test(origin)) {
          logger.info(`✅ Socket.IO: Allowing menulogs.in domain: ${origin}`);
          return callback(null, true);
        }
        
        // Allow localhost for development
        const localhostRegex = /^https?:\/\/localhost(:\d+)?$/;
        if (localhostRegex.test(origin)) {
          logger.info(`✅ Socket.IO: Allowing localhost: ${origin}`);
          return callback(null, true);
        }
        
        logger.error(`❌ Socket.IO CORS blocked origin: ${origin}`);
        logger.error(`❌ Allowed origins: ${allowedOrigins.join(', ')}`);
        logger.error(`❌ NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
        callback(new Error(`Not allowed by CORS: ${origin}`));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
    allowEIO3: true, // Allow Engine.IO v3 clients
    allowRequest: (req, callback) => {
      // Additional request validation
      const origin = req.headers.origin;
      logger.debug(`🔍 Socket.IO connection attempt from origin: ${origin || 'none'}`);
      callback(null, true);
    },
  });

  // Redis adapter for multi-server support (production)
  if (process.env.REDIS_URL) {
    try {
      const redisUrl = process.env.REDIS_URL;
      
      // Build Redis config - support both URL format and individual env vars
      let redisConfig: { url?: string; socket?: { host: string; port: number }; password?: string } = {};
      
      if (redisUrl) {
        redisConfig.url = redisUrl;
      } else {
        // Fallback to individual env vars if REDIS_URL not provided
        redisConfig.socket = {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
        };
        if (process.env.REDIS_PASSWORD && process.env.REDIS_PASSWORD.trim() !== '') {
          redisConfig.password = process.env.REDIS_PASSWORD;
        }
      }

      const pubClient = createClient(redisConfig);
      const subClient = pubClient.duplicate();

      // Add error handlers to prevent unhandled rejections
      pubClient.on('error', (err) => {
        logger.error('❌ Redis pub client error:', err.message);
      });

      subClient.on('error', (err) => {
        logger.error('❌ Redis sub client error:', err.message);
      });

      await Promise.all([pubClient.connect(), subClient.connect()]);

      io.adapter(createAdapter(pubClient, subClient));
      logger.info('✅ Socket.IO Redis adapter configured');
    } catch (error: any) {
      logger.error('❌ Failed to connect Redis adapter:', error.message || error);
      logger.warn('⚠️  Running without Redis - single server mode only');
      // Don't throw - allow server to continue without Redis adapter
    }
  }

  // Authentication middleware
  io.use(async (socket: TypedSocket, next) => {
    try {
      const origin = socket.handshake.headers.origin;
      const token = socket.handshake.auth.token;

      logger.debug(`🔍 Socket auth attempt - Origin: ${origin || 'none'}, Has token: ${!!token}`);

      if (!token) {
        logger.warn(`⚠️ Socket authentication failed: No token provided (Origin: ${origin || 'none'})`);
        return next(new Error('Authentication token required'));
      }

      const decoded = verifyAccessToken(token);

      // Attach user data to socket
      socket.data = {
        userId: decoded.userId,
        locationId: decoded.locationId,
        staffId: decoded.staffId,
        role: decoded.role,
        email: decoded.email,
      };

      logger.info(`✅ Socket authenticated: ${socket.id} (User: ${decoded.userId}, Origin: ${origin || 'none'})`);
      next();
    } catch (error: any) {
      logger.error('❌ Socket authentication failed:', {
        error: error.message,
        stack: error.stack,
        origin: socket.handshake.headers.origin,
      });
      next(new Error(`Authentication failed: ${error.message || 'Invalid token'}`));
    }
  });

  // Connection handling
  io.on('connection', async (socket: TypedSocket) => {
    const userId = socket.data.userId;
    const socketId = socket.id;
    const origin = socket.handshake.headers.origin;
    const transport = (socket as any).conn?.transport?.name || 'unknown';

    logger.info(`🔌 Client connected: ${socketId} (User: ${userId}, Origin: ${origin || 'none'}, Transport: ${transport})`);

    // Automatically join user's personal room
    socket.join(`user:${userId}`);

    // Register event handlers
    registerConnectionHandlers(socket);

    // Monitor transport changes
    const conn = (socket as any).conn;
    if (conn) {
      conn.on('upgrade', () => {
        const newTransport = conn.transport?.name || 'unknown';
        logger.info(`⬆️ Transport upgraded for ${socketId}: ${newTransport}`);
      });
    }

    // Disconnect handling
    socket.on('disconnect', (reason) => {
      logger.info(`🔌 Client disconnected: ${socketId} (Reason: ${reason})`);
    });

    // Error handling
    socket.on('error', (error) => {
      logger.error(`❌ Socket error: ${socketId}`, {
        error: error.message || error,
        origin,
        transport,
      });
    });
  });

  logger.info('✅ Socket.IO server initialized');
  return io;
}

/**
 * Register connection-related event handlers
 */
function registerConnectionHandlers(socket: TypedSocket) {
  // Join location room
  socket.on('join-location', async (locationId: string) => {
    try {
      const userId = socket.data.userId;

      // Verify user has access to this location
      const hasAccess = await verifyLocationAccess(userId, locationId);

      if (!hasAccess) {
        socket.emit('error', { message: 'Access denied to location' });
        return;
      }

      // Join location room
      socket.join(`location:${locationId}`);
      socket.data.locationId = locationId;

      // Role-based room joining
      const role = socket.data.role;

      if (role === 'KITCHEN') {
        socket.join(`kitchen:${locationId}`);
      }

      if (['OWNER', 'MANAGER'].includes(role)) {
        socket.join(`kitchen:${locationId}`);
      }

      if (socket.data.staffId) {
        socket.join(`staff:${socket.data.staffId}`);
      }

      logger.info(
        `✅ Socket ${socket.id} joined location:${locationId} as ${role}`
      );

      socket.emit('joined-location', { locationId, success: true });
    } catch (error) {
      logger.error('❌ Error joining location:', error);
      socket.emit('error', { message: 'Failed to join location' });
    }
  });

  // Leave location room
  socket.on('leave-location', (locationId: string) => {
    socket.leave(`location:${locationId}`);
    socket.leave(`kitchen:${locationId}`);
    logger.info(`✅ Socket ${socket.id} left location:${locationId}`);
  });

  // Join kitchen room
  socket.on('join-kitchen', async (locationId: string) => {
    try {
      const userId = socket.data.userId;
      const role = socket.data.role;

      const hasAccess = await verifyLocationAccess(userId, locationId);

      if (!hasAccess || !['KITCHEN', 'MANAGER', 'OWNER'].includes(role)) {
        socket.emit('error', { message: 'Access denied to kitchen' });
        return;
      }

      socket.join(`kitchen:${locationId}`);
      logger.info(`✅ Socket ${socket.id} joined kitchen:${locationId}`);
      socket.emit('joined-kitchen', { locationId, success: true });
    } catch (error) {
      logger.error('❌ Error joining kitchen:', error);
      socket.emit('error', { message: 'Failed to join kitchen' });
    }
  });

  // Leave kitchen room
  socket.on('leave-kitchen', (locationId: string) => {
    socket.leave(`kitchen:${locationId}`);
    logger.info(`✅ Socket ${socket.id} left kitchen:${locationId}`);
  });

  // Subscribe to specific order updates
  socket.on('order:subscribe', (orderId: string) => {
    socket.join(`order:${orderId}`);
    logger.debug(`Socket ${socket.id} subscribed to order:${orderId}`);
  });

  // Unsubscribe from order updates
  socket.on('order:unsubscribe', (orderId: string) => {
    socket.leave(`order:${orderId}`);
    logger.debug(`Socket ${socket.id} unsubscribed from order:${orderId}`);
  });
}

/**
 * Verify user has access to a location
 */
async function verifyLocationAccess(
  userId: string,
  locationId: string
): Promise<boolean> {
  try {
    const location = await prisma.location.findFirst({
      where: {
        id: locationId,
        OR: [
          { business: { ownerId: userId } }, // Owner access
          { staff: { some: { userId } } }, // Staff access
        ],
      },
    });

    return !!location;
  } catch (error) {
    logger.error('Error verifying location access:', error);
    return false;
  }
}

// ============================================
// HELPER FUNCTIONS TO EMIT EVENTS
// ============================================

/**
 * Emit event to all clients in a location
 */
export function emitToLocation(
  locationId: string,
  event: keyof ServerToClientEvents,
  data: any
) {
  if (!io) {
    logger.warn('⚠️ Socket.IO not initialized');
    return;
  }

  const room = `location:${locationId}`;
  const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;
  
  io.to(room).emit(event, data);
  logger.info(`📡 Emitted ${event} to location:${locationId} (${roomSize} clients in room)`);
  
  if (roomSize === 0) {
    logger.warn(`⚠️ No clients in room ${room} - event may not be received`);
  }
}

/**
 * Emit event to kitchen display
 */
export function emitToKitchen(
  locationId: string,
  event: keyof ServerToClientEvents,
  data: any
) {
  if (!io) {
    logger.warn('⚠️ Socket.IO not initialized');
    return;
  }

  const room = `kitchen:${locationId}`;
  const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;
  
  io.to(room).emit(event, data);
  logger.info(`📡 Emitted ${event} to kitchen:${locationId} (${roomSize} clients in room)`);
  
  if (roomSize === 0) {
    logger.warn(`⚠️ No clients in room ${room} - event may not be received`);
  }
}

/**
 * Emit event to specific staff member
 */
export function emitToStaff(
  staffId: string,
  event: keyof ServerToClientEvents,
  data: any
) {
  if (!io) return;
  io.to(`staff:${staffId}`).emit(event, data);
  logger.debug(`📡 Emitted ${event} to staff:${staffId}`);
}

/**
 * Emit event to specific user
 */
export function emitToUser(
  userId: string,
  event: keyof ServerToClientEvents,
  data: any
) {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, data);
  logger.debug(`📡 Emitted ${event} to user:${userId}`);
}

/**
 * Emit event to specific order subscribers
 */
export function emitToOrder(
  orderId: string,
  event: keyof ServerToClientEvents,
  data: any
) {
  if (!io) return;
  io.to(`order:${orderId}`).emit(event, data);
  logger.debug(`📡 Emitted ${event} to order:${orderId}`);
}

/**
 * Get connection statistics
 */
export function getSocketStats() {
  if (!io) {
    return {
      totalConnections: 0,
      rooms: [],
    };
  }

  const sockets = io.sockets.sockets;
  const rooms = io.sockets.adapter.rooms;

  const locationRooms: { [key: string]: number } = {};

  rooms.forEach((sockets, roomName) => {
    if (roomName.startsWith('location:')) {
      const locationId = roomName.replace('location:', '');
      locationRooms[locationId] = sockets.size;
    }
  });

  return {
    totalConnections: sockets.size,
    locationConnections: locationRooms,
    uptime: process.uptime(),
  };
}

