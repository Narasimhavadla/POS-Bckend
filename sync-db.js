const { sequelize } = require('./src/models');
const logger = require('./src/utils/logger');
const { runSsidMigration } = require('./src/utils/runSsidMigration');

sequelize.sync({ alter: true }).then(async () => {
  // await runSsidMigration();
  logger.info('✅ Database sync complete');
  process.exit(0);
}).catch((err) => {
  logger.error('❌ Database sync failed: %o', err);
  process.exit(1);
});
