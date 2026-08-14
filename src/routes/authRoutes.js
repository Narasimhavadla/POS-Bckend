const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

const { auth } = require('../middleware/auth');

router.post('/register-restaurant', authController.registerRestaurant);
router.post('/login', authController.login);
router.post('/refresh-token', authController.refreshToken);
router.get('/me', auth, authController.getMe);

module.exports = router;
