const { Table } = require('../models');

exports.getTables = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const tables = await Table.findAll({
      where: { tenantId, isActive: true },
      order: [['number', 'ASC']]
    });
    res.json({ success: true, data: tables });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createTable = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { number, zone, seats, branchId, qrCodeUrl } = req.body;
    const { Branch } = require('../models');

    let validBranchId = null;
    if (branchId && typeof branchId === 'string' && branchId.trim() !== '') {
      const branchExists = await Branch.findByPk(branchId);
      if (branchExists) {
        validBranchId = branchId;
      }
    }

    // Fallback to first branch of tenant if validBranchId is null
    if (!validBranchId) {
      const defaultBranch = await Branch.findOne({ where: { tenantId } });
      if (defaultBranch) {
        validBranchId = defaultBranch.id;
      }
    }

    const table = await Table.create({
      tenantId,
      branchId: validBranchId,
      number: number || `T-${Date.now()}`,
      zone: zone || 'Main Dining',
      seats: seats ? parseInt(seats) : 4,
      status: 'vacant',
      qrCode: qrCodeUrl || `https://smartserve.app/menu?tenant=${tenantId}&table=${number}`
    });

    res.status(201).json({ success: true, data: table });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateTableStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    let table = await Table.findByPk(id);
    if (!table) {
      table = await Table.findOne({ where: { number: id } });
    }

    if (!table) {
      return res.status(404).json({ success: false, message: 'Table not found' });
    }

    table.status = status;
    await table.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`tenant-${table.tenantId}`).emit('table_updated', table);
    }

    res.json({ success: true, message: `Table status updated to ${status}`, data: table });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateTable = async (req, res) => {
  try {
    const { id } = req.params;
    const { number, zone, seats, status, qrCodeUrl } = req.body;

    let table = await Table.findByPk(id);
    if (!table) {
      table = await Table.findOne({ where: { number: id } });
    }

    if (!table) {
      return res.status(404).json({ success: false, message: 'Table not found' });
    }

    if (number) table.number = number;
    if (zone) table.zone = zone;
    if (seats) table.seats = parseInt(seats);
    if (status) table.status = status;
    if (qrCodeUrl) table.qrCode = qrCodeUrl;

    await table.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`tenant-${table.tenantId}`).emit('table_updated', table);
    }

    res.json({ success: true, message: 'Table updated successfully', data: table });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteTable = async (req, res) => {
  try {
    const { id } = req.params;

    let table = await Table.findByPk(id);
    if (!table) {
      table = await Table.findOne({ where: { number: id } });
    }

    if (!table) {
      return res.status(404).json({ success: false, message: 'Table not found' });
    }

    const tenantId = table.tenantId;
    const tableId = table.id;
    const tableNumber = table.number;

    await table.destroy();

    const io = req.app.get('io');
    if (io) {
      io.to(`tenant-${tenantId}`).emit('table_deleted', { id: tableId, number: tableNumber });
    }

    res.json({ success: true, message: 'Table deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
