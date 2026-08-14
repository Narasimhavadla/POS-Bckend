const express = require('express');
const router = express.Router();
const shiftController = require('../controllers/shiftController');

// POS-level shift routes (used by Cashier terminals directly)
router.get('/shifts/active', shiftController.getActiveShift);
router.post('/shifts/open', shiftController.openShift);
router.post('/shifts/:id/close', shiftController.closeShift);

module.exports = router;
