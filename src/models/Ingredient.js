const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Ingredient = sequelize.define('Ingredient', {
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
  name: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  unit: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: 'kg',
    comment: 'e.g. kg, liters, pieces, grams'
  },
  currentStock: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  reorderLevel: {
    type: DataTypes.FLOAT,
    defaultValue: 10,
    comment: 'Trigger alert when stock falls below this'
  },
  costPerUnit: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  supplier: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  timestamps: true,
  indexes: [
    { fields: ['tenantId'] },
    { fields: ['currentStock'] }
  ]
});

module.exports = Ingredient;
