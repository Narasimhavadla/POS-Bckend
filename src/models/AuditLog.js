const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AuditLog = sequelize.define('AuditLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  tenantId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  action: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'e.g. CREATE, UPDATE, DELETE, LOGIN, VOID_ORDER'
  },
  entity: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'e.g. Order, MenuItem, User'
  },
  entityId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  details: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
    get() {
      const raw = this.getDataValue('details');
      try { return raw ? JSON.parse(raw) : null; } catch { return null; }
    },
    set(val) {
      this.setDataValue('details', typeof val === 'string' ? val : JSON.stringify(val));
    }
  },
  ipAddress: {
    type: DataTypes.STRING(50),
    allowNull: true
  }
}, {
  timestamps: true,
  indexes: [
    { fields: ['tenantId'] },
    { fields: ['userId'] },
    { fields: ['action'] },
    { fields: ['createdAt'] }
  ]
});

module.exports = AuditLog;
