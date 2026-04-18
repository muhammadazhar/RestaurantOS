import axios from 'axios';

const API = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '/api',
  withCredentials: true,
});

// Attach token to every request
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
API.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry && !original.url?.includes('/auth/')) {
      original._retry = true;
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        const { data } = await API.post('/auth/refresh', { refreshToken });
        localStorage.setItem('accessToken', data.accessToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return API(original);
      } catch {
        localStorage.clear();
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const register    = (data) => API.post('/auth/register', data);
export const login       = (data) => API.post('/auth/login', data);
export const superLogin  = (data) => API.post('/auth/super-login', data);
export const logout      = (data) => API.post('/auth/logout', data);
export const forgotPassword = (data) => API.post('/auth/forgot-password', data);
export const resetPassword  = (data) => API.post('/auth/reset-password', data);

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const getDashboardStats = () => API.get('/dashboard/stats');

// ── Orders ────────────────────────────────────────────────────────────────────
export const getOrders         = (params) => API.get('/orders', { params });
export const createOrder       = (data)   => API.post('/orders', data);
export const updateOrderStatus = (id, status, paymentMethod) =>
  API.patch(`/orders/${id}/status`, { status, payment_method: paymentMethod });

// ── Tables ────────────────────────────────────────────────────────────────────
export const getTables           = ()           => API.get('/tables');
export const createTable         = (data)       => API.post('/tables', data);
export const updateTable         = (id, data)   => API.patch(`/tables/${id}`, data);
export const deleteTable         = (id)         => API.delete(`/tables/${id}`);
export const updateTableStatus   = (id, status) => API.patch(`/tables/${id}/status`, { status });
export const createOvertimeAlert = (id, data)   => API.post(`/tables/${id}/overtime-alert`, data);

// ── Restaurant Settings ───────────────────────────────────────────────────────
export const getRestaurantSettings    = ()     => API.get('/restaurant/settings');
export const updateRestaurantSettings = (data) => API.patch('/restaurant/settings', data);
export const uploadRestaurantLogo     = (file) => {
  const form = new FormData();
  form.append('image', file);
  return API.post('/restaurant/logo', form, { headers: { 'Content-Type': 'multipart/form-data' } });
};

// ── Menu ──────────────────────────────────────────────────────────────────────
export const getMenu             = (params)   => API.get('/menu', { params });
export const createMenuItem      = (data)      => API.post('/menu/items', data);
export const updateMenuItem      = (id, d)     => API.put(`/menu/items/${id}`, d);
export const deleteMenuItem      = (id)        => API.delete(`/menu/items/${id}`);
export const uploadMenuItemImage = (id, file)  => {
  const form = new FormData();
  form.append('image', file);
  return API.post(`/menu/items/${id}/image`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

// ── Inventory ─────────────────────────────────────────────────────────────────
export const getInventory        = (p)      => API.get('/inventory', { params: p });
export const createInventoryItem = (data)   => API.post('/inventory', data);
export const updateInventoryItem = (id, d)  => API.put(`/inventory/${id}`, d);
export const deleteInventoryItem = (id)     => API.delete(`/inventory/${id}`);
export const updateStock         = (id, d)  => API.patch(`/inventory/${id}/stock`, d);
export const getLowStockAlerts   = ()       => API.get('/inventory/alerts');
export const getTransactions     = (p)      => API.get('/inventory/transactions', { params: p });
export const getInventoryReport  = ()       => API.get('/inventory/report');

// ── Recipes ───────────────────────────────────────────────────────────────────
export const getRecipes   = ()     => API.get('/recipes');
export const createRecipe = (data) => API.post('/recipes', data);

// ── Roles ────────────────────────────────────────────────────────────────────
export const getRoles        = ()        => API.get('/roles');
export const createRole      = (data)    => API.post('/roles', data);
export const updateRole      = (id,data) => API.patch(`/roles/${id}`, data);

// ── Employees ─────────────────────────────────────────────────────────────────
export const getEmployees      = ()        => API.get('/employees');
export const createEmployee    = (data)    => API.post('/employees', data);
export const updateEmployee    = (id, d)   => API.put(`/employees/${id}`, d);
export const uploadEmployeePhoto = (id, file) => {
  const form = new FormData();
  form.append('image', file);
  return API.post(`/employees/${id}/photo`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
};

// ── Shifts ────────────────────────────────────────────────────────────────────
export const getCurrentShift  = ()        => API.get('/shifts/current');
export const getMyShifts      = ()        => API.get('/shifts/my');
export const startMyShift        = (id, body) => API.patch(`/shifts/${id}/start`, body || {});
export const continueMyShift     = (id, body) => API.patch(`/shifts/${id}/continue`, body || {});
export const closeMyShift        = (id, body) => API.patch(`/shifts/${id}/close-my`, body || {});
export const getShiftCashSummary = (id)       => API.get(`/shifts/${id}/cash-summary`);
export const getOpenShifts       = ()         => API.get('/shifts/open');
export const autoCloseShifts  = ()        => API.post('/shifts/auto-close');
export const getShifts        = (params)  => API.get('/shifts', { params });
export const createShift      = (data)    => API.post('/shifts', data);
export const bulkCreateShifts = (data)    => API.post('/shifts/bulk', data);
export const updateShift      = (id, d)   => API.patch(`/shifts/${id}`, d);
export const forceCloseShift  = (id)      => API.patch(`/shifts/${id}/force-close`);
export const deleteShift      = (id)      => API.delete(`/shifts/${id}`);

// ── GL ────────────────────────────────────────────────────────────────────────
export const getGLAccounts          = ()       => API.get('/gl/accounts');
export const createGLAccount        = (data)   => API.post('/gl/accounts', data);
export const updateGLAccount        = (id, d)  => API.put(`/gl/accounts/${id}`, d);
export const deleteGLAccount        = (id)     => API.delete(`/gl/accounts/${id}`);
export const getJournalEntries      = (params) => API.get('/gl/entries', { params });
export const createJournalEntry     = (data)   => API.post('/gl/entries', data);
export const getSalesMappings       = ()       => API.get('/gl/mappings/sales');
export const saveSalesMappings      = (data)   => API.post('/gl/mappings/sales', data);
export const getInventoryMappings   = ()       => API.get('/gl/mappings/inventory');
export const saveInventoryMappings  = (data)   => API.post('/gl/mappings/inventory', data);
export const getTrialBalance        = (p)      => API.get('/gl/reports/trial-balance', { params: p });
export const getBalanceSheet        = (p)      => API.get('/gl/reports/balance-sheet', { params: p });

// ── Notifications ─────────────────────────────────────────────────────────────
export const getNotifications = ()      => API.get('/notifications');
export const markNotificationsRead = (ids) => API.patch('/notifications/read', { ids });

// ── Reports ───────────────────────────────────────────────────────────────────
export const getSalesReport       = (p) => API.get('/reports/sales',       { params: p });
export const getEmployeeReport    = (p) => API.get('/reports/employees',   { params: p });
export const getMenuReport        = (p) => API.get('/reports/menu',        { params: p });
export const getPerformanceReport = (p) => API.get('/reports/performance', { params: p });
export const getShiftSalesReport  = (p) => API.get('/reports/shift-sales', { params: p });

// ── Setup Wizard ─────────────────────────────────────────────────────────────
export const getSetupStatus  = ()     => API.get('/setup/status');
export const completeSetup   = (data) => API.post('/setup/complete', data);

// ── Reservations ─────────────────────────────────────────────────────────────
export const getReservations    = (p)    => API.get('/reservations', { params: p });
export const createReservation  = (d)    => API.post('/reservations', d);
export const updateReservation  = (id,d) => API.patch(`/reservations/${id}`, d);

// ── Attendance ────────────────────────────────────────────────────────────────
export const attClockIn          = (d)      => API.post('/attendance/clock-in', d);
export const attClockOut         = (d)      => API.post('/attendance/clock-out', d);
export const attGetStatus        = ()       => API.get('/attendance/status');
export const attGetLogs          = (p)      => API.get('/attendance/logs', { params: p });
export const attCreateLog        = (d)      => API.post('/attendance/logs', d);
export const attVoidLog          = (id)     => API.patch(`/attendance/logs/${id}/void`);
export const attGetDaily         = (p)      => API.get('/attendance/daily', { params: p });
export const attGetTodayOverview = ()       => API.get('/attendance/today');
export const attRecompute        = (d)      => API.post('/attendance/recompute', d);
export const attGetLeaves        = (p)      => API.get('/attendance/leaves', { params: p });
export const attCreateLeave      = (d)      => API.post('/attendance/leaves', d);
export const attUpdateLeave      = (id, d)  => API.patch(`/attendance/leaves/${id}`, d);
export const attGetHolidays      = (p)      => API.get('/attendance/holidays', { params: p });
export const attCreateHoliday    = (d)      => API.post('/attendance/holidays', d);
export const attUpdateHoliday    = (id, d)  => API.patch(`/attendance/holidays/${id}`, d);
export const attDeleteHoliday    = (id)     => API.delete(`/attendance/holidays/${id}`);
export const attGetOTRules       = ()       => API.get('/attendance/ot-rules');
export const attCreateOTRule     = (d)      => API.post('/attendance/ot-rules', d);
export const attUpdateOTRule     = (id, d)  => API.patch(`/attendance/ot-rules/${id}`, d);
export const attGetCorrections   = (p)      => API.get('/attendance/corrections', { params: p });
export const attCreateCorrection = (d)      => API.post('/attendance/corrections', d);
export const attUpdateCorrection = (id, d)  => API.patch(`/attendance/corrections/${id}`, d);
export const attGetMonthlySummary= (p)      => API.get('/attendance/summary/monthly', { params: p });

// ── Delivery Platforms ────────────────────────────────────────────────────────
export const getDeliveryOrders     = (p)           => API.get('/delivery/orders', { params: p });
export const simulateDeliveryOrder = (d)           => API.post('/delivery/simulate', d);
export const acceptDeliveryOrder   = (id, d)       => API.patch(`/delivery/orders/${id}/accept`, d);
export const rejectDeliveryOrder   = (id, d)       => API.patch(`/delivery/orders/${id}/reject`, d);
export const getDeliveryPlatforms  = ()            => API.get('/delivery/platforms');
export const updateDeliveryPlatform= (platform, d) => API.patch(`/delivery/platforms/${platform}`, d);
export const getDeliveryStats      = ()            => API.get('/delivery/stats');

// ── Rider Delivery Management ─────────────────────────────────────────────────
export const getRiders              = ()        => API.get('/rider/riders');
export const createPhoneOrder       = (d)       => API.post('/rider/phone-orders', d);
export const getPhoneOrders         = (p)       => API.get('/rider/phone-orders', { params: p });
export const assignRider            = (id, d)   => API.patch(`/rider/orders/${id}/assign`, d);

export const getAvailableOrders     = ()        => API.get('/rider/available-orders');
export const claimOrder             = (id)      => API.post(`/rider/orders/${id}/claim`);
export const getRiderMyOrders       = (p)       => API.get('/rider/my-orders', { params: p });
export const pickOrder              = (id)      => API.patch(`/rider/orders/${id}/pick`);
export const riderCollectPayment    = (d)       => API.post('/rider/collections', d);

export const getCashierSummary      = (p)       => API.get('/rider/cashier/summary', { params: p });
export const getRiderOrdersForCashier = (riderId, p) => API.get(`/rider/cashier/rider/${riderId}/orders`, { params: p });
export const cashierCollect         = (d)       => API.post('/rider/cashier/collect', d);
export const updateCashierCollection= (id, d)   => API.patch(`/rider/cashier/collections/${id}`, d);

export const getDailyAudit          = (p)       => API.get('/rider/audit', { params: p });

export const getIncentiveRules      = ()        => API.get('/rider/incentives/rules');
export const createIncentiveRule    = (d)       => API.post('/rider/incentives/rules', d);
export const updateIncentiveRule    = (id, d)   => API.patch(`/rider/incentives/rules/${id}`, d);
export const deleteIncentiveRule    = (id)      => API.delete(`/rider/incentives/rules/${id}`);
export const processIncentives      = (d)       => API.post('/rider/incentives/process', d);
export const getIncentivePayments   = (p)       => API.get('/rider/incentives/payments', { params: p });
export const updateIncentivePayment = (id, d)   => API.patch(`/rider/incentives/payments/${id}`, d);
export const deleteIncentivePayment = (id)       => API.delete(`/rider/incentives/payments/${id}`);
export const getIncentivePaymentDeliveries = (id) => API.get(`/rider/incentives/payments/${id}/deliveries`);

export const getRiderReport         = (p)       => API.get('/rider/reports', { params: p });

// ── Company Groups & Branches ─────────────────────────────────────────────────
export const getMyGroup                 = ()        => API.get('/branches/my-group');
// Self-service group management (restaurant admin)
export const registerMyGroup            = (data)    => API.post('/my-group/register', data);
export const updateMyGroupInfo          = (data)    => API.patch('/my-group', data);
export const getMyGroupDashboard        = ()        => API.get('/my-group/dashboard');
export const addBranchToMyGroup         = (data)    => API.post('/my-group/branches', data);
// Super admin group management
export const getGroups                  = ()        => API.get('/admin/groups');
export const createGroup                = (data)    => API.post('/admin/groups', data);
export const updateGroup                = (id, d)   => API.put(`/admin/groups/${id}`, d);
export const getGroupBranches           = (id)      => API.get(`/admin/groups/${id}/branches`);
export const assignBranch               = (gid, d)  => API.post(`/admin/groups/${gid}/assign`, d);
export const removeBranch               = (gid, rid)=> API.delete(`/admin/groups/${gid}/branches/${rid}`);
export const getUnassignedRestaurants   = ()        => API.get('/admin/unassigned-restaurants');
export const getDiscountTiers           = ()        => API.get('/admin/branch-discounts');
export const saveDiscountTiers          = (data)    => API.post('/admin/branch-discounts', data);
export const getGroupConsolidatedTB     = (gid, p)  => API.get(`/admin/groups/${gid}/consolidated-tb`, { params: p });

// ── Admin ─────────────────────────────────────────────────────────────────────
export const getAllRestaurants    = ()     => API.get('/admin/restaurants');
export const registerRestaurant  = (data) => API.post('/admin/restaurants', data);
export const getPlatformStats    = ()     => API.get('/admin/stats');

// ── System ────────────────────────────────────────────────────────────────────
export const getSystemHealth  = ()         => API.get('/system/health');
export const listBackups      = ()         => API.get('/system/backups');
export const createBackup     = ()         => API.post('/system/backup');
export const downloadBackup   = (filename) => API.get(`/system/backups/${encodeURIComponent(filename)}`, { responseType: 'blob' });
export const deleteBackup     = (filename) => API.delete(`/system/backups/${encodeURIComponent(filename)}`);

// ── Subscriptions / Licensing ─────────────────────────────────────────────────
export const getModules              = ()     => API.get('/modules');
export const getMySubscriptions      = ()     => API.get('/subscriptions/my');
export const requestSubscription     = (data) => API.post('/subscriptions/request', data);
export const getModulePricing        = ()     => API.get('/admin/module-pricing');
export const saveModulePricing       = (data) => API.post('/admin/module-pricing', data);
export const getAdminSubscriptions   = (p)    => API.get('/admin/subscriptions', { params: p });
export const approveSubscription     = (id, data) => API.patch(`/admin/subscriptions/${id}/approve`, data);
export const rejectSubscription      = (id, data) => API.patch(`/admin/subscriptions/${id}/reject`, data);

// ── Categories ────────────────────────────────────────────────────────────────
export const getCategories    = ()        => API.get('/menu/categories');
export const createCategory   = (data)    => API.post('/menu/categories', data);
export const updateCategory   = (id, d)   => API.put(`/menu/categories/${id}`, d);
export const deleteCategory   = (id)      => API.delete(`/menu/categories/${id}`);

// ── Discount Presets ──────────────────────────────────────────────────────────
export const getDiscountPresets    = ()       => API.get('/discount-presets');
export const createDiscountPreset  = (data)   => API.post('/discount-presets', data);
export const updateDiscountPreset  = (id, d)  => API.put(`/discount-presets/${id}`, d);
export const deleteDiscountPreset  = (id)     => API.delete(`/discount-presets/${id}`);

// ── Support Tickets ───────────────────────────────────────────────────────────
export const createSupportTicket = (data) => {
  const form = new FormData();
  form.append('title', data.title);
  if (data.description) form.append('description', data.description);
  if (data.screenshot) form.append('screenshot', data.screenshot);
  return API.post('/support/tickets', form, { headers: { 'Content-Type': 'multipart/form-data' } });
};
export const getMySupportTickets    = ()        => API.get('/support/tickets');
export const getTicketMessages      = (id)      => API.get(`/support/tickets/${id}/messages`);
export const addTicketMessage       = (id, msg) => API.post(`/support/tickets/${id}/messages`, { message: msg });

export const getSystemConfig        = ()         => API.get('/admin/system-config');
export const saveSystemConfig       = (data)     => API.post('/admin/system-config', data);
export const testSmtpEmail          = (to)       => API.post('/admin/system-config/test-email', { to });
export const testWhatsAppMsg        = (data)     => API.post('/admin/system-config/test-whatsapp', data);

export const adminGetAllTickets     = (p)        => API.get('/admin/support/tickets', { params: p });
export const adminGetTicket         = (id)       => API.get(`/admin/support/tickets/${id}`);
export const adminGetTicketMessages = (id)       => API.get(`/admin/support/tickets/${id}/messages`);
export const adminAddTicketMessage  = (id, msg)  => API.post(`/admin/support/tickets/${id}/messages`, { message: msg });
export const adminAssignTicket      = (id, name) => API.patch(`/admin/support/tickets/${id}/assign`, { assigned_to_name: name });
export const adminResolveTicket     = (id)       => API.patch(`/admin/support/tickets/${id}/resolve`);

// ── Delivery Pricing ──────────────────────────────────────────────────────────
export const getDeliveryZones           = ()       => API.get('/delivery-pricing/zones');
export const createDeliveryZone         = (data)   => API.post('/delivery-pricing/zones', data);
export const updateDeliveryZone         = (id, d)  => API.put(`/delivery-pricing/zones/${id}`, d);
export const deleteDeliveryZone         = (id)     => API.delete(`/delivery-pricing/zones/${id}`);

export const getDeliveryAreas           = ()       => API.get('/delivery-pricing/areas');
export const createDeliveryArea         = (data)   => API.post('/delivery-pricing/areas', data);
export const updateDeliveryArea         = (id, d)  => API.put(`/delivery-pricing/areas/${id}`, d);
export const deleteDeliveryArea         = (id)     => API.delete(`/delivery-pricing/areas/${id}`);

export const getSurgeRules              = ()       => API.get('/delivery-pricing/surge-rules');
export const createSurgeRule            = (data)   => API.post('/delivery-pricing/surge-rules', data);
export const updateSurgeRule            = (id, d)  => API.put(`/delivery-pricing/surge-rules/${id}`, d);
export const deleteSurgeRule            = (id)     => API.delete(`/delivery-pricing/surge-rules/${id}`);

export const getCustomerRules           = ()       => API.get('/delivery-pricing/customer-rules');
export const createCustomerRule         = (data)   => API.post('/delivery-pricing/customer-rules', data);
export const updateCustomerRule         = (id, d)  => API.put(`/delivery-pricing/customer-rules/${id}`, d);
export const deleteCustomerRule         = (id)     => API.delete(`/delivery-pricing/customer-rules/${id}`);

export const previewDeliveryFee         = (data)   => API.post('/delivery-pricing/preview-fee', data);
export const getRestaurantLocation      = ()       => API.get('/delivery-pricing/restaurant-location');
export const saveRestaurantLocation     = (data)   => API.post('/delivery-pricing/restaurant-location', data);

export default API;
