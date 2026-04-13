import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  getAvailableOrders, claimOrder,
  getRiderMyOrders, pickOrder, riderCollectPayment
} from '../../services/api';
import { Card, PageHeader, Btn, Input, Modal, Spinner, T, useT } from '../shared/UI';
import { useSocket } from '../../context/SocketContext';
import toast from 'react-hot-toast';

function fmtCur(v) { return 'PKR ' + parseFloat(v || 0).toLocaleString('en-PK', { minimumFractionDigits: 0 }); }
function fmtTime(ts) { if (!ts) return '—'; return new Date(ts).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }); }

const STATUS_COLOR = {
  pending: '#F39C12', confirmed: '#3498DB', preparing: '#9B59B6',
  ready: '#27AE60', picked: '#2ECC71', out_for_delivery: '#1ABC9C',
  delivered: '#27AE60', cancelled: '#E74C3C',
};

// ── Countdown timer for claim expiry ──────────────────────────────────────────
function CountdownBadge({ secondsLeft }) {
  useT();
  const [secs, setSecs] = useState(secondsLeft);
  useEffect(() => {
    setSecs(secondsLeft);
    const t = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [secondsLeft]);

  if (secs <= 0) return (
    <span style={{ padding: '2px 8px', background: '#E74C3C22', color: '#E74C3C', borderRadius: 20, fontSize: 10, fontWeight: 700 }}>EXPIRING</span>
  );
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  const color = secs < 120 ? '#E74C3C' : '#F39C12';
  return (
    <span style={{ padding: '2px 8px', background: color + '22', color, borderRadius: 20, fontSize: 10, fontWeight: 700, fontFamily: 'monospace' }}>
      {m}:{String(s).padStart(2, '0')} left
    </span>
  );
}

// ── Payment collection modal ───────────────────────────────────────────────────
function CollectModal({ order, open, onClose, onCollected }) {
  useT();
  const [method,   setMethod]   = useState('cash');
  const [tendered, setTendered] = useState('');
  const [cardAmt,  setCardAmt]  = useState('');
  const [notes,    setNotes]    = useState('');
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    if (open && order) { setMethod('cash'); setTendered(''); setCardAmt(''); setNotes(''); }
  }, [open, order]);

  if (!order) return null;

  const total  = parseFloat(order.total_amount || 0);
  const change = method === 'cash' ? Math.max(0, parseFloat(tendered || 0) - total) : 0;

  const handleSubmit = async () => {
    if (method === 'cash' && parseFloat(tendered || 0) < total) return toast.error('Tendered must be ≥ total');
    if (method === 'card' && parseFloat(cardAmt || 0) < total) return toast.error('Card amount must be ≥ total');
    if (method === 'mixed' && (parseFloat(cardAmt || 0) + Math.max(0, total - parseFloat(cardAmt || 0))) < total) return toast.error('Total must cover invoice');
    setLoading(true);
    try {
      const cashAmount = method === 'card' ? 0 : method === 'mixed' ? Math.max(0, total - parseFloat(cardAmt || 0)) : parseFloat(tendered || total);
      await riderCollectPayment({
        order_id: order.id, payment_method: method,
        cash_amount: cashAmount,
        card_amount: method === 'cash' ? 0 : parseFloat(cardAmt || 0),
        tendered_amount: method === 'cash' ? parseFloat(tendered) : total,
        notes,
      });
      toast.success('Payment collected!');
      onCollected(); onClose();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    setLoading(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Collect Payment" width={460}>
      {/* Invoice */}
      <div style={{ background: T.surface, borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>#{order.order_number}</span>
          <span style={{ fontSize: 13, color: T.textMid }}>{order.customer_name}</span>
        </div>
        {(order.items || []).filter(Boolean).map((item, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.text, marginBottom: 4 }}>
            <span>{item.quantity}× {item.name}</span>
            <span>{fmtCur(item.total_price)}</span>
          </div>
        ))}
        {order.discount_amount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.red, marginTop: 6 }}>
            <span>Discount</span><span>-{fmtCur(order.discount_amount)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, color: T.accent, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
          <span>TOTAL DUE</span><span>{fmtCur(total)}</span>
        </div>
      </div>

      {/* Method */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: T.textMid, marginBottom: 8, fontWeight: 600 }}>Payment Method</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['cash', 'card', 'mixed'].map(m => (
            <button key={m} onClick={() => setMethod(m)} style={{
              flex: 1, padding: '10px 0', borderRadius: 10,
              border: `2px solid ${method === m ? T.accent : T.border}`,
              background: method === m ? T.accentGlow : T.surface,
              color: method === m ? T.accent : T.textMid,
              fontWeight: 700, fontSize: 13, cursor: 'pointer', textTransform: 'capitalize',
            }}>{m}</button>
          ))}
        </div>
      </div>
      {(method === 'cash' || method === 'mixed') && (
        <Input label={method === 'mixed' ? 'Cash Amount (PKR)' : 'Tendered Amount (PKR)'}
          type="number" value={tendered} onChange={e => setTendered(e.target.value)} placeholder={fmtCur(total)} />
      )}
      {(method === 'card' || method === 'mixed') && (
        <Input label="Card Amount (PKR)"
          type="number" value={cardAmt} onChange={e => setCardAmt(e.target.value)} placeholder={method === 'card' ? fmtCur(total) : '0'} />
      )}
      {method === 'cash' && parseFloat(tendered) >= total && tendered && (
        <div style={{ background: T.greenDim, border: `1px solid ${T.green}`, borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: T.textMid }}>Change to return</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.green }}>{fmtCur(change)}</div>
        </div>
      )}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: T.textMid, marginBottom: 6, fontWeight: 600 }}>Notes</div>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          style={{ width: '100%', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '8px 12px', color: T.text, fontSize: 13, fontFamily: "'Inter', sans-serif", resize: 'none', minHeight: 48, outline: 'none' }} />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <Btn variant="ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</Btn>
        <Btn onClick={handleSubmit} disabled={loading} style={{ flex: 1 }}>
          {loading ? 'Recording...' : 'Confirm Collection'}
        </Btn>
      </div>
    </Modal>
  );
}

// ── Order card shared UI ───────────────────────────────────────────────────────
function OrderCard({ order, actions }) {
  useT();
  return (
    <Card style={{ padding: '14px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: T.text }}>#{order.order_number}</span>
            <span style={{
              padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
              background: (STATUS_COLOR[order.status] || '#888') + '22',
              color: STATUS_COLOR[order.status] || '#888',
            }}>{order.status.replace(/_/g, ' ').toUpperCase()}</span>
            {order.seconds_until_expiry != null && order.status === 'confirmed' && !order.picked_at && (
              <CountdownBadge secondsLeft={order.seconds_until_expiry} />
            )}
          </div>
          {/* Customer */}
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{order.customer_name}</div>
          <div style={{ fontSize: 12, color: T.textMid }}>{order.customer_phone}</div>
          {order.delivery_address?.address && (
            <div style={{ fontSize: 12, color: T.textMid, marginTop: 4 }}>📍 {order.delivery_address.address}</div>
          )}
          {/* Items */}
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {(order.items || []).filter(Boolean).map((item, i) => (
              <span key={i} style={{ padding: '2px 7px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 11, color: T.textMid }}>
                {item.quantity}× {item.name}
              </span>
            ))}
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: T.textDim }}>
            Placed: {fmtTime(order.created_at)}
            {order.picked_at && ` · Collected: ${fmtTime(order.picked_at)}`}
          </div>
        </div>
        {/* Right: amount + actions */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.accent }}>{fmtCur(order.total_amount)}</div>
          {(order.customer_lat && order.customer_lng) ? (
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${order.customer_lat},${order.customer_lng}`}
              target="_blank" rel="noopener noreferrer"
              style={{ padding: '7px 12px', background: '#4285F422', border: '1px solid #4285F4', color: '#4285F4', borderRadius: 10, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
              📍 Navigate
            </a>
          ) : order.delivery_address?.address ? (
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.delivery_address.address)}`}
              target="_blank" rel="noopener noreferrer"
              style={{ padding: '7px 12px', background: '#4285F422', border: '1px solid #4285F4', color: '#4285F4', borderRadius: 10, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
              📍 Map
            </a>
          ) : null}
          {actions}
        </div>
      </div>
    </Card>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function RiderDashboard() {
  useT();
  const { on, off } = useSocket();
  const [tab,          setTab]          = useState('available');
  const [available,    setAvailable]    = useState([]);
  const [myOrders,     setMyOrders]     = useState([]);
  const [loadingA,     setLoadingA]     = useState(true);
  const [loadingM,     setLoadingM]     = useState(true);
  const [collectOrder, setCollectOrder] = useState(null);
  const [claiming,     setClaiming]     = useState(null); // order id being claimed
  const [picking,      setPicking]      = useState(null); // order id being picked
  const pollRef = useRef(null);

  const loadAvailable = useCallback(async () => {
    setLoadingA(true);
    try {
      const res = await getAvailableOrders();
      setAvailable(res.data);
    } catch { /* silent */ }
    setLoadingA(false);
  }, []);

  const loadMine = useCallback(async () => {
    setLoadingM(true);
    try {
      const res = await getRiderMyOrders({ date: new Date().toISOString().slice(0, 10) });
      setMyOrders(res.data);
    } catch (e) {
      if (e.response?.status === 403) toast.error('Your role does not have Rider permission. Ask your manager to assign you the Rider role.');
    }
    setLoadingM(false);
  }, []);

  // Initial load + poll every 30 seconds
  useEffect(() => {
    loadAvailable(); loadMine();
    pollRef.current = setInterval(() => { loadAvailable(); loadMine(); }, 30000);
    return () => clearInterval(pollRef.current);
  }, [loadAvailable, loadMine]);

  // Real-time: delivery order ready notification
  useEffect(() => {
    const handler = ({ orderNumber, assignedRiderId }) => {
      loadAvailable();
      loadMine();
      if (!assignedRiderId) {
        toast('🏍 Order #' + orderNumber + ' is ready — claim it now!', { duration: 6000 });
      } else {
        toast.success('🟢 Order #' + orderNumber + ' is ready for pickup', { duration: 5000 });
      }
    };
    on('delivery_order_ready', handler);
    return () => off('delivery_order_ready', handler);
  }, [on, off, loadAvailable, loadMine]);

  const handleClaim = async (orderId) => {
    setClaiming(orderId);
    try {
      await claimOrder(orderId);
      toast.success('Order claimed! You have limited time to collect it.');
      await Promise.all([loadAvailable(), loadMine()]);
      setTab('my');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not claim order');
      loadAvailable(); // refresh to reflect new state
    }
    setClaiming(null);
  };

  const handlePick = async (orderId) => {
    setPicking(orderId);
    try {
      await pickOrder(orderId);
      toast.success('Order picked up — head to customer!');
      loadMine();
    } catch (e) { toast.error(e.response?.data?.error || 'Cannot pick order'); }
    setPicking(null);
  };

  const handleMarkDelivered = async (order) => {
    setPicking(order.id);
    try {
      await riderCollectPayment({
        order_id: order.id, payment_method: order.payment_method || 'prepaid',
        cash_amount: 0, card_amount: 0, tendered_amount: 0, notes: 'Pre-paid order',
      });
      toast.success('Order marked as delivered!');
      loadMine();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to mark delivered'); }
    setPicking(null);
  };

  const myActive    = myOrders.filter(o => !['delivered', 'cancelled'].includes(o.status));
  const myDelivered = myOrders.filter(o => o.status === 'delivered');
  const totalSales  = myDelivered.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="My Deliveries"
        subtitle="Claim phone orders and manage your delivery queue"
        action={
          <Btn size="sm" variant="ghost" onClick={() => { loadAvailable(); loadMine(); }}>↻ Refresh</Btn>
        }
      />

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Available',  value: available.length,       icon: '📦', color: '#F39C12' },
          { label: 'My Active',  value: myActive.length,        icon: '🚴', color: T.accent },
          { label: 'Delivered',  value: myDelivered.length,     icon: '✅', color: T.green },
          { label: 'My Sales',   value: fmtCur(totalSales),     icon: '💰', color: T.green },
        ].map(s => (
          <Card key={s.label} style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: T.textMid, textTransform: 'uppercase', letterSpacing: 0.8 }}>{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 18 }}>
        {[
          ['available', `Available Orders (${available.length})`],
          ['my',        `My Orders (${myOrders.length})`],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '9px 20px', borderRadius: 10,
            border: `1px solid ${tab === key ? T.accent : T.border}`,
            background: tab === key ? T.accent : T.surface,
            color: tab === key ? '#000' : T.textMid,
            fontWeight: 700, fontSize: 13, cursor: 'pointer',
          }}>{label}</button>
        ))}
      </div>

      {/* ── Available Orders ── */}
      {tab === 'available' && (
        loadingA ? <Spinner /> : available.length === 0
          ? (
            <Card>
              <div style={{ textAlign: 'center', padding: '50px 0', color: T.textDim }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
                <div style={{ fontWeight: 700, color: T.textMid }}>No orders available right now</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>Delivery orders will appear here once the kitchen marks them ready</div>
              </div>
            </Card>
          )
          : (
            <div style={{ display: 'grid', gap: 12 }}>
              {available.map(order => (
                <OrderCard key={order.id} order={order} actions={
                  <Btn
                    onClick={() => handleClaim(order.id)}
                    disabled={claiming === order.id}
                    style={{ minWidth: 110 }}
                  >
                    {claiming === order.id ? 'Claiming...' : 'Claim Order'}
                  </Btn>
                } />
              ))}
            </div>
          )
      )}

      {/* ── My Orders ── */}
      {tab === 'my' && (
        loadingM ? <Spinner /> : myOrders.length === 0
          ? (
            <Card>
              <div style={{ textAlign: 'center', padding: '50px 0', color: T.textDim }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>🏍</div>
                <div style={{ fontWeight: 700, color: T.textMid }}>No orders assigned to you today</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>Claim an order from the Available tab</div>
              </div>
            </Card>
          )
          : (
            <div style={{ display: 'grid', gap: 12 }}>
              {myOrders.map(order => {
                const isReady       = ['ready', 'served'].includes(order.status); // 'served' for legacy delivery orders
                const isPicked      = order.status === 'picked';
                const isCOD         = order.payment_status !== 'paid';
                const canPickUp     = isReady && !order.picked_at;
                const canGetPaid    = isPicked && isCOD && !order.collection_status;
                const canDeliver    = isPicked && !isCOD;

                return (
                  <OrderCard key={order.id} order={order} actions={
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                      {isReady && (
                        <span style={{ padding: '4px 12px', background: '#27AE6022', border: '1px solid #27AE60', borderRadius: 20, fontSize: 11, fontWeight: 800, color: '#27AE60', letterSpacing: 0.5 }}>
                          🟢 READY TO PICK
                        </span>
                      )}
                      {canPickUp && (
                        <Btn
                          onClick={() => handlePick(order.id)}
                          disabled={picking === order.id}
                          style={{ minWidth: 140, background: '#27AE60', color: '#fff', border: 'none' }}
                        >
                          {picking === order.id ? 'Updating...' : '✓ Pick Up Order'}
                        </Btn>
                      )}
                      {canGetPaid && (
                        <Btn onClick={() => setCollectOrder(order)} style={{ minWidth: 140 }}>
                          💰 Collect Payment
                        </Btn>
                      )}
                      {canDeliver && (
                        <Btn
                          onClick={() => handleMarkDelivered(order)}
                          disabled={picking === order.id}
                          style={{ minWidth: 140, background: T.green, color: '#fff', border: 'none' }}
                        >
                          {picking === order.id ? 'Updating...' : '✓ Mark Delivered'}
                        </Btn>
                      )}
                    </div>
                  } />
                );
              })}
            </div>
          )
      )}

      <CollectModal
        order={collectOrder}
        open={!!collectOrder}
        onClose={() => setCollectOrder(null)}
        onCollected={loadMine}
      />
    </div>
  );
}
