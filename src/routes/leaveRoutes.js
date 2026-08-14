const express = require('express');
const router = express.Router();
const leaveController = require('../controllers/leaveController');

// Staff routes (mounted under /pos)
router.post('/leaves',        leaveController.createLeaveRequest);
router.get('/leaves/my',      leaveController.getMyLeaveRequests);
router.delete('/leaves/:id',  leaveController.cancelLeaveRequest);

// Owner/Manager routes (mounted under /owner)
router.get('/leaves',         leaveController.getAllLeaveRequests);
router.patch('/leaves/:id',   leaveController.updateLeaveStatus);

module.exports = router;
