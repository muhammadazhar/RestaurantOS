const express = require('express');
const router  = express.Router();

const { authenticate, requirePermission, requireSuperAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');  // multer: saves to /uploads/
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

// ── Auth ──────────────────────────────────────────────────────────────────────
router.post('/auth/register',     auth.register);   // public self-registration
router.post('/auth/login',        auth.login);
router.post('/auth/super-login',  auth.superLogin);
router.post('/auth/refresh',      auth.refresh);
router.post('/auth/logout',       auth.logout);

// All routes below require authentication
router.use(authenticate);

// ── Dashboard ─────────────────────────────────────────────────────────────────
router.get('/dashboard/stats', orders.getDashboardStats);

// ── Orders ────────────────────────────────────────────────────────────────────
router.get('/orders',              requirePermission('pos'), orders.getOrders);
router.post('/orders',             requirePermission('pos'), orders.createOrder);
router.patch('/orders/:id/status', requirePermission('pos', 'kitchen'), orders.updateOrderStatus);

// ── Tables ────────────────────────────────────────────────────────────────────
router.get('/tables',                      requirePermission('tables'),   ctrl.getTables);
router.post('/tables',                     requirePermission('settings'), ctrl.createTable);
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
router.post('/menu/items/:id/image',        requirePermission('settings'), upload.single('image'), ctrl.uploadMenuImage);

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
router.get('/employees',               requirePermission('employees'), ctrl.getEmployees);
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
router.patch('/shifts/:id/start',        requirePermission('pos'),       ctrl.startMyShift);
router.patch('/shifts/:id/continue',     requirePermission('pos'),       ctrl.continueMyShift);
router.patch('/shifts/:id/close-my',     requirePermission('pos'),       ctrl.closeMyShift);
router.get('/shifts/open',               requirePermission('employees'), ctrl.getOpenShifts);
router.post('/shifts/auto-close',        requirePermission('employees'), ctrl.autoCloseShifts);
router.get('/shifts',                    requirePermission('employees'), ctrl.getShifts);
router.post('/shifts',                   requirePermission('employees'), ctrl.createShift);
router.post('/shifts/bulk',              requirePermission('employees'), ctrl.bulkCreateShifts);
router.patch('/shifts/:id',              requirePermission('employees'), ctrl.updateShift);
router.patch('/shifts/:id/force-close',  requirePermission('employees'), ctrl.forceCloseShift);
router.delete('/shifts/:id',             requirePermission('employees'), ctrl.deleteShift);

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
router.get('/reports/shift-sales',  requirePermission('pos'), orders.getShiftSalesReport);

// ── Setup Wizard ─────────────────────────────────────────────────────────────
router.get('/setup/status',    authenticate, ctrl.getSetupStatus);
router.post('/setup/complete', authenticate, ctrl.completeSetup);

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

module.exports = router;
