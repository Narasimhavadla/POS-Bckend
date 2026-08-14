const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * ShiftDrawer — tracks cashier shift lifecycle.
 * One record = one shift session opened and closed by a cashier.
 */
const ShiftDrawer = sequelize.define('ShiftDrawer', {
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
  // Identity of who opened the shift
  userId: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'UUID from User or Staff table'
  },
  staffId: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: '6-digit numeric staff ID for display'
  },
  staffName: {
    type: DataTypes.STRING(150),
    allowNull: true
  },
  staffRole: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  // Cash drawer metrics
  openingFloat: {
    type: DataTypes.FLOAT,
    defaultValue: 0,
    comment: 'Cash placed in drawer at shift start'
  },
  totalCashSales: {
    type: DataTypes.FLOAT,
    defaultValue: 0,
    comment: 'Sum of all PAID Cash orders during this shift'
  },
  totalUpiSales: {
    type: DataTypes.FLOAT,
    defaultValue: 0,
    comment: 'Sum of all PAID UPI orders during this shift'
  },
  totalCardSales: {
    type: DataTypes.FLOAT,
    defaultValue: 0,
    comment: 'Sum of all PAID Card/Split orders during this shift'
  },
  totalVoidAmount: {
    type: DataTypes.FLOAT,
    defaultValue: 0,
    comment: 'Total value of voided orders during shift'
  },
  totalTaxCollected: {
    type: DataTypes.FLOAT,
    defaultValue: 0,
    comment: 'Total tax collected across all paid orders during shift'
  },
  totalSalesCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Total closed orders during shift'
  },
  totalVoidCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Total voided orders during shift'
  },
  // Z-Report close metrics
  expectedCash: {
    type: DataTypes.FLOAT,
    allowNull: true,
    comment: 'openingFloat + totalCashSales'
  },
  actualCash: {
    type: DataTypes.FLOAT,
    allowNull: true,
    comment: 'Physical cash counted by cashier at close'
  },
  cashVariance: {
    type: DataTypes.FLOAT,
    allowNull: true,
    comment: 'actualCash - expectedCash'
  },
  status: {
    type: DataTypes.ENUM('OPEN', 'CLOSED'),
    defaultValue: 'OPEN'
  },
  openedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  closedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  timestamps: true,
  indexes: [
    { fields: ['tenantId'] },
    { fields: ['branchId'] },
    { fields: ['userId'] },
    { fields: ['status'] },
    { fields: ['openedAt'] }
  ]
});

module.exports = ShiftDrawer;
