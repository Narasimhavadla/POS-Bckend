const { Op, QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const getModels = () => require('../models');

const SSID_PREFIX = 'SS';
const SSID_START = 100000;
const SSID_DIGITS = 6;
const SSID_REGEX = /^SS(\d+)$/i;

const extractSsidNumber = (ssid) => {
  const match = String(ssid || '').trim().match(SSID_REGEX);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  return Number.isFinite(num) ? num : null;
};

const formatSsid = (num) => `${SSID_PREFIX}${String(num).padStart(SSID_DIGITS, '0')}`;

const ensureSequenceTable = async (transaction) => {
  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS SsidSequences (
      name VARCHAR(50) PRIMARY KEY,
      lastNumber INT NOT NULL DEFAULT ${SSID_START}
    )`,
    { transaction }
  );
};

const getMaxExistingSsidNumber = async (transaction) => {
  const [tenantRows, userRows, staffRows] = await Promise.all([
    sequelize.query('SELECT ssid FROM Tenants WHERE ssid IS NOT NULL', { type: QueryTypes.SELECT, transaction }),
    sequelize.query('SELECT ssid FROM Users WHERE ssid IS NOT NULL', { type: QueryTypes.SELECT, transaction }),
    sequelize.query('SELECT ssid FROM Staffs WHERE ssid IS NOT NULL', { type: QueryTypes.SELECT, transaction })
  ]);

  let maxNum = SSID_START;
  [...tenantRows, ...userRows, ...staffRows].forEach((row) => {
    const n = extractSsidNumber(row.ssid);
    if (n && n > maxNum) maxNum = n;
  });

  return maxNum;
};

const initializeGlobalSequence = async (transaction) => {
  await ensureSequenceTable(transaction);
  const existing = await sequelize.query(
    "SELECT name, lastNumber FROM SsidSequences WHERE name='global' FOR UPDATE",
    { type: QueryTypes.SELECT, transaction }
  );

  if (!existing.length) {
    const maxExisting = await getMaxExistingSsidNumber(transaction);
    await sequelize.query(
      "INSERT INTO SsidSequences(name, lastNumber) VALUES ('global', :seed)",
      { replacements: { seed: Math.max(SSID_START, maxExisting) }, transaction }
    );
    return;
  }

  const maxExisting = await getMaxExistingSsidNumber(transaction);
  if (maxExisting > Number(existing[0].lastNumber || SSID_START)) {
    await sequelize.query(
      "UPDATE SsidSequences SET lastNumber=:next WHERE name='global'",
      { replacements: { next: maxExisting }, transaction }
    );
  }
};

const ssidExistsAnywhere = async (candidate, transaction) => {
  const { Tenant, User, Staff } = getModels();
  const [tenantExists, userExists, staffExists] = await Promise.all([
    Tenant.findOne({ where: { ssid: candidate }, attributes: ['id'], transaction }),
    User.findOne({ where: { ssid: candidate }, attributes: ['id'], transaction }),
    Staff.findOne({ where: { ssid: candidate }, attributes: ['id'], transaction })
  ]);
  return !!(tenantExists || userExists || staffExists);
};

const allocateNextGlobalSsid = async () => {
  return sequelize.transaction(async (transaction) => {
    await initializeGlobalSequence(transaction);

    for (let attempt = 0; attempt < 20; attempt++) {
      const rows = await sequelize.query(
        "SELECT lastNumber FROM SsidSequences WHERE name='global' FOR UPDATE",
        { type: QueryTypes.SELECT, transaction }
      );
      const current = Number(rows[0]?.lastNumber || SSID_START);
      const next = current + 1;
      const candidate = formatSsid(next);

      const exists = await ssidExistsAnywhere(candidate, transaction);
      if (!exists) {
        await sequelize.query(
          "UPDATE SsidSequences SET lastNumber=:next WHERE name='global'",
          { replacements: { next }, transaction }
        );
        return candidate;
      }

      await sequelize.query(
        "UPDATE SsidSequences SET lastNumber=:next WHERE name='global'",
        { replacements: { next }, transaction }
      );
    }

    throw new Error('Failed to allocate a globally unique SSID');
  });
};

const isUnifiedSsid = (ssid) => SSID_REGEX.test(String(ssid || '').trim());

const generateTenantSsid = async () => allocateNextGlobalSsid();
const generateUserSsid = async () => allocateNextGlobalSsid();

const resolveTenantByIdentifier = async (tenantIdentifier) => {
  const { Tenant } = getModels();
  if (!tenantIdentifier) return null;
  return Tenant.findOne({
    where: {
      [Op.or]: [{ id: tenantIdentifier }, { ssid: tenantIdentifier }]
    }
  });
};

module.exports = {
  generateTenantSsid,
  generateUserSsid,
  resolveTenantByIdentifier,
  initializeGlobalSequence,
  isUnifiedSsid,
  extractSsidNumber,
  SSID_REGEX
};
