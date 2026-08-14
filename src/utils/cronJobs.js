const cron = require('node-cron');
const logger = require('./logger');

function setupCronJobs() {
  // Daily cleanup of old audit logs (older than 365 days)
  cron.schedule('0 2 * * *', async () => {
    try {
      const { AuditLog } = require('../models');
      const { Op } = require('sequelize');
      const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const deleted = await AuditLog.destroy({ where: { createdAt: { [Op.lt]: cutoff } } });
      logger.info(`🧹 Cleaned up ${deleted} old audit log entries`);
    } catch (err) {
      logger.error('Audit log cleanup error: %o', err);
    }
  });

  // Hourly subscription expiry check
  cron.schedule('0 * * * *', async () => {
    try {
      const { Subscription } = require('../models');
      const { Op } = require('sequelize');
      const now = new Date();
      const expiring = await Subscription.findAll({
        where: {
          status: 'active',
          endDate: { [Op.lte]: now }
        }
      });
      for (const sub of expiring) {
        sub.status = 'expired';
        await sub.save();
        logger.info(`⏰ Subscription ${sub.id} expired for tenant ${sub.tenantId}`);
      }
    } catch (err) {
      logger.error('Subscription expiry check error: %o', err);
    }
  });

  logger.info('⏰ Cron jobs scheduled');
}

module.exports = { setupCronJobs };
