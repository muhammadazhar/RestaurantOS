import React, { useState, useEffect, useCallback } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useTheme } from '../../context/ThemeContext';
import {
  getRestaurantSettings,
  getMenu,
  getOrders,
  getPhoneOrders,
  getMySupportTickets,
  adminGetAllTickets,
  getSyncStatus,
} from '../../services/api';
import LicenseGate from './LicenseGate';
import { normalizeWorkflowSettings } from '../../utils/workflowSettings';

const IMG_BASE = process.env.REACT_APP_SOCKET_URL
  || (window.location.protocol + '//' + window.location.hostname + ':5000');

const NAV_GROUPS = [
  {
    label: 'Dashboard',
    module: null,
    hiddenForSuperAdmin: true,
    description: 'Overview and live metrics',
    items: [
      { to: '/dashboard', icon: 'dashboard', label: 'Dashboard', perm: 'dashboard' },
    ],
  },
  {
    label: 'POS',
    module: 'base',
    hiddenForSuperAdmin: true,
    description: 'Transactions and order flow',
    items: [
      { to: '/pos', icon: 'pos', label: 'POS / Orders', perm: 'pos', badgeKey: 'orders' },
      { to: '/kitchen', icon: 'kitchen', label: 'Kitchen Display', perm: 'kitchen' },
      { to: '/orders', icon: 'orders', label: 'Order History', perm: 'pos', badgeKey: 'orders' },
    ],
  },
  {
    label: 'Shifts',
    module: null,
    hiddenForSuperAdmin: true,
    description: 'Open, close, and review shifts',
    items: [
      { to: '/my-shift', icon: 'shift', label: 'My Shift', perm: 'pos' },
      { to: '/shift-management', icon: 'shift', label: 'Shift Management', perm: 'shift_management' },
      { to: '/shift-sales-report', icon: 'report', label: 'Shift Sales Report', perm: 'shift_management' },
    ],
  },
  {
    label: 'Tables',
    module: 'tables',
    hiddenForSuperAdmin: true,
    description: 'Dining floor and reservations',
    items: [
      { to: '/tables', icon: 'tables', label: 'Tables', perm: 'tables' },
      { to: '/reservations', icon: 'tables', label: 'Reservations', perm: 'tables' },
    ],
  },
  {
    label: 'Kitchen',
    module: 'inventory',
    hiddenForSuperAdmin: true,
    description: 'Inventory and menu controls',
    items: [
      { to: '/inventory', icon: 'inventory', label: 'Inventory', perm: 'inventory' },
      { to: '/recipes', icon: 'recipe', label: 'Recipes', perm: 'recipes' },
      { to: '/menu-mgmt', icon: 'menu', label: 'Menu Management', perm: 'settings' },
    ],
  },
  {
    label: 'Staff',
    module: 'staff',
    hiddenForSuperAdmin: true,
    description: 'Team access and attendance',
    items: [
      { to: '/employees', icon: 'staff', label: 'Employees', perm: 'employees' },
      { to: '/attendance', icon: 'attendance', label: 'Attendance', perm: 'attendance' },
    ],
  },
  {
    label: 'Delivery',
    module: 'rider',
    hiddenForSuperAdmin: true,
    description: 'Riders, queues, and collections',
    items: [
      { to: '/delivery', icon: 'delivery', label: 'Online Delivery', perm: 'pos' },
      { to: '/phone-orders', icon: 'phone', label: 'Phone Orders', perm: 'pos' },
      { to: '/rider', icon: 'delivery', label: 'My Deliveries', perm: 'rider' },
      { to: '/collections', icon: 'finance', label: 'Collections', perm: 'pos' },
      { to: '/daily-audit', icon: 'audit', label: 'Daily Audit', perm: 'pos' },
      { to: '/incentives', icon: 'staff', label: 'Rider Incentives', perm: 'employees' },
      { to: '/rider-reports', icon: 'report', label: 'Rider Reports', perm: 'pos' },
      { to: '/delivery-pricing', icon: 'settings', label: 'Delivery Pricing', perm: 'settings' },
    ],
  },
  {
    label: 'Reports',
    module: 'reports',
    hiddenForSuperAdmin: true,
    description: 'Operational, sales, and audit reports',
    items: [
      { to: '/reports', icon: 'report', label: 'Reports', perm: 'pos' },
      { to: '/refund-history', icon: 'finance', label: 'Refund History', perm: 'settings' },
    ],
  },
  {
    label: 'Finance',
    module: 'gl',
    hiddenForSuperAdmin: true,
    description: 'Ledger, setup, and finance views',
    items: [
      { to: '/ledger', icon: 'finance', label: 'General Ledger', perm: 'gl' },
      { to: '/gl-setup', icon: 'settings', label: 'GL Setup', perm: 'gl' },
      { to: '/gl-reports', icon: 'report', label: 'GL Reports', perm: 'gl' },
    ],
  },
  {
    label: 'Support',
    module: 'support',
    hiddenForSuperAdmin: true,
    description: 'Tickets and support follow-up',
    items: [
      { to: '/support', icon: 'support', label: 'Support Tickets', perm: null, badgeKey: 'support' },
    ],
  },
  {
    label: 'SaaS',
    module: null,
    superAdminOnly: true,
    description: 'Registered sites, subscriptions, and platform control',
    items: [
      { to: '/branches', icon: 'branch', label: 'Registered Sites', superAdmin: true },
      { to: '/company-groups', icon: 'branch', label: 'Company Groups', superAdmin: true },
      { to: '/group-dashboard', icon: 'dashboard', label: 'Group Dashboard', superAdmin: true },
      { to: '/subscriptions', icon: 'finance', label: 'Subscriptions Overview', superAdmin: true },
      { to: '/alerts', icon: 'alert', label: 'Alerts', perm: null },
      { to: '/admin', icon: 'settings', label: 'Admin Panel', superAdmin: true },
      { to: '/module-pricing', icon: 'finance', label: 'Module Pricing', superAdmin: true },
      { to: '/subscription-mgmt', icon: 'finance', label: 'Subscriptions', superAdmin: true },
      { to: '/admin-support', icon: 'support', label: 'Support Tickets', superAdmin: true, badgeKey: 'adminSupport' },
    ],
  },
  {
    label: 'Settings',
    module: null,
    hiddenForSuperAdmin: true,
    description: 'System, roles, pricing, and config',
    items: [
      { to: '/branches', icon: 'branch', label: 'My Branch / Group', perm: null },
      { to: '/group-dashboard', icon: 'dashboard', label: 'Group Dashboard', perm: 'settings' },
      { to: '/subscriptions', icon: 'finance', label: 'My Subscriptions', perm: null },
      { to: '/alerts', icon: 'alert', label: 'Alerts', perm: null },
      { to: '/discount-presets', icon: 'finance', label: 'Discount Presets', perm: 'settings' },
      { to: '/system', icon: 'settings', label: 'System', perm: 'settings' },
      { to: '/settings', icon: 'settings', label: 'Settings', perm: 'settings' },
    ],
  },
];

const INCOMPLETE_ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'served', 'picked', 'out_for_delivery'];
const needsSupportReview = (ticket) => ticket && ticket.status !== 'resolved';
const formatBadgeCount = (count) => (count > 99 ? '99+' : String(count));

const getSyncDisplay = (status, socketConnected) => {
  if (!status) {
    return {
      label: socketConnected ? 'Online' : 'Checking',
      tone: socketConnected ? 'online' : 'checking',
      detail: socketConnected ? 'Cloud connection active' : 'Checking sync status',
    };
  }

  const queue = status.queue || {};
  const runtime = status.runtime || {};
  const cloud = status.cloud || {};
  const failed = Number(queue.failed || 0);
  const conflicts = Number(queue.conflict || 0);
  const pending = Number(queue.pending || 0) + Number(queue.syncing || 0);

  if (failed || conflicts) {
    return {
      label: `Sync issues ${failed + conflicts}`,
      tone: 'danger',
      detail: `${failed} failed, ${conflicts} conflict`,
    };
  }
  if (pending) {
    return {
      label: `Pending sync ${pending}`,
      tone: 'warning',
      detail: cloud.online ? 'Waiting to push local changes' : 'Cloud is offline',
    };
  }
  if (runtime.isLocalOfflineMode && !cloud.online) {
    return {
      label: 'Offline - local mode',
      tone: 'offline',
      detail: cloud.error || 'Using local server',
    };
  }
  if (runtime.isLocalOfflineMode) {
    return {
      label: 'Local mode online',
      tone: 'local',
      detail: 'Local server with cloud reachable',
    };
  }
  return {
    label: socketConnected ? 'Online' : 'API online',
    tone: 'online',
    detail: socketConnected ? 'Live updates connected' : 'API reachable',
  };
};

const reviewLink = (item, count) => {
  if (!count) return item.to;
  if (item.badgeKey === 'orders' && item.to === '/orders') return `${item.to}?review=1`;
  if (item.badgeKey === 'support' && item.to === '/support') return `${item.to}?review=1`;
  if (item.badgeKey === 'adminSupport' && item.to === '/admin-support') return `${item.to}?review=1`;
  return item.to;
};

const isPathMatch = (pathname, itemPath) => pathname === itemPath || pathname.startsWith(`${itemPath}/`);

function Icon({ name, size = 18, color = 'currentColor', stroke = 1.9 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const icons = {
    dashboard: (
      <svg {...common}>
        <path d="M4 13a8 8 0 1 1 16 0" />
        <path d="M12 13l4-4" />
        <path d="M12 13H8" />
      </svg>
    ),
    pos: (
      <svg {...common}>
        <circle cx="9" cy="19" r="1.4" />
        <circle cx="17" cy="19" r="1.4" />
        <path d="M3 5h2l2.1 9.1a1 1 0 0 0 1 .8H18a1 1 0 0 0 1-.8L21 8H7" />
      </svg>
    ),
    tables: (
      <svg {...common}>
        <rect x="5" y="6" width="14" height="8" rx="1.5" />
        <path d="M8 14v4M16 14v4M5 10H3M21 10h-2" />
      </svg>
    ),
    kitchen: (
      <svg {...common}>
        <path d="M7 4v16" />
        <path d="M5 4v5a2 2 0 0 0 4 0V4" />
        <path d="M15 4v7" />
        <path d="M19 4v16" />
        <path d="M15 11h4" />
      </svg>
    ),
    inventory: (
      <svg {...common}>
        <path d="M12 3l8 4.5-8 4.5-8-4.5L12 3Z" />
        <path d="M4 7.5V16.5L12 21l8-4.5V7.5" />
        <path d="M12 12v9" />
      </svg>
    ),
    finance: (
      <svg {...common}>
        <rect x="3.5" y="6" width="17" height="12" rx="2" />
        <path d="M3.5 10.5h17" />
        <path d="M7.5 14h3" />
      </svg>
    ),
    report: (
      <svg {...common}>
        <path d="M5 19V9" />
        <path d="M10 19V5" />
        <path d="M15 19v-7" />
        <path d="M20 19v-11" />
      </svg>
    ),
    settings: (
      <svg {...common}>
        <path d="M4 7h7" />
        <path d="M15 7h5" />
        <path d="M9 7a2 2 0 1 0 0 .01Z" />
        <path d="M4 17h3" />
        <path d="M13 17h7" />
        <path d="M11 17a2 2 0 1 0 0 .01Z" />
      </svg>
    ),
    staff: (
      <svg {...common}>
        <circle cx="9" cy="8" r="3" />
        <path d="M4 19a5 5 0 0 1 10 0" />
        <path d="M18 8h.01" />
        <path d="M16 19a4 4 0 0 0-2.2-3.6" />
      </svg>
    ),
    delivery: (
      <svg {...common}>
        <path d="M3 7h11v8H3z" />
        <path d="M14 10h3l3 3v2h-6z" />
        <circle cx="7.5" cy="18" r="1.5" />
        <circle cx="17.5" cy="18" r="1.5" />
      </svg>
    ),
    support: (
      <svg {...common}>
        <path d="M5 9a7 7 0 0 1 14 0c0 2.6-1.4 4-3.2 5.2-.9.6-1.8 1.1-2.3 1.8" />
        <path d="M12 19h.01" />
      </svg>
    ),
    shift: (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5v5l3 1.8" />
      </svg>
    ),
    attendance: (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3v4M16 3v4M7.5 11h9M8 15h4" />
      </svg>
    ),
    orders: (
      <svg {...common}>
        <path d="M7 4h10l2 4v12H5V8l2-4Z" />
        <path d="M9 4v4h6V4" />
        <path d="M8 12h8M8 16h5" />
      </svg>
    ),
    phone: (
      <svg {...common}>
        <rect x="7" y="2.5" width="10" height="19" rx="2" />
        <path d="M11 18h2" />
      </svg>
    ),
    menu: (
      <svg {...common}>
        <path d="M6 5.5h12" />
        <path d="M6 10.5h12" />
        <path d="M6 15.5h12" />
      </svg>
    ),
    recipe: (
      <svg {...common}>
        <path d="M7 4h10a2 2 0 0 1 2 2v14l-4-2-3 2-3-2-4 2V6a2 2 0 0 1 2-2Z" />
        <path d="M9 9h6M9 12h5" />
      </svg>
    ),
    branch: (
      <svg {...common}>
        <path d="M6 20V9l6-5 6 5v11" />
        <path d="M9.5 20v-5h5V20" />
      </svg>
    ),
    alert: (
      <svg {...common}>
        <path d="m12 4 8 14H4L12 4Z" />
        <path d="M12 9v4" />
        <path d="M12 16h.01" />
      </svg>
    ),
    audit: (
      <svg {...common}>
        <path d="M6 3h9l3 3v15H6z" />
        <path d="M15 3v4h4" />
        <path d="M9 12h6M9 16h6" />
      </svg>
    ),
  };
  return icons[name] || icons.settings;
}

export default function Layout({ children }) {
  const { user, logout, hasPermission, hasModule } = useAuth();
  const { connected } = useSocket();
  const { mode, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [logoUrl, setLogoUrl] = useState(null);
  const [basePricing, setBasePricing] = useState([]);
  const [badgeCounts, setBadgeCounts] = useState({ orders: 0, support: 0, adminSupport: 0 });
  const [workflowSettings, setWorkflowSettings] = useState(normalizeWorkflowSettings());
  const [syncStatus, setSyncStatus] = useState(null);

  const isLight = mode === 'light';
  const shellBg = isLight ? '#f3f6fb' : '#07111d';
  const panelBg = isLight ? 'rgba(255,255,255,0.92)' : 'rgba(8,14,24,0.9)';
  const panelBorder = isLight ? 'rgba(148,163,184,0.18)' : 'rgba(148,163,184,0.14)';
  const moduleText = isLight ? '#0f172a' : '#f8fafc';
  const mutedText = isLight ? '#64748b' : '#94a3b8';
  const accent = '#ffb661';
  const accentDeep = '#f6a84a';
  const syncDisplay = getSyncDisplay(syncStatus, connected);
  const syncTone = {
    online: { bg: isLight ? '#ecfdf5' : 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.35)', text: isLight ? '#047857' : '#86efac', dot: '#22c55e' },
    local: { bg: isLight ? '#eff6ff' : 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.35)', text: isLight ? '#1d4ed8' : '#93c5fd', dot: '#3b82f6' },
    warning: { bg: isLight ? '#fffbeb' : 'rgba(245,158,11,0.13)', border: 'rgba(245,158,11,0.38)', text: isLight ? '#92400e' : '#fcd34d', dot: '#f59e0b' },
    danger: { bg: isLight ? '#fef2f2' : 'rgba(239,68,68,0.13)', border: 'rgba(239,68,68,0.38)', text: isLight ? '#b91c1c' : '#fca5a5', dot: '#ef4444' },
    offline: { bg: isLight ? '#f8fafc' : 'rgba(148,163,184,0.12)', border: panelBorder, text: mutedText, dot: '#94a3b8' },
    checking: { bg: isLight ? '#f8fafc' : 'rgba(148,163,184,0.10)', border: panelBorder, text: mutedText, dot: '#94a3b8' },
  }[syncDisplay.tone] || {};

  useEffect(() => {
    if (!user?.isSuperAdmin && hasPermission('settings')) {
      getRestaurantSettings().then(r => {
        if (r.data?.logo_url) setLogoUrl(r.data.logo_url);
      }).catch(() => {});
    }
  }, [user, hasPermission]);

  useEffect(() => {
    if (!user?.isSuperAdmin && hasModule('base')) {
      getMenu()
        .then(r => setWorkflowSettings(normalizeWorkflowSettings(r.data?.settings?.workflow_settings)))
        .catch(() => {});
    }
  }, [user, hasModule]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const loadSyncStatus = () => {
      getSyncStatus()
        .then(r => { if (!cancelled) setSyncStatus(r.data); })
        .catch(() => { if (!cancelled) setSyncStatus(null); });
    };
    loadSyncStatus();
    const timer = setInterval(loadSyncStatus, 30000);
    window.addEventListener('focus', loadSyncStatus);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', loadSyncStatus);
    };
  }, [user]);

  const baseExpired = !user?.isSuperAdmin && user && !hasModule('base');
  useEffect(() => {
    if (baseExpired) {
      import('../../services/api').then(({ getMySubscriptions }) =>
        getMySubscriptions().then(r => setBasePricing(r.data.pricing || [])).catch(() => {})
      );
    }
  }, [baseExpired]);

  const refreshBadgeCounts = useCallback(async () => {
    if (!user || baseExpired) return;

    const permissions = user.permissions || [];
    const modules = user.modules || [];
    const canLoadOrders = !user.isSuperAdmin
      && modules.includes('base')
      && (permissions.includes('pos') || permissions.includes('settings'));
    const canLoadSupport = !user.isSuperAdmin && modules.includes('support');

    const next = { orders: 0, support: 0, adminSupport: 0 };
    const jobs = [];

    if (canLoadOrders) {
      jobs.push(
        Promise.allSettled([
          getOrders({ status: INCOMPLETE_ORDER_STATUSES.join(',') }),
          getPhoneOrders({ status: INCOMPLETE_ORDER_STATUSES.join(',') }),
        ]).then(([ordersRes, phoneRes]) => {
          const orders = ordersRes.status === 'fulfilled' && Array.isArray(ordersRes.value.data) ? ordersRes.value.data : [];
          const phoneOrders = phoneRes.status === 'fulfilled' && Array.isArray(phoneRes.value.data) ? phoneRes.value.data : [];
          next.orders = orders.length + phoneOrders.length;
        })
      );
    }

    if (canLoadSupport) {
      jobs.push(
        getMySupportTickets()
          .then(r => { next.support = Array.isArray(r.data) ? r.data.filter(needsSupportReview).length : 0; })
          .catch(() => {})
      );
    }

    if (user.isSuperAdmin) {
      jobs.push(
        adminGetAllTickets()
          .then(r => { next.adminSupport = Array.isArray(r.data) ? r.data.filter(needsSupportReview).length : 0; })
          .catch(() => {})
      );
    }

    await Promise.all(jobs);
    setBadgeCounts(next);
  }, [user, baseExpired]);

  useEffect(() => {
    refreshBadgeCounts();
    const onFocus = () => refreshBadgeCounts();
    window.addEventListener('focus', onFocus);
    const timer = setInterval(refreshBadgeCounts, 60000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(timer);
    };
  }, [refreshBadgeCounts]);

  const handleLogout = async () => { await logout(); navigate('/login'); };

  const canSee = (item) => {
    if (item.superAdmin) return user?.isSuperAdmin;
    if (!item.perm) return true;
    if (hasPermission('settings')) return true;
    return hasPermission(item.perm);
  };

  const canSeeGroup = (group) => {
    if (group.superAdminOnly) return user?.isSuperAdmin;
    if (group.hiddenForSuperAdmin && user?.isSuperAdmin) return false;
    if (!group.module) return true;
    if (user?.isSuperAdmin) return true;
    return hasModule(group.module);
  };

  const getBadgeCount = (item) => (item.badgeKey ? Number(badgeCounts[item.badgeKey] || 0) : 0);
  const getGroupBadgeCount = (group) => {
    const keys = new Set(group.items.map(item => item.badgeKey).filter(Boolean));
    return [...keys].reduce((sum, key) => sum + Number(badgeCounts[key] || 0), 0);
  };

  const visibleGroups = NAV_GROUPS
    .filter(canSeeGroup)
    .map(group => ({
      ...group,
      items: group.items.filter(item => canSee(item) && (item.to !== '/kitchen' || workflowSettings.use_kitchen_workflow)),
    }))
    .filter(group => group.items.length > 0);

  const activeGroup = visibleGroups.find(group => group.items.some(item => isPathMatch(location.pathname, item.to))) || visibleGroups[0];
  const activeItem = activeGroup?.items.find(item => isPathMatch(location.pathname, item.to)) || activeGroup?.items[0];

  if (baseExpired) {
    return <LicenseGate moduleKey="base" moduleName="RestaurantOS Base" pricing={basePricing} />;
  }

  return (
    <div style={{ minHeight: '100vh', background: isLight ? shellBg : `radial-gradient(circle at top left, rgba(255,182,97,0.08), transparent 24%), radial-gradient(circle at top right, rgba(68,183,255,0.08), transparent 22%), ${shellBg}`, fontFamily: "'Inter', sans-serif" }}>
      <div style={{ display: 'flex', minHeight: '100vh', padding: 12, gap: 12 }}>
        <aside style={{ width: 88, flexShrink: 0, background: panelBg, border: `1px solid ${panelBorder}`, borderRadius: 24, boxShadow: isLight ? '0 18px 48px rgba(15,23,42,0.06)' : '0 22px 54px rgba(0,0,0,0.22)', padding: '10px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 48, height: 48, borderRadius: 16, background: isLight ? '#fff' : 'rgba(255,255,255,0.04)', border: `1px solid ${panelBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: isLight ? '0 10px 30px rgba(15,23,42,0.06)' : '0 14px 34px rgba(0,0,0,0.25)' }}>
            {logoUrl
              ? <img src={logoUrl.startsWith('http') ? logoUrl : `${IMG_BASE}${logoUrl}`} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontWeight: 900, color: moduleText }}>RO</span>
            }
          </div>

          <div style={{ fontSize: 10, fontWeight: 800, color: moduleText, textAlign: 'center', lineHeight: 1.25, maxWidth: 64 }}>
            {user?.restaurantName || 'RestaurantOS'}
          </div>

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6, flex: 1, overflowY: 'auto', paddingTop: 4 }}>
            {visibleGroups.map(group => {
              const groupActive = activeGroup?.label === group.label;
              const badgeCount = getGroupBadgeCount(group);
              const target = reviewLink(group.items[0], getBadgeCount(group.items[0]));
              return (
                <button
                  key={group.label}
                  onClick={() => navigate(target)}
                  title={group.label}
                  style={{
                    position: 'relative',
                    width: '100%',
                    border: `1px solid ${groupActive ? accentDeep : 'transparent'}`,
                    background: groupActive ? `linear-gradient(180deg, ${accent} 0%, #ffc880 100%)` : 'transparent',
                    color: groupActive ? '#111827' : moduleText,
                    borderRadius: 18,
                    padding: '10px 6px 8px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    boxShadow: groupActive ? '0 14px 28px rgba(255,182,97,0.22)' : 'none',
                    transition: 'all 0.18s ease',
                  }}
                >
                  <div style={{ width: 34, height: 34, borderRadius: 12, background: groupActive ? 'rgba(255,255,255,0.28)' : (isLight ? '#ffffff' : 'rgba(255,255,255,0.04)'), border: `1px solid ${groupActive ? 'rgba(255,255,255,0.24)' : panelBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={group.items[0]?.icon} color={groupActive ? '#111827' : '#dbe4f0'} size={16} stroke={1.85} />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 800, lineHeight: 1.1, textAlign: 'center' }}>{group.label}</span>
                  {badgeCount > 0 && (
                    <span style={{ position: 'absolute', top: 6, right: 6, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: groupActive ? '#111827' : '#ef4444', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 900, lineHeight: 1 }}>
                      {formatBadgeCount(badgeCount)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            onClick={toggle}
            title={`Switch to ${isLight ? 'dark' : 'light'} mode`}
            style={{
              width: '100%',
              background: isLight ? '#ffffff' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${panelBorder}`,
              borderRadius: 16,
              padding: '10px 6px 8px',
              cursor: 'pointer',
              color: moduleText,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <div style={{ width: 34, height: 18, borderRadius: 999, background: isLight ? accent : 'rgba(255,255,255,0.14)', position: 'relative' }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: isLight ? 19 : 3, transition: 'left 0.2s' }} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 800 }}>{isLight ? 'Light' : 'Dark'}</span>
          </button>

          <div style={{ width: '100%', background: isLight ? '#ffffff' : 'rgba(255,255,255,0.04)', border: `1px solid ${panelBorder}`, borderRadius: 18, padding: '8px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: accent, color: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900 }}>
              {user?.name?.[0] || 'U'}
            </div>
            <div style={{ fontSize: 10, fontWeight: 800, color: moduleText, textAlign: 'center', lineHeight: 1.15 }}>{user?.name}</div>
            <div style={{ fontSize: 9, color: mutedText, textAlign: 'center' }}>{syncDisplay.label} / {user?.role || 'User'}</div>
            <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: mutedText, padding: 0, cursor: 'pointer', fontSize: 10, fontFamily: "'Inter', sans-serif", fontWeight: 700 }}>
              Sign out
            </button>
          </div>
        </aside>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {activeGroup && (
            <div style={{ background: panelBg, border: `1px solid ${panelBorder}`, borderRadius: 20, padding: '10px 12px', boxShadow: isLight ? '0 16px 42px rgba(15,23,42,0.05)' : '0 18px 42px rgba(0,0,0,0.18)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, marginRight: 6 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 12, background: `linear-gradient(135deg, ${accent} 0%, #ffc880 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 26px rgba(255,182,97,0.22)', flexShrink: 0 }}>
                    <Icon name={activeGroup.items[0]?.icon} color="#111827" size={16} stroke={1.9} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 900, color: moduleText }}>{activeGroup.label}</div>
                    <div style={{ fontSize: 11, color: mutedText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activeGroup.description}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                  {activeGroup.items.map(item => {
                    const itemBadgeCount = getBadgeCount(item);
                    const target = reviewLink(item, itemBadgeCount);
                    const isShiftManagementItem = activeGroup.label === 'Shifts' && item.to === '/shift-management';
                    return (
                      <NavLink
                        key={item.to}
                        to={target}
                        style={({ isActive }) => ({
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 7,
                          padding: '7px 10px',
                          borderRadius: 12,
                          textDecoration: 'none',
                          background: isActive
                            ? `linear-gradient(135deg, ${accent} 0%, #ffc880 100%)`
                            : isShiftManagementItem
                              ? (isLight ? 'rgba(255,182,97,0.14)' : 'rgba(255,182,97,0.12)')
                              : (isLight ? '#ffffff' : 'rgba(255,255,255,0.03)'),
                          border: `1px solid ${isActive ? accentDeep : isShiftManagementItem ? 'rgba(246,168,74,0.35)' : panelBorder}`,
                          color: isActive ? '#111827' : moduleText,
                          boxShadow: isActive
                            ? '0 12px 24px rgba(255,182,97,0.2)'
                            : isShiftManagementItem
                              ? 'inset 0 0 0 1px rgba(255,182,97,0.08)'
                              : 'none',
                          transition: 'all 0.18s ease',
                          fontSize: 11,
                          fontWeight: isShiftManagementItem ? 900 : 800,
                          whiteSpace: 'nowrap',
                        })}
                      >
                        {({ isActive }) => (
                          <>
                            <Icon name={item.icon} color={isActive ? '#111827' : isShiftManagementItem ? accent : '#cbd5e1'} size={13} stroke={1.85} />
                            <span>{item.label}</span>
                            {itemBadgeCount > 0 && (
                              <span style={{ minWidth: 17, height: 17, padding: '0 5px', borderRadius: 999, background: isActive ? '#111827' : '#ef4444', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 900, lineHeight: 1 }}>
                                {formatBadgeCount(itemBadgeCount)}
                              </span>
                            )}
                          </>
                        )}
                      </NavLink>
                    );
                  })}
                </div>

                <div title={syncDisplay.detail} style={{ display: 'flex', alignItems: 'center', gap: 7, background: syncTone.bg, border: `1px solid ${syncTone.border}`, borderRadius: 12, padding: '7px 10px', marginLeft: 'auto' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: syncTone.dot, boxShadow: `0 0 0 3px ${syncTone.dot}22`, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, fontWeight: 900, color: syncTone.text, whiteSpace: 'nowrap' }}>{syncDisplay.label}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: isLight ? '#f8fafc' : 'rgba(255,255,255,0.03)', border: `1px solid ${panelBorder}`, borderRadius: 12, padding: '7px 10px' }}>
                  <Icon name="shift" color={mutedText} size={12} stroke={1.85} />
                  <span style={{ fontSize: 10, color: mutedText }}>Active:</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: accent }}>{activeItem?.label || activeGroup.label}</span>
                </div>
              </div>
            </div>
          )}

          <main style={{ flex: 1, minHeight: 'calc(100vh - 24px)' }}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
