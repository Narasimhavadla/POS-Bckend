const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Order = sequelize.define('Order', {
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
  tableNo: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  orderNumber: {
    type: DataTypes.STRING(30),
    allowNull: true,
    comment: 'Human-readable order number e.g. ORD-001'
  },
  type: {
    type: DataTypes.ENUM('dine-in', 'takeaway', 'delivery', 'qr-order'),
    defaultValue: 'dine-in'
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'CLOSED', 'VOIDED'),
    defaultValue: 'PENDING'
  },
  items: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
    get() {
      const raw = this.getDataValue('items');
      try { return raw ? JSON.parse(raw) : []; } catch { return []; }
    },
    set(val) {
      this.setDataValue('items', typeof val === 'string' ? val : JSON.stringify(val));
    }
  },
  subtotal: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  tax: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  discount: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  total: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  paymentMethod: {
    type: DataTypes.ENUM('Cash', 'UPI', 'Card', 'Split', 'Pending'),
    defaultValue: 'Pending'
  },
  paymentStatus: {
    type: DataTypes.ENUM('UNPAID', 'PAID', 'PARTIAL', 'REFUNDED', 'VOIDED'),
    defaultValue: 'UNPAID'
  },
  customerName: {
    type: DataTypes.STRING(150),
    allowNull: true
  },
  customerPhone: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  kdsClosed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  voidReason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  voidedBy: {
    type: DataTypes.UUID,
    allowNull: true
  },
  servedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'Waiter/cashier who served the order'
  },
  preparedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  servedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  closedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  timestamps: true,
  indexes: [
    { fields: ['tenantId'] },
    { fields: ['branchId'] },
    { fields: ['status'] },
    { fields: ['paymentStatus'] },
    { fields: ['orderNumber'] },
    { fields: ['createdAt'] }
  ]
});

module.exports = Order;
