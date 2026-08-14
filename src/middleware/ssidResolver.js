const { Tenant } = require('../models');

/**
 * ssidResolver — extracts :ssid from the URL path parameter,
 * resolves it to a real tenant UUID, and populates req.tenantId.
 *
 * If the authenticated JWT already supplied a tenantId (via auth middleware
 * which runs before controllers), we validate the SSID still belongs to the
 * same tenant to prevent cross-tenant spoofing.
 *
 * Usage in server.js:
 *   app.use('/api/v1/:ssid/owner', ssidResolver, auth, ownerRoutes);
 */
const ssidResolver = async (req, res, next) => {
  try {
    const ssid = req.params.ssid;

    if (!ssid || ssid === 'undefined') {
      return res.status(400).json({
        success: false,
        message: 'SSID is required in the URL path'
      });
    }

    // Resolve SSID → tenant (supports both UUID and SSID strings)
    const tenant = await Tenant.findOne({
      where: {
        [require('sequelize').Op.or]: [
          { ssid: ssid },
          { id: ssid }
        ]
      }
    });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: `No restaurant found for identifier: ${ssid}`
      });
    }

    // If auth middleware already set a tenantId from the JWT token,
    // enforce that it matches the SSID in the URL — prevents a staff member
    // from Restaurant A accessing Restaurant B's data by changing the SSID.
    if (req.tenantId && req.tenantId !== tenant.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: your credentials do not belong to this restaurant'
      });
    }

    req.tenantId = tenant.id;
    req.tenant = tenant;

    next();
  } catch (error) {
    console.error('SSID Resolver Error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to resolve restaurant context' });
  }
};

module.exports = ssidResolver;
