const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Subscription = sequelize.define('Subscription', {
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
  plan: {
    type: DataTypes.ENUM('starter', 'professional', 'enterprise', 'basic'),
    defaultValue: 'starter'
  },
  status: {
    type: DataTypes.ENUM('active', 'expiring_soon', 'expired', 'cancelled', 'trial', 'suspended'),
    defaultValue: 'trial'
  },
  startDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  endDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  autoRenew: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  maxBranches: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  maxUsers: {
    type: DataTypes.INTEGER,
    defaultValue: 5
  },
  maxMenuItems: {
    type: DataTypes.INTEGER,
    defaultValue: 100
  },
  monthlyPrice: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  }
}, {
  timestamps: true,
  indexes: [
    { fields: ['tenantId'] },
    { fields: ['status'] },
    { fields: ['endDate'] }
  ]
});

module.exports = Subscription;
