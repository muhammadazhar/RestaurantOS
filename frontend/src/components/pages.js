import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';

// API — one level up from components/
import {
  getOrders,
  updateOrderStatus,
  getTables as apiGetTables,
  createTable,
  updateTable,
  deleteTable,
  updateTableStatus,
  createOvertimeAlert,
  getRestaurantSettings,
  getInventory,
  updateStock,
  getNotifications,
  markNotificationsRead,
  getAllRestaurants,
  getPlatformStats,
  registerRestaurant,
} from '../services/api';

// Shared UI — sibling folder
import {
  Card,
  Badge,
  Spinner,
  Btn,
  Modal,
  Input,
  Select,
  PageHeader,
  StatCard,
  Table as UITable,
  T,
  useT,
} from './shared/UI';

// Socket context — one level up
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../context/ThemeContext';
import TableBill from './tables/TableBill';

// ─────────────────────────────────────────────────────────────────────────────
// KITCHEN DISPLAY
// ─────────────────────────────────────────────────────────────────────────────
const PHASES      = ['pending', 'preparing', 'ready'];
const PHASE_COLOR = { pending: T.blue, preparing: T.accent, ready: T.green };
const NEXT        = { pending: 'preparing', preparing: 'ready', ready: 'served' };

export function Kitchen() {
  const [orders,  setOrders]  = useState([]);
  const [loading, setLoading] = useState(true);
  const { on, off } = useSocket();

  // useCallback keeps the same function reference so socket listeners
  // attach/detach correctly and do not silently become stale
  const load = React.useCallback(() => {
    getOrders({ status: 'pending,preparing,ready' })
      .then(r => setOrders(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    on('new_order',     load);
    on('order_updated', load);
    return () => { off('new_order', load); off('order_updated', load); };
  }, [load, on, off]);

  const advance = async (order) => {
    // Delivery orders stop at 'ready' — rider picks them up, not kitchen
    if (order.status === 'ready' && order.order_type === 'delivery') return;
    const next = NEXT[order.status];
    if (!next) return;
    try {
      await updateOrderStatus(order.id, next);
      toast.success(`Order ${order.order_number} advanced`);
      load();
    } catch {
      toast.error('Failed to update order');
    }
  };

  const elapsed = (d) => {
    const mins = Math.floor((Date.now() - new Date(d)) / 60000);
    return `${mins}min`;
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 4 }}>
        Kitchen Display
      </h1>
      <p style={{ color: T.textMid, fontSize: 13, marginBottom: 24 }}>
        Live order queue — click a card to advance its status
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        {PHASES.map(phase => (
          <div key={phase}>
            <div style={{
              fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
              color: PHASE_COLOR[phase], fontWeight: 700, marginBottom: 12,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: PHASE_COLOR[phase] }} />
              {phase} ({orders.filter(o => o.status === phase).length})
            </div>
            {orders.filter(o => o.status === phase).map(o => {
              const isDelivery = o.order_type === 'delivery';
              const isReadyDelivery = phase === 'ready' && isDelivery;
              return (
                <Card
                  key={o.id}
                  onClick={() => advance(o)}
                  style={{ marginBottom: 12, borderLeft: `3px solid ${PHASE_COLOR[phase]}`, cursor: isReadyDelivery ? 'default' : 'pointer', padding: 16 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: 14, color: T.text }}>
                      {o.order_number}
                    </span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {isDelivery && <Badge color="#3498DB" small>🏍 Delivery</Badge>}
                      <Badge color={PHASE_COLOR[phase]} small>{elapsed(o.created_at)}</Badge>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: T.textMid, marginBottom: 10 }}>
                    {o.table_label ? `Table ${o.table_label}` : isDelivery ? o.customer_name || 'Delivery' : 'Online'} {o.server_name ? `· ${o.server_name}` : ''}
                  </div>
                  {(o.items || []).map((item, i) => (
                    <div key={i} style={{ fontSize: 12, padding: '4px 0', borderBottom: `1px solid ${T.border}`, color: T.text }}>
                      <span style={{ color: PHASE_COLOR[phase] }}>• </span>
                      {item.name} x{item.quantity}
                    </div>
                  ))}
                  <div style={{ marginTop: 10 }}>
                    {isReadyDelivery ? (
                      <div style={{ width: '100%', padding: '7px 0', textAlign: 'center', borderRadius: 8, background: '#3498DB22', border: '1px solid #3498DB', color: '#3498DB', fontSize: 12, fontWeight: 700 }}>
                        🏍 Awaiting Rider Pickup
                      </div>
                    ) : (
                      <Btn size="sm" style={{
                        width: '100%',
                        background: PHASE_COLOR[phase],
                        color: phase === 'preparing' ? '#000' : '#fff',
                        border: 'none',
                      }}>
                        {phase === 'pending' ? 'Start Cooking' : phase === 'preparing' ? 'Mark Ready' : 'Mark Served'}
                      </Btn>
                    )}
                  </div>
                </Card>
              );
            })}
            {orders.filter(o => o.status === phase).length === 0 && (
              <div style={{ textAlign: 'center', padding: 24, color: T.textDim, fontSize: 13 }}>No orders</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TABLE VIEW
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_COLOR = { occupied: T.red, vacant: T.green, reserved: T.blue, cleaning: T.textMid };
const STATUS_BG    = {
  occupied: 'rgba(239,68,68,0.14)', vacant: 'rgba(46,204,113,0.12)',
  reserved: 'rgba(52,152,219,0.12)', cleaning: 'rgba(74,85,104,0.2)',
};

// Kitchen order_status → display config
const TABLE_SETUP_PRESETS = [
  {
    label: 'Small cafe (6)',
    tables: Array.from({ length: 6 }, (_, i) => ({
      label: `T-0${i + 1}`,
      section: 'Main Hall',
      capacity: i < 2 ? 2 : 4,
    })),
  },
  {
    label: 'Mid-size (12)',
    tables: [
      ...Array.from({ length: 6 }, (_, i) => ({ label: `T-0${i + 1}`, section: 'Main Hall', capacity: 4 })),
      ...Array.from({ length: 4 }, (_, i) => ({ label: `T-${i + 7}`, section: 'Terrace', capacity: 4 })),
      ...Array.from({ length: 2 }, (_, i) => ({ label: `T-V${i + 1}`, section: 'VIP', capacity: 6 })),
    ],
  },
  {
    label: 'Large (20)',
    tables: [
      ...Array.from({ length: 10 }, (_, i) => ({ label: `T-${String(i + 1).padStart(2, '0')}`, section: 'Main Hall', capacity: 4 })),
      ...Array.from({ length: 6 }, (_, i) => ({ label: `T-${String(i + 11).padStart(2, '0')}`, section: 'Terrace', capacity: 4 })),
      ...Array.from({ length: 4 }, (_, i) => ({ label: `T-V${i + 1}`, section: 'VIP', capacity: 6 })),
    ],
  },
];

const KITCHEN_PHASE = {
  pending:    { label: 'Waiting',    color: '#6B7280', icon: '⏳' },
  confirmed:  { label: 'Confirmed',  color: '#6B7280', icon: '✓'  },
  preparing:  { label: 'Preparing',  color: '#F5A623', icon: '👨‍🍳' },
  ready:      { label: 'Food Ready', color: '#2ECC71', icon: '✅' },
  served:     { label: 'Served',     color: '#3498DB', icon: '🍽' },
};

const isReservationExpired = (t) => {
  if (!t.reserved_at || !t.reservation_duration_min) return false;
  const expiry = new Date(t.reserved_at).getTime() + t.reservation_duration_min * 60000;
  return Date.now() > expiry;
};

const getElapsedMinutes = (t) =>
  t.order_started ? Math.floor((Date.now() - new Date(t.order_started)) / 60000) : 0;

const fmtElapsed = (mins) => {
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

// eslint-disable-next-line no-unused-vars
function TablesLegacy() {
  const [tables,        setTables]        = useState([]);
  const [selected,      setSelected]      = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [billTable,     setBillTable]     = useState(null);
  const [overtimeHours, setOvertimeHours] = useState(2);
  const overtimeAlerted = useRef(new Set());
  const tablesRef       = useRef([]);
  const { on, off } = useSocket();

  const load = useCallback(() => {
    apiGetTables().then(r => {
      setTables(r.data);
      tablesRef.current = r.data;
    }).finally(() => setLoading(false));
  }, []);

  // Load tables + settings on mount
  useEffect(() => {
    load();
    getRestaurantSettings().then(r => {
      if (r.data?.table_overtime_hours) setOvertimeHours(Number(r.data.table_overtime_hours));
    }).catch(() => {});
    on('table_updated', load);
    on('overtime_alert', load);
    return () => { off('table_updated', load); off('overtime_alert', load); };
  }, [load, on, off]);

  // Check for overtime tables every 60 s
  useEffect(() => {
    overtimeAlerted.current.clear(); // reset when threshold changes
    const check = () => {
      tablesRef.current.forEach(t => {
        if (t.status !== 'occupied' || !t.order_started) return;
        const elapsed = getElapsedMinutes(t);
        if (elapsed < overtimeHours * 60) return;
        if (overtimeAlerted.current.has(t.id)) return;
        overtimeAlerted.current.add(t.id);
        toast.error(`⏰ Table ${t.label} has been occupied for ${fmtElapsed(elapsed)}!`, { duration: 10000, id: `ot-${t.id}` });
        createOvertimeAlert(t.id, { tableLabel: t.label, elapsedMinutes: elapsed, thresholdHours: overtimeHours }).catch(() => {});
      });
    };
    check();
    const timer = setInterval(check, 60000);
    return () => clearInterval(timer);
  }, [overtimeHours]);

  const summary      = (status) => tables.filter(t => t.status === status).length;
  const sections     = [...new Set(tables.map(t => t.section))];
  const overtimeCount = tables.filter(t => t.status === 'occupied' && getElapsedMinutes(t) >= overtimeHours * 60).length;
  const noShowCount   = tables.filter(t => t.status === 'reserved' && isReservationExpired(t)).length;
  const foodReadyCount = tables.filter(t => t.order_status === 'ready').length;

  if (loading) return <Spinner />;

  return (
    <>
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 4 }}>Table Management</h1>

      {/* Summary pills */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {[['Occupied','occupied'],['Vacant','vacant'],['Reserved','reserved'],['Cleaning','cleaning']].map(([l, k]) => (
          <div key={k} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[k] }} />
            <span style={{ fontSize: 13, color: T.textMid }}>{l}</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: STATUS_COLOR[k], fontFamily: 'monospace' }}>{summary(k)}</span>
          </div>
        ))}
        {foodReadyCount > 0 && (
          <div style={{ background: 'rgba(46,204,113,0.12)', border: `1px solid ${T.green}44`, borderRadius: 12, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 15 }}>✅</span>
            <span style={{ fontSize: 13, color: T.green, fontWeight: 700 }}>Food Ready</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: T.green, fontFamily: 'monospace' }}>{foodReadyCount}</span>
          </div>
        )}
        {overtimeCount > 0 && (
          <div style={{ background: T.redDim, border: `1px solid ${T.red}44`, borderRadius: 12, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 15 }}>⏰</span>
            <span style={{ fontSize: 13, color: T.red, fontWeight: 700 }}>Overtime</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: T.red, fontFamily: 'monospace' }}>{overtimeCount}</span>
          </div>
        )}
        {noShowCount > 0 && (
          <div style={{ background: T.redDim, border: `1px solid ${T.red}44`, borderRadius: 12, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 15 }}>❌</span>
            <span style={{ fontSize: 13, color: T.red, fontWeight: 700 }}>No-Show</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: T.red, fontFamily: 'monospace' }}>{noShowCount}</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1 }}>
          {sections.map(sec => (
            <div key={sec} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: T.textMid, fontWeight: 700, marginBottom: 12 }}>{sec}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px,1fr))', gap: 10 }}>
                {tables.filter(t => t.section === sec).map(t => {
                  const elapsed    = t.status === 'occupied' ? getElapsedMinutes(t) : 0;
                  const overdue    = t.status === 'occupied' && elapsed >= overtimeHours * 60;
                  const expired    = t.status === 'reserved' && isReservationExpired(t);
                  const kPhase     = t.order_status ? KITCHEN_PHASE[t.order_status] : null;
                  const color      = overdue ? T.red : expired ? T.red : STATUS_COLOR[t.status];
                  const bg         = overdue ? T.redDim : expired ? T.redDim : STATUS_BG[t.status];
                  const isActive   = selected && selected.id === t.id;
                  return (
                    <div key={t.id} onClick={() => setSelected(isActive ? null : t)} style={{
                      background: bg,
                      border: `2px solid ${isActive ? color : color + '55'}`,
                      borderRadius: 14, padding: 14, cursor: 'pointer', transition: 'all 0.2s',
                      transform: isActive ? 'scale(1.04)' : 'scale(1)',
                      boxShadow: (overdue || expired) ? `0 0 0 1px ${T.red}44` : 'none',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontWeight: 800, color, fontFamily: 'monospace' }}>{t.label}</span>
                        <span style={{ fontSize: 16 }}>
                          {overdue ? '🔴' : expired ? '❌' : t.status === 'occupied' ? (kPhase?.icon || '👥') : t.status === 'reserved' ? '📌' : t.status === 'cleaning' ? '🧹' : '✓'}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: T.textMid }}>Seats: {t.capacity}</div>
                      {t.status === 'occupied' && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: T.text, marginTop: 4 }}>{t.order_number}</div>
                          {kPhase && (
                            <div style={{ fontSize: 10, fontWeight: 700, color: kPhase.color, marginTop: 3 }}>
                              {kPhase.icon} {kPhase.label}
                            </div>
                          )}
                          <div style={{ fontSize: 10, fontWeight: overdue ? 800 : 500, color: overdue ? T.red : T.textMid, marginTop: 2 }}>
                            {overdue ? '⏰' : '🕐'} {fmtElapsed(elapsed)}{overdue && ' OVERTIME'}
                          </div>
                          {t.total_amount > 0 && (
                            <div style={{ marginTop: 5, background: overdue ? `${T.red}22` : T.accentGlow, borderRadius: 6, padding: '3px 6px', display: 'inline-block' }}>
                              <span style={{ fontSize: 11, fontWeight: 800, color: overdue ? T.red : T.accent, fontFamily: 'monospace' }}>
                                PKR {Number(t.total_amount).toLocaleString()}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      {t.status === 'reserved' && (
                        <div style={{ marginTop: 4 }}>
                          {expired
                            ? <div style={{ fontSize: 10, fontWeight: 800, color: T.red }}>❌ NO SHOW — {new Date(t.reserved_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
                            : <div style={{ fontSize: 10, color: T.blue }}>📅 {t.reservation_guest} · {new Date(t.reserved_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
                          }
                        </div>
                      )}
                      {t.status === 'vacant' && <div style={{ fontSize: 10, color: T.green, marginTop: 4 }}>Available</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Detail panel */}
        {selected && (() => {
          const elapsed  = selected.status === 'occupied' ? getElapsedMinutes(selected) : 0;
          const overdue  = selected.status === 'occupied' && elapsed >= overtimeHours * 60;
          const expired  = selected.status === 'reserved' && isReservationExpired(selected);
          const kPhase   = selected.order_status ? KITCHEN_PHASE[selected.order_status] : null;
          const color    = overdue || expired ? T.red : STATUS_COLOR[selected.status];
          return (
            <Card style={{ width: 240, alignSelf: 'flex-start' }}>
              <div style={{ fontWeight: 800, fontSize: 16, color }}>{selected.label}</div>
              <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Badge color={color}>{selected.status}</Badge>
                {kPhase && <Badge color={kPhase.color}>{kPhase.icon} {kPhase.label}</Badge>}
                {overdue && <Badge color={T.red}>⏰ Overtime</Badge>}
                {expired && <Badge color={T.red}>❌ No-Show</Badge>}
              </div>

              <div style={{ marginTop: 16 }}>
                {[
                  ['Section',  selected.section],
                  ['Capacity', `${selected.capacity} seats`],
                  ['Order',    selected.order_number  || '---'],
                  ['Cashier',  selected.server_name   || '---'],
                  ['Waiter',   selected.waiter_name   || '---'],
                  ['Seated',   selected.status === 'occupied' ? fmtElapsed(elapsed) : '---'],
                  ['Bill',     selected.total_amount > 0 ? `PKR ${Number(selected.total_amount).toLocaleString()}` : '---'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
                    <span style={{ fontSize: 12, color: T.textMid }}>{k}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: k === 'Seated' && overdue ? T.red : T.text }}>{v}</span>
                  </div>
                ))}
                {selected.reservation_guest && (
                  <div style={{ padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ fontSize: 11, color: T.textMid, marginBottom: 2 }}>Reservation</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: expired ? T.red : T.blue }}>{selected.reservation_guest}</div>
                    <div style={{ fontSize: 11, color: T.textMid }}>{new Date(selected.reserved_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} · {selected.reservation_duration_min}min</div>
                    {expired && <div style={{ fontSize: 10, fontWeight: 700, color: T.red, marginTop: 2 }}>Guest did not arrive</div>}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selected.status === 'vacant' && (
                  <Btn onClick={async () => { await updateTableStatus(selected.id, 'occupied'); load(); setSelected(null); }}>Assign Table</Btn>
                )}
                {selected.status === 'occupied' && (
                  <>
                    {selected.order_status === 'ready' && (
                      <Btn style={{ background: T.blue, color: '#fff', border: 'none' }}
                        onClick={async () => {
                          try { await updateOrderStatus(selected.order_id, 'served'); toast.success('Marked as served'); load(); }
                          catch { toast.error('Failed'); }
                        }}>
                        🍽 Mark Served
                      </Btn>
                    )}
                    <Btn style={{ background: T.accent, color: '#000', border: 'none' }} onClick={() => setBillTable(selected)}>🧾 View Bill</Btn>
                    <Btn variant="ghost"
                      disabled={!!selected.order_id}
                      onClick={async () => { await updateTableStatus(selected.id, 'cleaning'); load(); setSelected(null); }}
                      style={{ opacity: selected.order_id ? 0.4 : 1, cursor: selected.order_id ? 'not-allowed' : 'pointer' }}
                    >
                      {selected.order_id ? '🔒 Mark Cleaning (pay first)' : '🧹 Mark Cleaning'}
                    </Btn>
                  </>
                )}
                {selected.status === 'reserved' && expired && (
                  <Btn style={{ background: T.red, color: '#fff', border: 'none' }}
                    onClick={async () => {
                      try {
                        await import('../services/api').then(api => api.updateReservation(selected.reservation_id, { status: 'no_show' }));
                        toast.success('Marked as no-show, table released');
                        load(); setSelected(null);
                      } catch { toast.error('Failed'); }
                    }}>
                    ❌ Clear Reservation
                  </Btn>
                )}
                {selected.status === 'cleaning' && (
                  <Btn style={{ background: T.green, color: '#fff', border: 'none' }}
                    onClick={async () => { await updateTableStatus(selected.id, 'vacant'); load(); setSelected(null); }}>
                    Mark Vacant
                  </Btn>
                )}
              </div>
            </Card>
          );
        })()}
      </div>
    </div>

    {/* Table Bill Modal */}
    {billTable && (
      <TableBill
        table={billTable}
        onClose={() => setBillTable(null)}
        onPaid={() => { load(); setSelected(null); }}
      />
    )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TABLE VIEW
// ─────────────────────────────────────────────────────────────────────────────
export function Tables() {
  useT();
  const { mode } = useTheme();
  const light = mode === 'light';
  const [tables,        setTables]        = useState([]);
  const [selected,      setSelected]      = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [billTable,     setBillTable]     = useState(null);
  const [overtimeHours, setOvertimeHours] = useState(2);
  const [statusFilter,  setStatusFilter]  = useState('all');
  const [sectionFilter, setSectionFilter] = useState('All');
  const [search,        setSearch]        = useState('');
  const [setupOpen,     setSetupOpen]     = useState(false);
  const [setupSaving,   setSetupSaving]   = useState(false);
  const [setupTables,   setSetupTables]   = useState([]);
  const [setupTable,    setSetupTable]    = useState({ label: '', section: 'Main Hall', capacity: 4 });
  const [editTableOpen, setEditTableOpen] = useState(false);
  const [editSaving,    setEditSaving]    = useState(false);
  const [editTableForm, setEditTableForm] = useState({ id: '', label: '', section: 'Main Hall', capacity: 4 });
  const overtimeAlerted = useRef(new Set());
  const tablesRef       = useRef([]);
  const { on, off } = useSocket();

  const load = useCallback(() => {
    apiGetTables().then(r => {
      setTables(r.data);
      tablesRef.current = r.data;
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    getRestaurantSettings().then(r => {
      if (r.data?.table_overtime_hours) setOvertimeHours(Number(r.data.table_overtime_hours));
    }).catch(() => {});
    on('table_updated', load);
    on('overtime_alert', load);
    return () => { off('table_updated', load); off('overtime_alert', load); };
  }, [load, on, off]);

  useEffect(() => {
    overtimeAlerted.current.clear();
    const check = () => {
      tablesRef.current.forEach(t => {
        if (t.status !== 'occupied' || !t.order_started) return;
        const elapsed = getElapsedMinutes(t);
        if (elapsed < overtimeHours * 60) return;
        if (overtimeAlerted.current.has(t.id)) return;
        overtimeAlerted.current.add(t.id);
        toast.error(`Table ${t.label} has been occupied for ${fmtElapsed(elapsed)}!`, { duration: 10000, id: `ot-${t.id}` });
        createOvertimeAlert(t.id, { tableLabel: t.label, elapsedMinutes: elapsed, thresholdHours: overtimeHours }).catch(() => {});
      });
    };
    check();
    const timer = setInterval(check, 60000);
    return () => clearInterval(timer);
  }, [overtimeHours]);

  const statusColor = { occupied: T.red, vacant: T.green, reserved: T.blue, cleaning: T.textMid };
  const statusBg = {
    occupied: light ? 'rgba(185,28,28,0.12)' : 'rgba(239,68,68,0.16)',
    vacant: T.greenDim,
    reserved: T.blueDim,
    cleaning: light ? T.surface : 'rgba(148,163,184,0.10)',
  };
  const summary = (status) => tables.filter(t => t.status === status).length;
  const sectionNamesAll = useMemo(() => ['All', ...new Set(tables.map(t => t.section || 'Main Floor'))], [tables]);
  const overtimeCount = tables.filter(t => t.status === 'occupied' && getElapsedMinutes(t) >= overtimeHours * 60).length;
  const noShowCount = tables.filter(t => t.status === 'reserved' && isReservationExpired(t)).length;
  const foodReadyCount = tables.filter(t => t.order_status === 'ready').length;
  const runningBills = tables.reduce((sum, t) => sum + Number(t.total_amount || 0), 0);
  const salesTarget = Math.max(1, runningBills, 150000);
  const pct = (value) => tables.length ? Math.round((value / tables.length) * 100) : 0;
  const salesPct = Math.min(100, Math.round((runningBills / salesTarget) * 100));
  const selectedTable = selected ? tables.find(t => t.id === selected.id) || selected : null;

  const filteredTables = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tables.filter(t => {
      const statusMatch = statusFilter === 'all' || t.status === statusFilter;
      const sectionMatch = sectionFilter === 'All' || (t.section || 'Main Floor') === sectionFilter;
      const searchMatch = !q || [t.label, t.section, t.reservation_guest, t.order_number, t.server_name, t.waiter_name]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q));
      return statusMatch && sectionMatch && searchMatch;
    });
  }, [tables, statusFilter, sectionFilter, search]);

  const groupedTables = useMemo(() => filteredTables.reduce((acc, table) => {
    const section = table.section || 'Main Floor';
    if (!acc[section]) acc[section] = [];
    acc[section].push(table);
    return acc;
  }, {}), [filteredTables]);

  const visibleSections = sectionFilter === 'All'
    ? sectionNamesAll.filter(section => section !== 'All' && groupedTables[section])
    : [sectionFilter].filter(section => groupedTables[section]);

  const statusFilters = [
    ['all', 'All'],
    ['occupied', 'Occupied'],
    ['vacant', 'Vacant'],
    ['reserved', 'Reserved'],
    ['cleaning', 'Cleaning'],
  ];

  const FilterButton = ({ active, onClick, children }) => (
    <button onClick={onClick} style={{
      background: active ? T.accent : T.card,
      color: active ? (light ? '#fff' : '#020617') : T.textMid,
      border: `1px solid ${active ? T.accent : T.border}`,
      borderRadius: 12,
      padding: '9px 13px',
      fontSize: 12,
      fontWeight: active ? 900 : 700,
      cursor: 'pointer',
      fontFamily: "'Inter', sans-serif",
      whiteSpace: 'nowrap',
    }}>{children}</button>
  );

  const formatReservationTime = (value) => value
    ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '--';

  const displayStatus = (status) => status === 'vacant' ? 'available' : status;
  const tableGuest = (table) => {
    if (table.reservation_guest) return table.reservation_guest;
    if (table.status === 'occupied' && table.guest_count) return `${table.guest_count} guest${Number(table.guest_count) === 1 ? '' : 's'}`;
    return 'No guest';
  };
  const tableTime = (table) => {
    if (table.status === 'occupied') return table.order_started ? `${fmtElapsed(getElapsedMinutes(table))} seated` : '-';
    if (table.status === 'reserved') return formatReservationTime(table.reserved_at);
    if (table.status === 'cleaning') return 'Resetting';
    return '-';
  };

  const runTableAction = async (action) => {
    try {
      await action();
      load();
      setSelected(null);
    } catch {
      toast.error('Failed to update table');
    }
  };

  const applySetupPreset = (preset) => {
    const existing = new Set(tables.map(t => String(t.label || '').trim().toLowerCase()));
    const freshTables = preset.tables.filter(t => !existing.has(String(t.label).toLowerCase()));
    if (!freshTables.length) return toast.error('Those table labels already exist');
    setSetupTables(freshTables);
  };

  const addSetupTable = () => {
    const label = setupTable.label.trim();
    if (!label) return toast.error('Enter a table label');
    const exists = [...tables, ...setupTables].some(t => String(t.label || '').trim().toLowerCase() === label.toLowerCase());
    if (exists) return toast.error('Table label already exists');
    setSetupTables(current => [...current, { ...setupTable, label, capacity: Math.max(1, Number(setupTable.capacity) || 4) }]);
    setSetupTable(current => ({ ...current, label: '', capacity: 4 }));
  };

  const saveSetupTables = async () => {
    if (!setupTables.length) return toast.error('Add at least one table');
    setSetupSaving(true);
    try {
      for (const table of setupTables) {
        await createTable({
          label: table.label,
          section: table.section || 'Main Hall',
          capacity: Math.max(1, Number(table.capacity) || 4),
        });
      }
      toast.success(`${setupTables.length} table${setupTables.length === 1 ? '' : 's'} added`);
      setSetupTables([]);
      setSetupOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not create tables');
    } finally {
      setSetupSaving(false);
    }
  };

  const openEditTable = (table) => {
    setEditTableForm({
      id: table.id,
      label: table.label || '',
      section: table.section || 'Main Hall',
      capacity: table.capacity || 4,
    });
    setEditTableOpen(true);
  };

  const saveEditedTable = async () => {
    const label = editTableForm.label.trim();
    if (!label) return toast.error('Enter a table label');
    const duplicate = tables.some(t =>
      t.id !== editTableForm.id
      && String(t.label || '').trim().toLowerCase() === label.toLowerCase()
    );
    if (duplicate) return toast.error('Table label already exists');
    setEditSaving(true);
    try {
      const res = await updateTable(editTableForm.id, {
        label,
        section: editTableForm.section || 'Main Hall',
        capacity: Math.max(1, Number(editTableForm.capacity) || 4),
      });
      toast.success('Table updated');
      setSelected(res.data);
      setEditTableOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not update table');
    } finally {
      setEditSaving(false);
    }
  };

  const removeSelectedTable = async (table) => {
    if (table.order_id) return toast.error('Pay or clear the active order before deleting this table');
    if (table.reservation_id) return toast.error('Clear the active reservation before deleting this table');
    if (!window.confirm(`Delete table ${table.label}?`)) return;
    try {
      await deleteTable(table.id);
      toast.success('Table deleted');
      setSelected(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not delete table');
    }
  };

  if (loading) return <Spinner />;

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <PageHeader
          title="Table Management"
          subtitle="Live floor view with status filters, table bills and service alerts"
          action={
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search table, guest, order"
                style={{
                  width: 280,
                  maxWidth: '100%',
                  background: T.card,
                  border: `1px solid ${T.border}`,
                  borderRadius: 12,
                  color: T.text,
                  fontSize: 13,
                  outline: 'none',
                  padding: '11px 14px',
                  fontFamily: "'Inter', sans-serif",
                }}
              />
              <Btn onClick={() => setSetupOpen(true)} style={{ whiteSpace: 'nowrap' }}>
                Table Setup
              </Btn>
            </div>
          }
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          {[
            ['Available', summary('vacant'), pct(summary('vacant')), 'Ready tables', T.green],
            ['Occupied', summary('occupied'), pct(summary('occupied')), 'Serving guests', T.red],
            ['Reserved', summary('reserved'), pct(summary('reserved')), 'Upcoming bookings', T.blue],
            ['Cleaning', summary('cleaning'), pct(summary('cleaning')), 'Reset in progress', T.textMid],
            ['Sales', `PKR ${runningBills.toLocaleString()}`, salesPct, 'Open table value', T.purple],
          ].map(([label, value, percent, sub, color]) => (
            <Card key={label} hover style={{ padding: 16, minHeight: 112, borderTop: `3px solid ${color}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: T.textDim, textTransform: 'uppercase', fontWeight: 800 }}>{label}</div>
                  <div style={{ color, fontSize: 24, fontWeight: 900, marginTop: 8, fontFamily: label === 'Sales' ? "'Inter', sans-serif" : 'monospace' }}>{value}</div>
                  <div style={{ color: T.textMid, fontSize: 12, marginTop: 6 }}>{sub}</div>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 38, opacity: 0.85 }}>
                  <div style={{ width: 6, height: 18, borderRadius: 999, background: `${color}66` }} />
                  <div style={{ width: 6, height: 28, borderRadius: 999, background: `${color}99` }} />
                  <div style={{ width: 6, height: 36, borderRadius: 999, background: color }} />
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <div style={{ height: 7, borderRadius: 999, background: T.border, overflow: 'hidden' }}>
                  <div style={{ width: `${percent}%`, height: '100%', borderRadius: 999, background: color }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7, fontSize: 11, color: T.textDim }}>
                  <span>{percent}% of total</span>
                  <span>{label === 'Sales' ? 'Live' : 'Current'}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {(foodReadyCount > 0 || overtimeCount > 0 || noShowCount > 0) && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {foodReadyCount > 0 && <Badge color={T.green}>{foodReadyCount} food ready</Badge>}
            {overtimeCount > 0 && <Badge color={T.red}>{overtimeCount} overtime</Badge>}
            {noShowCount > 0 && <Badge color={T.red}>{noShowCount} no-show</Badge>}
          </div>
        )}

        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 18, borderBottom: `1px solid ${T.border}`, display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', background: T.surface }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {statusFilters.map(([key, label]) => (
                <FilterButton key={key} active={statusFilter === key} onClick={() => setStatusFilter(key)}>{label}</FilterButton>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {sectionNamesAll.map(section => (
                <FilterButton key={section} active={sectionFilter === section} onClick={() => setSectionFilter(section)}>{section}</FilterButton>
              ))}
            </div>
          </div>

          <div style={{ padding: 18 }}>
            <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 620px', minWidth: 0 }}>
                {visibleSections.map(section => (
                  <div key={section} style={{ marginBottom: 22 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', color: T.textMid, fontWeight: 800 }}>{section}</div>
                      <div style={{ color: T.textDim, fontSize: 12 }}>{groupedTables[section].length} tables</div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
                      {groupedTables[section].map(table => {
                        const elapsed = table.status === 'occupied' ? getElapsedMinutes(table) : 0;
                        const overdue = table.status === 'occupied' && elapsed >= overtimeHours * 60;
                        const expired = table.status === 'reserved' && isReservationExpired(table);
                        const kPhase = table.order_status ? KITCHEN_PHASE[table.order_status] : null;
                        const color = overdue || expired ? T.red : statusColor[table.status] || T.textMid;
                        const bg = overdue || expired ? T.redDim : statusBg[table.status] || T.surface;
                        const isActive = selectedTable && selectedTable.id === table.id;
                        return (
                          <div key={table.id} onClick={() => setSelected(isActive ? null : table)} style={{ background: bg, border: `1px solid ${isActive ? color : color + '55'}`, borderRadius: 16, padding: 16, cursor: 'pointer', transition: 'all 0.2s', transform: isActive ? 'translateY(-3px)' : 'none', boxShadow: isActive ? `0 18px 38px ${color}22` : 'none' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, boxShadow: `0 0 0 3px ${color}22`, flexShrink: 0 }} />
                                <span style={{ color: T.textMid, fontSize: 13, fontWeight: 800, textTransform: 'capitalize' }}>
                                  {overdue ? 'overtime' : expired ? 'no-show' : displayStatus(table.status)}
                                </span>
                              </div>
                              <Badge color={color} small style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{table.section || 'Main Floor'}</Badge>
                            </div>

                            <div style={{ marginTop: 16 }}>
                              <div style={{ fontWeight: 900, color: T.text, fontFamily: 'monospace', fontSize: 28, lineHeight: 1 }}>{table.label}</div>
                            </div>

                            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 9, color: T.textMid, fontSize: 13 }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                <span>Seats</span>
                                <span style={{ color: T.text, fontWeight: 800 }}>{table.capacity}</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                <span>Time</span>
                                <span style={{ color: overdue ? T.red : T.text, fontWeight: 800 }}>{tableTime(table)}</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                <span>Guest</span>
                                <span title={tableGuest(table)} style={{ color: T.text, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{tableGuest(table)}</span>
                              </div>
                            </div>

                            {kPhase && <div style={{ marginTop: 12, fontSize: 11, fontWeight: 900, color: kPhase.color }}>{kPhase.label}</div>}

                            <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                              <span style={{ fontSize: 13, color: T.textDim, fontWeight: 700 }}>Bill</span>
                              <span style={{ color: table.total_amount > 0 ? T.accent : T.textMid, fontSize: 18, fontWeight: 900, fontFamily: 'monospace' }}>
                                PKR {Number(table.total_amount || 0).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {filteredTables.length === 0 && <div style={{ border: `1px dashed ${T.borderLight}`, borderRadius: 16, padding: 48, textAlign: 'center', color: T.textMid, background: T.surface }}>No tables match this view.</div>}
              </div>

              {selectedTable && (() => {
                const elapsed = selectedTable.status === 'occupied' ? getElapsedMinutes(selectedTable) : 0;
                const overdue = selectedTable.status === 'occupied' && elapsed >= overtimeHours * 60;
                const expired = selectedTable.status === 'reserved' && isReservationExpired(selectedTable);
                const kPhase = selectedTable.order_status ? KITCHEN_PHASE[selectedTable.order_status] : null;
                const color = overdue || expired ? T.red : statusColor[selectedTable.status] || T.textMid;
                return (
                  <Card style={{ flex: '1 1 280px', maxWidth: 340, alignSelf: 'flex-start', position: 'sticky', top: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 11, color: T.textDim, fontWeight: 800, textTransform: 'uppercase' }}>Selected table</div>
                        <div style={{ fontWeight: 900, fontSize: 28, color, fontFamily: 'monospace', marginTop: 4 }}>{selectedTable.label}</div>
                      </div>
                      <button onClick={() => setSelected(null)} style={{ background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 10, color: T.textMid, cursor: 'pointer', width: 34, height: 34, fontSize: 18 }}>x</button>
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Badge color={color}>{selectedTable.status}</Badge>
                      {kPhase && <Badge color={kPhase.color}>{kPhase.label}</Badge>}
                      {overdue && <Badge color={T.red}>Overtime</Badge>}
                      {expired && <Badge color={T.red}>No-show</Badge>}
                    </div>

                    <div style={{ marginTop: 16 }}>
                      {[
                        ['Section', selectedTable.section || 'Main Floor'],
                        ['Capacity', `${selectedTable.capacity} seats`],
                        ['Order', selectedTable.order_number || '---'],
                        ['Cashier', selectedTable.server_name || '---'],
                        ['Waiter', selectedTable.waiter_name || '---'],
                        ['Seated', selectedTable.status === 'occupied' ? fmtElapsed(elapsed) : '---'],
                        ['Bill', selectedTable.total_amount > 0 ? `PKR ${Number(selectedTable.total_amount).toLocaleString()}` : '---'],
                      ].map(([key, value]) => (
                        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
                          <span style={{ fontSize: 12, color: T.textMid }}>{key}</span>
                          <span style={{ fontSize: 12, fontWeight: 800, color: key === 'Seated' && overdue ? T.red : T.text, textAlign: 'right' }}>{value}</span>
                        </div>
                      ))}
                      {selectedTable.reservation_guest && (
                        <div style={{ padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
                          <div style={{ fontSize: 11, color: T.textMid, marginBottom: 2 }}>Reservation</div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: expired ? T.red : T.blue }}>{selectedTable.reservation_guest}</div>
                          <div style={{ fontSize: 11, color: T.textMid }}>{formatReservationTime(selectedTable.reserved_at)} - {selectedTable.reservation_duration_min}min</div>
                          {expired && <div style={{ fontSize: 10, fontWeight: 800, color: T.red, marginTop: 2 }}>Guest did not arrive</div>}
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <Btn variant="secondary" onClick={() => openEditTable(selectedTable)}>Edit</Btn>
                        <Btn
                          variant="danger"
                          disabled={!!selectedTable.order_id || !!selectedTable.reservation_id}
                          onClick={() => removeSelectedTable(selectedTable)}
                          style={{
                            opacity: selectedTable.order_id || selectedTable.reservation_id ? 0.45 : 1,
                            cursor: selectedTable.order_id || selectedTable.reservation_id ? 'not-allowed' : 'pointer',
                          }}
                        >
                          Delete
                        </Btn>
                      </div>
                      {selectedTable.status === 'vacant' && <Btn onClick={() => runTableAction(() => updateTableStatus(selectedTable.id, 'occupied'))}>Assign Table</Btn>}
                      {selectedTable.status === 'occupied' && (
                        <>
                          {selectedTable.order_status === 'ready' && <Btn style={{ background: T.blue, color: '#fff', border: 'none' }} onClick={() => runTableAction(() => updateOrderStatus(selectedTable.order_id, 'served'))}>Mark Served</Btn>}
                          <Btn style={{ background: T.accent, color: light ? '#fff' : '#020617', border: 'none' }} onClick={() => setBillTable(selectedTable)}>View Bill</Btn>
                          <Btn variant="ghost" disabled={!!selectedTable.order_id} onClick={() => runTableAction(() => updateTableStatus(selectedTable.id, 'cleaning'))} style={{ opacity: selectedTable.order_id ? 0.4 : 1, cursor: selectedTable.order_id ? 'not-allowed' : 'pointer' }}>
                            {selectedTable.order_id ? 'Mark Cleaning (pay first)' : 'Mark Cleaning'}
                          </Btn>
                        </>
                      )}
                      {selectedTable.status === 'reserved' && expired && <Btn style={{ background: T.red, color: '#fff', border: 'none' }} onClick={() => runTableAction(() => import('../services/api').then(api => api.updateReservation(selectedTable.reservation_id, { status: 'no_show' })))}>Clear Reservation</Btn>}
                      {selectedTable.status === 'cleaning' && <Btn style={{ background: T.green, color: '#fff', border: 'none' }} onClick={() => runTableAction(() => updateTableStatus(selectedTable.id, 'vacant'))}>Mark Vacant</Btn>}
                    </div>
                  </Card>
                );
              })()}
            </div>
          </div>
        </Card>
      </div>

      <Modal open={setupOpen} onClose={() => !setupSaving && setSetupOpen(false)} title="Table Setup" width={720}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: T.textDim, fontWeight: 900, textTransform: 'uppercase', marginBottom: 8 }}>Quick presets</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {TABLE_SETUP_PRESETS.map(preset => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applySetupPreset(preset)}
                  style={{
                    background: T.surface,
                    color: T.text,
                    border: `1px solid ${T.border}`,
                    borderRadius: 10,
                    padding: '9px 12px',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ border: `1px solid ${T.border}`, borderRadius: 14, padding: 14, background: T.surface }}>
            <div style={{ fontSize: 11, color: T.textDim, fontWeight: 900, textTransform: 'uppercase', marginBottom: 12 }}>Custom table</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px,1fr) minmax(140px,1fr) 110px auto', gap: 10, alignItems: 'end' }}>
              <Input
                label="Label"
                value={setupTable.label}
                onChange={e => setSetupTable(current => ({ ...current, label: e.target.value }))}
                placeholder="T-01"
                style={{ marginBottom: 0 }}
              />
              <Select
                label="Section"
                value={setupTable.section}
                onChange={e => setSetupTable(current => ({ ...current, section: e.target.value }))}
                style={{ marginBottom: 0 }}
              >
                {['Main Hall', 'Terrace', 'VIP', 'Bar', 'Private'].map(section => <option key={section}>{section}</option>)}
              </Select>
              <Input
                label="Seats"
                type="number"
                min="1"
                max="50"
                value={setupTable.capacity}
                onChange={e => setSetupTable(current => ({ ...current, capacity: e.target.value }))}
                style={{ marginBottom: 0 }}
              />
              <Btn onClick={addSetupTable}>Add</Btn>
            </div>
          </div>

          <div style={{ border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px 42px', gap: 10, padding: '10px 12px', background: T.surface, color: T.textDim, fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>
              <span>Table</span>
              <span>Section</span>
              <span>Seats</span>
              <span />
            </div>
            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
              {setupTables.map((table, index) => (
                <div key={`${table.label}-${index}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px 42px', gap: 10, alignItems: 'center', padding: '10px 12px', borderTop: `1px solid ${T.border}` }}>
                  <span style={{ color: T.text, fontWeight: 900 }}>{table.label}</span>
                  <span style={{ color: T.textMid }}>{table.section || 'Main Hall'}</span>
                  <span style={{ color: T.text, fontWeight: 800, fontFamily: 'monospace' }}>{table.capacity || 4}</span>
                  <button
                    type="button"
                    onClick={() => setSetupTables(current => current.filter((_, i) => i !== index))}
                    style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: T.red, cursor: 'pointer', fontWeight: 900 }}
                  >
                    x
                  </button>
                </div>
              ))}
              {!setupTables.length && (
                <div style={{ padding: 22, color: T.textDim, textAlign: 'center', fontSize: 13 }}>No tables added yet.</div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ color: T.textMid, fontSize: 12 }}>
              {setupTables.length} ready to create
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="ghost" disabled={setupSaving} onClick={() => setSetupTables([])}>Clear</Btn>
              <Btn disabled={setupSaving || !setupTables.length} onClick={saveSetupTables}>
                {setupSaving ? 'Saving...' : 'Save Tables'}
              </Btn>
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={editTableOpen} onClose={() => !editSaving && setEditTableOpen(false)} title="Edit Table" width={460}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input
            label="Label"
            value={editTableForm.label}
            onChange={e => setEditTableForm(current => ({ ...current, label: e.target.value }))}
            placeholder="T-01"
          />
          <Select
            label="Section"
            value={editTableForm.section}
            onChange={e => setEditTableForm(current => ({ ...current, section: e.target.value }))}
          >
            {['Main Hall', 'Terrace', 'VIP', 'Bar', 'Private'].map(section => <option key={section}>{section}</option>)}
          </Select>
          <Input
            label="Seats"
            type="number"
            min="1"
            max="50"
            value={editTableForm.capacity}
            onChange={e => setEditTableForm(current => ({ ...current, capacity: e.target.value }))}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <Btn variant="ghost" disabled={editSaving} onClick={() => setEditTableOpen(false)}>Cancel</Btn>
            <Btn disabled={editSaving} onClick={saveEditedTable}>{editSaving ? 'Saving...' : 'Save Changes'}</Btn>
          </div>
        </div>
      </Modal>

      {billTable && <TableBill table={billTable} onClose={() => setBillTable(null)} onPaid={() => { load(); setSelected(null); }} />}
    </>
  );
}

// INVENTORY
const alertLevel = (item) => {
  if (item.stock_quantity <= item.min_quantity * 0.5) return 'critical';
  if (item.stock_quantity <= item.min_quantity)       return 'low';
  return 'ok';
};
const ALERT_COLOR = { ok: T.green, low: T.accent, critical: T.red };

export function Inventory() {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(null);
  const [qty,     setQty]     = useState('');

  const load = () => getInventory().then(r => setItems(r.data)).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const doReorder = async () => {
    if (!qty || isNaN(qty)) return toast.error('Enter a valid quantity');
    try {
      await updateStock(modal.item.id, { type: 'purchase', quantity: parseFloat(qty), notes: 'Reorder' });
      toast.success('Stock updated');
      setModal(null); setQty(''); load();
    } catch {
      toast.error('Failed to update stock');
    }
  };

  if (loading) return <Spinner />;

  const critical = items.filter(i => alertLevel(i) === 'critical').length;
  const low      = items.filter(i => alertLevel(i) === 'low').length;

  const columns = [
    { key: 'name',           label: 'Ingredient', style: { fontWeight: 700, color: T.text } },
    { key: 'unit',           label: 'Unit',       style: { color: T.textMid } },
    { key: 'stock_quantity', label: 'In Stock',   render: r => {
      const pct = Math.min(100, (r.stock_quantity / r.max_quantity) * 100);
      const c   = ALERT_COLOR[alertLevel(r)];
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 800, color: c, fontFamily: 'monospace', minWidth: 40 }}>{r.stock_quantity}</span>
          <div style={{ width: 60, height: 5, background: T.border, borderRadius: 3 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: c, borderRadius: 3 }} />
          </div>
        </div>
      );
    }},
    { key: 'min_quantity',  label: 'Min',    style: { color: T.textMid, fontFamily: 'monospace' } },
    { key: 'max_quantity',  label: 'Max',    style: { color: T.textMid, fontFamily: 'monospace' } },
    { key: 'alert',         label: 'Status', render: r => <Badge color={ALERT_COLOR[alertLevel(r)]}>{alertLevel(r)}</Badge> },
    { key: 'cost_per_unit', label: 'Cost/Unit', render: r => <span style={{ fontFamily: 'monospace', color: T.textMid }}>PKR {r.cost_per_unit}</span> },
    { key: 'actions',       label: '',       render: r => <Btn size="sm" variant="ghost" onClick={() => { setModal({ item: r }); setQty(''); }}>Reorder</Btn> },
  ];

  return (
    <div>
      <PageHeader
        title="Inventory Control"
        subtitle="Live stock levels with automated alerts"
        action={<div style={{ display: 'flex', gap: 8 }}><Badge color={T.red}>{critical} Critical</Badge><Badge color={T.accent}>{low} Low</Badge></div>}
      />
      <UITable columns={columns} rows={items} />
      <Modal open={!!modal} onClose={() => setModal(null)} title={`Reorder: ${modal && modal.item ? modal.item.name : ''}`}>
        <div style={{ color: T.textMid, fontSize: 13, marginBottom: 16 }}>
          Current: <b style={{ color: T.text }}>{modal && modal.item ? modal.item.stock_quantity : ''} {modal && modal.item ? modal.item.unit : ''}</b>
          {' · '}Min: <b style={{ color: T.accent }}>{modal && modal.item ? modal.item.min_quantity : ''}</b>
        </div>
        <Input label={`Quantity to add (${modal && modal.item ? modal.item.unit : ''})`} type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="0" />
        <Btn onClick={doReorder} style={{ width: '100%', marginTop: 8 }}>Update Stock</Btn>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ALERTS
// ─────────────────────────────────────────────────────────────────────────────
export function Alerts() {
  const [notes,   setNotes]   = useState([]);
  const [loading, setLoading] = useState(true);
  const { on, off } = useSocket();

  const load = () => getNotifications().then(r => setNotes(r.data)).finally(() => setLoading(false));

  useEffect(() => {
    load();
    on('order_updated', load);
    return () => off('order_updated', load);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markRead = async (ids) => { await markNotificationsRead(ids); load(); };

  if (loading) return <Spinner />;

  const unread = notes.filter(n => !n.is_read);
  const severityColor = { critical: T.red, high: T.accent, info: T.blue, low: T.accent };
  const severityBg    = { critical: T.redDim, high: T.accentGlow, info: T.blueDim, low: T.accentGlow };
  const alertIcon     = { critical: '🚨', high: '⚠️', info: 'ℹ️', low: '⚠️' };

  return (
    <div>
      <PageHeader
        title="Notification Center"
        subtitle="Inventory, orders and system notifications"
        action={unread.length > 0 && <Btn variant="ghost" onClick={() => markRead(unread.map(n => n.id))}>Mark all read</Btn>}
      />
      {notes.length === 0 && <div style={{ textAlign: 'center', padding: 60, color: T.textDim }}>No notifications</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {notes.map(n => (
          <Card key={n.id} style={{ padding: '14px 18px', opacity: n.is_read ? 0.6 : 1 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: severityBg[n.severity] || T.blueDim, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                {alertIcon[n.severity] || 'ℹ️'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: n.is_read ? 500 : 700, color: T.text }}>{n.title}</div>
                <div style={{ fontSize: 12, color: T.textMid, marginTop: 3 }}>{n.message}</div>
                <div style={{ fontSize: 11, color: T.textDim, marginTop: 4 }}>{new Date(n.created_at).toLocaleString()}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <Badge color={severityColor[n.severity] || T.blue} small>{n.severity}</Badge>
                {!n.is_read && <Btn size="sm" variant="ghost" onClick={() => markRead([n.id])}>Dismiss</Btn>}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN PANEL
// ─────────────────────────────────────────────────────────────────────────────
export function Admin() {
  const [restaurants,   setRestaurants]   = useState([]);
  const [platformStats, setPlatformStats] = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [modal,         setModal]         = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [form, setForm] = useState({ restaurant_name: '', email: '', city: '', admin_name: '', admin_password: '', plan_id: 'a1000000-0000-0000-0000-000000000002' });

  const load = async () => {
    try {
      const [r, s] = await Promise.all([getAllRestaurants(), getPlatformStats()]);
      setRestaurants(r.data); setPlatformStats(s.data);
    } catch { toast.error('Failed to load admin data'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleRegister = async () => {
    if (!form.restaurant_name || !form.email || !form.admin_name || !form.admin_password) return toast.error('Please fill all required fields');
    setSaving(true);
    try {
      await registerRestaurant(form);
      toast.success('Restaurant registered!');
      setModal(false);
      setForm({ restaurant_name: '', email: '', city: '', admin_name: '', admin_password: '', plan_id: 'a1000000-0000-0000-0000-000000000002' });
      load();
    } catch (err) { toast.error(err.response && err.response.data ? err.response.data.error : 'Registration failed'); }
    finally { setSaving(false); }
  };

  if (loading) return <Spinner />;

  const planBadge = { Pro: T.accent, Starter: T.blue, Enterprise: T.purple };
  const columns = [
    { key: 'name',           label: 'Restaurant', style: { fontWeight: 700, color: T.text } },
    { key: 'plan_name',      label: 'Plan',       render: r => <Badge color={planBadge[r.plan_name] || T.textMid}>{r.plan_name}</Badge> },
    { key: 'city',           label: 'City',       style: { color: T.textMid } },
    { key: 'table_count',    label: 'Tables',     style: { fontFamily: 'monospace' } },
    { key: 'employee_count', label: 'Staff',      style: { fontFamily: 'monospace' } },
    { key: 'total_revenue',  label: 'Revenue',    render: r => <span style={{ color: T.green, fontFamily: 'monospace', fontWeight: 700 }}>PKR {Number(r.total_revenue).toLocaleString()}</span> },
    { key: 'status',         label: 'Status',     render: r => <Badge color={r.status === 'active' ? T.green : T.accent}>{r.status}</Badge> },
    { key: 'created_at',     label: 'Joined',     render: r => <span style={{ color: T.textMid, fontSize: 12 }}>{new Date(r.created_at).toLocaleDateString()}</span> },
  ];

  const FORM_FIELDS = [
    { key: 'restaurant_name', label: 'Restaurant Name *', type: 'text' },
    { key: 'email',           label: 'Admin Email *',     type: 'email' },
    { key: 'city',            label: 'City',              type: 'text' },
    { key: 'admin_name',      label: 'Admin Full Name *', type: 'text' },
    { key: 'admin_password',  label: 'Admin Password *',  type: 'password' },
  ];

  return (
    <div>
      <PageHeader title="Super Admin - All Restaurants" subtitle="Platform-wide management" action={<Btn onClick={() => setModal(true)}>+ Onboard Restaurant</Btn>} />
      <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        <StatCard label="Total Restaurants" value={platformStats ? platformStats.total_restaurants : 0} color={T.accent} icon="🏪" />
        <StatCard label="Total Employees"   value={platformStats ? platformStats.total_employees   : 0} color={T.blue}   icon="👥" />
        <StatCard label="Total Orders"      value={platformStats ? platformStats.total_orders      : 0} color={T.green}  icon="📋" />
        <StatCard label="Platform Revenue"  value={`PKR ${Number(platformStats ? platformStats.total_revenue : 0).toLocaleString()}`} color={T.purple} icon="💹" />
      </div>
      <UITable columns={columns} rows={restaurants} />
      <Modal open={modal} onClose={() => setModal(false)} title="Register New Restaurant">
        {FORM_FIELDS.map(function(f) {
          return <Input key={f.key} label={f.label} type={f.type} value={form[f.key]} onChange={function(e) { setForm(function(prev) { var next = Object.assign({}, prev); next[f.key] = e.target.value; return next; }); }} />;
        })}
        <Select label="Plan" value={form.plan_id} onChange={e => setForm(f => Object.assign({}, f, { plan_id: e.target.value }))}>
          <option value="a1000000-0000-0000-0000-000000000001">Starter - PKR 8,000/mo</option>
          <option value="a1000000-0000-0000-0000-000000000002">Pro - PKR 22,000/mo</option>
          <option value="a1000000-0000-0000-0000-000000000003">Enterprise - PKR 55,000/mo</option>
        </Select>
        <Btn onClick={handleRegister} disabled={saving} style={{ width: '100%', marginTop: 8 }}>{saving ? 'Registering...' : 'Register Restaurant'}</Btn>
      </Modal>
    </div>
  );
}
