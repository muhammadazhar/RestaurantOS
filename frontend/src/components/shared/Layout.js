import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useTheme } from '../../context/ThemeContext';
import { getRestaurantSettings } from '../../services/api';
import toast from 'react-hot-toast';
import LicenseGate from './LicenseGate';

const IMG_BASE = process.env.REACT_APP_SOCKET_URL
  || (window.location.protocol + '//' + window.location.hostname + ':5000');

const NAV_GROUPS = [
  {
    label: null, // no header for top-level
    module: null,
    items: [
      { to: '/dashboard', icon: '⬛', label: 'Dashboard', perm: 'dashboard' },
    ],
  },
  {
    label: 'POS / Orders',
    module: 'base',
    items: [
      { to: '/pos',      icon: '📲', label: 'POS / Orders',    perm: 'pos' },
      { to: '/kitchen',  icon: '👨‍🍳', label: 'Kitchen Display', perm: 'kitchen' },
      { to: '/orders',   icon: '🧾', label: 'Order History',   perm: 'pos' },
      { to: '/my-shift', icon: '⏱',  label: 'My Shift',        perm: 'pos' },
    ],
  },
  {
    label: 'Tables',
    module: 'tables',
    items: [
      { to: '/tables',        icon: '🪑', label: 'Tables',       perm: 'tables' },
      { to: '/reservations',  icon: '📅', label: 'Reservations', perm: 'tables' },
    ],
  },
  {
    label: 'Inventory',
    module: 'inventory',
    items: [
      { to: '/inventory', icon: '📦', label: 'Inventory',       perm: 'inventory' },
      { to: '/recipes',   icon: '📋', label: 'Recipes',         perm: 'recipes' },
      { to: '/menu-mgmt', icon: '🍽',  label: 'Menu Management', perm: 'settings' },
    ],
  },
  {
    label: 'Staff',
    module: 'staff',
    items: [
      { to: '/employees',  icon: '👥', label: 'Employees',  perm: 'employees' },
      { to: '/attendance', icon: '🕐', label: 'Attendance', perm: 'attendance' },
    ],
  },
  {
    label: 'Rider Delivery',
    module: 'rider',
    items: [
      { to: '/delivery',      icon: '🛵', label: 'Online Delivery',  perm: 'pos' },
      { to: '/rider',         icon: '🏍', label: 'My Deliveries',    perm: 'rider' },
      { to: '/collections',   icon: '💵', label: 'Collections',      perm: 'pos' },
      { to: '/daily-audit',   icon: '🗒',  label: 'Daily Audit',      perm: 'pos' },
      { to: '/incentives',    icon: '🏆', label: 'Rider Incentives', perm: 'employees' },
      { to: '/rider-reports', icon: '📈', label: 'Rider Reports',    perm: 'pos' },
    ],
  },
  {
    label: 'Reports',
    module: 'reports',
    items: [
      { to: '/reports',            icon: '📊', label: 'Reports',            perm: 'pos' },
      { to: '/shift-sales-report', icon: '🕑', label: 'Shift Sales Report', perm: 'pos' },
    ],
  },
  {
    label: 'General Ledger',
    module: 'gl',
    items: [
      { to: '/ledger',     icon: '📒', label: 'General Ledger', perm: 'gl' },
      { to: '/gl-setup',   icon: '🔗', label: 'GL Setup',       perm: 'gl' },
      { to: '/gl-reports', icon: '📋', label: 'GL Reports',     perm: 'gl' },
    ],
  },
  {
    label: 'System',
    module: null,
    items: [
      { to: '/branches',        icon: '🏪', label: 'My Branch / Group',  perm: null },
      { to: '/group-dashboard', icon: '📊', label: 'Group Dashboard',    perm: 'settings' },
      { to: '/subscriptions',   icon: '🏷️', label: 'My Subscriptions',   perm: null },
      { to: '/alerts',        icon: '🔔', label: 'Alerts',              perm: null },
      { to: '/admin',              icon: '🏢', label: 'Admin Panel',      superAdmin: true },
      { to: '/company-groups',     icon: '🏗',  label: 'Company Groups',   superAdmin: true },
      { to: '/module-pricing',     icon: '💰', label: 'Module Pricing',   superAdmin: true },
      { to: '/subscription-mgmt',  icon: '📋', label: 'Subscriptions',    superAdmin: true },
      { to: '/system',        icon: '🖥',  label: 'System',              perm: 'settings' },
      { to: '/settings',      icon: '⚙️', label: 'Settings',            perm: 'settings' },
    ],
  },
];

export default function Layout({ children }) {
  const { user, logout, hasPermission, hasModule } = useAuth();
  const { connected }                   = useSocket();
  const { mode, theme: T, toggle }      = useTheme();
  const navigate                        = useNavigate();
  const [collapsed, setCollapsed]       = useState(false);
  const [logoUrl,   setLogoUrl]         = useState(null);
  const [basePricing, setBasePricing]   = useState([]);

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

  const visibleGroups = NAV_GROUPS
    .filter(canSeeGroup)
    .map(g => ({ ...g, items: g.items.filter(canSee) }))
    .filter(g => g.items.length > 0);

  // Track which groups are open; default all open
  const [openGroups, setOpenGroups] = useState(() =>
    Object.fromEntries(NAV_GROUPS.filter(g => g.label).map(g => [g.label, true]))
  );
  const toggleGroup = (label) => setOpenGroups(p => ({ ...p, [label]: !p[label] }));

  const W = collapsed ? 64 : 220;
  const isLight = mode === 'light';

  if (baseExpired) {
    return <LicenseGate moduleKey="base" moduleName="RestaurantOS Base" pricing={basePricing} />;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: T.bg, fontFamily: "'Inter', sans-serif", transition: 'background 0.3s' }}>

      {/* ── Sidebar ── */}
      <aside style={{
        width: W, minHeight: '100vh', background: T.surface,
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
            style={{ width: 36, height: 36, borderRadius: 10, background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, cursor: 'pointer', overflow: 'hidden' }}
          >
            {logoUrl
              ? <img src={logoUrl.startsWith('http') ? logoUrl : `${IMG_BASE}${logoUrl}`} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} />
              : '🍽'
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
                  {connected ? '● Live' : '○ Offline'} · {user.role}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav style={{ flex: 1, padding: '8px 10px', overflowY: 'auto' }}>
          {visibleGroups.map((group, gi) => {
            const isOpen = !group.label || collapsed || openGroups[group.label] !== false;
            return (
              <div key={gi} style={{ marginBottom: 2 }}>

                {/* ── Group header (expanded sidebar only) ── */}
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
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      color: T.textMid,
                      letterSpacing: 0.6,
                      textTransform: 'uppercase',
                    }}>
                      {group.label}
                    </span>
                    <span style={{
                      fontSize: 10, color: T.textDim,
                      transition: 'transform 0.2s',
                      display: 'inline-block',
                      transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                    }}>›</span>
                  </div>
                )}

                {/* ── Collapsed sidebar: thin divider between groups ── */}
                {collapsed && gi > 0 && (
                  <div style={{ height: 1, background: T.border, margin: '4px 6px' }} />
                )}

                {/* ── Nav items (hidden when group collapsed) ── */}
                {isOpen && group.items.map(item => (
                  <NavLink key={item.to} to={item.to} style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: collapsed ? '10px 14px' : '7px 10px',
                    borderRadius: 8, marginBottom: 1,
                    background: isActive ? T.accentGlow : 'transparent',
                    color: isActive ? T.accent : T.textMid,
                    fontSize: 13, fontWeight: isActive ? 700 : 500,
                    border: `1px solid ${isActive ? T.accent + '55' : 'transparent'}`,
                    textDecoration: 'none', whiteSpace: 'nowrap',
                    transition: 'all 0.15s',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                  })}>
                    <span style={{ fontSize: 15, flexShrink: 0 }}>{item.icon}</span>
                    {!collapsed && item.label}
                  </NavLink>
                ))}
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
                {isLight ? '☀️' : '🌙'}
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
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#000', fontWeight: 800, flexShrink: 0 }}>
              {user?.name?.[0] || 'U'}
            </div>
            {!collapsed && (
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</div>
                <button onClick={handleLogout} style={{ background: 'none', color: T.textMid, fontSize: 11, padding: 0, cursor: 'pointer', border: 'none', fontFamily: "'Inter', sans-serif" }}>
                  Sign out →
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main style={{ marginLeft: W, flex: 1, padding: 28, minHeight: '100vh', transition: 'margin-left 0.2s ease, background 0.3s' }}>
        {children}
      </main>
    </div>
  );
}
