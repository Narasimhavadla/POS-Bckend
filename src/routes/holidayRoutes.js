const express = require('express');
const router = express.Router();
const holidayController = require('../controllers/holidayController');

// Staff + Owner read route
router.get('/holidays', holidayController.getHolidays);

// Owner management routes
router.post('/holidays', holidayController.createHoliday);
router.delete('/holidays/:id', holidayController.deleteHoliday);

module.exports = router;
