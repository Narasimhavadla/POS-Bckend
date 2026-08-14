const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { User, Tenant, Branch, Setting, Staff } = require('../models');
const { generateTenantSsid, generateUserSsid, resolveTenantByIdentifier } = require('../utils/ssidService');

const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { id: user.id, role: user.role, tenantId: user.tenantId },
    process.env.JWT_SECRET || 'dnk-smartserve-pos-super-secret-key-change-in-production-2026',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET || 'dnk-smartserve-refresh-secret-key-change-in-production-2026',
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );

  return { accessToken, refreshToken };
};

const verifyPin = async (storedPin, providedPin) => {
  if (!storedPin || !providedPin) return false;
  const pinStr = String(providedPin).trim();
  if (!pinStr) return false;
  if (String(storedPin).startsWith('$2')) {
    return bcrypt.compare(pinStr, storedPin);
  }
  return String(storedPin).trim() === pinStr;
};

const buildLoginPayload = async (userRecord, tenantObj) => {
  let permissionsMatrixJson = null;
  let tenantCurrency = '₹';
  let tenantTaxName = 'GST';
  let tenantTaxRate = 5.0;

  if (userRecord.tenantId) {
    try {
      const tenantSetting = await Setting.findOne({ where: { tenantId: userRecord.tenantId } });
      if (tenantSetting) {
        permissionsMatrixJson = tenantSetting.permissionsMatrixJson || null;
        if (tenantSetting.currency) tenantCurrency = tenantSetting.currency;
        if (tenantSetting.taxName) tenantTaxName = tenantSetting.taxName;
        if (tenantSetting.taxRate !== undefined && tenantSetting.taxRate !== null) {
          tenantTaxRate = parseFloat(tenantSetting.taxRate);
        }
      }
      if (tenantObj) {
        if (tenantObj.currencySymbol) tenantCurrency = tenantObj.currencySymbol;
        if (tenantObj.taxName) tenantTaxName = tenantObj.taxName;
        if (tenantObj.taxRate !== undefined && tenantObj.taxRate !== null) {
          tenantTaxRate = parseFloat(tenantObj.taxRate);
        }
      }
    } catch (settingErr) {
      console.warn('Could not fetch tenant settings on login:', settingErr.message);
    }
  }

  return {
    ...userRecord,
    tenant: tenantObj,
    tenantName: tenantObj ? tenantObj.name : null,
    tenantSsid: tenantObj ? tenantObj.ssid : null,
    permissionsMatrixJson,
    currency: tenantCurrency,
    taxName: tenantTaxName,
    taxRate: tenantTaxRate
  };
};

exports.registerRestaurant = async (req, res) => {
  try {
    const { restaurantName, ownerName, email, phone, city, outlets, plan } = req.body;

    if (!restaurantName || !ownerName) {
      return res.status(400).json({ success: false, message: 'Restaurant Name and Owner Name are required' });
    }

    const firstName = ownerName.split(' ')[0] || 'owner';
    const username = `${firstName.toLowerCase()}${Math.floor(100 + Math.random() * 900)}`;
    const randomSuffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const generatedPassword = `${firstName}@${randomSuffix}#1`;

    const tenant = await Tenant.create({
      ssid: null,
      name: restaurantName,
      ownerName,
      email: email || `${username}@smartserve.com`,
      phone,
      city,
      outletsCount: outlets ? parseInt(outlets, 10) : 1,
      plan: plan ? String(plan).toLowerCase() : 'starter',
      status: 'Pending Approval',
      ownerUsername: username,
      ownerTempPassword: generatedPassword
    });

    await Branch.create({
      tenantId: tenant.id,
      name: `${restaurantName} HQ`,
      code: 'HQ',
      city: city || 'Main City'
    });

    await Setting.create({
      tenantId: tenant.id,
      orderWorkflowMode: 'WORKFLOW_1'
    });

    res.status(201).json({
      success: true,
      message: 'Restaurant registered successfully. Pending Super Admin approval.',
      data: {
        tenant,
        credentials: { username, password: generatedPassword }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, email, password, pin, ssid, tenantSsid } = req.body;
    const identifier = String(ssid || username || email || '').trim();
    const passwordSecret = String(password || '').trim();
    const pinSecret = String(pin || '').trim();

    if (!identifier) {
      return res.status(400).json({ success: false, message: 'User SSID or Username is required' });
    }

    let tenantFilter = null;
    if (tenantSsid) {
      const tenant = await resolveTenantByIdentifier(String(tenantSsid).trim());
      if (!tenant) {
        return res.status(404).json({ success: false, message: 'Tenant not found for the provided tenant SSID' });
      }
      tenantFilter = tenant.id;
    }

    let principal = null;
    let tenantObj = null;

    const isSsidLogin = !!ssid;
    if (isSsidLogin) {
      let user = await User.findOne({
        where: {
          ssid: identifier,
          ...(tenantFilter ? { tenantId: tenantFilter } : {})
        },
        include: [{ model: Tenant, as: 'tenant' }]
      });

      if (user) {
        const isValidPin = await verifyPin(user.pin, pinSecret);
        if (!isValidPin) {
          return res.status(401).json({ success: false, message: 'Invalid SSID or PIN' });
        }
        if (user.isActive === false) {
          return res.status(403).json({ success: false, message: 'Account has been deactivated' });
        }
        principal = user;
        tenantObj = user.tenant ? user.tenant.toJSON() : null;
      } else {
        const staffMember = await Staff.findOne({
          where: {
            ssid: identifier,
            ...(tenantFilter ? { tenantId: tenantFilter } : {})
          },
          include: [{ model: Tenant, as: 'tenant' }]
        });

        if (!staffMember) {
          return res.status(401).json({ success: false, message: 'Invalid SSID or PIN' });
        }

        const isValidPin = await verifyPin(staffMember.pin, pinSecret);
        if (!isValidPin) {
          return res.status(401).json({ success: false, message: 'Invalid SSID or PIN' });
        }
        if (staffMember.isActive === false) {
          return res.status(403).json({ success: false, message: 'Account has been deactivated' });
        }

        if (staffMember.userId) {
          user = await User.findByPk(staffMember.userId, { include: [{ model: Tenant, as: 'tenant' }] });
        }

        if (user) {
          principal = user;
          tenantObj = user.tenant ? user.tenant.toJSON() : null;
        } else {
          principal = {
            id: staffMember.id,
            tenantId: staffMember.tenantId,
            name: staffMember.name,
            email: staffMember.email,
            username: staffMember.staffId || staffMember.ssid,
            role: (staffMember.role || 'waiter').toLowerCase(),
            isActive: staffMember.isActive,
            ssid: staffMember.ssid,
            toJSON: function () {
              return {
                id: this.id,
                tenantId: this.tenantId,
                name: this.name,
                email: this.email,
                username: this.username,
                role: this.role,
                ssid: this.ssid
              };
            },
            save: async () => {}
          };
          tenantObj = staffMember.tenant ? staffMember.tenant.toJSON() : null;
        }
      }
    } else {
      const secret = passwordSecret || pinSecret;
      if (!secret) {
        return res.status(400).json({ success: false, message: 'Password is required for username login' });
      }

      const user = await User.findOne({
        where: {
          ...(tenantFilter ? { tenantId: tenantFilter } : {}),
          [Op.or]: [
            { email: identifier.toLowerCase() },
            { username: identifier },
            { username: identifier.toLowerCase() },
            { username: identifier.toUpperCase() }
          ]
        },
        include: [{ model: Tenant, as: 'tenant' }]
      });

      if (!user) {
        const legacyStaff = await Staff.findOne({
          where: {
            ...(tenantFilter ? { tenantId: tenantFilter } : {}),
            [Op.or]: [{ staffId: identifier }, { email: identifier.toLowerCase() }]
          },
          include: [{ model: Tenant, as: 'tenant' }]
        });
        if (!legacyStaff) {
          return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        const isValidPin = await verifyPin(legacyStaff.pin, secret);
        if (!isValidPin) {
          return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        principal = {
          id: legacyStaff.id,
          tenantId: legacyStaff.tenantId,
          name: legacyStaff.name,
          email: legacyStaff.email,
          username: legacyStaff.staffId || legacyStaff.ssid,
          role: (legacyStaff.role || 'waiter').toLowerCase(),
          isActive: legacyStaff.isActive,
          ssid: legacyStaff.ssid,
          toJSON: function () {
            return {
              id: this.id,
              tenantId: this.tenantId,
              name: this.name,
              email: this.email,
              username: this.username,
              role: this.role,
              ssid: this.ssid
            };
          },
          save: async () => {}
        };
        tenantObj = legacyStaff.tenant ? legacyStaff.tenant.toJSON() : null;
      } else {
        if (user.isActive === false) {
          return res.status(403).json({ success: false, message: 'Account has been deactivated' });
        }

        const isValidPassword = await user.comparePassword(secret);
        if (!isValidPassword) {
          return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        principal = user;
        tenantObj = user.tenant ? user.tenant.toJSON() : null;

        // Ensure SSIDs exist for legacy records once they log in.
        if (!user.ssid && user.role !== 'superadmin') {
          user.ssid = await generateUserSsid();
        }
        if (user.tenantId && tenantObj && !tenantObj.ssid) {
          const tenant = await Tenant.findByPk(user.tenantId);
          if (tenant && !tenant.ssid) {
            tenant.ssid = await generateTenantSsid();
            await tenant.save();
            tenantObj.ssid = tenant.ssid;
          }
        }
      }
    }

    const tokens = generateTokens(principal);
    if (typeof principal.save === 'function') {
      principal.lastLoginAt = new Date();
      principal.refreshToken = tokens.refreshToken;
      await principal.save();
    }

    const principalObj = typeof principal.toJSON === 'function' ? principal.toJSON() : principal;
    const loginUser = await buildLoginPayload(principalObj, tenantObj);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: loginUser,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMe = async (req, res) => {
  try {
    let user = await User.findByPk(req.user.id, {
      include: [{ model: Tenant, as: 'tenant' }]
    });

    if (!user) {
      const staffMember = await Staff.findByPk(req.user.id, {
        include: [{ model: Tenant, as: 'tenant' }]
      });
      if (staffMember) {
        user = {
          id: staffMember.id,
          tenantId: staffMember.tenantId,
          name: staffMember.name,
          email: staffMember.email,
          role: (staffMember.role || 'waiter').toLowerCase(),
          isActive: staffMember.isActive,
          ssid: staffMember.ssid,
          tenant: staffMember.tenant
        };
      }
    }

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const userObj = typeof user.toJSON === 'function' ? user.toJSON() : user;
    const tenantObj = user.tenant ? (typeof user.tenant.toJSON === 'function' ? user.tenant.toJSON() : user.tenant) : null;

    res.json({
      success: true,
      data: {
        user: {
          ...userObj,
          tenant: tenantObj,
          tenantName: tenantObj ? tenantObj.name : null,
          tenantSsid: tenantObj ? tenantObj.ssid : null,
          logo: tenantObj ? tenantObj.logo : null,
          currencySymbol: tenantObj ? tenantObj.currencySymbol : '₹',
          taxName: tenantObj ? tenantObj.taxName : 'GST',
          taxRate: tenantObj && tenantObj.taxRate !== undefined ? tenantObj.taxRate : 5.0,
          orderWorkflowMode: tenantObj ? tenantObj.orderWorkflowMode : 'WORKFLOW_1'
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Refresh token required' });
    }

    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET || 'dnk-smartserve-refresh-secret-key-change-in-production-2026'
    );

    const user = await User.findByPk(decoded.id);
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }

    const tokens = generateTokens(user);
    user.refreshToken = tokens.refreshToken;
    await user.save();

    res.json({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
      }
    });
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
  }
};
