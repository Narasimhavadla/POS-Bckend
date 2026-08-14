const jwt = require('jsonwebtoken');
const { User, Tenant } = require('../models');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'No authentication token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dnk-smartserve-pos-super-secret-key-change-in-production-2026');
    let user = await User.findByPk(decoded.id, {
      include: [{ model: Tenant, as: 'tenant' }]
    });

    if (!user) {
      // Fallback: check if it is a staff member logging in without a direct User record
      const { Staff } = require('../models');
      const staffMember = await Staff.findByPk(decoded.id, {
        include: [{ model: Tenant, as: 'tenant' }]
      });
      if (staffMember) {
        user = {
          id: staffMember.id,
          tenantId: staffMember.tenantId,
          name: staffMember.name,
          email: staffMember.email,
          role: staffMember.role || 'waiter',
          isActive: staffMember.isActive,
          tenant: staffMember.tenant
        };
      }
    }

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'User not found or deactivated' });
    }

    // If route context already resolved tenant (e.g. /api/v1/:ssid/*), enforce match.
    // Never allow cross-tenant access by changing URL SSID while reusing a valid token.
    if (req.tenantId && user.role !== 'superadmin' && user.tenantId && req.tenantId !== user.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: tenant mismatch between URL context and authenticated user'
      });
    }

    req.user = user;
    req.userId = user.id;
    req.tenantId = user.tenantId;
    next();
  } catch (error) {
    console.error("JWT Auth Middleware Error:", error);
    res.status(401).json({ success: false, message: 'Invalid or expired token', details: error.message });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Unauthorized role access' });
    }
    next();
  };
};

module.exports = { auth, authorize };
