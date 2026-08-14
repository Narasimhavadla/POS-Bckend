const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Setting = sequelize.define('Setting', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  tenantId: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true,
    references: { model: 'Tenants', key: 'id' }
  },
  orderWorkflowMode: {
    type: DataTypes.STRING(30),
    defaultValue: 'WORKFLOW_1',
    comment: 'WORKFLOW_1=Cashier First, WORKFLOW_2=Direct Kitchen'
  },
  permissionsMatrixJson: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
    get() {
      const raw = this.getDataValue('permissionsMatrixJson');
      try { return raw ? JSON.parse(raw) : null; } catch { return null; }
    },
    set(val) {
      this.setDataValue('permissionsMatrixJson', typeof val === 'string' ? val : JSON.stringify(val));
    }
  },
  taxRate: {
    type: DataTypes.FLOAT,
    defaultValue: 5.0
  },
  taxName: {
    type: DataTypes.STRING(30),
    defaultValue: 'GST'
  },
  currency: {
    type: DataTypes.STRING(10),
    defaultValue: '₹'
  },
  gstNumber: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  restaurantType: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'restaurant'
  },
  enableKDS: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  enableQROrdering: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  enableInventory: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  timestamps: true,
  indexes: [
    { fields: ['tenantId'], unique: true }
  ]
});

module.exports = Setting;
