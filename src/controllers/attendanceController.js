const { Attendance, Staff, User } = require('../models');
const { Op } = require('sequelize');

// Defaults
const LATE_THRESHOLD_MINUTES = 10;

/**
 * Helper: parse a "HH:MM" string into today's Date object
 */
const parseTimeToday = (timeStr, referenceDate) => {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date(referenceDate || new Date());
  d.setHours(h, m, 0, 0);
  return d;
};

/**
 * POST /pos/attendance/clock-in
 * Staff clocks in. Creates or reuses today's Attendance record.
 */
exports.clockIn = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const user = req.user;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Find staff profile for schedule info (checking userId, id, email, or name)
    const staffProfile = await Staff.findOne({
      where: {
        tenantId,
        [Op.or]: [
          { userId: user.id },
          { id: user.id },
          ...(user.email ? [{ email: user.email }] : []),
          ...(user.name ? [{ name: user.name }] : [])
        ]
      }
    });

    // Prevent duplicate active clock-in
    const existing = await Attendance.findOne({
      where: { tenantId, userId: user.id, date: today }
    });

    if (existing && existing.clockIn && !existing.clockOut) {
      return res.status(409).json({
        success: false,
        message: 'You are already clocked in for today.',
        data: existing
      });
    }

    const now = new Date();
    const scheduledStart = staffProfile?.shiftStart || null;
    const scheduledEnd = staffProfile?.shiftEnd || null;

    // Compute lateness
    let isLate = false;
    let lateByMinutes = 0;
    if (scheduledStart) {
      const scheduledStartTime = parseTimeToday(scheduledStart, now);
      const thresholdTime = new Date(scheduledStartTime.getTime() + LATE_THRESHOLD_MINUTES * 60000);
      if (now > thresholdTime) {
        isLate = true;
        lateByMinutes = Math.round((now - scheduledStartTime) / 60000);
      }
    }

    let record;
    if (existing) {
      // Re-clock-in (e.g. after a break) — update the record
      await existing.update({
        clockIn: now,
        clockOut: null,
        isLate,
        lateByMinutes,
        status: 'PENDING',
        scheduledStart,
        scheduledEnd
      });
      record = existing;
    } else {
      record = await Attendance.create({
        tenantId,
        branchId: req.body.branchId || staffProfile?.branchId || null,
        userId: user.id,
        staffId: staffProfile?.staffId || null,
        staffName: user.name || user.username,
        staffRole: user.role,
        date: today,
        clockIn: now,
        scheduledStart,
        scheduledEnd,
        isLate,
        lateByMinutes,
        status: 'PENDING'
      });
    }

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.to(`tenant-${tenantId}`).emit('attendance_update', { type: 'CLOCK_IN', record });
    }

    res.status(201).json({ success: true, message: 'Clocked in successfully.', data: record });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PUT /pos/attendance/clock-out
 * Staff clocks out. Computes hoursWorked, overtimeHours, isEarlyLeave.
 */
exports.clockOut = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const user = req.user;
    const today = new Date().toISOString().split('T')[0];

    const record = await Attendance.findOne({
      where: { tenantId, userId: user.id, date: today, clockOut: null }
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'No active clock-in found for today. Please clock in first.'
      });
    }

    const now = new Date();
    const hoursWorked = parseFloat(((now - new Date(record.clockIn)) / 3600000).toFixed(2));

    // Early leave check
    let isEarlyLeave = false;
    let overtimeHours = 0;
    if (record.scheduledEnd) {
      const scheduledEndTime = parseTimeToday(record.scheduledEnd, now);
      if (now < scheduledEndTime) {
        isEarlyLeave = true;
      } else {
        overtimeHours = parseFloat(((now - scheduledEndTime) / 3600000).toFixed(2));
      }
    }

    // Determine final status
    let status = 'PRESENT';
    if (hoursWorked < 4) status = 'HALF_DAY';

    await record.update({
      clockOut: now,
      hoursWorked,
      overtimeHours,
      isEarlyLeave,
      status
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`tenant-${tenantId}`).emit('attendance_update', { type: 'CLOCK_OUT', record });
    }

    res.json({ success: true, message: 'Clocked out successfully.', data: record });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /pos/attendance/my
 * Staff views their own attendance history.
 */
exports.getMyAttendance = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.user.id;
    const { page = 1, limit = 30, startDate, endDate } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = { tenantId, userId };
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date[Op.gte] = startDate;
      if (endDate) where.date[Op.lte] = endDate;
    }

    const { count, rows } = await Attendance.findAndCountAll({
      where,
      order: [['date', 'DESC']],
      limit: parseInt(limit),
      offset
    });

    // Summary stats
    const allRecords = await Attendance.findAll({ where: { tenantId, userId } });
    const totalDaysPresent = allRecords.filter(r => ['PRESENT', 'HALF_DAY'].includes(r.status)).length;
    const totalHours = allRecords.reduce((s, r) => s + (r.hoursWorked || 0), 0);
    const lateCount = allRecords.filter(r => r.isLate).length;
    const absentCount = allRecords.filter(r => r.status === 'ABSENT').length;
    const avgHours = totalDaysPresent > 0 ? parseFloat((totalHours / totalDaysPresent).toFixed(2)) : 0;

    res.json({
      success: true,
      data: rows,
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / parseInt(limit)),
      summary: { totalDaysPresent, totalHours: parseFloat(totalHours.toFixed(2)), lateCount, absentCount, avgHours }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /owner/attendance
 * Owner/Manager views all staff attendance records with filters.
 */
exports.getAllAttendance = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { page = 1, limit = 50, startDate, endDate, staffId, userId, status, branchId } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = { tenantId };
    if (branchId) where.branchId = branchId;
    if (staffId) where.staffId = staffId;
    if (userId) where.userId = userId;
    if (status) where.status = status;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date[Op.gte] = startDate;
      if (endDate) where.date[Op.lte] = endDate;
    }

    const { count, rows } = await Attendance.findAndCountAll({
      where,
      order: [['date', 'DESC'], ['clockIn', 'DESC']],
      limit: parseInt(limit),
      offset
    });

    res.json({
      success: true,
      data: rows,
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / parseInt(limit))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /owner/attendance/summary
 * Per-staff aggregate: total present, absent, hours, late count, avg hours.
 */
exports.getAttendanceSummary = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { startDate, endDate, branchId } = req.query;

    const where = { tenantId };
    if (branchId) where.branchId = branchId;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date[Op.gte] = startDate;
      if (endDate) where.date[Op.lte] = endDate;
    }

    const allRecords = await Attendance.findAll({ where });

    // Group by userId
    const grouped = {};
    for (const r of allRecords) {
      const key = r.userId || r.staffId || r.staffName;
      if (!grouped[key]) {
        grouped[key] = {
          userId: r.userId,
          staffId: r.staffId,
          staffName: r.staffName,
          staffRole: r.staffRole,
          records: []
        };
      }
      grouped[key].records.push(r);
    }

    const summary = Object.values(grouped).map(g => {
      const present = g.records.filter(r => ['PRESENT', 'HALF_DAY'].includes(r.status)).length;
      const absent = g.records.filter(r => r.status === 'ABSENT').length;
      const late = g.records.filter(r => r.isLate).length;
      const totalHours = g.records.reduce((s, r) => s + (r.hoursWorked || 0), 0);
      const totalOvertime = g.records.reduce((s, r) => s + (r.overtimeHours || 0), 0);
      const avgHours = present > 0 ? parseFloat((totalHours / present).toFixed(2)) : 0;
      return {
        userId: g.userId,
        staffId: g.staffId,
        staffName: g.staffName,
        staffRole: g.staffRole,
        totalDays: g.records.length,
        totalPresent: present,
        totalAbsent: absent,
        lateCount: late,
        totalHours: parseFloat(totalHours.toFixed(2)),
        totalOvertime: parseFloat(totalOvertime.toFixed(2)),
        avgHoursPerDay: avgHours
      };
    });

    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /owner/attendance/live
 * Returns all staff currently clocked in (clockOut is null).
 */
exports.getActiveClockIns = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const today = new Date().toISOString().split('T')[0];

    const active = await Attendance.findAll({
      where: { tenantId, date: today, clockOut: null, status: 'PENDING' },
      order: [['clockIn', 'ASC']]
    });

    res.json({ success: true, data: active });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /owner/attendance/mark-absent
 * Manager manually marks a staff member absent for a specific date.
 * Body: { userId, staffName, staffRole, staffId, date, notes }
 */
exports.markAbsent = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { userId, staffName, staffRole, staffId, date, notes, branchId } = req.body;

    if (!date) {
      return res.status(400).json({ success: false, message: 'date is required (YYYY-MM-DD).' });
    }

    const [record, created] = await Attendance.findOrCreate({
      where: { tenantId, userId, date },
      defaults: {
        tenantId,
        branchId: branchId || null,
        userId,
        staffId: staffId || null,
        staffName,
        staffRole,
        date,
        status: 'ABSENT',
        notes: notes || 'Marked absent by manager'
      }
    });

    if (!created) {
      await record.update({ status: 'ABSENT', notes: notes || record.notes });
    }

    res.json({ success: true, message: 'Staff marked as absent.', data: record });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
