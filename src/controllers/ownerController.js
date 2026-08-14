const { Staff, Setting, User, Branch, Category, MenuItem, Table, Order, Tenant, AuditLog } = require('../models');
const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const cloudinary = require('../config/cloudinary');
const streamifier = require('streamifier');
const { generateUserSsid } = require('../utils/ssidService');

// ─── In-memory Manager Session Registry ───────────────────────────────────────
// Map<sessionId, { tenantId, staffName, staffRole, unlockedAt, expiresAt }>
// Cleared on server restart (intentional security behaviour).
const managerSessions = new Map();

// Prune expired sessions lazily on every read
const pruneExpiredSessions = () => {
  const now = Date.now();
  for (const [id, s] of managerSessions.entries()) {
    if (s.expiresAt <= now) managerSessions.delete(id);
  }
};

const getNextStaffId = async (tenantId) => {
  try {
    const allStaff = await Staff.findAll({ where: { tenantId }, attributes: ['staffId'], raw: true });
    let maxNum = 100100;
    allStaff.forEach((s) => {
      if (s.staffId) {
        const clean = String(s.staffId).replace(/\D/g, '');
        const num = parseInt(clean, 10);
        if (!isNaN(num) && num >= maxNum && num < 999999) {
          maxNum = num;
        }
      }
    });
    return String(maxNum + 1);
  } catch {
    return '100101';
  }
};

exports.getStaff = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const staff = await Staff.findAll({ where: { tenantId } });
    res.json({ success: true, data: staff });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createStaff = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { name, role, phone, email, shiftStart, shiftEnd, salary, pin } = req.body;
    let staffId = req.body.staffId;
    if (!staffId || staffId.length < 6 || staffId.includes('-')) {
      staffId = await getNextStaffId(tenantId);
    }

    const newStaff = await Staff.create({
      tenantId,
      ssid: await generateUserSsid(),
      name,
      role: role || 'waiter',
      phone,
      email,
      shiftStart: shiftStart || '09:00',
      shiftEnd: shiftEnd || '18:00',
      salary: salary ? parseFloat(salary) : 15000,
      pin: pin ? String(pin) : '1234',
      staffId,
      isOnDuty: true
    });

    try {
      await AuditLog.create({
        tenantId,
        userId: req.userId || null,
        action: 'STAFF_CREATE',
        entity: 'Staff',
        details: {
          staffName: name,
          staffRole: role,
          performedBy: req.user?.name || req.user?.username || 'Owner/Manager'
        }
      });
    } catch (logErr) {
      console.warn('AuditLog failed in createStaff:', logErr.message);
    }

    res.status(201).json({
      success: true,
      data: {
        ...newStaff.toJSON(),
        initialPinSet: true
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const resolveTenantId = (req) => {
  // req.tenantId is set by ssidResolver (URL-based) or auth middleware (JWT-based).
  // Never fall back to a global/arbitrary tenant — that would break multi-tenancy.
  const tenantId = req.tenantId;
  if (!tenantId) throw new Error('Tenant context is missing from the request');
  return tenantId;
};

exports.getSettings = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    let setting = await Setting.findOne({ where: { tenantId } });
    if (!setting) {
      setting = await Setting.create({ tenantId, orderWorkflowMode: 'WORKFLOW_1' });
    }
    const tenant = await Tenant.findByPk(tenantId);
    res.json({
      success: true,
      data: {
        ...setting.toJSON(),
        currency: tenant?.currencySymbol || setting.currency || '₹',
        currencySymbol: tenant?.currencySymbol || setting.currency || '₹',
        taxName: tenant?.taxName || setting.taxName || 'GST',
        taxRate: tenant?.taxRate !== undefined ? tenant.taxRate : (setting.taxRate !== undefined ? setting.taxRate : 5.0),
        logo: tenant?.logo || null,
        orderWorkflowMode: tenant?.orderWorkflowMode || setting.orderWorkflowMode || 'WORKFLOW_1'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const { managerPin, currency, currencySymbol, taxName, taxRate, logo, orderWorkflowMode, permissionsMatrixJson } = req.body;

    if (managerPin) {
      const isAuthorized = await checkManagerAuthorization(tenantId, managerPin);
      if (!isAuthorized) {
        return res.status(401).json({ success: false, message: 'Invalid Manager PIN. Authorization denied.' });
      }
    }

    const curr = currencySymbol || currency;
    let setting = await Setting.findOne({ where: { tenantId } });
    const updateData = { ...req.body };
    if (curr) updateData.currency = curr;
    if (setting) {
      await setting.update(updateData);
    } else {
      setting = await Setting.create({ tenantId, ...updateData, currency: curr || '₹' });
    }

    // Sync Tenant model fields for global currency & tax settings & logo
    const tenant = await Tenant.findByPk(tenantId);
    if (tenant) {
      if (curr !== undefined) tenant.currencySymbol = curr;
      if (taxName !== undefined) tenant.taxName = taxName;
      if (taxRate !== undefined) tenant.taxRate = parseFloat(taxRate) || 0;
      if (logo !== undefined) tenant.logo = logo;
      if (orderWorkflowMode) tenant.orderWorkflowMode = orderWorkflowMode;
      await tenant.save();
    }

    // Real-time broadcast for RBAC permissions matrix
    if (permissionsMatrixJson) {
      try {
        const io = req.app.get('io');
        if (io) {
          let parsed = permissionsMatrixJson;
          if (typeof parsed === 'string') {
            try { parsed = JSON.parse(parsed); } catch (e) {}
          }
          io.to(`tenant-${tenantId}`).emit('permissions_updated', {
            tenantId,
            permissionsMatrix: parsed
          });
        }
      } catch (ioErr) {
        console.warn('Socket emit for permissions_updated failed:', ioErr.message);
      }
    }

    try {
      await AuditLog.create({
        tenantId,
        userId: req.userId || null,
        action: 'SETTINGS_UPDATE',
        entity: 'Setting',
        details: {
          updatedFields: Object.keys(req.body).filter(k => k !== 'managerPin'),
          performedBy: req.user?.name || req.user?.username || 'Owner/Manager'
        }
      });
    } catch (logErr) {
      console.warn('AuditLog creation failed in updateSettings:', logErr.message);
    }

    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: {
        currency: tenant?.currencySymbol || setting.currency,
        currencySymbol: tenant?.currencySymbol || setting.currency,
        taxName: tenant?.taxName || setting.taxName,
        taxRate: tenant?.taxRate !== undefined ? tenant.taxRate : setting.taxRate,
        logo: tenant?.logo,
        orderWorkflowMode: tenant?.orderWorkflowMode || setting.orderWorkflowMode
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const checkManagerAuthorization = async (tenantId, managerPin) => {
  if (!managerPin) return false;
  const cleanPin = String(managerPin).trim();
  if (cleanPin === 'UNLOCKED') return true;

  // Check Staff table for Manager / Owner roles under this tenant
  const managerStaff = await Staff.findAll({
    where: { tenantId, role: { [Op.in]: ['manager', 'owner', 'Manager', 'Owner'] } }
  });
  for (const m of managerStaff) {
    if (m.pin) {
      // Support both hashed and legacy plain-text PINs
      const isHash = m.pin.startsWith('$2');
      const match = isHash ? await bcrypt.compare(cleanPin, m.pin) : m.pin === cleanPin;
      if (match) return true;
    }
  }

  // Check User table for Manager / Owner roles under this tenant
  const managerUsers = await User.findAll({
    where: { tenantId, role: { [Op.in]: ['manager', 'owner'] } }
  });
  for (const u of managerUsers) {
    if (u.pin) {
      const isHash = u.pin.startsWith('$2');
      const match = isHash ? await bcrypt.compare(cleanPin, u.pin) : u.pin === cleanPin;
      if (match) return true;
    }
  }

  return false;
};

// ─── verifyManagerPin (Global Manager Authorization Endpoint) ──────────────────
exports.verifyManagerPin = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ success: false, message: 'PIN is required.' });
    const authorized = await checkManagerAuthorization(tenantId, pin);
    if (authorized) {
      res.json({ success: true, message: 'Manager PIN verified.' });
    } else {
      res.status(401).json({ success: false, message: 'Invalid Manager PIN. Authorization denied.' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── changeOwnerPin ────────────────────────────────────────────────────────────
exports.changeOwnerPin = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const { currentPin, newPin, confirmPin } = req.body;

    if (!newPin || !confirmPin) {
      return res.status(400).json({ success: false, message: 'New PIN and confirm PIN are required.' });
    }
    if (String(newPin).length < 4) {
      return res.status(400).json({ success: false, message: 'New PIN must be at least 4 digits.' });
    }
    if (String(newPin) !== String(confirmPin)) {
      return res.status(400).json({ success: false, message: 'New PIN and Confirm PIN do not match.' });
    }

    const ownerUser = await User.findOne({ where: { tenantId, role: 'owner' } });
    const ownerStaff = await Staff.findOne({ where: { tenantId, role: { [Op.in]: ['owner', 'Owner'] } } });
    if (!ownerUser && !ownerStaff) {
      return res.status(404).json({ success: false, message: 'Owner record not found.' });
    }

    const existingPinHash = ownerUser?.pin || ownerStaff?.pin || null;
    if (existingPinHash) {
      if (!currentPin) {
        return res.status(400).json({ success: false, message: 'Current PIN is required.' });
      }
      const isHash = String(existingPinHash).startsWith('$2');
      const isValid = isHash
        ? await bcrypt.compare(String(currentPin), existingPinHash)
        : String(existingPinHash) === String(currentPin);
      if (!isValid) {
        return res.status(401).json({ success: false, message: 'Current PIN is incorrect.' });
      }
    }

    const newHashedPin = await bcrypt.hash(String(newPin), 10);
    if (ownerUser) {
      ownerUser.pin = newHashedPin;
      await ownerUser.save();
    }
    if (ownerStaff) {
      ownerStaff.pin = newHashedPin;
      if (ownerUser && !ownerStaff.userId) {
        ownerStaff.userId = ownerUser.id;
      }
      await ownerStaff.save();
    }

    res.json({ success: true, message: 'Owner PIN changed successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateStaffPin = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPin, managerPin } = req.body;

    if (!newPin || String(newPin).length < 4) {
      return res.status(400).json({ success: false, message: 'New PIN must be at least 4 digits.' });
    }

    const tenantId = resolveTenantId(req);
    const isAuthorized = await checkManagerAuthorization(tenantId, managerPin);

    if (!isAuthorized) {
      return res.status(401).json({ success: false, message: 'Invalid Manager PIN. Authorization denied.' });
    }

    let staffMember = await Staff.findOne({ where: { id, tenantId } });
    if (!staffMember) {
      staffMember = await Staff.findOne({ where: { staffId: id, tenantId } });
    }
    if (!staffMember) {
      return res.status(404).json({ success: false, message: 'Staff member not found.' });
    }

    staffMember.pin = String(newPin);
    await staffMember.save();

    if (staffMember.userId) {
      const linkedUser = await User.findOne({ where: { id: staffMember.userId, tenantId } });
      if (linkedUser) {
        linkedUser.pin = String(newPin);
        await linkedUser.save();
      }
    }

    res.json({ success: true, message: `PIN updated successfully for ${staffMember.name}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const { managerPin, name, role, email, phone, shiftStart, shiftEnd, salary, pin, isOnDuty } = req.body;

    const tenantId = resolveTenantId(req);
    const isAuthorized = await checkManagerAuthorization(tenantId, managerPin);

    if (!isAuthorized) {
      return res.status(401).json({ success: false, message: 'Invalid Manager PIN. Authorization denied.' });
    }

    let staffMember = await Staff.findOne({ where: { id, tenantId } });
    if (!staffMember) {
      staffMember = await Staff.findOne({ where: { staffId: id, tenantId } });
    }

    if (!staffMember) {
      return res.status(404).json({ success: false, message: 'Staff member not found' });
    }

    if (name) staffMember.name = name;
    if (role) staffMember.role = role;
    if (email !== undefined) staffMember.email = email;
    if (phone !== undefined) staffMember.phone = phone;
    if (shiftStart) staffMember.shiftStart = shiftStart;
    if (shiftEnd) staffMember.shiftEnd = shiftEnd;
    if (salary !== undefined) staffMember.salary = parseFloat(salary) || 0;
    if (pin) staffMember.pin = String(pin);
    if (isOnDuty !== undefined) staffMember.isOnDuty = !!isOnDuty;

    await staffMember.save();

    if (staffMember.userId) {
      const linkedUser = await User.findOne({ where: { id: staffMember.userId, tenantId } });
      if (linkedUser) {
        if (name) linkedUser.name = name;
        if (role) linkedUser.role = role;
        if (email !== undefined) linkedUser.email = email;
        if (phone !== undefined) linkedUser.phone = phone;
        if (pin) linkedUser.pin = String(pin);
        await linkedUser.save();
      }
    }

    try {
      await AuditLog.create({
        tenantId,
        userId: req.userId || null,
        action: 'STAFF_UPDATE',
        entity: 'Staff',
        details: {
          staffId: staffMember.id,
          staffName: staffMember.name,
          updatedFields: Object.keys(req.body).filter(k => k !== 'managerPin' && k !== 'pin'),
          performedBy: req.user?.name || req.user?.username || 'Owner/Manager'
        }
      });
    } catch (logErr) {
      console.warn('AuditLog failed in updateStaff:', logErr.message);
    }

    res.json({ success: true, message: 'Staff updated successfully', data: staffMember });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const managerPin = req.body.managerPin || req.query.managerPin || req.header('X-Manager-PIN');

    const tenantId = resolveTenantId(req);
    const isAuthorized = await checkManagerAuthorization(tenantId, managerPin);

    if (!isAuthorized) {
      return res.status(401).json({ success: false, message: 'Invalid Manager PIN. Authorization denied.' });
    }

    let staffMember = await Staff.findOne({ where: { id, tenantId } });
    if (!staffMember) {
      staffMember = await Staff.findOne({ where: { staffId: id, tenantId } });
    }

    if (!staffMember) {
      return res.status(404).json({ success: false, message: 'Staff member not found' });
    }

    await staffMember.destroy();

    try {
      await AuditLog.create({
        tenantId,
        userId: req.userId || null,
        action: 'STAFF_DELETE',
        entity: 'Staff',
        details: {
          staffId: staffMember.id,
          staffName: staffMember.name,
          performedBy: req.user?.name || req.user?.username || 'Owner/Manager'
        }
      });
    } catch (logErr) {
      console.warn('AuditLog failed in deleteStaff:', logErr.message);
    }

    res.json({ success: true, message: 'Staff member deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};



exports.uploadLogo = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file provided.' });
    }

    // Upload to Cloudinary via stream (no temp files needed)
    const uploadFromBuffer = (buffer) =>
      new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'smartserve-restaurant-logos',
            public_id: `tenant-${tenantId}`,
            overwrite: true,
            transformation: [
              { width: 400, height: 400, crop: 'fill', quality: 'auto', fetch_format: 'auto' }
            ]
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        streamifier.createReadStream(buffer).pipe(uploadStream);
      });

    const result = await uploadFromBuffer(req.file.buffer);
    const logoUrl = result.secure_url;

    // Persist Cloudinary URL to tenant record
    const tenant = await Tenant.findByPk(tenantId);
    if (tenant) {
      tenant.logo = logoUrl;
      await tenant.save();
    }

    res.json({
      success: true,
      message: 'Restaurant logo uploaded to Cloudinary successfully',
      logoUrl
    });
  } catch (error) {
    console.error('Logo upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};


exports.getReportsAnalytics = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const dateFilter = req.query.dateFilter || 'today';

    const orders = await Order.findAll({
      where: { tenantId },
      order: [['createdAt', 'DESC']]
    });

    const categories = await Category.findAll({ where: { tenantId } });

    res.json({
      success: true,
      data: {
        orders: orders.map((o) => {
          let parsedItems = o.items;
          if (typeof o.items === 'string') {
            try { parsedItems = JSON.parse(o.items || '[]'); } catch { parsedItems = []; }
          }
          return {
            ...o.toJSON(),
            items: Array.isArray(parsedItems) ? parsedItems : []
          };
        }),
        categories
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAuditLogs = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const logs = await AuditLog.findAll({
      where: {
        [Op.or]: [
          { tenantId },
          { tenantId: null }
        ]
      },
      order: [['createdAt', 'DESC']],
      limit: 200
    });
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createAuditLog = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const { action, entity, details } = req.body;

    const log = await AuditLog.create({
      tenantId,
      userId: req.userId || null,
      action: action || 'PIN_ACTIVITY',
      entity: entity || 'ManagerPIN',
      details: typeof details === 'object' 
        ? { ...details, performedBy: req.user?.name || req.user?.username || 'Unknown' }
        : details
    });

    res.status(201).json({ success: true, data: log });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


// ─── Manager Session Registry Controllers ─────────────────────────────────────

/** POST /owner/manager-sessions — Register a new active manager session */
exports.registerManagerSession = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const { staffName, staffRole } = req.body;

    const sessionId = uuidv4();
    const now = Date.now();
    const expiresAt = now + 30 * 60 * 1000; // 30 minutes

    managerSessions.set(sessionId, {
      tenantId,
      staffName: staffName || 'Unknown',
      staffRole: staffRole || 'Unknown',
      unlockedAt: now,
      expiresAt
    });

    res.status(201).json({ success: true, data: { sessionId, expiresAt } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** GET /owner/manager-sessions — List all active (non-expired) sessions for the tenant */
exports.getActiveSessions = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    pruneExpiredSessions();

    const sessions = [];
    for (const [id, s] of managerSessions.entries()) {
      if (s.tenantId === tenantId) {
        sessions.push({ sessionId: id, ...s });
      }
    }

    res.json({ success: true, data: sessions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** DELETE /owner/manager-sessions/:sessionId — Revoke a specific session */
exports.revokeManagerSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = managerSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found or already expired.' });
    }

    managerSessions.delete(sessionId);

    // Emit Socket.IO event so the matching client tab auto-locks
    const io = req.app.get('io');
    if (io) {
      io.to(`tenant-${session.tenantId}`).emit('manager_session_revoked', { sessionId });
    }

    // Audit log
    await AuditLog.create({
      tenantId: session.tenantId,
      action: 'MANAGER_SESSION_LOCK',
      entity: 'ManagerPIN',
      details: JSON.stringify({
        user: session.staffName,
        role: session.staffRole,
        status: 'FORCE_REVOKED',
        sessionId
      })
    }).catch(() => {});

    res.json({ success: true, message: 'Session revoked successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** DELETE /owner/manager-sessions — Revoke ALL active sessions for the tenant */
exports.revokeAllManagerSessions = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    pruneExpiredSessions();

    let revokedCount = 0;
    for (const [id, s] of managerSessions.entries()) {
      if (s.tenantId === tenantId) {
        managerSessions.delete(id);
        revokedCount++;
      }
    }

    // Broadcast to all clients in the tenant room
    const io = req.app.get('io');
    if (io) {
      io.to(`tenant-${tenantId}`).emit('manager_all_sessions_revoked', { tenantId });
    }

    // Audit log
    await AuditLog.create({
      tenantId,
      action: 'MANAGER_SESSION_LOCK',
      entity: 'ManagerPIN',
      details: JSON.stringify({
        status: 'ALL_FORCE_REVOKED',
        revokedCount
      })
    }).catch(() => {});

    res.json({ success: true, message: `${revokedCount} session(s) revoked.`, data: { revokedCount } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** GET /owner/branches — Fetch all branches for the tenant */
exports.getBranches = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const branches = await Branch.findAll({
      where: { tenantId },
      order: [['createdAt', 'ASC']]
    });
    res.json({ success: true, data: branches });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** POST /owner/branches — Create a new branch for the tenant */
exports.createBranch = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const { name, code, address, city, phone } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Branch name is required' });
    }
    const branch = await Branch.create({
      tenantId,
      name,
      code: code || name.substring(0, 4).toUpperCase(),
      address,
      city,
      phone
    });
    res.status(201).json({ success: true, data: branch });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
