const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * SubscriptionHistory — tracks plan changes, date extensions, and subscription audits.
 */
const SubscriptionHistory = sequelize.define('SubscriptionHistory', {
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
  previousPlan: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  newPlan: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  previousExpiryDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  newExpiryDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  changedBy: {
    type: DataTypes.STRING(150),
    allowNull: true,
    comment: 'Super Admin or User who performed the change'
  },
  changedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  timestamps: true,
  indexes: [
    { fields: ['tenantId'] },
    { fields: ['createdAt'] }
  ]
});

module.exports = SubscriptionHistory;
