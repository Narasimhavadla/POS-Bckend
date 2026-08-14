const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Holiday — tracks restaurant weekly off days and special holiday dates.
 */
const Holiday = sequelize.define('Holiday', {
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
  title: {
    type: DataTypes.STRING(150),
    allowNull: false,
    comment: 'e.g. Sunday Weekly Off, Diwali, Independence Day'
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    comment: 'Specific date YYYY-MM-DD (null if recurring weekly off)'
  },
  dayOfWeek: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '0=Sunday, 1=Monday... 6=Saturday for weekly recurring off'
  },
  isRecurring: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'True if repeats every week'
  },
  type: {
    type: DataTypes.ENUM('WEEKLY_OFF', 'PUBLIC_HOLIDAY', 'SPECIAL_CLOSURE'),
    defaultValue: 'PUBLIC_HOLIDAY'
  },
  description: {
    type: DataTypes.STRING(255),
    allowNull: true
  }
}, {
  timestamps: true,
  indexes: [
    { fields: ['tenantId'] },
    { fields: ['branchId'] },
    { fields: ['date'] },
    { fields: ['dayOfWeek'] }
  ]
});

module.exports = Holiday;
