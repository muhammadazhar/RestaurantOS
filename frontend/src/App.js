import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';

import Login      from './components/auth/Login';
import SuperLogin from './components/auth/SuperLogin';
import Layout     from './components/shared/Layout';
import Dashboard  from './components/dashboard/Dashboard';
import POS        from './components/pos/POS';
import Employees  from './components/employees/Employees';
import Recipes    from './components/recipes/Recipes';
import Ledger     from './components/ledger/Ledger';
import GLSetup    from './components/ledger/GLSetup';
import GLReports  from './components/reports/GLReports';
import { Kitchen, Tables, Alerts, Admin } from './components/pages';
import InventoryPage from './components/inventory/Inventory';

import Settings          from './components/settings/Settings';
import DiscountPresets   from './components/settings/DiscountPresets';
import MenuManagement  from './components/menu/MenuManagement';
import Orders          from './components/orders/Orders';
import Reservations    from './components/reservations/Reservations';
import Reports         from './components/reports/Reports';
import ShiftSalesReport from './components/reports/ShiftSalesReport';
import Register        from './components/onboarding/Register';
import SetupWizard     from './components/onboarding/SetupWizard';
import SystemPanel     from './components/system/SystemPanel';
import Attendance      from './components/attendance/Attendance';
import Delivery        from './components/delivery/Delivery';
import MyShift from './components/shifts/MyShift';
import PhoneOrder        from './components/rider/PhoneOrder';
import RiderDashboard    from './components/rider/RiderDashboard';
import CollectionScreen  from './components/rider/CollectionScreen';
import DailyAudit        from './components/rider/DailyAudit';
import IncentiveManagement from './components/rider/IncentiveManagement';
import RiderReports        from './components/rider/RiderReports';
import MySubscriptions      from './components/subscriptions/MySubscriptions';
import ModulePricing        from './components/admin/ModulePricing';
import SubscriptionManagement from './components/admin/SubscriptionManagement';
import CompanyGroups        from './components/admin/CompanyGroups';
import BranchManagement     from './components/branches/BranchManagement';
import GroupDashboard       from './components/branches/GroupDashboard';
import Support              from './components/support/Support';
import AdminSupport         from './components/admin/AdminSupport';

function ThemedToaster() {
  const { theme: T } = useTheme();
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        style: { background: T.card, color: T.text, border: `1px solid ${T.border}`, fontFamily: "'Inter', sans-serif" },
        success: { iconTheme: { primary: T.green,   secondary: '#fff' } },
        error:   { iconTheme: { primary: '#E74C3C', secondary: '#fff' } },
      }}
    />
  );
}

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? children : <Navigate to="/login" replace />;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login"       element={user ? <Navigate to="/dashboard" /> : <Login />} />
      <Route path="/super-login" element={user ? <Navigate to="/dashboard" /> : <SuperLogin />} />
      <Route path="/register"    element={user ? <Navigate to="/setup" />     : <Register />} />
      <Route path="/setup"       element={<PrivateRoute><SetupWizard /></PrivateRoute>} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<PrivateRoute><Layout><Dashboard /></Layout></PrivateRoute>} />
      <Route path="/pos"       element={<PrivateRoute><Layout><POS /></Layout></PrivateRoute>} />
      <Route path="/kitchen"   element={<PrivateRoute><Layout><Kitchen /></Layout></PrivateRoute>} />
      <Route path="/tables"    element={<PrivateRoute><Layout><Tables /></Layout></PrivateRoute>} />
      <Route path="/inventory" element={<PrivateRoute><Layout><InventoryPage /></Layout></PrivateRoute>} />
      <Route path="/recipes"   element={<PrivateRoute><Layout><Recipes /></Layout></PrivateRoute>} />
      <Route path="/employees"  element={<PrivateRoute><Layout><Employees /></Layout></PrivateRoute>} />
      <Route path="/attendance" element={<PrivateRoute><Layout><Attendance /></Layout></PrivateRoute>} />
      <Route path="/my-shift" element={<PrivateRoute><Layout><MyShift /></Layout></PrivateRoute>} />
      <Route path="/delivery"   element={<PrivateRoute><Layout><Delivery /></Layout></PrivateRoute>} />
      <Route path="/ledger"      element={<PrivateRoute><Layout><Ledger /></Layout></PrivateRoute>} />
      <Route path="/gl-setup"    element={<PrivateRoute><Layout><GLSetup /></Layout></PrivateRoute>} />
      <Route path="/gl-reports"  element={<PrivateRoute><Layout><GLReports /></Layout></PrivateRoute>} />
      <Route path="/alerts"    element={<PrivateRoute><Layout><Alerts /></Layout></PrivateRoute>} />
      <Route path="/admin"     element={<PrivateRoute><Layout><Admin /></Layout></PrivateRoute>} />
      <Route path="/menu-mgmt"    element={<PrivateRoute><Layout><MenuManagement /></Layout></PrivateRoute>} />
      <Route path="/orders"       element={<PrivateRoute><Layout><Orders /></Layout></PrivateRoute>} />
      <Route path="/reservations" element={<PrivateRoute><Layout><Reservations /></Layout></PrivateRoute>} />
      <Route path="/reports"         element={<PrivateRoute><Layout><Reports /></Layout></PrivateRoute>} />
      <Route path="/shift-sales-report" element={<PrivateRoute><Layout><ShiftSalesReport /></Layout></PrivateRoute>} />
      <Route path="/settings"          element={<PrivateRoute><Layout><Settings /></Layout></PrivateRoute>} />
      <Route path="/discount-presets"  element={<PrivateRoute><Layout><DiscountPresets /></Layout></PrivateRoute>} />
      <Route path="/system"            element={<PrivateRoute><Layout><SystemPanel /></Layout></PrivateRoute>} />

      {/* Rider Delivery Management */}
      <Route path="/phone-orders"  element={<PrivateRoute><Layout><PhoneOrder /></Layout></PrivateRoute>} />
      <Route path="/rider"         element={<PrivateRoute><Layout><RiderDashboard /></Layout></PrivateRoute>} />
      <Route path="/collections"   element={<PrivateRoute><Layout><CollectionScreen /></Layout></PrivateRoute>} />
      <Route path="/daily-audit"   element={<PrivateRoute><Layout><DailyAudit /></Layout></PrivateRoute>} />
      <Route path="/incentives"    element={<PrivateRoute><Layout><IncentiveManagement /></Layout></PrivateRoute>} />
      <Route path="/rider-reports" element={<PrivateRoute><Layout><RiderReports /></Layout></PrivateRoute>} />

      {/* Subscriptions & Licensing */}
      <Route path="/subscriptions"     element={<PrivateRoute><Layout><MySubscriptions /></Layout></PrivateRoute>} />
      <Route path="/module-pricing"    element={<PrivateRoute><Layout><ModulePricing /></Layout></PrivateRoute>} />
      <Route path="/subscription-mgmt" element={<PrivateRoute><Layout><SubscriptionManagement /></Layout></PrivateRoute>} />

      {/* Company Groups & Branches */}
      <Route path="/company-groups"   element={<PrivateRoute><Layout><CompanyGroups /></Layout></PrivateRoute>} />
      <Route path="/branches"         element={<PrivateRoute><Layout><BranchManagement /></Layout></PrivateRoute>} />
      <Route path="/group-dashboard"  element={<PrivateRoute><Layout><GroupDashboard /></Layout></PrivateRoute>} />

      {/* Support */}
      <Route path="/support"          element={<PrivateRoute><Layout><Support /></Layout></PrivateRoute>} />
      <Route path="/admin-support"    element={<PrivateRoute><Layout><AdminSupport /></Layout></PrivateRoute>} />

      <Route path="*"          element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <SocketProvider>
        <BrowserRouter>
          <AppRoutes />
          <ThemedToaster />
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
    </ThemeProvider>
  );
}
