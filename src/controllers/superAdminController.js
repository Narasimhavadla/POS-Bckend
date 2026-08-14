const { Tenant, User, Branch, Staff, Subscription, SubscriptionHistory, Order } = require('../models');
const { generateTenantSsid, generateUserSsid } = require('../utils/ssidService');

// ─── Plan configuration ─────────────────────────────────────────────────────
const PLAN_CONFIG = {
  starter:      { maxBranches: 1,  maxUsers: 5,   maxMenuItems: 100,  monthlyPrice: 0,    durationDays: 30 },
  basic:        { maxBranches: 2,  maxUsers: 10,  maxMenuItems: 200,  monthlyPrice: 999,  durationDays: 30 },
  professional: { maxBranches: 5,  maxUsers: 25,  maxMenuItems: 500,  monthlyPrice: 2499, durationDays: 30 },
  enterprise:   { maxBranches: 20, maxUsers: 100, maxMenuItems: 2000, monthlyPrice: 4999, durationDays: 30 }
};

// ─── Unique staff ID generator ───────────────────────────────────────────────
const getNextStaffId = async (tenantId) => {
  try {
    const all = await Staff.findAll({ where: { tenantId }, attributes: ['staffId'], raw: true });
    let maxNum = 100100;
    all.forEach(s => {
      if (s.staffId) {
        const n = parseInt(String(s.staffId).replace(/\D/g, ''), 10);
        if (!isNaN(n) && n >= maxNum && n < 999999) maxNum = n;
      }
    });
    return String(maxNum + 1);
  } catch { return '100101'; }
};

// ─── Dynamic subscription status ────────────────────────────────────────────
const computeSubscriptionStatus = (sub) => {
  if (!sub) return 'none';
  if (sub.status === 'suspended') return 'Suspended';
  if (!sub.endDate) return 'Trial';
  const now = new Date();
  const end = new Date(sub.endDate);
  const daysLeft = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  if (daysLeft <= 0)  return 'Expired';
  if (daysLeft <= 7)  return 'Expiring Soon';
  return 'Active';
};

const daysRemaining = (endDate) => {
  if (!endDate) return null;
  const d = Math.ceil((new Date(endDate) - new Date()) / (1000 * 60 * 60 * 24));
  return Math.max(0, d);
};

// ─── getTenants ──────────────────────────────────────────────────────────────
exports.getTenants = async (req, res) => {
  try {
    const tenants = await Tenant.findAll({
      include: [
        { model: User,   as: 'users',    attributes: ['id','ssid','name','username','email','role','isActive','lastLoginAt'] },
        { model: Branch, as: 'branches', attributes: ['id','name','code','address','city','isActive'] },
        { model: Subscription, as: 'subscription' }
      ],
      order: [['createdAt', 'DESC']]
    });
    res.json({ success: true, data: tenants });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── updateTenantStatus (Approve / Reject / Suspend) ────────────────────────
exports.updateTenantStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, branchName, branchCode, branchCity, branchAddress, branchPhone } = req.body;

    const tenant = await Tenant.findByPk(id, {
      include: [
        { model: User,   as: 'users'    },
        { model: Branch, as: 'branches' }
      ]
    });
    if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });

    const prevStatus = tenant.status;
    tenant.status = status;
    await tenant.save();

    let ownerUser = null;
    let ownerStaff = null;
    let branch = null;
    let credentials = null;

    if (status === 'Active' && prevStatus !== 'Active') {
      // 1️⃣ Create or use existing branch
      const existingBranch = tenant.branches && tenant.branches.length > 0 ? tenant.branches[0] : null;
      if (!existingBranch) {
        branch = await Branch.create({
          tenantId: tenant.id,
          name: branchName || `${tenant.name} Main Branch`,
          code: branchCode || 'MB-001',
          city: branchCity || tenant.city || '',
          address: branchAddress || tenant.address || '',
          phone: branchPhone || tenant.phone || '',
          isActive: true
        });
      } else {
        branch = existingBranch;
      }

      // 2️⃣ Compute unique staffId
      const staffId = await getNextStaffId(tenant.id);

      // 3️⃣ Generate username and temp password
      const firstName = (tenant.ownerName || 'Owner').split(' ')[0].toLowerCase();
      const randomSuffix = Math.random().toString(36).slice(2, 6).toUpperCase();
      const username = tenant.ownerUsername || `${firstName}${randomSuffix}`;
      const tempPassword = `${firstName.charAt(0).toUpperCase() + firstName.slice(1)}@${randomSuffix}#1`;

      // 3.5️⃣ Generate Tenant SSID first if it doesn't exist
      if (!tenant.ssid) {
        tenant.ssid = await generateTenantSsid();
      }

      // 4️⃣ Create User (hashed password via User hooks)
      const existingOwner = tenant.users && tenant.users.find(u => u.role === 'owner');
      if (!existingOwner) {
        ownerUser = await User.create({
          tenantId: tenant.id,
          name: tenant.ownerName || 'Restaurant Owner',
          email: tenant.email || `${username}@smartserve.com`,
          username,
          password: tempPassword,    // hashed by beforeCreate hook
          phone: tenant.phone,
          role: 'owner',
          ssid: tenant.ssid,
          pin: '1234',
          isActive: true,
          isVerified: true
        });
      } else {
        ownerUser = existingOwner;
        if (!ownerUser.ssid || ownerUser.ssid !== tenant.ssid) {
          ownerUser.ssid = tenant.ssid;
        }
        ownerUser.pin = '1234';
        await ownerUser.save();
      }

      // 5️⃣ Create Staff profile linked to the owner User
      const existingStaff = await Staff.findOne({ where: { userId: ownerUser.id } });
      if (!existingStaff) {
        ownerStaff = await Staff.create({
          tenantId: tenant.id,
          userId: ownerUser.id,
          name: tenant.ownerName || 'Restaurant Owner',
          role: 'owner',
          phone: tenant.phone,
          email: tenant.email,
          shiftStart: '09:00',
          shiftEnd: '21:00',
          staffId,
          ssid: tenant.ssid,
          pin: '1234',
          isOnDuty: false,
          isActive: true
        });
      } else {
        ownerStaff = existingStaff;
        if (!ownerStaff.ssid || ownerStaff.ssid !== tenant.ssid) {
          ownerStaff.ssid = tenant.ssid;
        }
        ownerStaff.userId = ownerUser.id;
        ownerStaff.pin = '1234';
        await ownerStaff.save();
      }

      // 6️⃣ Initialise subscription
      const plan = tenant.plan || 'starter';
      const planCfg = PLAN_CONFIG[plan] || PLAN_CONFIG.starter;
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + planCfg.durationDays);

      const existingSub = await Subscription.findOne({ where: { tenantId: tenant.id } });
      if (!existingSub) {
        await Subscription.create({
          tenantId: tenant.id,
          plan,
          status: 'active',
          startDate,
          endDate,
          autoRenew: false,
          ...planCfg
        });
      }

      // 7️⃣ Persist username + tempPassword on Tenant for SA reference
      tenant.ownerUsername = ownerUser.username || username;
      tenant.ownerTempPassword = tempPassword;
      await tenant.save();

      credentials = {
        tenantName: tenant.name,
        username: ownerUser.username || username,
        password: tempPassword,
        tenantSsid: tenant.ssid,
        ownerSsid: ownerUser.ssid,
        staffId,
        defaultPin: '1234',
        loginUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
        branchName: branch.name,
        branchCode: branch.code
      };
    }

    res.json({
      success: true,
      message: `Tenant status updated to ${status}`,
      data: tenant,
      credentials
    });
  } catch (error) {
    console.error('updateTenantStatus error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── updateFeatureFlags ──────────────────────────────────────────────────────
exports.updateFeatureFlags = async (req, res) => {
  try {
    const { id } = req.params;
    const { featureFlags } = req.body;
    const tenant = await Tenant.findByPk(id);
    if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });
    tenant.featureFlagsJson = featureFlags;
    await tenant.save();
    res.json({ success: true, message: 'Feature flags updated', data: tenant });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── resetTenantPassword ─────────────────────────────────────────────────────
exports.resetTenantPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    let tenant = await Tenant.findByPk(id, { include: [{ model: User, as: 'users' }] });
    if (!tenant) {
      tenant = await Tenant.findOne({
        where: { ssid: id },
        include: [{ model: User, as: 'users' }]
      });
    }
    if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });

    const firstName = tenant.ownerName ? tenant.ownerName.split(' ')[0] : 'Owner';
    const randomSuffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const passwordToSet = newPassword && newPassword.trim() ? newPassword.trim() : `${firstName}@${randomSuffix}#1`;

    let ownerUser = tenant.users && tenant.users.find(u => u.role === 'owner');
    if (!ownerUser && tenant.users && tenant.users.length > 0) ownerUser = tenant.users[0];

    if (ownerUser) {
      ownerUser.password = passwordToSet;
      await ownerUser.save();
    } else {
      const username = tenant.ownerUsername || `${firstName.toLowerCase()}${Math.floor(100 + Math.random() * 900)}`;
      ownerUser = await User.create({
        tenantId: tenant.id,
        name: tenant.ownerName || 'Tenant Owner',
        email: tenant.email || `${username}@smartserve.com`,
        username,
        password: passwordToSet,
        phone: tenant.phone,
        role: 'owner',
        ssid: await generateUserSsid(),
        pin: null
      });
    }

    tenant.ownerTempPassword = passwordToSet;
    tenant.ownerUsername = ownerUser.username || tenant.ownerUsername;
    await tenant.save();

    res.json({
      success: true,
      message: `Password updated for ${tenant.name}`,
      credentials: { username: tenant.ownerUsername, password: passwordToSet }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── impersonateTenant ───────────────────────────────────────────────────────
exports.impersonateTenant = async (req, res) => {
  try {
    const { id } = req.params;
    const tenant = await Tenant.findByPk(id);
    if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });
    res.json({ success: true, message: `Impersonating tenant ${tenant.name}`, data: { tenantId: tenant.id, tenant } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── getGlobalAnalytics ──────────────────────────────────────────────────────
exports.getGlobalAnalytics = async (req, res) => {
  try {
    const totalTenants   = await Tenant.count();
    const activeTenants  = await Tenant.count({ where: { status: 'Active' } });
    const pendingTenants = await Tenant.count({ where: { status: 'Pending Approval' } });
    const totalOrders    = await Order.count();
    res.json({
      success: true,
      data: { totalTenants, activeTenants, pendingTenants, totalOrders, totalRevenue: totalOrders * 450 }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── getAllSubscriptions ─────────────────────────────────────────────────────
exports.getAllSubscriptions = async (req, res) => {
  try {
    const subscriptions = await Subscription.findAll({
      include: [{ model: Tenant, as: 'tenant', attributes: ['id','ssid','name','ownerName','email','status'] }],
      order: [['createdAt', 'DESC']]
    });

    const enriched = subscriptions.map(sub => {
      const s = sub.toJSON();
      const days = daysRemaining(s.endDate);
      return {
        ...s,
        daysRemaining: days,
        computedStatus: computeSubscriptionStatus(s),
        tenantName: s.tenant?.name,
        tenantSsid: s.tenant?.ssid,
        ownerName: s.tenant?.ownerName,
        tenantStatus: s.tenant?.status
      };
    });

    res.json({ success: true, data: enriched });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── changeSubscriptionPlan ──────────────────────────────────────────────────
exports.changeSubscriptionPlan = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { newPlan, reason, durationDays } = req.body;
    const changedBy = req.user?.name || req.user?.username || 'SuperAdmin';

    const planCfg = PLAN_CONFIG[newPlan];
    if (!planCfg) return res.status(400).json({ success: false, message: `Unknown plan: ${newPlan}` });

    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });

    let sub = await Subscription.findOne({ where: { tenantId } });

    const previousPlan = sub?.plan || null;
    const previousExpiryDate = sub?.endDate || null;

    const startDate = new Date();
    const newEndDate = new Date();
    newEndDate.setDate(newEndDate.getDate() + (durationDays || planCfg.durationDays));

    if (sub) {
      await sub.update({
        plan: newPlan,
        status: 'active',
        startDate,
        endDate: newEndDate,
        maxBranches: planCfg.maxBranches,
        maxUsers: planCfg.maxUsers,
        maxMenuItems: planCfg.maxMenuItems,
        monthlyPrice: planCfg.monthlyPrice
      });
    } else {
      sub = await Subscription.create({
        tenantId,
        plan: newPlan,
        status: 'active',
        startDate,
        endDate: newEndDate,
        ...planCfg
      });
    }

    // Update Tenant.plan for quick reference
    tenant.plan = newPlan;
    await tenant.save();

    // Record history
    await SubscriptionHistory.create({
      tenantId,
      previousPlan,
      newPlan,
      previousExpiryDate,
      newExpiryDate: newEndDate,
      changedBy,
      changedAt: new Date(),
      reason: reason || null
    });

    res.json({
      success: true,
      message: `Subscription changed to ${newPlan} for ${tenant.name}`,
      data: { ...sub.toJSON(), daysRemaining: daysRemaining(newEndDate) }
    });
  } catch (error) {
    console.error('changeSubscriptionPlan error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── getSubscriptionHistory ──────────────────────────────────────────────────
exports.getSubscriptionHistory = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const history = await SubscriptionHistory.findAll({
      where: { tenantId },
      order: [['changedAt', 'DESC']]
    });
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
