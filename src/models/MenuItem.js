const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const MenuItem = sequelize.define('MenuItem', {
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
  categoryId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'Categories', key: 'id' }
  },
  name: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00,
    get() {
      const raw = this.getDataValue('price');
      return raw !== null && raw !== undefined ? parseFloat(parseFloat(raw).toFixed(2)) : 0.00;
    },
    set(val) {
      const num = parseFloat(val);
      this.setDataValue('price', isNaN(num) ? 0.00 : parseFloat(num.toFixed(2)));
    }
  },
  image: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  isVeg: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  isAvailable: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  preparationTime: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Estimated prep time in minutes'
  },
  tags: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const raw = this.getDataValue('tags');
      try { return raw ? JSON.parse(raw) : []; } catch { return []; }
    },
    set(val) {
      this.setDataValue('tags', typeof val === 'string' ? val : JSON.stringify(val));
    }
  },
  sortOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  timestamps: true,
  indexes: [
    { fields: ['tenantId'] },
    { fields: ['categoryId'] },
    { fields: ['isAvailable'] }
  ]
});

module.exports = MenuItem;
