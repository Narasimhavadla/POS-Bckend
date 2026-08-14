const { Holiday } = require('../models');

/**
 * GET /pos/holidays
 * Fetch all holidays for tenant / branch (accessible by staff & owners).
 */
exports.getHolidays = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const holidays = await Holiday.findAll({
      where: { tenantId },
      order: [['isRecurring', 'DESC'], ['date', 'ASC']]
    });
    res.json({ success: true, data: holidays });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /owner/holidays
 * Create a holiday or weekly off rule.
 * Body: { title, date, dayOfWeek, isRecurring, type, description }
 */
exports.createHoliday = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { title, date, dayOfWeek, isRecurring, type, description } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: 'Holiday title is required.' });
    }

    if (!isRecurring && !date) {
      return res.status(400).json({ success: false, message: 'Specific date is required for single holidays.' });
    }

    if (isRecurring && typeof dayOfWeek === 'undefined') {
      return res.status(400).json({ success: false, message: 'Day of week (0-6) is required for recurring weekly off.' });
    }

    const holiday = await Holiday.create({
      tenantId,
      branchId: req.body.branchId || null,
      title,
      date: isRecurring ? null : date,
      dayOfWeek: isRecurring ? parseInt(dayOfWeek) : null,
      isRecurring: !!isRecurring,
      type: type || (isRecurring ? 'WEEKLY_OFF' : 'PUBLIC_HOLIDAY'),
      description: description || null
    });

    res.status(201).json({ success: true, message: 'Holiday saved successfully.', data: holiday });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE /owner/holidays/:id
 * Delete a holiday record.
 */
exports.deleteHoliday = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const holiday = await Holiday.findOne({ where: { id, tenantId } });
    if (!holiday) {
      return res.status(404).json({ success: false, message: 'Holiday record not found.' });
    }

    await holiday.destroy();
    res.json({ success: true, message: 'Holiday deleted.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
