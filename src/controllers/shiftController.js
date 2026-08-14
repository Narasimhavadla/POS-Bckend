const { ShiftDrawer, Order, AuditLog } = require('../models');
const { Op } = require('sequelize');

/**
 * GET /pos/shifts/active  OR  GET /owner/shifts/active
 * Returns the currently OPEN shift for the tenant (and optionally a specific user).
 */
exports.getActiveShift = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const where = { tenantId, status: 'OPEN' };

    // If the caller is a cashier/staff, scope to their own shift
    if (req.user?.role === 'cashier' || req.user?.role === 'waiter') {
      where.userId = req.user.id;
    }

    const shift = await ShiftDrawer.findOne({ where, order: [['openedAt', 'DESC']] });
    res.json({ success: true, data: shift || null });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /pos/shifts/open
 * Opens a new shift drawer for the authenticated cashier.
 * Body: { openingFloat: Number, notes?: String }
 */
exports.openShift = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { openingFloat = 0, notes, branchId } = req.body;
    const staffUser = req.user;

    // Enforce one active shift per cashier per tenant
    const existing = await ShiftDrawer.findOne({
      where: { tenantId, userId: staffUser.id, status: 'OPEN' }
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'You already have an open shift. Please close it before opening a new one.',
        data: existing
      });
    }

    const shift = await ShiftDrawer.create({
      tenantId,
      branchId: branchId || null,
      userId: staffUser.id,
      staffId: staffUser.staffId || null,
      staffName: staffUser.name || staffUser.username,
      staffRole: staffUser.role,
      openingFloat: parseFloat(openingFloat) || 0,
      status: 'OPEN',
      openedAt: new Date(),
      notes: notes || null
    });

    // Audit log (visible to Owner/Manager)
    await AuditLog.create({
      tenantId,
      action: 'SHIFT_OPEN',
      entity: 'ShiftDrawer',
      entityId: shift.id,
      userId: staffUser.id,
      details: JSON.stringify({
        shiftId: shift.id,
        staffName: staffUser.name || staffUser.username,
        staffRole: staffUser.role,
        staffId: staffUser.staffId,
        openingFloat: parseFloat(openingFloat) || 0,
        openedAt: shift.openedAt
      })
    }).catch(() => {});

    res.status(201).json({ success: true, message: 'Shift opened successfully.', data: shift });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /pos/shifts/:id/close
 * Closes the shift, computes live sales breakdown from orders, creates Z-Report snapshot.
 * Body: { actualCash: Number, notes?: String }
 */
exports.closeShift = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    const { actualCash, notes } = req.body;
    const staffUser = req.user;

    const shift = await ShiftDrawer.findOne({ where: { id, tenantId, status: 'OPEN' } });
    if (!shift) {
      return res.status(404).json({ success: false, message: 'No open shift found with that ID.' });
    }

    // Compute sales totals for orders closed/paid between shift open time and now
    const openTimeBuffer = new Date(shift.openedAt.getTime() - 60000);
    const shiftOrders = await Order.findAll({
      where: {
        tenantId,
        paymentStatus: { [Op.in]: ['PAID', 'paid'] },
        status: { [Op.in]: ['CLOSED', 'closed'] },
        [Op.or]: [
          { closedAt: { [Op.gte]: openTimeBuffer } },
          { updatedAt: { [Op.gte]: openTimeBuffer } },
          { createdAt: { [Op.gte]: openTimeBuffer } }
        ]
      }
    });

    const voidedOrders = await Order.findAll({
      where: {
        tenantId,
        status: { [Op.in]: ['VOIDED', 'voided'] },
        [Op.or]: [
          { closedAt: { [Op.gte]: openTimeBuffer } },
          { updatedAt: { [Op.gte]: openTimeBuffer } },
          { createdAt: { [Op.gte]: openTimeBuffer } }
        ]
      }
    });

    let totalCashSales = 0, totalUpiSales = 0, totalCardSales = 0, totalTaxCollected = 0;
    for (const o of shiftOrders) {
      const amt = parseFloat(o.total) || parseFloat(o.totalAmount) || parseFloat(o.subtotal) || 0;
      const taxAmt = parseFloat(o.tax) || parseFloat(o.taxAmount) || 0;
      totalTaxCollected += taxAmt;

      const method = (o.paymentMethod || '').trim().toLowerCase();
      if (method === 'cash') {
        totalCashSales += amt;
      } else if (method === 'upi') {
        totalUpiSales += amt;
      } else if (method === 'card' || method === 'card/other' || method === 'credit' || method === 'debit' || method === 'pos' || method === 'other') {
        totalCardSales += amt;
      } else {
        // Fallback: If order is marked CLOSED & PAID with cash/default, assign to cash sales
        totalCashSales += amt;
      }
    }
    const totalVoidAmount = voidedOrders.reduce((s, o) => s + (parseFloat(o.total) || parseFloat(o.totalAmount) || 0), 0);
    const expectedCash = (parseFloat(shift.openingFloat) || 0) + totalCashSales;
    const parsedActual = isNaN(parseFloat(actualCash)) ? expectedCash : parseFloat(actualCash);
    const cashVariance = parsedActual - expectedCash;

    // Update shift record
    await shift.update({
      totalCashSales,
      totalUpiSales,
      totalCardSales,
      totalVoidAmount,
      totalTaxCollected,
      totalSalesCount: shiftOrders.length,
      totalVoidCount: voidedOrders.length,
      expectedCash,
      actualCash: parsedActual,
      cashVariance,
      status: 'CLOSED',
      closedAt: new Date(),
      notes: notes || shift.notes
    });

    // Audit log (visible to Owner/Manager)
    await AuditLog.create({
      tenantId,
      action: 'SHIFT_CLOSE',
      entity: 'ShiftDrawer',
      entityId: shift.id,
      userId: staffUser.id,
      details: JSON.stringify({
        shiftId: shift.id,
        staffName: staffUser.name || staffUser.username,
        staffRole: staffUser.role,
        openingFloat: shift.openingFloat,
        totalCashSales,
        totalUpiSales,
        totalCardSales,
        totalTaxCollected,
        totalVoidAmount,
        totalSalesCount: shiftOrders.length,
        expectedCash,
        actualCash: parsedActual,
        cashVariance,
        openedAt: shift.openedAt,
        closedAt: new Date()
      })
    }).catch(() => {});

    res.json({ success: true, message: 'Shift closed. Z-Report generated.', data: shift });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /owner/shifts/history
 * Owner / Manager only — returns all shift records for the tenant (paginated).
 */
exports.getShiftHistory = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { page = 1, limit = 50, startDate, endDate } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = { tenantId };
    if (startDate || endDate) {
      where.openedAt = {};
      if (startDate) where.openedAt[Op.gte] = new Date(startDate);
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        where.openedAt[Op.lte] = e;
      }
    }

    const { count, rows } = await ShiftDrawer.findAndCountAll({
      where,
      order: [['openedAt', 'DESC']],
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
