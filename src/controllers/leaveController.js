const { LeaveRequest, Staff } = require('../models');
const { Op } = require('sequelize');

/**
 * POST /pos/leaves
 * Staff raises a leave request from their portal.
 */
exports.createLeaveRequest = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { leaveType, fromDate, toDate, reason } = req.body;

    if (!fromDate || !toDate || !leaveType) {
      return res.status(400).json({ success: false, message: 'Leave type, from date and to date are required.' });
    }

    // Calculate total days
    const from = new Date(fromDate);
    const to = new Date(toDate);
    if (to < from) {
      return res.status(400).json({ success: false, message: 'End date must be on or after start date.' });
    }
    const totalDays = Math.round((to - from) / (1000 * 60 * 60 * 24)) + 1;

    // Resolve staff identity from JWT
    const userId = req.user?.id || null;
    let staffName = req.user?.name || 'Staff Member';
    let staffRole = req.user?.role || 'staff';
    let staffIdCode = null;

    if (userId) {
      const staffProfile = await Staff.findOne({ where: { userId } });
      if (staffProfile) {
        staffName = staffProfile.name || staffName;
        staffRole = staffProfile.role || staffRole;
        staffIdCode = staffProfile.staffId || null;
      }
    }

    const leave = await LeaveRequest.create({
      tenantId,
      userId,
      staffId: staffIdCode,
      staffName,
      staffRole,
      leaveType,
      fromDate,
      toDate,
      totalDays,
      reason: reason || null,
      status: 'PENDING'
    });

    res.status(201).json({ success: true, message: 'Leave request submitted successfully.', data: leave });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /pos/leaves/my
 * Staff views their own leave requests.
 */
exports.getMyLeaveRequests = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.user?.id;

    const leaves = await LeaveRequest.findAll({
      where: { tenantId, userId },
      order: [['createdAt', 'DESC']],
      limit: 50
    });

    res.json({ success: true, data: leaves });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /owner/leaves
 * Owner/Manager views all staff leave requests with optional status filter.
 */
exports.getAllLeaveRequests = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { status, staffId, userId: filterUserId } = req.query;

    const where = { tenantId };
    if (status) where.status = status;
    if (staffId) where.staffId = staffId;
    if (filterUserId) where.userId = filterUserId;

    const leaves = await LeaveRequest.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: 200
    });

    const pending = leaves.filter(l => l.status === 'PENDING').length;

    res.json({ success: true, data: leaves, pendingCount: pending });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PATCH /owner/leaves/:id
 * Owner/Manager approves or rejects a leave request.
 * Body: { status: 'APPROVED'|'REJECTED', reviewNotes }
 */
exports.updateLeaveStatus = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    const { status, reviewNotes } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be APPROVED or REJECTED.' });
    }

    const leave = await LeaveRequest.findOne({ where: { id, tenantId } });
    if (!leave) {
      return res.status(404).json({ success: false, message: 'Leave request not found.' });
    }

    await leave.update({
      status,
      reviewedBy: req.user?.name || 'Manager',
      reviewedAt: new Date(),
      reviewNotes: reviewNotes || null
    });

    res.json({ success: true, message: `Leave request ${status.toLowerCase()}.`, data: leave });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE /pos/leaves/:id
 * Staff cancels their own pending leave request.
 */
exports.cancelLeaveRequest = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    const userId = req.user?.id;

    const leave = await LeaveRequest.findOne({ where: { id, tenantId, userId } });
    if (!leave) {
      return res.status(404).json({ success: false, message: 'Leave request not found.' });
    }
    if (leave.status !== 'PENDING') {
      return res.status(400).json({ success: false, message: 'Only pending requests can be cancelled.' });
    }

    await leave.destroy();
    res.json({ success: true, message: 'Leave request cancelled.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
