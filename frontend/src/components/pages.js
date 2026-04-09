import React, { useEffect, useState, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';

// API — one level up from components/
import {
  getOrders,
  updateOrderStatus,
  getTables as apiGetTables,
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
} from './shared/UI';

// Socket context — one level up
import { useSocket } from '../context/SocketContext';
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
            {orders.filter(o => o.status === phase).map(o => (
              <Card
                key={o.id}
                onClick={() => advance(o)}
                style={{ marginBottom: 12, borderLeft: `3px solid ${PHASE_COLOR[phase]}`, cursor: 'pointer', padding: 16 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: 14, color: T.text }}>
                    {o.order_number}
                  </span>
                  <Badge color={PHASE_COLOR[phase]} small>{elapsed(o.created_at)}</Badge>
                </div>
                <div style={{ fontSize: 12, color: T.textMid, marginBottom: 10 }}>
                  {o.table_label ? `Table ${o.table_label}` : 'Online'} {o.server_name ? `· ${o.server_name}` : ''}
                </div>
                {(o.items || []).map((item, i) => (
                  <div key={i} style={{ fontSize: 12, padding: '4px 0', borderBottom: `1px solid ${T.border}`, color: T.text }}>
                    <span style={{ color: PHASE_COLOR[phase] }}>• </span>
                    {item.name} x{item.quantity}
                  </div>
                ))}
                <div style={{ marginTop: 10 }}>
                  <Btn size="sm" style={{
                    width: '100%',
                    background: PHASE_COLOR[phase],
                    color: phase === 'preparing' ? '#000' : '#fff',
                    border: 'none',
                  }}>
                    {phase === 'pending' ? 'Start Cooking' : phase === 'preparing' ? 'Mark Ready' : 'Served'}
                  </Btn>
                </div>
              </Card>
            ))}
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
const STATUS_COLOR = { occupied: T.accent, vacant: T.green, reserved: T.blue, cleaning: T.textMid };
const STATUS_BG    = {
  occupied: 'rgba(245,166,35,0.12)', vacant: 'rgba(46,204,113,0.12)',
  reserved: 'rgba(52,152,219,0.12)', cleaning: 'rgba(74,85,104,0.2)',
};

// Kitchen order_status → display config
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

export function Tables() {
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
                  ['Order',    selected.order_number || '---'],
                  ['Server',   selected.server_name  || '---'],
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
// INVENTORY
// ─────────────────────────────────────────────────────────────────────────────
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
