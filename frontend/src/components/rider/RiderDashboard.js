import React, { useEffect, useState, useCallback } from 'react';
import { getRiderMyOrders, pickOrder, riderCollectPayment } from '../../services/api';
import { Card, PageHeader, Btn, Input, Modal, Spinner, Badge, T, useT } from '../shared/UI';
import toast from 'react-hot-toast';

const STATUS_COLOR = {
  pending: '#F39C12', confirmed: '#3498DB', preparing: '#9B59B6',
  ready: '#27AE60', picked: '#2ECC71', out_for_delivery: '#1ABC9C',
  delivered: '#27AE60', paid: '#27AE60', cancelled: '#E74C3C',
};

function fmtCur(v) { return 'PKR ' + parseFloat(v || 0).toLocaleString('en-PK', { minimumFractionDigits: 0 }); }
function fmtTime(ts) { if (!ts) return '—'; const d = new Date(ts); return d.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }); }

// Invoice & Payment Collection Modal
function CollectModal({ order, open, onClose, onCollected }) {
  useT();
  const [method,    setMethod]    = useState('cash');
  const [tendered,  setTendered]  = useState('');
  const [cardAmt,   setCardAmt]   = useState('');
  const [notes,     setNotes]     = useState('');
  const [loading,   setLoading]   = useState(false);

  useEffect(() => {
    if (open && order) { setMethod('cash'); setTendered(''); setCardAmt(''); setNotes(''); }
  }, [open, order]);

  if (!order) return null;

  const total       = parseFloat(order.total_amount || 0);
  const cashAmt     = method === 'cash' ? total : method === 'mixed' ? Math.max(0, total - parseFloat(cardAmt || 0)) : 0;
  const change      = method === 'cash' ? Math.max(0, parseFloat(tendered || 0) - total) : 0;

  const handleSubmit = async () => {
    if (method === 'cash' && (!tendered || parseFloat(tendered) < total)) {
      return toast.error('Tendered amount must be >= total');
    }
    if (method === 'card' && (!cardAmt || parseFloat(cardAmt) < total)) {
      return toast.error('Card amount must be >= total');
    }
    if (method === 'mixed' && (parseFloat(cardAmt || 0) + cashAmt) < total) {
      return toast.error('Total collected must be >= invoice total');
    }
    setLoading(true);
    try {
      await riderCollectPayment({
        order_id:       order.id,
        payment_method: method,
        cash_amount:    method === 'card'  ? 0 : (method === 'mixed' ? cashAmt : parseFloat(tendered || total)),
        card_amount:    method === 'cash'  ? 0 : parseFloat(cardAmt || 0),
        tendered_amount: method === 'cash' ? parseFloat(tendered) : total,
        notes,
      });
      toast.success('Payment collected!');
      onCollected();
      onClose();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to record payment'); }
    setLoading(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Collect Payment" width={460}>
      {/* Invoice */}
      <div style={{ background: T.surface, borderRadius: 12, padding: 16, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>#{order.order_number}</span>
          <span style={{ fontSize: 13, color: T.textMid }}>{order.customer_name}</span>
        </div>
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10, marginBottom: 10 }}>
          {(order.items || []).map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.text, marginBottom: 4 }}>
              <span>{item.quantity}x {item.name}</span>
              <span>{fmtCur(item.total_price)}</span>
            </div>
          ))}
        </div>
        {order.discount_amount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.red }}>
            <span>Discount</span><span>-{fmtCur(order.discount_amount)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, color: T.accent, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
          <span>Total</span><span>{fmtCur(total)}</span>
        </div>
      </div>

      {/* Payment Method */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: T.textMid, marginBottom: 8, fontWeight: 600 }}>Payment Method</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['cash','card','mixed'].map(m => (
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
        <Input
          label={method === 'mixed' ? 'Tendered Cash (PKR)' : 'Tendered Amount (PKR)'}
          type="number" value={tendered}
          onChange={e => setTendered(e.target.value)}
          placeholder={fmtCur(total)}
        />
      )}
      {(method === 'card' || method === 'mixed') && (
        <Input
          label="Card Amount (PKR)"
          type="number" value={cardAmt}
          onChange={e => setCardAmt(e.target.value)}
          placeholder={method === 'card' ? fmtCur(total) : '0'}
        />
      )}
      {method === 'cash' && tendered && parseFloat(tendered) >= total && (
        <div style={{ background: T.greenDim, border: `1px solid ${T.green}`, borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: T.textMid }}>Change to Return</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.green }}>{fmtCur(change)}</div>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: T.textMid, marginBottom: 6, fontWeight: 600 }}>Notes (optional)</div>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          style={{ width: '100%', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 14px', color: T.text, fontSize: 13, fontFamily: "'Syne', sans-serif", resize: 'none', minHeight: 50, outline: 'none' }}
          placeholder="Any notes..." />
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

export default function RiderDashboard() {
  useT();
  const [orders,       setOrders]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [collectOrder, setCollectOrder] = useState(null);
  const [mapOrder,     setMapOrder]     = useState(null);
  const [date,         setDate]         = useState(new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getRiderMyOrders({ date });
      setOrders(res.data);
    } catch { toast.error('Failed to load orders'); }
    setLoading(false);
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const handlePick = async (orderId) => {
    try {
      await pickOrder(orderId);
      toast.success('Order marked as picked up');
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Cannot pick order'); }
  };

  const stats = {
    total:     orders.length,
    active:    orders.filter(o => ['confirmed','preparing','ready','picked','out_for_delivery'].includes(o.status)).length,
    delivered: orders.filter(o => o.status === 'delivered').length,
    pending:   orders.filter(o => o.status === 'pending').length,
    sales:     orders.filter(o => o.status === 'delivered').reduce((s, o) => s + parseFloat(o.total_amount || 0), 0),
  };

  if (loading) return <Spinner />;

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="My Deliveries"
        subtitle="Your assigned orders for today"
        action={
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ marginBottom: 0, width: 160 }} />
        }
      />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Assigned', value: stats.total, icon: '📦' },
          { label: 'Active',         value: stats.active, icon: '🚴' },
          { label: 'Delivered',      value: stats.delivered, icon: '✅' },
          { label: 'Sales',          value: fmtCur(stats.sales), icon: '💰' },
        ].map(s => (
          <Card key={s.label}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: T.accent }}>{s.value}</div>
            <div style={{ fontSize: 11, color: T.textMid, textTransform: 'uppercase', letterSpacing: 0.8 }}>{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Order List */}
      {orders.length === 0
        ? <Card><div style={{ textAlign: 'center', padding: '40px 0', color: T.textDim }}>No orders assigned for {date}</div></Card>
        : (
          <div style={{ display: 'grid', gap: 14 }}>
            {orders.map(order => (
              <Card key={order.id} style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  {/* Order Info */}
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 800, color: T.text }}>#{order.order_number}</span>
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: (STATUS_COLOR[order.status] || '#888') + '22', color: STATUS_COLOR[order.status] || '#888' }}>
                        {order.status.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{order.customer_name}</div>
                    <div style={{ fontSize: 12, color: T.textMid }}>{order.customer_phone}</div>
                    {order.delivery_address?.address && (
                      <div style={{ fontSize: 12, color: T.textMid, marginTop: 4 }}>{order.delivery_address.address}</div>
                    )}
                    {/* Items */}
                    <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {(order.items || []).filter(Boolean).map((item, i) => (
                        <span key={i} style={{ padding: '3px 8px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 11, color: T.textMid }}>
                          {item.quantity}x {item.name}
                        </span>
                      ))}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11, color: T.textDim }}>
                      Ordered: {fmtTime(order.created_at)}
                      {order.picked_at && ` · Picked: ${fmtTime(order.picked_at)}`}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: T.accent }}>{fmtCur(order.total_amount)}</div>

                    {order.customer_lat && order.customer_lng && (
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${order.customer_lat},${order.customer_lng}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ padding: '8px 14px', background: '#4285F4', color: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        📍 Navigate
                      </a>
                    )}

                    {['confirmed','preparing','ready'].includes(order.status) && (
                      <Btn size="sm" onClick={() => handlePick(order.id)}>
                        Mark Picked Up
                      </Btn>
                    )}

                    {order.status === 'picked' && !order.collection_status && (
                      <Btn size="sm" onClick={() => setCollectOrder(order)}>
                        Collect Payment
                      </Btn>
                    )}

                    {order.status === 'delivered' && (
                      <span style={{ fontSize: 12, color: T.green, fontWeight: 700 }}>
                        Collected {fmtCur(order.total_collected)}
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      }

      <CollectModal
        order={collectOrder}
        open={!!collectOrder}
        onClose={() => setCollectOrder(null)}
        onCollected={load}
      />
    </div>
  );
}
