const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');

// Owner/Manager attendance management routes (under /owner/attendance)
router.get('/attendance',              attendanceController.getAllAttendance);
router.get('/attendance/summary',      attendanceController.getAttendanceSummary);
router.get('/attendance/live',         attendanceController.getActiveClockIns);
router.post('/attendance/mark-absent', attendanceController.markAbsent);

module.exports = router;
