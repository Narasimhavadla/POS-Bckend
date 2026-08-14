const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * LeaveRequest — tracks leave applications raised by staff members.
 * Owner/Manager can approve or reject each request.
 */
const LeaveRequest = sequelize.define('LeaveRequest', {
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
    allowNull: true
  },
  // Staff identity (denormalized for fast queries)
  userId: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'UUID from Users table'
  },
  staffId: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Human-readable staff ID e.g. STF-001'
  },
  staffName: {
    type: DataTypes.STRING(150),
    allowNull: false
  },
  staffRole: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  // Leave details
  leaveType: {
    type: DataTypes.ENUM('CASUAL', 'SICK', 'EARNED', 'MATERNITY', 'PATERNITY', 'UNPAID', 'OTHER'),
    defaultValue: 'CASUAL',
    allowNull: false
  },
  fromDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: 'Leave start date'
  },
  toDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: 'Leave end date'
  },
  totalDays: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Number of leave days'
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Reason provided by staff'
  },
  // Review lifecycle
  status: {
    type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'),
    defaultValue: 'PENDING',
    allowNull: false
  },
  reviewedBy: {
    type: DataTypes.STRING(150),
    allowNull: true,
    comment: 'Name of manager/owner who reviewed'
  },
  reviewedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  reviewNotes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Optional note from reviewer on approval/rejection'
  }
}, {
  timestamps: true,
  indexes: [
    { fields: ['tenantId'] },
    { fields: ['userId'] },
    { fields: ['staffId'] },
    { fields: ['status'] },
    { fields: ['fromDate'] }
  ]
});

module.exports = LeaveRequest;
