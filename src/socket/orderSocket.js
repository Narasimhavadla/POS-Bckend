const logger = require('../utils/logger');

function setupOrderSocket(io) {
  io.on('connection', (socket) => {
    logger.info(`🔌 Socket client connected: ${socket.id}`);

    // Join tenant room
    socket.on('join_tenant', (tenantId) => {
      socket.join(`tenant-${tenantId}`);
      logger.info(`Client ${socket.id} joined room tenant-${tenantId}`);
    });

    // Handle new order emission from frontends
    socket.on('place_order', (data) => {
      const { tenantId, order } = data;
      if (tenantId && order) {
        io.to(`tenant-${tenantId}`).emit('new_order', order);
        logger.info(`Broadcasted new order ${order.id} to room tenant-${tenantId}`);
      }
    });

    // Handle order status updates
    socket.on('update_order_status', (data) => {
      const { tenantId, order } = data;
      if (tenantId && order) {
        io.to(`tenant-${tenantId}`).emit('order_updated', order);
        logger.info(`Broadcasted order status update ${order.id} to room tenant-${tenantId}`);
      }
    });

    socket.on('disconnect', () => {
      logger.info(`🔌 Socket client disconnected: ${socket.id}`);
    });
  });
}

module.exports = setupOrderSocket;
