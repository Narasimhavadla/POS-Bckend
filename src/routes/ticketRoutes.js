const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const tenantResolver = require('../middleware/tenantResolver');

router.use(tenantResolver);

router.get('/', ticketController.getTickets);
router.post('/', ticketController.createTicket);
router.post('/:id/reply', ticketController.replyTicket);
router.patch('/:id/status', ticketController.updateTicketStatus);

module.exports = router;
