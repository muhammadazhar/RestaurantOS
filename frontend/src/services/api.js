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
        const { data } = await axios.post('/api/auth/refresh', { refreshToken });
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
export const getMenu             = ()          => API.get('/menu');
export const createMenuItem      = (data)      => API.post('/menu/items', data);
export const updateMenuItem      = (id, d)     => API.put(`/menu/items/${id}`, d);
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
export const getShifts       = (params)  => API.get('/shifts', { params });
export const createShift      = (data)   => API.post('/shifts', data);
export const bulkCreateShifts = (data)   => API.post('/shifts/bulk', data);
export const updateShift      = (id, d)  => API.patch(`/shifts/${id}`, d);
export const deleteShift      = (id)     => API.delete(`/shifts/${id}`);

// ── GL ────────────────────────────────────────────────────────────────────────
export const getGLAccounts      = ()       => API.get('/gl/accounts');
export const getJournalEntries  = (params) => API.get('/gl/entries', { params });
export const createJournalEntry = (data)   => API.post('/gl/entries', data);

// ── Notifications ─────────────────────────────────────────────────────────────
export const getNotifications = ()      => API.get('/notifications');
export const markNotificationsRead = (ids) => API.patch('/notifications/read', { ids });

// ── Reports ───────────────────────────────────────────────────────────────────
export const getSalesReport       = (p) => API.get('/reports/sales',       { params: p });
export const getEmployeeReport    = (p) => API.get('/reports/employees',   { params: p });
export const getMenuReport        = (p) => API.get('/reports/menu',        { params: p });
export const getPerformanceReport = (p) => API.get('/reports/performance', { params: p });

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

export default API;
