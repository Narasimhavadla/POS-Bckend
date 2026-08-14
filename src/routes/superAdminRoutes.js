const express = require('express');
const router = express.Router();
const superAdminController = require('../controllers/superAdminController');
const { auth, authorize } = require('../middleware/auth');

const sa = [auth, authorize('superadmin')];

// Tenant management
router.get('/tenants', ...sa, superAdminController.getTenants);
router.put('/tenants/:id/status', ...sa, superAdminController.updateTenantStatus);
router.put('/tenants/:id/reset-password', ...sa, superAdminController.resetTenantPassword);
router.patch('/tenants/:id/feature-flags', ...sa, superAdminController.updateFeatureFlags);
router.post('/tenants/:id/impersonate', ...sa, superAdminController.impersonateTenant);

// Analytics
router.get('/analytics', ...sa, superAdminController.getGlobalAnalytics);

// Subscriptions
router.get('/subscriptions', ...sa, superAdminController.getAllSubscriptions);
router.patch('/subscriptions/:tenantId/plan', ...sa, superAdminController.changeSubscriptionPlan);
router.get('/subscriptions/:tenantId/history', ...sa, superAdminController.getSubscriptionHistory);

module.exports = router;
