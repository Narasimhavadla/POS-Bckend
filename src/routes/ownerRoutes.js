const express = require('express');
const router = express.Router();
const multer = require('multer');
const ownerController = require('../controllers/ownerController');
const categoryController = require('../controllers/categoryController');
const menuController = require('../controllers/menuController');
const tableController = require('../controllers/tableController');
const inventoryController = require('../controllers/inventoryController');

// Multer in-memory storage for Cloudinary uploads (no temp files)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  }
});

// Note: ssidResolver + auth are applied at the server.js level before this router.
// req.tenantId is guaranteed to be set and tenant-scoped by the time we reach here.

// Staff
router.get('/staff', ownerController.getStaff);
router.post('/staff', ownerController.createStaff);
router.put('/staff/:id', ownerController.updateStaff);
router.delete('/staff/:id', ownerController.deleteStaff);
router.put('/staff/:id/pin', ownerController.updateStaffPin);
router.post('/staff/:id/pin', ownerController.updateStaffPin);
router.patch('/staff/:id/pin', ownerController.updateStaffPin);

// Manager PIN verification (global POS unlock)
router.post('/verify-manager-pin', ownerController.verifyManagerPin);

// Owner PIN change
router.post('/owner/change-pin', ownerController.changeOwnerPin);

// Categories
router.get('/categories', categoryController.getCategories);
router.post('/categories', categoryController.createCategory);
router.put('/categories/:id', categoryController.updateCategory);
router.delete('/categories/:id', categoryController.deleteCategory);

// Menu Items
router.get('/menu-items', menuController.getMenuItems);
router.post('/menu-items', menuController.createMenuItem);
router.put('/menu-items/:id', menuController.updateMenuItem);
router.delete('/menu-items/:id', menuController.deleteMenuItem);

// Tables
router.get('/tables', tableController.getTables);
router.post('/tables', tableController.createTable);
router.put('/tables/:id/status', tableController.updateTableStatus);
router.put('/tables/:id', tableController.updateTable);
router.delete('/tables/:id', tableController.deleteTable);

// Inventory
router.get('/inventory', inventoryController.getInventory);
router.post('/inventory', inventoryController.createIngredient);
router.patch('/inventory/:id/stock', inventoryController.updateStock);

// Settings & Analytics
router.get('/settings', ownerController.getSettings);
router.put('/settings', ownerController.updateSettings);
router.post('/upload-logo', upload.single('logo'), ownerController.uploadLogo);
router.get('/reports', ownerController.getReportsAnalytics);
router.get('/audit-logs', ownerController.getAuditLogs);
router.post('/audit-logs', ownerController.createAuditLog);

// Manager Session Registry (multi-session tracking + force-revoke)
router.post('/manager-sessions', ownerController.registerManagerSession);
router.get('/manager-sessions', ownerController.getActiveSessions);
router.delete('/manager-sessions/:sessionId', ownerController.revokeManagerSession);
// Branches / Outlets
router.get('/branches', ownerController.getBranches);
router.post('/branches', ownerController.createBranch);

// Shift Drawer & Z-Report (Owner sees all staff shifts)
const shiftController = require('../controllers/shiftController');
router.get('/shifts/active', shiftController.getActiveShift);
router.get('/shifts/history', shiftController.getShiftHistory);

module.exports = router;
