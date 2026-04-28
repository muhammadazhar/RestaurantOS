import React, { useState, useEffect, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useTheme } from '../../context/ThemeContext';
import {
  getRestaurantSettings,
  getOrders,
  getPhoneOrders,
  getMySupportTickets,
  adminGetAllTickets,
} from '../../services/api';
import LicenseGate from './LicenseGate';

const IMG_BASE = process.env.REACT_APP_SOCKET_URL
  || (window.location.protocol + '//' + window.location.hostname + ':5000');

const NAV_GROUPS = [
  {
    label: null, // no header for top-level
    module: null,
    items: [
      { to: '/dashboard', icon: 'DB', label: 'Dashboard', perm: 'dashboard' },
    ],
  },
  {
    label: 'POS / Orders',
    module: 'base',
    items: [
      { to: '/pos',      icon: 'POS', label: 'POS / Orders',    perm: 'pos', badgeKey: 'orders' },
      { to: '/kitchen',  icon: 'KDS', label: 'Kitchen Display', perm: 'kitchen' },
      { to: '/orders',   icon: 'ORD', label: 'Order History',   perm: 'pos', badgeKey: 'orders' },
    ],
  },
  {
    label: 'Shift Management',
    module: null,
    items: [
      { to: '/my-shift',           icon: 'MS',  label: 'My Shift',           perm: 'pos' },
      { to: '/shift-management',   icon: 'SM',  label: 'Shift Management',   perm: 'shift_management' },
      { to: '/shift-sales-report', icon: 'SSR', label: 'Shift Sales Report', perm: 'shift_management' },
    ],
  },
  {
    label: 'Tables',
    module: 'tables',
    items: [
      { to: '/tables',        icon: 'TBL', label: 'Tables',       perm: 'tables' },
      { to: '/reservations',  icon: 'RES', label: 'Reservations', perm: 'tables' },
    ],
  },
  {
    label: 'Inventory',
    module: 'inventory',
    items: [
      { to: '/inventory', icon: 'INV', label: 'Inventory',       perm: 'inventory' },
      { to: '/recipes',   icon: 'RCP', label: 'Recipes',         perm: 'recipes' },
      { to: '/menu-mgmt', icon: 'MENU',  label: 'Menu Management', perm: 'settings' },
    ],
  },
  {
    label: 'Staff',
    module: 'staff',
    items: [
      { to: '/employees',  icon: 'EMP', label: 'Employees',  perm: 'employees' },
      { to: '/attendance', icon: 'ATT', label: 'Attendance', perm: 'attendance' },
    ],
  },
  {
    label: 'Rider Delivery',
    module: 'rider',
    items: [
      { to: '/delivery',          icon: 'DEL', label: 'Online Delivery',   perm: 'pos' },
      { to: '/phone-orders',      icon: 'PH', label: 'Phone Orders',      perm: 'pos' },
      { to: '/rider',             icon: 'RID', label: 'My Deliveries',     perm: 'rider' },
      { to: '/collections',       icon: 'COL', label: 'Collections',       perm: 'pos' },
      { to: '/daily-audit',       icon: 'AUD',  label: 'Daily Audit',       perm: 'pos' },
      { to: '/incentives',        icon: 'INC', label: 'Rider Incentives',  perm: 'employees' },
      { to: '/rider-reports',     icon: 'RR', label: 'Rider Reports',     perm: 'pos' },
      { to: '/delivery-pricing',  icon: 'DP', label: 'Delivery Pricing',  perm: 'settings' },
    ],
  },
  {
    label: 'Reports',
    module: 'reports',
    items: [
      { to: '/reports',            icon: 'RPT', label: 'Reports',            perm: 'pos' },
    ],
  },
  {
    label: 'General Ledger',
    module: 'gl',
    items: [
      { to: '/ledger',     icon: 'GL', label: 'General Ledger', perm: 'gl' },
      { to: '/gl-setup',   icon: 'GLS', label: 'GL Setup',       perm: 'gl' },
      { to: '/gl-reports', icon: 'GLR', label: 'GL Reports',     perm: 'gl' },
    ],
  },
  {
    label: 'Support',
    module: 'support',
    items: [
      { to: '/support', icon: 'SUP', label: 'Support Tickets', perm: null, badgeKey: 'support' },
    ],
  },
  {
    label: 'System',
    module: null,
    items: [
      { to: '/branches',        icon: 'BR', label: 'My Branch / Group',  perm: null },
      { to: '/group-dashboard', icon: 'GD', label: 'Group Dashboard',    perm: 'settings' },
      { to: '/subscriptions',   icon: 'SUB', label: 'My Subscriptions',   perm: null },
      { to: '/alerts',        icon: 'ALT', label: 'Alerts',              perm: null },
      { to: '/admin',              icon: 'ADM', label: 'Admin Panel',      superAdmin: true },
      { to: '/company-groups',     icon: 'CG',  label: 'Company Groups',   superAdmin: true },
      { to: '/module-pricing',     icon: 'MP', label: 'Module Pricing',   superAdmin: true },
      { to: '/subscription-mgmt',  icon: 'SMG', label: 'Subscriptions',    superAdmin: true },
      { to: '/admin-support',      icon: 'AS', label: 'Support Tickets',  superAdmin: true, badgeKey: 'adminSupport' },
      { to: '/discount-presets', icon: 'DISC', label: 'Discount Presets',   perm: 'settings' },
      { to: '/system',           icon: 'SYS',  label: 'System',             perm: 'settings' },
      { to: '/settings',         icon: 'SET', label: 'Settings',           perm: 'settings' },
    ],
  },
];

const INCOMPLETE_ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'served', 'picked', 'out_for_delivery'];
const needsSupportReview = (ticket) => ticket && ticket.status !== 'resolved';

const formatBadgeCount = (count) => count > 99 ? '99+' : String(count);
const reviewLink = (item, count) => {
  if (!count) return item.to;
  if (item.badgeKey === 'orders' && item.to === '/orders') return `${item.to}?review=1`;
  if (item.badgeKey === 'support' && item.to === '/support') return `${item.to}?review=1`;
  if (item.badgeKey === 'adminSupport' && item.to === '/admin-support') return `${item.to}?review=1`;
  return item.to;
};

export default function Layout({ children }) {
  const { user, logout, hasPermission, hasModule } = useAuth();
  const { connected }                   = useSocket();
  const { mode, theme: T, toggle }      = useTheme();
  const navigate                        = useNavigate();
  const [collapsed, setCollapsed]       = useState(false);
  const [logoUrl,   setLogoUrl]         = useState(null);
  const [basePricing, setBasePricing]   = useState([]);
  const [badgeCounts, setBadgeCounts]   = useState({ orders: 0, support: 0, adminSupport: 0 });

  useEffect(() => {
    if (!user?.isSuperAdmin && hasPermission('settings')) {
      getRestaurantSettings().then(r => {
        if (r.data?.logo_url) setLogoUrl(r.data.logo_url);
      }).catch(() => {});
    }
  }, [user]);

  // Load pricing for LicenseGate if base is expired
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
        ])
          .then(([ordersRes, phoneRes]) => {
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
    if (!group.module) return true;           // no module restriction
    if (user?.isSuperAdmin) return true;
    return hasModule(group.module);
  };

  const getBadgeCount = (item) => item.badgeKey ? Number(badgeCounts[item.badgeKey] || 0) : 0;
  const getGroupBadgeCount = (group) => {
    const keys = new Set(group.items.map(item => item.badgeKey).filter(Boolean));
    return [...keys].reduce((sum, key) => sum + Number(badgeCounts[key] || 0), 0);
  };

  const visibleGroups = NAV_GROUPS
    .filter(canSeeGroup)
    .map(g => ({ ...g, items: g.items.filter(canSee) }))
    .filter(g => g.items.length > 0);

  // Track which groups are open; default all open
  const [openGroups, setOpenGroups] = useState(() =>
    Object.fromEntries(NAV_GROUPS.filter(g => g.label).map(g => [g.label, false]))
  );
  const toggleGroup = (label) => setOpenGroups(p => ({ ...p, [label]: !p[label] }));

  const W = collapsed ? 64 : 220;
  const isLight = mode === 'light';

  if (baseExpired) {
    return <LicenseGate moduleKey="base" moduleName="RestaurantOS Base" pricing={basePricing} />;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: T.bg, fontFamily: "'Inter', sans-serif", transition: 'background 0.3s' }}>

      {/* Layout section */}
      <aside style={{
        width: W, minHeight: '100vh', background: isLight ? T.card : T.surface,
        borderRight: `1px solid ${T.border}`,
        display: 'flex', flexDirection: 'column',
        position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 100,
        transition: 'width 0.2s ease, background 0.3s, border-color 0.3s',
        overflow: 'hidden',
      }}>

        {/* Logo */}
        <div style={{ padding: '20px 16px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            onClick={() => setCollapsed(c => !c)}
            style={{ width: 36, height: 36, borderRadius: 10, background: T.accent, color: isLight ? '#fff' : '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, cursor: 'pointer', overflow: 'hidden', fontWeight: 900 }}
          >
            {logoUrl
              ? <img src={logoUrl.startsWith('http') ? logoUrl : `${IMG_BASE}${logoUrl}`} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} />
              : 'RO'
            }
          </div>
          {!collapsed && (
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: T.text, whiteSpace: 'nowrap' }}>RestaurantOS</div>
              <div style={{ fontSize: 9, color: T.textMid, letterSpacing: 1 }}>SAAS PLATFORM</div>
            </div>
          )}
        </div>

        {/* Restaurant chip */}
        {!collapsed && user && (
          <div style={{ padding: '10px 12px 4px' }}>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
              {logoUrl && (
                <div style={{ width: 28, height: 28, borderRadius: 8, overflow: 'hidden', flexShrink: 0, border: `1px solid ${T.border}` }}>
                  <img src={logoUrl.startsWith('http') ? logoUrl : `${IMG_BASE}${logoUrl}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user.restaurantName || 'Super Admin'}
                </div>
                <div style={{ fontSize: 10, color: T.accent }}>
                  {connected ? 'Live' : 'Offline'} {'/'} {user.role}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav style={{ flex: 1, padding: '8px 10px', overflowY: 'auto' }}>
          {visibleGroups.map((group, gi) => {
            const isOpen = !group.label || collapsed || openGroups[group.label] !== false;
            const groupBadgeCount = getGroupBadgeCount(group);
            return (
              <div key={gi} style={{ marginBottom: 2 }}>

                {/* Layout section */}
                {!collapsed && group.label && (
                  <div
                    onClick={() => toggleGroup(group.label)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 10px 5px',
                      marginTop: gi === 0 ? 0 : 6,
                      cursor: 'pointer',
                      borderRadius: 8,
                      userSelect: 'none',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = T.card}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        color: T.textMid,
                        letterSpacing: 0.6,
                        textTransform: 'uppercase',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {group.label}
                      </span>
                      {groupBadgeCount > 0 && (
                        <span
                          title={`${groupBadgeCount} waiting for review`}
                          style={{
                            minWidth: 18,
                            height: 18,
                            padding: '0 5px',
                            borderRadius: 999,
                            background: T.red || '#E74C3C',
                            color: '#fff',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 10,
                            fontWeight: 900,
                            lineHeight: 1,
                            boxShadow: isLight ? '0 4px 10px rgba(231,76,60,0.28)' : '0 0 0 1px rgba(255,255,255,0.14)',
                          }}
                        >
                          {formatBadgeCount(groupBadgeCount)}
                        </span>
                      )}
                    </span>
                    <span style={{
                      fontSize: 10, color: T.textDim,
                      transition: 'transform 0.2s',
                      display: 'inline-block',
                      transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                    }}>&gt;</span>
                  </div>
                )}

                {/* Layout section */}
                {collapsed && gi > 0 && (
                  <div style={{ height: 1, background: T.border, margin: '4px 6px' }} />
                )}

                {/* Layout section */}
                {isOpen && group.items.map(item => {
                  const itemBadgeCount = getBadgeCount(item);
                  return (
                    <NavLink key={item.to} to={reviewLink(item, itemBadgeCount)} style={({ isActive }) => ({
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: collapsed ? '10px 14px' : '7px 10px',
                      borderRadius: 8, marginBottom: 1,
                      background: isActive ? (isLight ? T.accent : T.accentGlow) : 'transparent',
                      color: isActive ? (isLight ? '#fff' : T.accent) : T.textMid,
                      fontSize: 13, fontWeight: isActive ? 700 : 500,
                      border: `1px solid ${isActive ? (isLight ? T.accent : T.accent + '55') : 'transparent'}`,
                      textDecoration: 'none', whiteSpace: 'nowrap',
                      transition: 'all 0.15s',
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      position: 'relative',
                    })}>
                      <span style={{ fontSize: 10, flexShrink: 0, fontWeight: 900, minWidth: 28, textAlign: 'center' }}>{item.icon}</span>
                      {!collapsed && (
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
                      )}
                      {itemBadgeCount > 0 && (
                        <span
                          title={`${itemBadgeCount} waiting for review`}
                          style={{
                            minWidth: collapsed ? 16 : 20,
                            height: collapsed ? 16 : 20,
                            padding: collapsed ? 0 : '0 6px',
                            borderRadius: 999,
                            background: T.red || '#E74C3C',
                            color: '#fff',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: collapsed ? 9 : 10,
                            fontWeight: 900,
                            lineHeight: 1,
                            flexShrink: 0,
                            position: collapsed ? 'absolute' : 'static',
                            top: collapsed ? 2 : 'auto',
                            right: collapsed ? 4 : 'auto',
                            boxShadow: isLight ? '0 4px 10px rgba(231,76,60,0.28)' : '0 0 0 1px rgba(255,255,255,0.16)',
                          }}
                        >
                          {formatBadgeCount(itemBadgeCount)}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Dark/Light toggle + user */}
        <div style={{ padding: '0 10px 16px', borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>

          {/* Theme toggle */}
          <div
            onClick={toggle}
            title={`Switch to ${isLight ? 'dark' : 'light'} mode`}
            style={{
              display: 'flex', alignItems: 'center',
              gap: collapsed ? 0 : 10,
              padding: '8px 10px', borderRadius: 10, cursor: 'pointer',
              marginBottom: 8,
              background: T.card, border: `1px solid ${T.border}`,
              transition: 'all 0.2s', justifyContent: collapsed ? 'center' : 'flex-start',
            }}
          >
            {/* Toggle track */}
            <div style={{
              width: 36, height: 20, borderRadius: 10, flexShrink: 0,
              background: isLight ? T.accent : T.border,
              position: 'relative', transition: 'background 0.3s',
            }}>
              <div style={{
                width: 14, height: 14, borderRadius: '50%', background: '#fff',
                position: 'absolute', top: 3,
                left: isLight ? 19 : 3,
                transition: 'left 0.25s',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9,
              }}>
                {isLight ? 'L' : 'D'}
              </div>
            </div>
            {!collapsed && (
              <span style={{ fontSize: 12, color: T.textMid, fontWeight: 600 }}>
                {isLight ? 'Light Mode' : 'Dark Mode'}
              </span>
            )}
          </div>

          {/* User */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: T.card, border: `1px solid ${T.border}` }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: isLight ? '#fff' : '#000', fontWeight: 800, flexShrink: 0 }}>
              {user?.name?.[0] || 'U'}
            </div>
            {!collapsed && (
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</div>
                <button onClick={handleLogout} style={{ background: 'none', color: T.textMid, fontSize: 11, padding: 0, cursor: 'pointer', border: 'none', fontFamily: "'Inter', sans-serif" }}>
                  Sign out -&gt;
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Layout section */}
      <main style={{ marginLeft: W, flex: 1, padding: isLight ? 24 : 28, minHeight: '100vh', background: T.bg, transition: 'margin-left 0.2s ease, background 0.3s' }}>
        {children}
      </main>
    </div>
  );
}
