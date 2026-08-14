const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

// Note: ssidResolver + auth are applied at the server.js level before this router.
// req.tenantId is guaranteed to be set and tenant-scoped by the time we reach here.

router.get('/orders', orderController.getPosOrders);
router.post('/orders', orderController.createPosOrder);
router.put('/orders/:id', orderController.updateOrderStatus);
router.post('/orders/:id/void', orderController.voidOrder);

module.exports = router;
