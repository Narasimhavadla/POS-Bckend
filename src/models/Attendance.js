const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Attendance — tracks each staff member's daily clock-in/clock-out event.
 * One record = one work session (one shift entry per day per staff).
 */
const Attendance = sequelize.define('Attendance', {
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
  // Staff identity — denormalized for fast queries
  staffId: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Human-readable staff ID e.g. STF-001'
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'UUID from Users table'
  },
  staffName: {
    type: DataTypes.STRING(150),
    allowNull: false
  },
  staffRole: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  // Date & time tracking
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: 'Attendance date e.g. 2026-08-12'
  },
  clockIn: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp when staff clocked in'
  },
  clockOut: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp when staff clocked out (null = still active)'
  },
  hoursWorked: {
    type: DataTypes.FLOAT,
    allowNull: true,
    comment: 'Computed on clock-out: (clockOut - clockIn) in hours'
  },
  overtimeHours: {
    type: DataTypes.FLOAT,
    allowNull: true,
    defaultValue: 0,
    comment: 'Hours worked beyond scheduledEnd'
  },
  // Scheduled shift from Staff profile
  scheduledStart: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'e.g. 09:00 — copied from Staff.shiftStart at clock-in'
  },
  scheduledEnd: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'e.g. 18:00 — copied from Staff.shiftEnd at clock-in'
  },
  // Computed flags
  isLate: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'True if clockIn > scheduledStart + 10 minutes'
  },
  lateByMinutes: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    comment: 'How many minutes late at clock-in'
  },
  isEarlyLeave: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'True if clockOut < scheduledEnd'
  },
  // Status
  status: {
    type: DataTypes.ENUM('PRESENT', 'ABSENT', 'HALF_DAY', 'ON_LEAVE', 'PENDING'),
    defaultValue: 'PENDING',
    comment: 'PENDING = clocked in but not yet clocked out'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Optional manager/staff note'
  }
}, {
  timestamps: true,
  indexes: [
    { fields: ['tenantId'] },
    { fields: ['branchId'] },
    { fields: ['userId'] },
    { fields: ['staffId'] },
    { fields: ['date'] },
    { fields: ['status'] },
    { unique: true, fields: ['tenantId', 'userId', 'date'], name: 'unique_attendance_per_staff_per_day' }
  ]
});

module.exports = Attendance;
