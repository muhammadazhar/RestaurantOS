import React, { useEffect, useState, useCallback } from 'react';
import { getOrders, updateOrderStatus, getPhoneOrders, assignRider, getRiders, getRestaurantSettings } from '../../services/api';
import { Card, Badge, Spinner, Btn, Modal, Select, PageHeader, T, useT } from '../shared/UI';
import { mergePrintTemplates, renderReceiptHtml } from '../../utils/printTemplates';
import toast from 'react-hot-toast';

const STATUS_COLOR = {
  pending:   T.blue,   confirmed: T.blue,
  preparing: T.accent, ready:     T.green,
  served:    T.textMid, paid:     T.green,
  cancelled: T.red,
};

const ORDER_TYPE_ICON = { dine_in: '🪑', takeaway: '🛍', online: '📲', delivery: '🛵' };

const fmt    = n => `PKR ${Number(n||0).toLocaleString()}`;
const fmtDT  = d => new Date(d).toLocaleString('en-PK', { dateStyle:'short', timeStyle:'short' });
const fmtDay = d => new Date(d).toLocaleDateString('en-PK', { weekday:'short', day:'numeric', month:'short' });
const isReturnedItem = item => item?.status === 'cancelled' || item?.returned === true;
const itemChargeTotal = item => Number(item.total_price ?? (Number(item.unit_price || 0) * Number(item.quantity || 1)));
const itemDisplayTotal = item => isReturnedItem(item) ? -Math.abs(itemChargeTotal(item)) : itemChargeTotal(item);
const fmtLineAmount = value => {
  const amount = Number(value || 0);
  return `${amount < 0 ? '-PKR ' : 'PKR '}${Math.abs(amount).toLocaleString('en-PK')}`;
};

// ─── Receipt printer ──────────────────────────────────────────────────────────
function printReceipt(order, printSettings) {
  const fmtD = (d) => new Date(d).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' });
  const methodLabel = { cash: 'Cash', card: 'Card', jazzcash: 'JazzCash', easypaisa: 'Easypaisa' }[order.payment_method] || order.payment_method || '—';
  const isDineIn = order.order_type === 'dine_in';
  const items = (order.items || []).filter(i => i?.name);
  const w = window.open('', '_blank', 'width=420,height=720');
  const templates = mergePrintTemplates(printSettings || {});
  w.document.write(renderReceiptHtml({
    template: templates.receipt,
    restaurant: printSettings || {},
    order,
    items,
    table: isDineIn ? { label: order.table_label } : null,
    taxLabel: 'Tax',
    methodLabel,
    isPaid: order.payment_status === 'paid',
    cashierName: order.server_name || '',
    waiterName: order.waiter_name || '',
    shiftLabel: order.shift_number ? `#${order.shift_number} ${order.shift_name || ''} (${(order.shift_start || '').slice(0, 5)}-${(order.shift_end || '').slice(0, 5)})` : '',
  }));
  w.document.close();
  setTimeout(() => w.print(), 400);
  return;
  w.document.write(`
    <!DOCTYPE html><html><head><title>Receipt — ${order.order_number}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Courier New', monospace; font-size: 13px; padding: 24px 20px; color: #111; }
      .center { text-align: center; }
      .bold   { font-weight: bold; }
      .row    { display: flex; justify-content: space-between; padding: 3px 0; }
      .grid4  { display: grid; grid-template-columns: 1fr 40px 90px 90px; gap: 4px; padding: 5px 0; border-bottom: 1px dashed #ccc; }
      .line   { border-top: 1px dashed #999; margin: 10px 0; }
      .big    { font-size: 16px; font-weight: bold; }
      .small  { font-size: 11px; color: #666; }
      .paid-stamp { border: 3px solid #000; border-radius: 6px; padding: 6px 16px; display: inline-block; font-size: 18px; font-weight: bold; letter-spacing: 3px; margin-top: 14px; }
      @media print { body { padding: 0 4px; } }
    </style></head>
    <body>
      <div class="center bold" style="font-size:20px; margin-bottom:4px">The Golden Fork</div>
      <div class="center small" style="margin-bottom:16px">Fine dining at its best · Karachi</div>
      <div class="line"></div>
      <div class="row"><span>Order:</span><span class="bold">${order.order_number}</span></div>
      <div class="row"><span>Type:</span><span>${(order.order_type || '').replace('_',' ').toUpperCase()}</span></div>
      <div class="row"><span>Cashier:</span><span class="bold">${order.server_name || '—'}</span></div>
      ${order.shift_number ? `<div class="row"><span>Shift:</span><span class="bold">#${order.shift_number} ${order.shift_name || ''} (${(order.shift_start||'').slice(0,5)}–${(order.shift_end||'').slice(0,5)})</span></div>` : ''}
      ${isDineIn
        ? `<div class="row"><span>Table:</span><span class="bold">${order.table_label || '—'}</span></div>
           <div class="row"><span>Guests:</span><span>${order.guest_count || '—'}</span></div>`
        : `<div class="row"><span>Customer:</span><span class="bold">${order.customer_name || '—'}</span></div>
           ${order.customer_phone ? `<div class="row"><span>Phone:</span><span>${order.customer_phone}</span></div>` : ''}`
      }
      <div class="row"><span>Date:</span><span>${fmtD(order.created_at)}</span></div>
      <div class="line"></div>
      <div class="grid4">
        <span class="small">ITEM</span>
        <span class="small" style="text-align:center">QTY</span>
        <span class="small" style="text-align:right">UNIT</span>
        <span class="small" style="text-align:right">TOTAL</span>
      </div>
      ${items.map(i => `
        <div class="grid4">
          <span>${i.name}${i.notes ? '<br><span style="font-size:10px;color:#888">'+i.notes+'</span>' : ''}</span>
          <span style="text-align:center">x${i.quantity}</span>
          <span style="text-align:right">PKR ${Number(i.unit_price).toLocaleString()}</span>
          <span style="text-align:right" class="bold">PKR ${Number(i.total_price).toLocaleString()}</span>
        </div>
      `).join('')}
      <div class="line"></div>
      <div class="row"><span>Subtotal</span><span>PKR ${Number(order.subtotal).toLocaleString()}</span></div>
      <div class="row"><span>Tax</span><span>PKR ${Number(order.tax_amount).toLocaleString()}</span></div>
      ${Number(order.discount_amount) > 0 ? `<div class="row"><span>Discount</span><span>- PKR ${Number(order.discount_amount).toLocaleString()}</span></div>` : ''}
      <div class="line"></div>
      <div class="row big"><span>TOTAL</span><span>PKR ${Number(order.total_amount).toLocaleString()}</span></div>
      <div class="line"></div>
      ${order.payment_status === 'paid'
        ? `<div class="row"><span>Payment</span><span class="bold">${methodLabel}</span></div>
           <div class="center" style="margin-top:12px"><span class="paid-stamp">★ PAID ★</span></div>`
        : `<div class="center" style="margin-top:12px; font-size:13px; color:#888">Payment pending</div>`
      }
      <div class="center small" style="margin-top:20px; line-height:1.8">
        ${isDineIn ? 'Thank you for dining with us!' : 'Thank you for your order!'}<br>
        Please come again soon.<br>★★★★★
      </div>
    </body></html>
  `);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

// ─── Order detail modal ───────────────────────────────────────────────────────
function OrderDetailModal({ order, open, onClose, onStatusChange, printSettings }) {
  if (!order) return null;
  const canAdvance = !['paid','cancelled','served'].includes(order.status);
  const NEXT = { pending:'confirmed', confirmed:'preparing', preparing:'ready', ready:'served', served:'paid' };

  return (
    <Modal open={open} onClose={onClose} title={`Order ${order.order_number}`} width={520}>
      {/* Meta */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, background: T.surface, borderRadius: 12, padding: '12px 14px', marginBottom: 18 }}>
        {[
          ['Type',    `${ORDER_TYPE_ICON[order.order_type] || ''} ${order.order_type?.replace('_',' ')}`],
          ['Table',   order.table_label || '—'],
          ['Cashier', order.server_name || '—'],
          ['Shift',   order.shift_number ? `#${order.shift_number} ${order.shift_name || ''} (${order.shift_start?.slice(0,5)||''}–${order.shift_end?.slice(0,5)||''})` : '—'],
          ['Guests',  order.guest_count || '—'],
          ['Date',    fmtDT(order.created_at)],
          ['Source',  order.source || 'pos'],
        ].map(([k,v]) => (
          <div key={k}>
            <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 3 }}>{k}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{v}</div>
          </div>
        ))}
        {order.customer_name && (
          <div style={{ gridColumn: '1/-1', borderTop: `1px solid ${T.border}`, paddingTop: 10, marginTop: 2 }}>
            <span style={{ fontSize: 12, color: T.textMid }}>Customer: </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{order.customer_name}</span>
            {order.customer_phone && <span style={{ fontSize: 12, color: T.textMid }}> · {order.customer_phone}</span>}
          </div>
        )}
        {order.notes && (
          <div style={{ gridColumn: '1/-1', borderTop: `1px solid ${T.border}`, paddingTop: 10, marginTop: 2 }}>
            <span style={{ fontSize: 12, color: T.textMid }}>Notes: </span>
            <span style={{ fontSize: 12, color: T.text }}>{order.notes}</span>
          </div>
        )}
      </div>

      {/* Items */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.textMid, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Items</div>
        {(order.items || []).filter(i => i?.name).map((item, idx) => {
          const returned = isReturnedItem(item);
          return (
          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: `1px solid ${T.border}` }}>
            <div>
              <span style={{ fontSize: 13, color: returned ? T.red : T.text, fontWeight: 600, textDecoration: returned ? 'line-through' : 'none', textDecorationColor: T.red, textDecorationThickness: 1 }}>{item.name}</span>
              {returned && <div style={{ fontSize: 10, color: T.red, fontWeight: 800, marginTop: 2 }}>Returned</div>}
              {item.notes && <div style={{ fontSize: 11, color: T.accent, marginTop: 2 }}>📝 {item.notes}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: returned ? T.red : T.textMid, textDecoration: returned ? 'line-through' : 'none', textDecorationColor: T.red, textDecorationThickness: 1 }}>×{item.quantity} @ PKR {Number(item.unit_price).toLocaleString()}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: returned ? T.red : T.text, fontFamily: 'monospace', textDecoration: returned ? 'line-through' : 'none', textDecorationColor: T.red, textDecorationThickness: 1 }}>{fmtLineAmount(itemDisplayTotal(item))}</div>
            </div>
          </div>
        );})}
      </div>

      {/* Totals */}
      <div style={{ background: T.surface, borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
        {[['Subtotal', fmt(order.subtotal)], ['Tax', fmt(order.tax_amount)]].map(([l,v]) => (
          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: T.textMid }}>{l}</span>
            <span style={{ fontSize: 13, fontFamily: 'monospace', color: T.text }}>{v}</span>
          </div>
        ))}
        {Number(order.discount_amount) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: T.green }}>Discount</span>
            <span style={{ fontSize: 13, fontFamily: 'monospace', color: T.green }}>− {fmt(order.discount_amount)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: T.text }}>Total</span>
          <span style={{ fontSize: 15, fontWeight: 800, fontFamily: 'monospace', color: T.accent }}>{fmt(order.total_amount)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <span style={{ fontSize: 12, color: T.textMid }}>Payment</span>
          <Badge color={order.payment_status === 'paid' ? T.green : T.textDim} small>{order.payment_status}</Badge>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {canAdvance && (
          <Btn onClick={() => { onStatusChange(order.id, NEXT[order.status]); onClose(); }} style={{ width: '100%' }}>
            Advance → {NEXT[order.status]}
          </Btn>
        )}
        {order.status === 'served' && order.payment_status !== 'paid' && (
          <Btn onClick={() => { onStatusChange(order.id, 'paid'); onClose(); }} style={{ width: '100%', background: T.green, color: '#fff', border: 'none' }}>
            ✓ Mark as Paid
          </Btn>
        )}
        <Btn variant="ghost" onClick={() => printReceipt(order, printSettings)} style={{ width: '100%' }}>
          🖨 Print Receipt
        </Btn>
        {order.payment_status !== 'paid' && order.status !== 'cancelled' && (
          <Btn
            onClick={() => {
              if (window.confirm('Cancel this order? This cannot be undone.')) {
                onStatusChange(order.id, 'cancelled');
                onClose();
              }
            }}
            style={{ width: '100%', background: T.redDim, color: T.red, border: `1px solid ${T.red}44` }}
          >
            ✕ Cancel Order
          </Btn>
        )}
      </div>
    </Modal>
  );
}

// ─── Phone Orders Panel ───────────────────────────────────────────────────────
const PHONE_STATUS_COLOR = {
  pending: '#F39C12', confirmed: '#3498DB', preparing: '#9B59B6',
  ready: '#27AE60', picked: '#2ECC71', delivered: '#27AE60',
  cancelled: '#E74C3C',
};

function PhoneOrdersPanel() {
  useT();
  const [orders,        setOrders]        = useState([]);
  const [riders,        setRiders]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [date,          setDate]          = useState(new Date().toISOString().slice(0, 10));
  const [statusFilter,  setStatusFilter]  = useState('all');
  const [assignModal,   setAssignModal]   = useState(null);
  const [assignRiderId, setAssignRiderId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersR, ridersR] = await Promise.all([
        getPhoneOrders({ date, ...(statusFilter !== 'all' ? { status: statusFilter } : {}) }),
        getRiders(),
      ]);
      setOrders(ordersR.data);
      setRiders(ridersR.data);
    } catch { toast.error('Failed to load phone orders'); }
    setLoading(false);
  }, [date, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleAssign = async () => {
    if (!assignRiderId) return toast.error('Select a rider');
    try {
      await assignRider(assignModal.orderId, { rider_id: assignRiderId });
      toast.success('Rider assigned');
      setAssignModal(null); setAssignRiderId('');
      load();
    } catch { toast.error('Failed to assign rider'); }
  };

  const fmtT = ts => ts ? new Date(ts).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }) : '—';
  const fmtM = v  => 'PKR ' + parseFloat(v || 0).toLocaleString('en-PK', { minimumFractionDigits: 0 });

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 11, color: T.textMid, marginBottom: 5, fontWeight: 600 }}>Date</div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 12px', color: T.text, fontSize: 13, outline: 'none', fontFamily: "'Inter', sans-serif" }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: T.textMid, marginBottom: 5, fontWeight: 600 }}>Status</div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 12px', color: T.text, fontSize: 13, outline: 'none', fontFamily: "'Inter', sans-serif" }}>
            <option value="all">All</option>
            {['pending','confirmed','preparing','ready','picked','delivered','cancelled'].map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>
        <Btn size="sm" variant="ghost" onClick={load}>↻ Refresh</Btn>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
          {[
            { label: 'Total',     value: orders.length },
            { label: 'Delivered', value: orders.filter(o => o.status === 'delivered').length },
            { label: 'Revenue',   value: fmtM(orders.filter(o => o.status === 'delivered').reduce((s, o) => s + parseFloat(o.total_amount || 0), 0)) },
          ].map(s => (
            <div key={s.label} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '6px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.accent }}>{s.value}</div>
              <div style={{ fontSize: 10, color: T.textMid }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {loading ? <Spinner /> : orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: T.textDim }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📞</div>
          <div style={{ fontWeight: 700, color: T.textMid }}>No phone orders for {date}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {orders.map(order => (
            <div key={order.id} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              background: T.card, border: `1px solid ${T.border}`,
              borderLeft: `3px solid ${PHONE_STATUS_COLOR[order.status] || T.textDim}`,
              borderRadius: 12, padding: '12px 16px',
            }}>
              <div style={{ fontSize: 20, flexShrink: 0 }}>📞</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: 13, color: T.text }}>{order.order_number}</span>
                  <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: (PHONE_STATUS_COLOR[order.status] || '#888') + '22', color: PHONE_STATUS_COLOR[order.status] || '#888' }}>
                    {order.status.replace(/_/g, ' ').toUpperCase()}
                  </span>
                  {order.payment_status === 'paid' && <Badge color={T.green} small>✓ Paid</Badge>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{order.customer_name}</div>
                <div style={{ fontSize: 11, color: T.textMid }}>{order.customer_phone}</div>
                {order.delivery_address?.address && <div style={{ fontSize: 11, color: T.textMid }}>{order.delivery_address.address}</div>}
                <div style={{ fontSize: 10, color: T.textDim, marginTop: 3 }}>
                  {order.items?.filter(i => i?.name).length || 0} items · {fmtT(order.created_at)}
                  {order.rider_name && <span style={{ color: T.green }}> · 🏍 {order.rider_name}</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: T.accent, fontFamily: 'monospace', marginBottom: 6 }}>
                  PKR {Number(order.total_amount).toLocaleString()}
                </div>
                {!order.rider_id && order.status !== 'cancelled' && (
                  <Btn size="sm" onClick={() => { setAssignModal({ orderId: order.id }); setAssignRiderId(''); }}>
                    Assign Rider
                  </Btn>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!assignModal} onClose={() => setAssignModal(null)} title="Assign Rider" width={380}>
        <Select label="Select Rider" value={assignRiderId} onChange={e => setAssignRiderId(e.target.value)}>
          <option value="">-- Choose a rider --</option>
          {riders.map(r => <option key={r.id} value={r.id}>{r.full_name} · {r.active_orders} active</option>)}
        </Select>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <Btn variant="ghost" onClick={() => setAssignModal(null)} style={{ flex: 1 }}>Cancel</Btn>
          <Btn onClick={handleAssign} style={{ flex: 1 }}>Assign</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ─── Main Orders page ─────────────────────────────────────────────────────────
const today = () => new Date().toISOString().slice(0,10);

export default function Orders() {
  useT();
  const [mainTab,  setMainTab]  = useState('all'); // 'all' | 'phone'
  const [orders,   setOrders]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [detail,   setDetail]   = useState(null);
  const [search,   setSearch]   = useState('');
  const [statusF,  setStatusF]  = useState('all');
  const [typeF,    setTypeF]    = useState('all');
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo,   setDateTo]   = useState(today());
  const [printSettings, setPrintSettings] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusF !== 'all') params.status = statusF;
      if (typeF   !== 'all') params.order_type = typeF;
      const res = await getOrders(params);
      // Filter by date client-side for flexibility
      const from = new Date(dateFrom + 'T00:00:00');
      const to   = new Date(dateTo   + 'T23:59:59');
      setOrders(res.data.filter(o => {
        const d = new Date(o.created_at);
        return d >= from && d <= to;
      }));
    } catch { toast.error('Failed to load orders'); }
    finally { setLoading(false); }
  }, [statusF, typeF, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    getRestaurantSettings().then(r => setPrintSettings(r.data)).catch(() => {});
  }, []);

  const handleStatus = async (id, status) => {
    try { await updateOrderStatus(id, status); toast.success(`Order → ${status}`); load(); }
    catch { toast.error('Update failed'); }
  };

  const filtered = orders.filter(o =>
    !search ||
    o.order_number?.toLowerCase().includes(search.toLowerCase()) ||
    o.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    o.table_label?.toLowerCase().includes(search.toLowerCase())
  );

  // Summary stats
  const totalRevenue = filtered.filter(o => o.payment_status === 'paid').reduce((s,o) => s + Number(o.total_amount), 0);
  const paidCount    = filtered.filter(o => o.payment_status === 'paid').length;
  const unpaidCount  = filtered.filter(o => o.payment_status !== 'paid' && o.status !== 'cancelled').length;

  // Group by date for display
  const grouped = filtered.reduce((acc, o) => {
    const day = new Date(o.created_at).toISOString().slice(0,10);
    if (!acc[day]) acc[day] = [];
    acc[day].push(o);
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        title="📋 Orders"
        subtitle={mainTab === 'all' ? `${filtered.length} orders · PKR ${totalRevenue.toLocaleString()} collected` : 'Phone delivery orders'}
        action={<Btn onClick={load} variant="ghost">↻ Refresh</Btn>}
      />

      {/* Main tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: `1px solid ${T.border}`, paddingBottom: 10 }}>
        {[['all', '📋 All Orders'], ['phone', '📞 Phone Orders']].map(([key, label]) => (
          <button key={key} onClick={() => setMainTab(key)} style={{
            padding: '8px 20px', borderRadius: 10, border: 'none',
            background: mainTab === key ? T.accent : 'transparent',
            color: mainTab === key ? '#000' : T.textMid,
            fontWeight: 700, fontSize: 13, cursor: 'pointer',
          }}>{label}</button>
        ))}
      </div>

      {mainTab === 'phone' && <PhoneOrdersPanel />}

      {mainTab === 'all' && <>
      {/* Summary pills */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[['Total', filtered.length, T.accent], ['Paid', paidCount, T.green], ['Unpaid', unpaidCount, T.red], ['Revenue', `PKR ${totalRevenue.toLocaleString()}`, T.accent]].map(([l,v,c]) => (
          <div key={l} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
            <span style={{ fontSize: 12, color: T.textMid }}>{l}</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: c, fontFamily: 'monospace' }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <Card style={{ marginBottom: 20, padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {/* Date range */}
          <div>
            <div style={{ fontSize: 11, color: T.textMid, marginBottom: 5, fontWeight: 600 }}>From</div>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 12px', color: T.text, fontSize: 13, fontFamily: "'Inter', sans-serif", outline: 'none' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: T.textMid, marginBottom: 5, fontWeight: 600 }}>To</div>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 12px', color: T.text, fontSize: 13, fontFamily: "'Inter', sans-serif", outline: 'none' }} />
          </div>
          {/* Status filter */}
          <div>
            <div style={{ fontSize: 11, color: T.textMid, marginBottom: 5, fontWeight: 600 }}>Status</div>
            <select value={statusF} onChange={e => setStatusF(e.target.value)}
              style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 12px', color: T.text, fontSize: 13, fontFamily: "'Inter', sans-serif", outline: 'none' }}>
              <option value="all">All Statuses</option>
              {['pending','confirmed','preparing','ready','served','paid','cancelled'].map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
          {/* Type filter */}
          <div>
            <div style={{ fontSize: 11, color: T.textMid, marginBottom: 5, fontWeight: 600 }}>Type</div>
            <select value={typeF} onChange={e => setTypeF(e.target.value)}
              style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 12px', color: T.text, fontSize: 13, fontFamily: "'Inter', sans-serif", outline: 'none' }}>
              <option value="all">All Types</option>
              {['dine_in','takeaway','online','delivery'].map(t => (
                <option key={t} value={t}>{t.replace('_',' ')}</option>
              ))}
            </select>
          </div>
          {/* Search */}
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 11, color: T.textMid, marginBottom: 5, fontWeight: 600 }}>Search</div>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Order #, customer, table…"
              style={{ width: '100%', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 12px', color: T.text, fontSize: 13, fontFamily: "'Inter', sans-serif", outline: 'none' }} />
          </div>
          {/* Quick date buttons */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[['Today', today(), today()], ['Yesterday', (() => { const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); })(), (() => { const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); })()], ['Week', (() => { const d = new Date(); d.setDate(d.getDate()-6); return d.toISOString().slice(0,10); })(), today()]].map(([lbl, from, to]) => (
              <button key={lbl} onClick={() => { setDateFrom(from); setDateTo(to); }}
                style={{ background: T.card, border: `1px solid ${T.border}`, color: T.textMid, borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Orders list */}
      {loading ? <Spinner /> : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 80, color: T.textDim }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.textMid }}>No orders found</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Try adjusting your filters</div>
        </div>
      ) : (
        Object.entries(grouped).sort(([a],[b]) => b.localeCompare(a)).map(([day, dayOrders]) => (
          <div key={day} style={{ marginBottom: 28 }}>
            {/* Day header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.textMid, letterSpacing: 1, textTransform: 'uppercase' }}>
                {fmtDay(day)}
              </div>
              <div style={{ flex: 1, height: 1, background: T.border }} />
              <div style={{ fontSize: 12, color: T.textMid }}>
                {dayOrders.length} orders · PKR {dayOrders.filter(o => o.payment_status==='paid').reduce((s,o)=>s+Number(o.total_amount),0).toLocaleString()} collected
              </div>
            </div>

            {/* Order rows */}
            {dayOrders.map(order => (
              <div key={order.id} onClick={() => setDetail(order)} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                background: T.card, border: `1px solid ${T.border}`,
                borderLeft: `3px solid ${STATUS_COLOR[order.status] || T.textDim}`,
                borderRadius: 12, padding: '12px 16px', marginBottom: 8,
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
                {/* Icon + type */}
                <div style={{ fontSize: 20, flexShrink: 0 }}>{ORDER_TYPE_ICON[order.order_type] || '📋'}</div>

                {/* Order info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: 13, color: T.text }}>{order.order_number}</span>
                    <Badge color={STATUS_COLOR[order.status] || T.textDim} small>{order.status}</Badge>
                    {order.payment_status === 'paid' && <Badge color={T.green} small>✓ Paid</Badge>}
                  </div>
                  <div style={{ fontSize: 11, color: T.textMid }}>
                    {order.table_label ? `Table ${order.table_label}` : ''}
                    {order.customer_name ? ` ${order.customer_name}` : ''}
                    {order.server_name ? ` · 👤 ${order.server_name}` : ''}
                    {order.shift_number ? ` · 🕐 Shift #${order.shift_number} ${order.shift_name || ''}` : ''}
                    {` · ${order.items?.filter(i=>i?.name).length || 0} items`}
                    {` · ${new Date(order.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`}
                  </div>
                </div>

                {/* Amount */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: order.payment_status === 'paid' ? T.green : T.accent, fontFamily: 'monospace' }}>
                    PKR {Number(order.total_amount).toLocaleString()}
                  </div>
                  {order.discount_amount > 0 && (
                    <div style={{ fontSize: 10, color: T.green }}>− PKR {Number(order.discount_amount).toLocaleString()} disc.</div>
                  )}
                </div>

                <div style={{ color: T.textDim, fontSize: 18, flexShrink: 0 }}>›</div>
              </div>
            ))}
          </div>
        ))
      )}

      <OrderDetailModal
        order={detail}
        open={!!detail}
        onClose={() => setDetail(null)}
        onStatusChange={handleStatus}
        printSettings={printSettings}
      />
      </>}
    </div>
  );
}
