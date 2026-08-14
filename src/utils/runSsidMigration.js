const bcrypt = require('bcryptjs');
const { DataTypes } = require('sequelize');
const { sequelize, Tenant, User, Staff } = require('../models');
const {
  generateTenantSsid,
  generateUserSsid,
  initializeGlobalSequence,
  isUnifiedSsid,
  extractSsidNumber
} = require('./ssidService');

const ensureColumn = async (tableName, columnName, definition) => {
  const qi = sequelize.getQueryInterface();
  const table = await qi.describeTable(tableName);
  if (!table[columnName]) {
    await qi.addColumn(tableName, columnName, definition);
  }
};

const ensureUniqueIndex = async (tableName, indexName, fields) => {
  const qi = sequelize.getQueryInterface();
  const indexes = await qi.showIndex(tableName);
  const exists = indexes.some((idx) => idx.name === indexName);
  if (!exists) {
    try {
      await qi.addIndex(tableName, fields, { unique: true, name: indexName });
    } catch (err) {
      if (err?.original?.code === 'ER_TOO_MANY_KEYS') {
        console.warn(`[SSID Migration] Skipping unique index ${indexName} on ${tableName}: MySQL key limit reached`);
        return;
      }
      throw err;
    }
  }
};

const hashIfPlainPin = async (pinValue) => {
  if (!pinValue) return pinValue;
  const pin = String(pinValue).trim();
  if (!pin) return null;
  if (pin.startsWith('$2a$') || pin.startsWith('$2b$') || pin.startsWith('$2y$')) {
    return pin;
  }
  return bcrypt.hash(pin, 10);
};

const recoverFourDigitPinFromHash = async (hashedPin) => {
  if (!hashedPin || !String(hashedPin).startsWith('$2')) return null;

  for (let i = 0; i <= 9999; i++) {
    const candidate = String(i).padStart(4, '0');
    const matched = await bcrypt.compare(candidate, hashedPin);
    if (matched) {
      return candidate;
    }
  }

  return null;
};

const hasDuplicateSsid = async (candidate, currentModel, currentId) => {
  const [tenantRow, userRow, staffRow] = await Promise.all([
    Tenant.findOne({ where: { ssid: candidate }, attributes: ['id'] }),
    User.findOne({ where: { ssid: candidate }, attributes: ['id'] }),
    Staff.findOne({ where: { ssid: candidate }, attributes: ['id'] })
  ]);

  const sameTenant = currentModel === 'tenant' && tenantRow && String(tenantRow.id) === String(currentId);
  const sameUser = currentModel === 'user' && userRow && String(userRow.id) === String(currentId);
  const sameStaff = currentModel === 'staff' && staffRow && String(staffRow.id) === String(currentId);

  return !!((tenantRow && !sameTenant) || (userRow && !sameUser) || (staffRow && !sameStaff));
};

const needsReplacement = async (ssid, currentModel, currentId) => {
  if (!ssid) return true;
  if (!isUnifiedSsid(ssid)) return true;
  const numeric = extractSsidNumber(ssid);
  if (!numeric || numeric < 1001) return true;
  return hasDuplicateSsid(ssid, currentModel, currentId);
};

const runSsidMigration = async () => {
  const qi = sequelize.getQueryInterface();

  await ensureColumn('Tenants', 'ssid', { type: DataTypes.STRING(24), allowNull: true });
  await ensureColumn('Users', 'ssid', { type: DataTypes.STRING(24), allowNull: true });
  await ensureColumn('Staffs', 'ssid', { type: DataTypes.STRING(24), allowNull: true });
  await ensureColumn('Staffs', 'pinPlain', { type: DataTypes.STRING(20), allowNull: true });

  await qi.changeColumn('Users', 'pin', { type: DataTypes.STRING(255), allowNull: true });
  await qi.changeColumn('Staffs', 'pin', { type: DataTypes.STRING(255), allowNull: true });

  await ensureUniqueIndex('Tenants', 'uq_tenants_ssid', ['ssid']);
  await ensureUniqueIndex('Users', 'uq_users_ssid', ['ssid']);
  await ensureUniqueIndex('Staffs', 'uq_staff_ssid', ['ssid']);

  // Seed sequence table before allocation to keep generation monotonic with existing SSIDs.
  await sequelize.transaction(async (transaction) => {
    await initializeGlobalSequence(transaction);
  });

  const tenants = await Tenant.findAll();
  for (const tenant of tenants) {
    if (await needsReplacement(tenant.ssid, 'tenant', tenant.id)) {
      tenant.ssid = await generateTenantSsid();
      await tenant.save({ hooks: false });
    }
  }

  const users = await User.findAll();
  for (const user of users) {
    let changed = false;

    if (await needsReplacement(user.ssid, 'user', user.id)) {
      user.ssid = await generateUserSsid();
      changed = true;
    }

    const hashedPin = await hashIfPlainPin(user.pin);
    if (hashedPin !== user.pin) {
      user.pin = hashedPin;
      changed = true;
    }

    if (changed) {
      await user.save({ hooks: false });
    }
  }

  const staffMembers = await Staff.findAll({ include: [{ model: User, as: 'user', required: false }] });
  for (const staff of staffMembers) {
    let changed = false;

    const linkedUser = staff.user || (staff.userId ? await User.findByPk(staff.userId) : null);

    if (await needsReplacement(staff.ssid, 'staff', staff.id)) {
      if (linkedUser && linkedUser.ssid && isUnifiedSsid(linkedUser.ssid)) {
        staff.ssid = linkedUser.ssid;
      } else {
        const assigned = await generateUserSsid();
        staff.ssid = assigned;
        if (linkedUser) {
          linkedUser.ssid = assigned;
          await linkedUser.save({ hooks: false });
        }
      }
      changed = true;
    }

    if (linkedUser && staff.ssid && linkedUser.ssid !== staff.ssid) {
      linkedUser.ssid = staff.ssid;
      await linkedUser.save({ hooks: false });
    }

    if (staff.pin && !String(staff.pin).startsWith('$2') && !staff.pinPlain) {
      staff.pinPlain = String(staff.pin).trim();
      changed = true;
    }

    if (!staff.pinPlain && staff.pin && String(staff.pin).startsWith('$2')) {
      const recovered = await recoverFourDigitPinFromHash(staff.pin);
      if (recovered) {
        staff.pinPlain = recovered;
        changed = true;
      }
    }

    const hashedPin = await hashIfPlainPin(staff.pin);
    if (hashedPin !== staff.pin) {
      staff.pin = hashedPin;
      changed = true;
    }

    if (changed) {
      await staff.save({ hooks: false });
    }
  }

  await sequelize.transaction(async (transaction) => {
    await initializeGlobalSequence(transaction);
  });
};

module.exports = { runSsidMigration };
