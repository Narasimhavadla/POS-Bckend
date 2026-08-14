require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { sequelize } = require('./src/config/database');
const setupOrderSocket = require('./src/socket/orderSocket');
const { setupCronJobs } = require('./src/utils/cronJobs');
const { runSsidMigration } = require('./src/utils/runSsidMigration');
const { ensureDefaultSuperAdmin, DEFAULT_SUPERADMIN } = require('./src/utils/superAdminBootstrap');
const logger = require('./src/utils/logger');

const app = express();
const server = http.createServer(app);

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
  }
});

// Middleware
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Tenant-ID']
}));

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());

app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Auth Rate Limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, message: 'Too many requests from this IP' }
});

app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register-restaurant', authLimiter);

app.set('io', io);

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({
      status: 'OK',
      service: 'D&K SmartServe POS API',
      database: 'Connected',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({
      status: 'Error',
      database: 'Disconnected',
      error: err.message
    });
  }
});

// API Routes — public / super-admin (no SSID required)
app.use('/api/v1/auth', require('./src/routes/authRoutes'));
app.use('/api/v1/super-admin', require('./src/routes/superAdminRoutes'));

// ─── Tenant-Scoped Routes (SSID in URL) ──────────────────────────────────────
// Pattern: /api/v1/:ssid/<domain>
// The ssidResolver middleware validates the SSID, resolves it to a tenantId,
// and enforces that the JWT token belongs to the same tenant.
const ssidResolver = require('./src/middleware/ssidResolver');
const { auth } = require('./src/middleware/auth');

app.use('/api/v1/:ssid/owner', ssidResolver, auth, require('./src/routes/ownerRoutes'));
app.use('/api/v1/:ssid/pos',   ssidResolver, auth, require('./src/routes/orderRoutes'));
app.use('/api/v1/:ssid/pos',   ssidResolver, auth, require('./src/routes/shiftRoutes'));
app.use('/api/v1/:ssid/pos',   ssidResolver, auth, require('./src/routes/attendanceRoutes'));
app.use('/api/v1/:ssid/owner', ssidResolver, auth, require('./src/routes/ownerAttendanceRoutes'));
app.use('/api/v1/:ssid/pos',   ssidResolver, auth, require('./src/routes/holidayRoutes'));
app.use('/api/v1/:ssid/owner', ssidResolver, auth, require('./src/routes/holidayRoutes'));
app.use('/api/v1/:ssid/pos',   ssidResolver, auth, require('./src/routes/leaveRoutes'));
app.use('/api/v1/:ssid/owner', ssidResolver, auth, require('./src/routes/leaveRoutes'));

// Legacy non-SSID paths kept for backwards compat during migration — they will
// still require auth; tenantId will be read from the JWT token via auth middleware.
app.use('/api/v1/owner', auth, require('./src/routes/ownerRoutes'));
app.use('/api/v1/pos',   auth, require('./src/routes/orderRoutes'));
app.use('/api/v1/pos',   auth, require('./src/routes/shiftRoutes'));
app.use('/api/v1/pos',   auth, require('./src/routes/attendanceRoutes'));
app.use('/api/v1/owner', auth, require('./src/routes/ownerAttendanceRoutes'));
app.use('/api/v1/pos',   auth, require('./src/routes/holidayRoutes'));
app.use('/api/v1/owner', auth, require('./src/routes/holidayRoutes'));
app.use('/api/v1/pos',   auth, require('./src/routes/leaveRoutes'));
app.use('/api/v1/owner', auth, require('./src/routes/leaveRoutes'));

// Setup Socket handlers
setupOrderSocket(io);

// Global Error Handler
app.use((err, req, res, next) => {
  logger.error('Unhandled Error: %s', err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

// Connect DB and Start Server
sequelize.authenticate()
  .then(async () => {
    logger.info('✅ MySQL Database connected successfully');
    
    // Auto-sync schema on startup so model changes alter MySQL tables automatically
    await sequelize.sync({ alter: true });
    await runSsidMigration();
    logger.info('✅ SSID migration/backfill completed');

    const saResult = await ensureDefaultSuperAdmin();
    if (saResult.created) {
      logger.info(`✅ Default Super Admin created (${DEFAULT_SUPERADMIN.username} / ${DEFAULT_SUPERADMIN.password})`);
    } else {
      logger.info(`✅ Default Super Admin ensured (${DEFAULT_SUPERADMIN.username} / ${DEFAULT_SUPERADMIN.password})`);
    }

    // Drop legacy foreign key constraint on attendances table if present
    try {
      await sequelize.query('ALTER TABLE `attendances` DROP FOREIGN KEY `attendances_ibfk_3`;');
    } catch (e) {
      // Constraint already dropped or does not exist
    }

    server.listen(PORT, () => {
      logger.info(`🚀 D&K SmartServe POS Backend server running on port ${PORT}`);
      logger.info(`📡 Socket.io ready for real-time POS & KDS sync`);
      setupCronJobs();
    });
  })
  .catch(err => {
    logger.error('❌ Database connection failed: %o', err);
  });

module.exports = { app, server, io };
