const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Table = sequelize.define('Table', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  tenantId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'Tenants', key: 'id' }
  },
  branchId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'Branches', key: 'id' }
  },
  number: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: 'Table number e.g. T-01, T-12'
  },
  zone: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'Main Hall',
    comment: 'Zone e.g. Main Hall, Outdoor, VIP'
  },
  seats: {
    type: DataTypes.INTEGER,
    defaultValue: 4
  },
  status: {
    type: DataTypes.STRING(30),
    defaultValue: 'vacant'
  },
  qrCode: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'QR code URL or data'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  timestamps: true,
  indexes: [
    { fields: ['tenantId'] },
    { fields: ['branchId'] },
    { fields: ['status'] },
    { fields: ['number'] }
  ]
});

module.exports = Table;
