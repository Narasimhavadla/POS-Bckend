const { Order, OrderItem, Table } = require('../models');

const getNextKotNumber = async (tenantId) => {
  try {
    const allTenantOrders = await Order.findAll({
      where: { tenantId },
      attributes: ['orderNumber'],
      raw: true
    });

    let maxNum = 0;
    allTenantOrders.forEach((o) => {
      if (o.orderNumber) {
        const match = String(o.orderNumber).match(/KOT-(\d+)/i);
        if (match && match[1]) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      }
    });

    const nextNum = maxNum + 1;
    return `KOT-${String(nextNum).padStart(4, '0')}`;
  } catch {
    return `KOT-0001`;
  }
};

exports.getPosOrders = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const orders = await Order.findAll({
      where: { tenantId },
      order: [['createdAt', 'DESC']]
    });
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createPosOrder = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { tableNo, items, total, subtotal, tax, discount, paymentMethod, paymentStatus, status, type, notes, branchId } = req.body;
    const { Branch } = require('../models');
    
    let validBranchId = null;
    if (branchId && branchId.trim() !== '') {
      const branchExists = await Branch.findByPk(branchId);
      if (branchExists) {
        validBranchId = branchId;
      }
    }

    let orderNumber = req.body.orderNumber || req.body.kotNo;
    if (!orderNumber || !orderNumber.startsWith("KOT-")) {
      orderNumber = await getNextKotNumber(tenantId);
    }
    
    const parsedItems = Array.isArray(items) ? items : (typeof items === 'string' ? (JSON.parse(items || '[]')) : []);
    const computedSum = parsedItems.reduce((acc, it) => {
      const p = Number(it.price ?? it.unitPrice ?? it.priceAmount ?? 0);
      const q = Number(it.qty ?? it.quantity ?? 1);
      return acc + (p * q);
    }, 0);
    const finalTotal = (total && Number(total) > 0) ? Number(total) : computedSum;

    let order = null;
    if (req.body.id) {
      order = await Order.findByPk(req.body.id);
    }
    if (!order && tableNo && tableNo !== 'Takeaway' && !tableNo.startsWith('Parcel')) {
      const { Op } = require('sequelize');
      order = await Order.findOne({
        where: {
          tenantId,
          tableNo,
          paymentStatus: { [Op.ne]: 'PAID' },
          status: { [Op.notIn]: ['CLOSED', 'closed', 'voided', 'VOIDED'] }
        },
        order: [['createdAt', 'DESC']]
      });
    }

    if (order) {
      if (items) {
        order.items = items;
        order.changed('items', true);
      }
      order.total = finalTotal || order.total;
      order.subtotal = subtotal || finalTotal || order.subtotal;
      order.tax = tax || order.tax;
      order.discount = discount || order.discount;
      if (status) order.status = status;
      if (typeof req.body.kdsClosed !== 'undefined') order.kdsClosed = req.body.kdsClosed;
      if (paymentMethod) order.paymentMethod = paymentMethod;
      if (paymentStatus) order.paymentStatus = paymentStatus;
      if (status === 'CLOSED' || paymentStatus === 'PAID') order.closedAt = new Date();
      if (req.body.voidReason) order.voidReason = req.body.voidReason;
      await order.save();
    } else {
      order = await Order.create({
        id: req.body.id || undefined,
        tenantId,
        branchId: validBranchId,
        tableNo: tableNo || 'T-01',
        orderNumber,
        items: items || [],
        total: finalTotal,
        subtotal: subtotal || finalTotal,
        tax: tax || 0,
        discount: discount || 0,
        paymentMethod: paymentMethod || 'Pending',
        paymentStatus: paymentStatus || 'UNPAID',
        status: status || 'DRAFT',
        closedAt: (status === 'CLOSED' || paymentStatus === 'PAID') ? new Date() : null,
        kdsClosed: req.body.kdsClosed || false,
        type: type || 'dine-in',
        notes,
        voidReason: req.body.voidReason || undefined,
        voidedBy: req.body.voidedBy || req.userId || undefined
      });
    }

    // Update table status if table provided
    if (tableNo) {
      const table = await Table.findOne({ where: { tenantId, number: tableNo } });
      if (table) {
        table.status = (status === 'VOIDED' || paymentStatus === 'VOIDED') ? 'available' : 'occupied';
        await table.save();
      }
    }

    // Broadcast realtime event via socket if available
    const io = req.app.get('io');
    if (io) {
      io.to(`tenant-${tenantId}`).emit('new_order', order);
    }

    res.status(201).json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, paymentStatus, paymentMethod, tableNo, voidReason } = req.body;
    const tenantId = req.tenantId;
    const { Op } = require('sequelize');

    let order = await Order.findByPk(id);
    if (!order && (tableNo || req.body.tableNumber)) {
      const tbl = tableNo || req.body.tableNumber;
      order = await Order.findOne({
        where: {
          tenantId,
          tableNo: tbl,
          status: { [Op.notIn]: ['CLOSED', 'closed', 'voided', 'VOIDED'] }
        },
        order: [['createdAt', 'DESC']]
      });
    }

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (req.body.items) {
      order.items = req.body.items;
      order.changed('items', true);
    }
    if (status) order.status = status;
    if (typeof req.body.kdsClosed !== 'undefined') order.kdsClosed = req.body.kdsClosed;
    if (typeof req.body.total !== 'undefined') order.total = parseFloat(req.body.total) || 0;
    if (typeof req.body.subtotal !== 'undefined') order.subtotal = parseFloat(req.body.subtotal) || 0;
    if (typeof req.body.tax !== 'undefined') order.tax = parseFloat(req.body.tax) || 0;
    if (paymentStatus) order.paymentStatus = paymentStatus;
    if (paymentMethod) order.paymentMethod = paymentMethod;
    if (voidReason) order.voidReason = voidReason;
    if (req.body.voidedBy || req.userId) order.voidedBy = req.body.voidedBy || req.userId;

    if (status === 'VOIDED' || status === 'voided' || paymentStatus === 'VOIDED' || paymentStatus === 'voided') {
      order.status = 'VOIDED';
      order.paymentStatus = 'VOIDED';
      if (voidReason) order.voidReason = voidReason;
      order.closedAt = new Date();

      const targetTableNo = order.tableNo || tableNo || req.body.tableNumber;
      if (targetTableNo) {
        const cleanTbl = String(targetTableNo).replace(/^TABLE\s*/i, '').replace(/^T-/i, '').trim();
        const table = await Table.findOne({
          where: {
            tenantId: order.tenantId,
            [Op.or]: [
              { number: targetTableNo },
              { number: cleanTbl },
              { number: `T-${cleanTbl}` },
              { number: `Table ${cleanTbl}` }
            ]
          }
        });
        if (table) {
          table.status = 'available';
          await table.save();

          const io = req.app.get('io');
          if (io) {
            io.to(`tenant-${order.tenantId}`).emit('table_updated', table);
          }
        }
      }
    } else if (status === 'CLOSED' || paymentStatus === 'PAID') {
      order.status = 'CLOSED';
      order.paymentStatus = 'PAID';
      order.closedAt = new Date();

      const targetTableNo = order.tableNo || tableNo || req.body.tableNumber;
      if (targetTableNo) {
        const cleanTbl = String(targetTableNo).replace(/^TABLE\s*/i, '').replace(/^T-/i, '').trim();
        const table = await Table.findOne({
          where: {
            tenantId: order.tenantId,
            [Op.or]: [
              { number: targetTableNo },
              { number: cleanTbl },
              { number: `T-${cleanTbl}` },
              { number: `Table ${cleanTbl}` }
            ]
          }
        });
        if (table) {
          table.status = 'available';
          await table.save();

          const io = req.app.get('io');
          if (io) {
            io.to(`tenant-${order.tenantId}`).emit('table_updated', table);
          }
        }
      }
    }

    await order.save();

    // Broadcast socket update
    const io = req.app.get('io');
    if (io) {
      io.to(`tenant-${order.tenantId}`).emit('order_updated', order);
    }

    res.json({ success: true, message: 'Order status updated', data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.voidOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const order = await Order.findByPk(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    order.status = 'VOIDED';
    order.paymentStatus = 'VOIDED';
    order.voidReason = reason || 'Manager authorization';
    order.voidedBy = req.userId || null;
    order.closedAt = new Date();
    await order.save();

    // Free table
    if (order.tableNo) {
      const { Op } = require('sequelize');
      const cleanTbl = String(order.tableNo).replace(/^TABLE\s*/i, '').replace(/^T-/i, '').trim();
      const table = await Table.findOne({
        where: {
          tenantId: order.tenantId,
          [Op.or]: [
            { number: order.tableNo },
            { number: cleanTbl },
            { number: `T-${cleanTbl}` },
            { number: `Table ${cleanTbl}` }
          ]
        }
      });
      if (table) {
        table.status = 'available';
        await table.save();

        const io = req.app.get('io');
        if (io) {
          io.to(`tenant-${order.tenantId}`).emit('table_updated', table);
        }
      }
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`tenant-${order.tenantId}`).emit('order_updated', order);
    }

    res.json({ success: true, message: 'Order voided successfully', data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
