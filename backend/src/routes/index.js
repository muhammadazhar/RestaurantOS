const express = require('express');
const router  = express.Router();

const { authenticate, requirePermission, requireSuperAdmin, requireModule } = require('../middleware/auth');
const upload = require('../middleware/upload');  // multer: stores images in Cloudinary
const db           = require('../config/db');
const auth         = require('../controllers/authController');
const orders       = require('../controllers/ordersController');
const inventory    = require('../controllers/inventoryController');
const ctrl         = require('../controllers/combinedControllers');
const system       = require('../controllers/systemController');
const attendance   = require('../controllers/attendanceController');
const delivery     = require('../controllers/deliveryController');
const rider        = require('../controllers/riderController');
const subscription = require('../controllers/subscriptionController');
const branch       = require('../controllers/branchController');
const support      = require('../controllers/supportController');
const pricing      = require('../controllers/deliveryPricingController');
const sync         = require('../controllers/syncController');

// ── Auth ──────────────────────────────────────────────────────────────────────
router.get('/auth/groups',                           auth.getPublicGroups);       // public
router.get('/auth/groups/:groupId/restaurants',      auth.getGroupRestaurants);   // public
router.post('/auth/register',     auth.register);   // public self-registration
router.post('/auth/login',        auth.login);
router.post('/auth/super-login',  auth.superLogin);
router.post('/auth/refresh',      auth.refresh);
router.post('/auth/logout',       auth.logout);
router.post('/auth/forgot-password', auth.forgotPassword);
router.post('/auth/reset-password',  auth.resetPassword);
router.get('/db-info', (_req, res) => res.json({ database: db.dbInfo }));
router.post('/sync/ingest', sync.ingest);

// All routes below require authentication
router.use(authenticate);

// ── Dashboard ─────────────────────────────────────────────────────────────────
router.get('/dashboard/stats', orders.getDashboardStats);

// Offline sync status and queue controls
router.get('/sync/status', sync.getStatus);
router.post('/sync/retry', requirePermission('settings'), sync.retryFailed);

// ── Orders ────────────────────────────────────────────────────────────────────
router.get('/orders',              requirePermission('pos'), orders.getOrders);
router.post('/orders',             requirePermission('pos'), orders.createOrder);
router.get('/orders/table/:tableId/active', requirePermission('pos'), orders.getActiveTableOrder);
router.post('/orders/:id/items',            requirePermission('pos'), orders.addOrderItems);
router.post('/orders/:id/replace-item',     requirePermission('pos'), orders.replaceOrderItem);
router.post('/orders/:id/return-item',      requirePermission('pos'), orders.returnOrderItem);
router.post('/orders/:id/cancel-return',    requirePermission('pos'), orders.cancelOrderReturn);
router.post('/orders/:id/cancel-online',    requirePermission('pos'), orders.cancelOnlineOrder);
router.post('/orders/:id/complete-online-refund', requirePermission('pos'), orders.completeOnlineRefund);
router.patch('/orders/:id/status', requirePermission('pos', 'kitchen'), orders.updateOrderStatus);

// ── Tables ────────────────────────────────────────────────────────────────────
router.get('/tables',                      requirePermission('tables'),   ctrl.getTables);
router.post('/tables',                     requirePermission('tables', 'settings'), ctrl.createTable);
router.patch('/tables/:id',                requirePermission('tables', 'settings'), ctrl.updateTable);
router.delete('/tables/:id',               requirePermission('tables', 'settings'), ctrl.deleteTable);
router.patch('/tables/:id/status',         requirePermission('tables'),   ctrl.updateTableStatus);
router.post('/tables/:id/overtime-alert',  requirePermission('tables'),   ctrl.createOvertimeAlert);

// ── Restaurant Settings ───────────────────────────────────────────────────────
router.get('/restaurant/settings',   requirePermission('settings'), ctrl.getRestaurantSettings);
router.patch('/restaurant/settings', requirePermission('settings'), ctrl.updateRestaurantSettings);
router.post('/restaurant/logo',      requirePermission('settings'), upload.single('image'), ctrl.uploadRestaurantLogo);

// ── Menu ──────────────────────────────────────────────────────────────────────
router.get('/menu',                         ctrl.getMenu);
router.post('/menu/items',                  requirePermission('settings'), ctrl.createMenuItem);
router.put('/menu/items/:id',               requirePermission('settings'), ctrl.updateMenuItem);
router.delete('/menu/items/:id',            requirePermission('settings'), ctrl.deleteMenuItem);
router.post('/menu/items/:id/image',        requirePermission('settings'), upload.single('image'), ctrl.uploadMenuImage);

// ── Discount Presets ──────────────────────────────────────────────────────────
router.get('/discount-presets',             requirePermission('settings'), ctrl.getDiscountPresets);
router.post('/discount-presets',            requirePermission('settings'), ctrl.createDiscountPreset);
router.put('/discount-presets/:id',         requirePermission('settings'), ctrl.updateDiscountPreset);
router.delete('/discount-presets/:id',      requirePermission('settings'), ctrl.deleteDiscountPreset);

// ── Categories ────────────────────────────────────────────────────────────────
router.get('/menu/categories',              requirePermission('settings'), ctrl.getCategories);
router.post('/menu/categories',             requirePermission('settings'), ctrl.createCategory);
router.put('/menu/categories/:id',          requirePermission('settings'), ctrl.updateCategory);
router.delete('/menu/categories/:id',       requirePermission('settings'), ctrl.deleteCategory);

// ── Inventory ─────────────────────────────────────────────────────────────────
router.get('/inventory',                requirePermission('inventory'), inventory.getInventory);
router.post('/inventory',               requirePermission('inventory'), inventory.createItem);
router.put('/inventory/:id',            requirePermission('inventory'), inventory.updateItem);
router.delete('/inventory/:id',         requirePermission('inventory'), inventory.deleteItem);
router.patch('/inventory/:id/stock',    requirePermission('inventory'), inventory.updateStock);
router.get('/inventory/alerts',         requirePermission('inventory'), inventory.getLowStockAlerts);
router.get('/inventory/transactions',   requirePermission('inventory'), inventory.getTransactions);
router.get('/inventory/report',         requirePermission('inventory'), inventory.getInventoryReport);

// ── Recipes ───────────────────────────────────────────────────────────────────
router.get('/recipes',   requirePermission('recipes'), ctrl.getRecipes);
router.post('/recipes',  requirePermission('recipes'), ctrl.createRecipe);

// ── Employees ─────────────────────────────────────────────────────────────────
router.get('/employees',               requirePermission('employees', 'shift_management'), ctrl.getEmployees);
router.post('/employees',              requirePermission('employees'), ctrl.createEmployee);
router.put('/employees/:id',           requirePermission('employees'), ctrl.updateEmployee);
router.post('/employees/:id/photo',    requirePermission('employees'), upload.single('image'), ctrl.uploadEmployeePhoto);

// ── Roles ─────────────────────────────────────────────────────────────────────
router.get('/roles',             requirePermission('employees'), ctrl.getRoles);
router.post('/roles',            requirePermission('employees'), ctrl.createRole);
router.patch('/roles/:id',       requirePermission('employees'), ctrl.updateRole);

// ── Shifts ────────────────────────────────────────────────────────────────────
router.get('/shifts/current',            requirePermission('pos'),       ctrl.getCurrentShift);
router.get('/shifts/my',                 requirePermission('pos'),       ctrl.getMyShifts);
router.patch('/shifts/:id/start',        requirePermission('pos', 'shift_management'),       ctrl.startMyShift);
router.patch('/shifts/:id/continue',     requirePermission('pos', 'shift_management'),       ctrl.continueMyShift);
router.patch('/shifts/:id/close-my',     requirePermission('pos', 'shift_management'),       ctrl.closeMyShift);
router.get('/shifts/:id/cash-summary',   requirePermission('pos', 'shift_management'),       ctrl.getShiftCashSummary);
router.get('/shifts/open',               requirePermission('shift_management', 'employees'), ctrl.getOpenShifts);
router.post('/shifts/auto-close',        requirePermission('shift_management', 'employees'), ctrl.autoCloseShifts);
router.get('/shifts',                    requirePermission('shift_management', 'employees'), ctrl.getShifts);
router.post('/shifts',                   requirePermission('shift_management', 'employees'), ctrl.createShift);
router.post('/shifts/bulk',              requirePermission('shift_management', 'employees'), ctrl.bulkCreateShifts);
router.patch('/shifts/:id',              requirePermission('shift_management', 'employees'), ctrl.updateShift);
router.patch('/shifts/:id/force-close',  requirePermission('shift_management', 'employees'), ctrl.forceCloseShift);
router.delete('/shifts/:id',             requirePermission('shift_management', 'employees'), ctrl.deleteShift);

// ── General Ledger ────────────────────────────────────────────────────────────
router.get('/gl/accounts',                requirePermission('gl'), ctrl.getAccounts);
router.post('/gl/accounts',               requirePermission('gl'), ctrl.createGLAccount);
router.put('/gl/accounts/:id',            requirePermission('gl'), ctrl.updateGLAccount);
router.delete('/gl/accounts/:id',         requirePermission('gl'), ctrl.deleteGLAccount);
router.get('/gl/entries',                 requirePermission('gl'), ctrl.getJournalEntries);
router.post('/gl/entries',                requirePermission('gl'), ctrl.createJournalEntry);
router.get('/gl/mappings/sales',          requirePermission('gl'), ctrl.getSalesMappings);
router.post('/gl/mappings/sales',         requirePermission('gl'), ctrl.saveSalesMappings);
router.get('/gl/mappings/inventory',      requirePermission('gl'), ctrl.getInventoryMappings);
router.post('/gl/mappings/inventory',     requirePermission('gl'), ctrl.saveInventoryMappings);
router.get('/gl/reports/trial-balance',   requirePermission('gl'), ctrl.getTrialBalance);
router.get('/gl/reports/balance-sheet',   requirePermission('gl'), ctrl.getBalanceSheet);

// ── Notifications ─────────────────────────────────────────────────────────────
router.get('/notifications',         ctrl.getNotifications);
router.patch('/notifications/read',  ctrl.markRead);

// ── Reservations ──────────────────────────────────────────────────────────────
router.get('/reservations',         requirePermission('tables'), ctrl.getReservations);
router.post('/reservations',        requirePermission('tables'), ctrl.createReservation);
router.patch('/reservations/:id',   requirePermission('tables'), ctrl.updateReservation);

// ── Reports ───────────────────────────────────────────────────────────────────
router.get('/reports/sales',        requirePermission('pos'), orders.getSalesReport);
router.get('/reports/employees',    requirePermission('pos'), orders.getEmployeeReport);
router.get('/reports/menu',         requirePermission('pos'), orders.getMenuReport);
router.get('/reports/performance',  requirePermission('pos'), orders.getPerformanceMatrix);
router.get('/reports/shift-sales',  requirePermission('shift_management', 'employees'), orders.getShiftSalesReport);

// ── Setup Wizard ─────────────────────────────────────────────────────────────
router.get('/setup/status',    authenticate, ctrl.getSetupStatus);
router.post('/setup/complete', authenticate, ctrl.completeSetup);

// ── System Config (super admin) ───────────────────────────────────────────────
router.get('/admin/system-config',                requireSuperAdmin, ctrl.getSystemConfig);
router.post('/admin/system-config',               requireSuperAdmin, ctrl.saveSystemConfig);
router.post('/admin/system-config/test-email',    requireSuperAdmin, ctrl.testSmtp);
router.post('/admin/system-config/test-whatsapp', authenticate,      ctrl.testWhatsApp);

// ── System ────────────────────────────────────────────────────────────────────
router.get('/system/health',               requirePermission('settings'), system.getHealth);
router.get('/system/backups',              requirePermission('settings'), system.listBackups);
router.post('/system/backup',              requirePermission('settings'), system.createBackup);
router.get('/system/backups/:filename',    requirePermission('settings'), system.downloadBackup);
router.delete('/system/backups/:filename', requirePermission('settings'), system.deleteBackup);

// ── Attendance ────────────────────────────────────────────────────────────────
router.post('/attendance/clock-in',              requirePermission('attendance'), attendance.clockIn);
router.post('/attendance/clock-out',             requirePermission('attendance'), attendance.clockOut);
router.get('/attendance/status',                 requirePermission('attendance'), attendance.getStatus);
router.get('/attendance/logs',                   requirePermission('attendance'), attendance.getLogs);
router.post('/attendance/logs',                  requirePermission('attendance'), attendance.createLog);
router.patch('/attendance/logs/:id/void',        requirePermission('attendance'), attendance.voidLog);
router.get('/attendance/daily',                  requirePermission('attendance'), attendance.getDailyAttendance);
router.get('/attendance/today',                  requirePermission('attendance'), attendance.getTodayOverview);
router.post('/attendance/recompute',             requirePermission('attendance'), attendance.recompute);
router.get('/attendance/leaves',                 requirePermission('attendance'), attendance.getLeaves);
router.post('/attendance/leaves',                requirePermission('attendance'), attendance.createLeave);
router.patch('/attendance/leaves/:id',           requirePermission('attendance'), attendance.updateLeave);
router.get('/attendance/holidays',               requirePermission('attendance'), attendance.getHolidays);
router.post('/attendance/holidays',              requirePermission('attendance'), attendance.createHoliday);
router.patch('/attendance/holidays/:id',         requirePermission('attendance'), attendance.updateHoliday);
router.delete('/attendance/holidays/:id',        requirePermission('attendance'), attendance.deleteHoliday);
router.get('/attendance/ot-rules',               requirePermission('attendance'), attendance.getOTRules);
router.post('/attendance/ot-rules',              requirePermission('attendance'), attendance.createOTRule);
router.patch('/attendance/ot-rules/:id',         requirePermission('attendance'), attendance.updateOTRule);
router.get('/attendance/corrections',            requirePermission('attendance'), attendance.getCorrections);
router.post('/attendance/corrections',           requirePermission('attendance'), attendance.createCorrection);
router.patch('/attendance/corrections/:id',      requirePermission('attendance'), attendance.updateCorrection);
router.get('/attendance/summary/monthly',        requirePermission('attendance'), attendance.getMonthlySummary);

// ── Delivery Platforms ────────────────────────────────────────────────────────
router.get('/delivery/orders',                requirePermission('pos'), delivery.getDeliveryOrders);
router.post('/delivery/simulate',             requirePermission('pos'), delivery.simulateFoodpandaOrder);
router.patch('/delivery/orders/:id/accept',   requirePermission('pos'), delivery.acceptOrder);
router.patch('/delivery/orders/:id/reject',   requirePermission('pos'), delivery.rejectOrder);
router.get('/delivery/platforms',             requirePermission('settings'), delivery.getPlatforms);
router.patch('/delivery/platforms/:platform', requirePermission('settings'), delivery.updatePlatform);
router.get('/delivery/stats',                 requirePermission('pos'), delivery.getDeliveryStats);

// ── Rider Delivery Management ─────────────────────────────────────────────────
// Phone order intake
router.get('/rider/riders',                         requirePermission('pos'),        rider.getRiders);
router.post('/rider/phone-orders',                  requirePermission('pos'),        rider.createPhoneOrder);
router.patch('/rider/orders/:id/assign',            requirePermission('pos'),        rider.assignRider);
router.get('/rider/phone-orders',                   requirePermission('pos'),        rider.getPhoneOrders);

// Rider pool — available orders any rider can claim
router.get('/rider/available-orders',               requirePermission('rider'),      rider.getAvailableOrders);
router.post('/rider/orders/:id/claim',              requirePermission('rider'),      rider.claimOrder);

// Rider dashboard (self-service — rider sees own orders)
router.get('/rider/my-orders',                      requirePermission('rider'),      rider.getMyOrders);
router.patch('/rider/orders/:id/pick',              requirePermission('rider'),      rider.pickOrder);
router.post('/rider/collections',                   requirePermission('rider'),      rider.collectPayment);

// Cashier collection screen
router.get('/rider/cashier/summary',                requirePermission('pos'),        rider.getCashierSummary);
router.get('/rider/cashier/rider/:riderId/orders',  requirePermission('pos'),        rider.getRiderOrdersForCashier);
router.post('/rider/cashier/collect',               requirePermission('pos'),        rider.cashierCollect);
router.patch('/rider/cashier/collections/:id',      requirePermission('pos'),        rider.updateCashierCollection);

// Daily audit
router.get('/rider/audit',                          requirePermission('pos'),        rider.getDailyAudit);

// Incentive management
router.get('/rider/incentives/rules',               requirePermission('employees'),  rider.getIncentiveRules);
router.post('/rider/incentives/rules',              requirePermission('employees'),  rider.createIncentiveRule);
router.patch('/rider/incentives/rules/:id',         requirePermission('employees'),  rider.updateIncentiveRule);
router.delete('/rider/incentives/rules/:id',        requirePermission('employees'),  rider.deleteIncentiveRule);
router.post('/rider/incentives/process',            requirePermission('employees'),  rider.processIncentives);
router.get('/rider/incentives/payments',                      requirePermission('employees'),  rider.getIncentivePayments);
router.patch('/rider/incentives/payments/:id',               requirePermission('employees'),  rider.updateIncentivePayment);
router.delete('/rider/incentives/payments/:id',              requirePermission('employees'),  rider.deleteIncentivePayment);
router.get('/rider/incentives/payments/:id/deliveries',      requirePermission('employees'),  rider.getIncentivePaymentDeliveries);

// Rider reports
router.get('/rider/reports',                        requirePermission('pos'),        rider.getRiderReport);

// ── Company Groups & Branches ─────────────────────────────────────────────────
router.get('/branches/my-group',                       branch.getMyGroup);
// Self-service group management (restaurant admin)
router.post('/my-group/register',  requirePermission('settings'), branch.registerMyGroup);
router.patch('/my-group',          requirePermission('settings'), branch.updateMyGroupInfo);
router.get('/my-group/dashboard',  requirePermission('settings'), branch.getMyGroupDashboard);
router.post('/my-group/branches',  requirePermission('settings'), branch.addBranchToMyGroup);
router.get('/admin/groups',                requireSuperAdmin, branch.getGroups);
router.post('/admin/groups',               requireSuperAdmin, branch.createGroup);
router.put('/admin/groups/:id',            requireSuperAdmin, branch.updateGroup);
router.get('/admin/groups/:groupId/branches',          requireSuperAdmin, branch.getGroupBranches);
router.post('/admin/groups/:groupId/assign',           requireSuperAdmin, branch.assignBranch);
router.delete('/admin/groups/:groupId/branches/:restaurantId', requireSuperAdmin, branch.removeBranch);
router.get('/admin/unassigned-restaurants',            requireSuperAdmin, branch.getUnassignedRestaurants);
router.get('/admin/branch-discounts',      requireSuperAdmin, branch.getDiscountTiers);
router.post('/admin/branch-discounts',     requireSuperAdmin, branch.saveDiscountTiers);
router.get('/admin/groups/:groupId/consolidated-tb',   requireSuperAdmin, branch.getGroupConsolidatedTB);

// ── Admin (super admin only) ──────────────────────────────────────────────────
router.get('/admin/restaurants',     requireSuperAdmin, ctrl.getAllRestaurants);
router.post('/admin/restaurants',    requireSuperAdmin, ctrl.registerRestaurant);
router.get('/admin/stats',           requireSuperAdmin, ctrl.getPlatformStats);

// ── Modules & Subscriptions ───────────────────────────────────────────────────
router.get('/modules',                               subscription.getModules);         // public
router.get('/subscriptions/my',                      subscription.getMySubscriptions); // restaurant
router.post('/subscriptions/request',                subscription.requestSubscription);// restaurant
router.get('/subscriptions/modules',                 subscription.checkModuleAccess);  // restaurant
router.get('/admin/module-pricing',    requireSuperAdmin, subscription.getModulePricing);
router.post('/admin/module-pricing',   requireSuperAdmin, subscription.saveModulePricing);
router.get('/admin/subscriptions',     requireSuperAdmin, subscription.getAllSubscriptions);
router.patch('/admin/subscriptions/:id/approve', requireSuperAdmin, subscription.approveSubscription);
router.patch('/admin/subscriptions/:id/reject',  requireSuperAdmin, subscription.rejectSubscription);

// ── Delivery Pricing Engine ───────────────────────────────────────────────────
router.get('/delivery-pricing/zones',                     requirePermission('settings'), pricing.getZones);
router.post('/delivery-pricing/zones',                    requirePermission('settings'), pricing.createZone);
router.put('/delivery-pricing/zones/:id',                 requirePermission('settings'), pricing.updateZone);
router.delete('/delivery-pricing/zones/:id',              requirePermission('settings'), pricing.deleteZone);

router.get('/delivery-pricing/areas',                     requirePermission('settings'), pricing.getAreas);
router.post('/delivery-pricing/areas',                    requirePermission('settings'), pricing.createArea);
router.put('/delivery-pricing/areas/:id',                 requirePermission('settings'), pricing.updateArea);
router.delete('/delivery-pricing/areas/:id',              requirePermission('settings'), pricing.deleteArea);

router.get('/delivery-pricing/surge-rules',               requirePermission('settings'), pricing.getSurgeRules);
router.post('/delivery-pricing/surge-rules',              requirePermission('settings'), pricing.createSurgeRule);
router.put('/delivery-pricing/surge-rules/:id',           requirePermission('settings'), pricing.updateSurgeRule);
router.delete('/delivery-pricing/surge-rules/:id',        requirePermission('settings'), pricing.deleteSurgeRule);

router.get('/delivery-pricing/customer-rules',            requirePermission('settings'), pricing.getCustomerRules);
router.post('/delivery-pricing/customer-rules',           requirePermission('settings'), pricing.createCustomerRule);
router.put('/delivery-pricing/customer-rules/:id',        requirePermission('settings'), pricing.updateCustomerRule);
router.delete('/delivery-pricing/customer-rules/:id',     requirePermission('settings'), pricing.deleteCustomerRule);

router.post('/delivery-pricing/preview-fee',              requirePermission('pos'), pricing.previewFee);
router.get('/delivery-pricing/restaurant-location',       requirePermission('settings'), pricing.getRestaurantLocation);
router.post('/delivery-pricing/restaurant-location',      requirePermission('settings'), pricing.saveRestaurantLocation);

// ── Support Tickets (restaurant) ─────────────────────────────────────────────
router.post('/support/tickets',                    requireModule('support'), upload.single('screenshot'), support.createTicket);
router.get('/support/tickets',                     requireModule('support'), support.getMyTickets);
router.get('/support/tickets/:id/messages',        requireModule('support'), support.getTicketMessages);
router.post('/support/tickets/:id/messages',       requireModule('support'), support.addMessage);

// ── Support Tickets (super admin) ────────────────────────────────────────────
router.get('/admin/support/tickets',               requireSuperAdmin, support.getAllTickets);
router.get('/admin/support/tickets/:id',           requireSuperAdmin, support.getTicketById);
router.get('/admin/support/tickets/:id/messages',  requireSuperAdmin, support.getTicketMessages);
router.post('/admin/support/tickets/:id/messages', requireSuperAdmin, support.adminAddMessage);
router.patch('/admin/support/tickets/:id/assign',  requireSuperAdmin, support.assignTicket);
router.patch('/admin/support/tickets/:id/resolve', requireSuperAdmin, support.resolveTicket);

module.exports = router;
