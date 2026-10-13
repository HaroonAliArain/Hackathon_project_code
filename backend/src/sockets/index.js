/**
 * @file sockets/index.js
 * @description Real-time WebSocket server setup using Socket.IO with JWT authentication and room subscriptions.
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User');

let ioInstance = null;

/**
 * Initialize Socket.IO with HTTP server instance
 * @param {import('http').Server} server
 * @returns {Server}
 */
const setupSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: config.CLIENT_ORIGIN || '*',
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Authentication middleware for Socket.IO
  io.use(async (socket, next) => {
    try {
      let token = socket.handshake.auth?.token;
      if (!token && socket.handshake.headers?.authorization) {
        const parts = socket.handshake.headers.authorization.split(' ');
        if (parts.length === 2 && parts[0] === 'Bearer') {
          token = parts[1];
        }
      }

      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token, config.JWT_SECRET);
      const userId = decoded.id || decoded.userId || decoded._id;

      if (!userId) {
        return next(new Error('Authentication error: Invalid token payload'));
      }

      const user = await User.findById(userId).select('-passwordHash');
      if (!user || user.accountStatus !== 'active') {
        return next(new Error('Authentication error: User inactive or not found'));
      }

      socket.user = user;
      next();
    } catch (err) {
      return next(new Error('Authentication error: ' + err.message));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    const user = socket.user;

    // Auto-join rooms based on user role
    if (user.role === 'coordinator' || user.role === 'system_admin' || user.role === 'observer') {
      socket.join('role:coordinator');
    }

    if (user.hospitalId && (user.role === 'hospital_staff' || user.role === 'hospital_admin')) {
      const hospitalRoom = `hospital:${user.hospitalId.toString()}`;
      socket.join(hospitalRoom);
    }

    if (user.ambulanceId && user.role === 'ambulance_staff') {
      const ambulanceRoom = `ambulance:${user.ambulanceId.toString()}`;
      socket.join(ambulanceRoom);
    }

    // Dynamic case subscription
    socket.on('join:case', (caseId) => {
      if (typeof caseId === 'string' && caseId.trim().length > 0) {
        socket.join(`case:${caseId.trim()}`);
      }
    });

    socket.on('leave:case', (caseId) => {
      if (typeof caseId === 'string' && caseId.trim().length > 0) {
        socket.leave(`case:${caseId.trim()}`);
      }
    });

    socket.on('disconnect', (reason) => {
      // Disconnection handled cleanly
    });
  });

  ioInstance = io;
  return io;
};

/**
 * Access the initialized Socket.IO instance
 * @returns {Server|null}
 */
const getIO = () => {
  return ioInstance;
};

module.exports = setupSocket;
module.exports.setupSocket = setupSocket;
module.exports.getIO = getIO;
