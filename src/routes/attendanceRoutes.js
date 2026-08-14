const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');

// Staff self-service routes (under /pos/attendance)
router.post('/attendance/clock-in',  attendanceController.clockIn);
router.put('/attendance/clock-out',  attendanceController.clockOut);
router.get('/attendance/my',         attendanceController.getMyAttendance);

module.exports = router;
