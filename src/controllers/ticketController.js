const { SupportTicket, Tenant } = require('../models');

exports.getTickets = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const where = tenantId ? { tenantId } : {};

    const tickets = await SupportTicket.findAll({
      where,
      include: [{ model: Tenant, as: 'tenant', attributes: ['name', 'ssid'] }],
      order: [['createdAt', 'DESC']]
    });

    res.json({ success: true, data: tickets });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createTicket = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { subject, description, priority } = req.body;

    const ticket = await SupportTicket.create({
      tenantId,
      userId: req.userId || null,
      subject,
      description,
      priority: priority || 'medium',
      status: 'open',
      replies: []
    });

    res.status(201).json({ success: true, data: ticket });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.replyTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    const ticket = await SupportTicket.findByPk(id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const replies = ticket.replies || [];
    replies.push({
      sender: req.user ? req.user.role : 'Support Staff',
      message,
      timestamp: new Date().toISOString()
    });

    ticket.replies = replies;
    ticket.status = 'in_progress';
    await ticket.save();

    res.json({ success: true, message: 'Reply added', data: ticket });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateTicketStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const ticket = await SupportTicket.findByPk(id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    ticket.status = status;
    await ticket.save();

    res.json({ success: true, message: `Ticket status updated to ${status}`, data: ticket });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
