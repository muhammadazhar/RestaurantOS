import React, { useEffect, useState, useCallback } from 'react';
import { getMenu, getTables, createOrder, getOrders, updateOrderStatus, getCurrentShift } from '../../services/api';
import { Card, Pill, Badge, Spinner, Btn, Modal, Input, Select, T, useT } from '../shared/UI';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const IMG_BASE = process.env.REACT_APP_SOCKET_URL
  || (window.location.protocol + '//' + window.location.hostname + ':5000');

// ─── Menu item image ──────────────────────────────────────────────────────────
const ItemImage = ({ src, name }) => {
  const [err, setErr] = useState(false);
  const url = src && !err ? (src.startsWith('http') ? src : `${IMG_BASE}${src}`) : null;
  return (
    <div style={{ fontSize: url ? 0 : 32, width: 56, height: 56, borderRadius: 10, overflow: 'hidden', background: T.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {url
        ? <img src={url} alt={name} onError={() => setErr(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : '🍽'
      }
    </div>
  );
};

// ─── Cart item notes modal ────────────────────────────────────────────────────
function ItemNotesModal({ item, open, onClose, onSave }) {
  const [notes, setNotes] = useState('');
  useEffect(() => { if (open) setNotes(item?.notes || ''); }, [open, item]);
  return (
    <Modal open={open} onClose={onClose} title={`Notes — ${item?.name}`} width={380}>
      <textarea value={notes} onChange={e => setNotes(e.target.value)}
        placeholder="e.g. No onions, extra spicy, medium-well…"
        style={{ width: '100%', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 14px', color: T.text, fontSize: 13, fontFamily: "'Syne', sans-serif", outline: 'none', resize: 'vertical', minHeight: 80, marginBottom: 12 }} />
      <Btn onClick={() => { onSave(notes); onClose(); }} style={{ width: '100%' }}>Save Notes</Btn>
    </Modal>
  );
}

export default function POS() {
  useT();
  const { hasPermission } = useAuth();
  const [menu,         setMenu]         = useState({ categories: [], items: [] });
  const [tables,       setTables]       = useState([]);
  const [onlineOrders, setOnlineOrders] = useState([]);
  const [cat,          setCat]          = useState('All');
  const [search,       setSearch]       = useState('');
  const [cart,         setCart]         = useState([]);
  const [tableId,      setTableId]      = useState('');
  const [orderType,    setOrderType]    = useState(hasPermission('tables') ? 'dine_in' : 'takeaway');
  const [guestCount,   setGuestCount]   = useState(1);
  const [discount,     setDiscount]     = useState('');
  const [custName,     setCustName]     = useState('');
  const [custPhone,    setCustPhone]    = useState('');
  const [orderNotes,   setOrderNotes]   = useState('');
  const [loading,      setLoading]      = useState(true);
  const [sending,      setSending]      = useState(false);
  const [notesItem,    setNotesItem]    = useState(null);
  const [createdOrder, setCreatedOrder] = useState(null);   // takeaway pay modal
  const [showPayModal, setShowPayModal] = useState(false);
  const [takePayMethod,setTakePayMethod]= useState('cash');
  const [takePaying,   setTakePaying]   = useState(false);
  const [takePrintRdy, setTakePrintRdy] = useState(false);
  const [currentShift, setCurrentShift] = useState(null);   // { shift, allowed, reason }
  const { on, off } = useSocket();
  const { user } = useAuth();

  const load = useCallback(() => {
    const tablesCall = hasPermission('tables') ? getTables() : Promise.resolve({ data: [] });
    Promise.all([getMenu(), tablesCall, getOrders({ order_type: 'online', status: 'pending' }), getCurrentShift()])
      .then(([m, t, o, s]) => { setMenu(m.data); setTables(t.data); setOnlineOrders(o.data); setCurrentShift(s.data); })
      .finally(() => setLoading(false));
  }, [hasPermission]);

  useEffect(() => {
    load();
    on('new_order', load);
    return () => off('new_order', load);
  }, [load, on, off]);

  const cats = ['All', ...menu.categories.map(c => c.name)];

  const filtered = menu.items.filter(item => {
    const matchCat    = cat === 'All' || item.category_name === cat;
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch && item.is_available !== false;
  });

  const addToCart = (item) => setCart(prev => {
    const ex = prev.find(c => c.id === item.id);
    if (ex) return prev.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c);
    return [...prev, { ...item, qty: 1, notes: '' }];
  });

  const changeQty = (id, delta) => setCart(prev =>
    prev.map(c => c.id === id ? { ...c, qty: Math.max(1, c.qty + delta) } : c)
        .filter(c => c.qty > 0)
  );

  const removeItem = (id) => setCart(prev => prev.filter(c => c.id !== id));

  const setItemNotes = (id, notes) => setCart(prev =>
    prev.map(c => c.id === id ? { ...c, notes } : c)
  );

  const subtotal     = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discountAmt  = Math.min(parseFloat(discount) || 0, subtotal);
  const taxable      = subtotal - discountAmt;
  const tax          = Math.round(taxable * 0.08 * 100) / 100;
  const total        = taxable + tax;

  const sendToKitchen = async () => {
    if (!cart.length)                             return toast.error('Cart is empty');
    if (orderType === 'dine_in' && !tableId)      return toast.error('Select a table');
    if (['takeaway','delivery'].includes(orderType) && !custName) return toast.error('Customer name required');
    setSending(true);
    try {
      const res = await createOrder({
        table_id:       tableId || null,
        order_type:     orderType,
        guest_count:    parseInt(guestCount) || 1,
        shift_id:       currentShift?.shift?.id || undefined,
        customer_name:  custName  || undefined,
        customer_phone: custPhone || undefined,
        notes:          orderNotes || undefined,
        discount_amount: discountAmt || undefined,
        items: cart.map(c => ({
          menu_item_id: c.id, name: c.name,
          quantity: c.qty, unit_price: c.price,
          notes: c.notes || undefined,
        })),
      });
      if (['takeaway', 'delivery'].includes(orderType)) {
        // Store order + local totals for pay/print modal
        setCreatedOrder({
          ...res.data,
          _cartItems:  cart,
          _subtotal:   subtotal,
          _discountAmt: discountAmt,
          _tax:        tax,
          _total:      total,
          _custName:   custName,
          _custPhone:  custPhone,
        });
        setTakePayMethod('cash');
        setTakePrintRdy(false);
        setShowPayModal(true);
      } else {
        toast.success('Order sent to kitchen! 🍳');
        setCart([]); setDiscount(''); setCustName(''); setCustPhone(''); setOrderNotes(''); setGuestCount(1);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send order');
    } finally { setSending(false); }
  };

  const handleTakeawayPay = async () => {
    if (!createdOrder) return;
    setTakePaying(true);
    try {
      await updateOrderStatus(createdOrder.id, 'paid', takePayMethod);
      toast.success('✅ Payment confirmed!');
      setTakePrintRdy(true);
    } catch {
      toast.error('Payment failed — please try again');
    } finally { setTakePaying(false); }
  };

  const printTakeawayReceipt = () => {
    if (!createdOrder) return;
    const o = createdOrder;
    const methodLabel = { cash: 'Cash', card: 'Card', jazzcash: 'JazzCash', easypaisa: 'Easypaisa' }[takePayMethod] || takePayMethod;
    const fmtD = (d) => new Date(d).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' });
    const items = (o.items && o.items.length ? o.items : o._cartItems.map(c => ({
      name: c.name, quantity: c.qty, unit_price: c.price, total_price: c.price * c.qty, notes: c.notes,
    }))).filter(i => i?.name);
    const sub  = Number(o.subtotal  || o._subtotal);
    const tax  = Number(o.tax_amount|| o._tax);
    const disc = Number(o.discount_amount || o._discountAmt || 0);
    const ttl  = Number(o.total_amount   || o._total);
    const w = window.open('', '_blank', 'width=420,height=720');
    w.document.write(`
      <!DOCTYPE html><html><head><title>Receipt — ${o.order_number}</title>
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
        <div class="row"><span>Order:</span><span class="bold">${o.order_number}</span></div>
        <div class="row"><span>Type:</span><span>${(o.order_type || orderType).replace('_',' ').toUpperCase()}</span></div>
        <div class="row"><span>Customer:</span><span class="bold">${o.customer_name || o._custName || '—'}</span></div>
        ${(o.customer_phone || o._custPhone) ? `<div class="row"><span>Phone:</span><span>${o.customer_phone || o._custPhone}</span></div>` : ''}
        <div class="row"><span>Date:</span><span>${fmtD(o.created_at || new Date())}</span></div>
        <div class="row"><span>Cashier:</span><span class="bold">${user?.full_name || user?.name || '—'}</span></div>
        ${currentShift?.shift ? `<div class="row"><span>Shift:</span><span class="bold">#${currentShift.shift.shift_number || '—'} ${currentShift.shift.shift_name} (${currentShift.shift.start_time?.slice(0,5)}–${currentShift.shift.end_time?.slice(0,5)})</span></div>` : ''}
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
        <div class="row"><span>Subtotal</span><span>PKR ${sub.toLocaleString()}</span></div>
        <div class="row"><span>Tax (8%)</span><span>PKR ${tax.toLocaleString()}</span></div>
        ${disc > 0 ? `<div class="row"><span>Discount</span><span>- PKR ${disc.toLocaleString()}</span></div>` : ''}
        <div class="line"></div>
        <div class="row big"><span>TOTAL</span><span>PKR ${ttl.toLocaleString()}</span></div>
        <div class="line"></div>
        <div class="row"><span>Payment</span><span class="bold">${methodLabel}</span></div>
        <div class="center" style="margin-top:12px"><span class="paid-stamp">★ PAID ★</span></div>
        <div class="center small" style="margin-top:20px; line-height:1.8">
          Thank you for your order!<br>Please come again soon.<br>★★★★★
        </div>
      </body></html>
    `);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  const closeTakeawayModal = () => {
    setShowPayModal(false);
    setCreatedOrder(null);
    setTakePrintRdy(false);
    setCart([]); setDiscount(''); setCustName(''); setCustPhone(''); setOrderNotes(''); setGuestCount(1);
  };

  if (loading) return <Spinner />;

  const needCustomer = ['takeaway', 'delivery', 'online'].includes(orderType);
  const shiftBlocked = currentShift && !currentShift.allowed;

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 56px)', position: 'relative' }}>

      {/* ── Shift blocked overlay ── */}
      {shiftBlocked && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: 12 }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🚫</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 8 }}>POS Locked</div>
          <div style={{ fontSize: 15, color: '#f87171', fontWeight: 600, marginBottom: 24, textAlign: 'center', maxWidth: 360 }}>{currentShift.reason}</div>
          <div style={{ fontSize: 13, color: '#aaa', textAlign: 'center' }}>Contact your manager to update your shift schedule.</div>
        </div>
      )}

      {/* ── Menu panel ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>

        {/* Top bar */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: T.text, margin: 0 }}>📲 POS</h1>
          {currentShift?.shift && (
            <div style={{ background: currentShift.allowed ? T.greenDim : T.redDim, border: `1px solid ${currentShift.allowed ? T.green : T.red}44`, borderRadius: 8, padding: '4px 12px', fontSize: 11, fontWeight: 700, color: currentShift.allowed ? T.green : T.red }}>
              {currentShift.allowed ? '🟢' : '🔴'} Shift #{currentShift.shift.shift_number} · {currentShift.shift.shift_name} · {currentShift.shift.start_time?.slice(0,5)}–{currentShift.shift.end_time?.slice(0,5)}
            </div>
          )}
          {currentShift && !currentShift.shift && (
            <div style={{ background: T.redDim, border: `1px solid ${T.red}44`, borderRadius: 8, padding: '4px 12px', fontSize: 11, fontWeight: 700, color: T.red }}>
              🔴 No shift today
            </div>
          )}

          {/* Order type */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[['dine_in','🪑','Dine In'],['takeaway','🛍','Takeaway'],['delivery','🛵','Delivery'],['online','📲','Online']]
              .filter(([v]) => v !== 'dine_in' || hasPermission('tables'))
              .map(([v,ico,lbl]) => (
              <button key={v} onClick={() => setOrderType(v)} style={{
                background: orderType === v ? T.accent : T.card, color: orderType === v ? '#000' : T.textMid,
                border: `1px solid ${orderType === v ? T.accent : T.border}`,
                borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: "'Syne', sans-serif",
              }}>{ico} {lbl}</button>
            ))}
          </div>

          {/* Table selector (dine-in only) */}
          {orderType === 'dine_in' && (
            <select value={tableId} onChange={e => setTableId(e.target.value)} style={{ background: T.card, border: `1px solid ${T.border}`, color: tableId ? T.text : T.textDim, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontFamily: "'Syne', sans-serif", outline: 'none' }}>
              <option value="">Select Table</option>
              {tables.filter(t => t.status !== 'cleaning').map(t => (
                <option key={t.id} value={t.id}>{t.label} — {t.section} ({t.status})</option>
              ))}
            </select>
          )}

          {/* Search */}
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search menu…"
            style={{ marginLeft: 'auto', background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 12px', color: T.text, fontSize: 12, fontFamily: "'Syne', sans-serif", outline: 'none', width: 160 }} />
        </div>

        {/* Category pills */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {cats.map(c => <Pill key={c} active={cat === c} onClick={() => setCat(c)}>{c}</Pill>)}
        </div>

        {/* Menu grid */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px,1fr))', gap: 10, alignContent: 'start' }}>
          {filtered.map(item => {
            const inCart = cart.find(c => c.id === item.id);
            return (
              <div key={item.id} onClick={() => addToCart(item)} style={{
                background: inCart ? T.accentGlow : T.card,
                border: `1px solid ${inCart ? T.accent + '88' : T.border}`,
                borderRadius: 14, overflow: 'hidden', cursor: 'pointer', transition: 'all 0.15s',
              }}>
                {/* Image */}
                <div style={{ height: 90, background: T.surface, overflow: 'hidden', position: 'relative' }}>
                  {item.image_url ? (
                    <img src={item.image_url.startsWith('http') ? item.image_url : `${IMG_BASE}${item.image_url}`}
                      alt={item.name} onError={e => e.target.style.display='none'}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, opacity: 0.3 }}>🍽</div>
                  )}
                  {item.is_popular && <div style={{ position: 'absolute', top: 6, right: 6 }}><Badge color={T.accent} small>★</Badge></div>}
                  {inCart && <div style={{ position: 'absolute', top: 6, left: 6, background: T.accent, color: '#000', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 800 }}>×{inCart.qty}</div>}
                </div>
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.text, lineHeight: 1.3, marginBottom: 4 }}>{item.name}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 800, color: T.accent, fontFamily: 'monospace', fontSize: 12 }}>PKR {Number(item.price).toLocaleString()}</span>
                    <span style={{ fontSize: 10, color: T.textDim }}>⏱{item.prep_time_min}m</span>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 60, color: T.textDim }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🔍</div>
              <div>No items found</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Order panel ── */}
      <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
        <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text, marginBottom: 2 }}>
            Order — {orderType === 'dine_in' ? (tables.find(t => t.id === tableId)?.label || 'No table') : orderType.replace('_',' ')}
          </div>
          <div style={{ fontSize: 11, color: T.textMid, marginBottom: 12 }}>
            {cart.length} item{cart.length !== 1 ? 's' : ''} · tap to add
          </div>

          {/* Customer info for takeaway/delivery */}
          {needCustomer && (
            <div style={{ marginBottom: 10, background: T.surface, borderRadius: 10, padding: '10px 12px' }}>
              <input value={custName} onChange={e => setCustName(e.target.value)}
                placeholder="Customer name *" style={{ width: '100%', background: 'none', border: 'none', color: T.text, fontSize: 12, fontFamily: "'Syne', sans-serif", outline: 'none', marginBottom: 6 }} />
              <input value={custPhone} onChange={e => setCustPhone(e.target.value)}
                placeholder="Phone number" style={{ width: '100%', background: 'none', border: 'none', color: T.text, fontSize: 12, fontFamily: "'Syne', sans-serif", outline: 'none' }} />
            </div>
          )}

          {/* Guest count (dine-in) */}
          {orderType === 'dine_in' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: T.textMid, flex: 1 }}>Guests</span>
              <button onClick={() => setGuestCount(g => Math.max(1, g-1))} style={{ width: 24, height: 24, borderRadius: '50%', background: T.border, border: 'none', color: T.text, cursor: 'pointer', fontWeight: 800, fontSize: 14 }}>−</button>
              <span style={{ fontWeight: 800, fontFamily: 'monospace', minWidth: 20, textAlign: 'center', color: T.text }}>{guestCount}</span>
              <button onClick={() => setGuestCount(g => g+1)} style={{ width: 24, height: 24, borderRadius: '50%', background: T.accent, border: 'none', color: '#000', cursor: 'pointer', fontWeight: 800, fontSize: 14 }}>+</button>
            </div>
          )}

          {/* Cart items */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {cart.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: T.textDim }}>
                <div style={{ fontSize: 32 }}>🛒</div>
                <div style={{ fontSize: 12, marginTop: 8 }}>Cart is empty</div>
              </div>
            )}
            {cart.map(item => (
              <div key={item.id} style={{ marginBottom: 8, background: T.surface, borderRadius: 10, padding: '8px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ItemImage src={item.image_url} name={item.name} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: T.textMid }}>PKR {Number(item.price).toLocaleString()}</div>
                    {item.notes && <div style={{ fontSize: 10, color: T.accent, marginTop: 2 }}>📝 {item.notes}</div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <button onClick={() => changeQty(item.id,-1)} style={{ width: 20, height: 20, borderRadius: '50%', background: T.border, border: 'none', color: T.text, cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>−</button>
                    <span style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: 12, color: T.text, minWidth: 16, textAlign: 'center' }}>{item.qty}</span>
                    <button onClick={() => addToCart(item)} style={{ width: 20, height: 20, borderRadius: '50%', background: T.accent, border: 'none', color: '#000', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>+</button>
                  </div>
                </div>
                {/* Per-item action row */}
                <div style={{ display: 'flex', gap: 8, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${T.border}` }}>
                  <button onClick={() => { setNotesItem(item); }} style={{ flex: 1, background: 'none', border: `1px solid ${T.border}`, color: T.textMid, borderRadius: 6, padding: '3px 0', fontSize: 10, cursor: 'pointer', fontFamily: "'Syne', sans-serif" }}>📝 Notes</button>
                  <button onClick={() => removeItem(item.id)} style={{ background: T.redDim, border: `1px solid ${T.red}44`, color: T.red, borderRadius: 6, padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: "'Syne', sans-serif" }}>Remove</button>
                </div>
              </div>
            ))}
          </div>

          {/* Order notes */}
          {cart.length > 0 && (
            <input value={orderNotes} onChange={e => setOrderNotes(e.target.value)}
              placeholder="Order notes (optional)…"
              style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 10px', color: T.text, fontSize: 11, fontFamily: "'Syne', sans-serif", outline: 'none', width: '100%', marginTop: 8 }} />
          )}

          {/* Totals */}
          {cart.length > 0 && (
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10, marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: T.textMid }}>Subtotal</span>
                <span style={{ fontSize: 12, fontFamily: 'monospace', color: T.text }}>PKR {subtotal.toLocaleString()}</span>
              </div>
              {/* Discount */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: T.textMid, flex: 1 }}>Discount (PKR)</span>
                <input type="number" value={discount} onChange={e => setDiscount(e.target.value)}
                  placeholder="0" min="0" max={subtotal}
                  style={{ width: 80, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: '3px 8px', color: T.accent, fontSize: 12, fontFamily: 'monospace', outline: 'none', textAlign: 'right' }} />
              </div>
              {discountAmt > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: T.green }}>Discount applied</span>
                  <span style={{ fontSize: 12, color: T.green, fontFamily: 'monospace' }}>− PKR {discountAmt.toLocaleString()}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: T.textMid }}>Tax (8%)</span>
                <span style={{ fontSize: 12, fontFamily: 'monospace', color: T.text }}>PKR {tax.toLocaleString(undefined, {minimumFractionDigits:0})}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: T.text }}>Total</span>
                <span style={{ fontSize: 14, fontWeight: 800, fontFamily: 'monospace', color: T.accent }}>PKR {total.toLocaleString(undefined, {minimumFractionDigits:0})}</span>
              </div>
              <Btn onClick={sendToKitchen} disabled={sending} style={{ width: '100%', padding: '13px' }}>
                {sending ? '⏳ Sending…' : '🍳 Send to Kitchen'}
              </Btn>
              <Btn variant="ghost" onClick={() => setCart([])} style={{ width: '100%', marginTop: 6 }}>Clear Cart</Btn>
            </div>
          )}
        </Card>

        {/* Online Orders Queue */}
        <Card>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 10 }}>
            📲 Online Queue ({onlineOrders.length})
          </div>
          {onlineOrders.length === 0 && <div style={{ fontSize: 12, color: T.textDim }}>No pending online orders</div>}
          {onlineOrders.slice(0, 3).map(o => (
            <div key={o.id} style={{ padding: '8px 10px', background: T.redDim, borderRadius: 8, marginBottom: 6, border: `1px solid ${T.red}44` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{o.order_number}</span>
                <Badge color={T.red} small>New</Badge>
              </div>
              <div style={{ fontSize: 11, color: T.textMid }}>{o.customer_name || 'Online Customer'}</div>
              <div style={{ fontSize: 11, color: T.accent, fontFamily: 'monospace' }}>PKR {Number(o.total_amount).toLocaleString()}</div>
            </div>
          ))}
        </Card>
      </div>

      {/* Per-item notes modal */}
      <ItemNotesModal
        item={notesItem}
        open={!!notesItem}
        onClose={() => setNotesItem(null)}
        onSave={(notes) => notesItem && setItemNotes(notesItem.id, notes)}
      />

      {/* ── Takeaway / Delivery payment modal ── */}
      {showPayModal && createdOrder && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Syne', sans-serif" }}>
          <div onClick={!takePrintRdy ? undefined : closeTakeawayModal} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)' }} />
          <div style={{ position: 'relative', zIndex: 1, background: T.card, border: `1px solid ${T.borderLight}`, borderRadius: 20, width: '100%', maxWidth: 480, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}>

            {/* Header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>
                  🧾 {(createdOrder.order_type || orderType).replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())} — {createdOrder.order_number}
                </div>
                <div style={{ fontSize: 12, color: T.textMid, marginTop: 3 }}>
                  {createdOrder.customer_name || createdOrder._custName}
                  {(createdOrder.customer_phone || createdOrder._custPhone) && ` · ${createdOrder.customer_phone || createdOrder._custPhone}`}
                </div>
              </div>
              {!takePaying && <button onClick={closeTakeawayModal} style={{ background: 'none', border: 'none', color: T.textMid, fontSize: 24, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>}
            </div>

            {/* Body — order summary */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              {/* Items */}
              <div style={{ marginBottom: 4 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px 88px 92px', gap: 8, padding: '6px 0', borderBottom: `1px solid ${T.border}`, fontSize: 10, color: T.textDim, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  <span>Item</span><span style={{ textAlign: 'center' }}>Qty</span>
                  <span style={{ textAlign: 'right' }}>Unit</span><span style={{ textAlign: 'right' }}>Total</span>
                </div>
                {(createdOrder._cartItems || []).map((item, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 52px 88px 92px', gap: 8, padding: '10px 0', borderBottom: `1px solid ${T.border}`, alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{item.name}</div>
                      {item.notes && <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>{item.notes}</div>}
                    </div>
                    <div style={{ textAlign: 'center', fontSize: 13, color: T.textMid, fontFamily: 'monospace' }}>×{item.qty}</div>
                    <div style={{ textAlign: 'right', fontSize: 12, color: T.textMid, fontFamily: 'monospace' }}>{Number(item.price).toLocaleString()}</div>
                    <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: T.text, fontFamily: 'monospace' }}>{Number(item.price * item.qty).toLocaleString()}</div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div style={{ background: T.surface, borderRadius: 12, padding: '14px 16px', marginTop: 16 }}>
                {[
                  ['Subtotal', `PKR ${Number(createdOrder._subtotal).toLocaleString()}`],
                  ['Tax (8%)', `PKR ${Number(createdOrder._tax).toLocaleString()}`],
                  ...(createdOrder._discountAmt > 0 ? [['Discount', `− PKR ${Number(createdOrder._discountAmt).toLocaleString()}`, true]] : []),
                ].map(([label, value, accent]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, color: accent ? T.accent : T.textMid }}>
                    <span>{label}</span><span style={{ fontFamily: 'monospace' }}>{value}</span>
                  </div>
                ))}
                <div style={{ borderTop: `1px dashed ${T.border}`, margin: '10px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, color: T.text }}>
                  <span>TOTAL DUE</span>
                  <span style={{ fontFamily: 'monospace', color: T.accent }}>PKR {Number(createdOrder._total).toLocaleString()}</span>
                </div>
              </div>

              {/* Payment method selector */}
              {!takePrintRdy && (
                <div style={{ marginTop: 16, background: T.surface, borderRadius: 12, padding: '14px 16px', border: `1px solid ${T.accent}44` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.textMid, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Payment Method</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[['cash','💵','Cash'],['card','💳','Card'],['jazzcash','📱','JazzCash'],['easypaisa','📲','Easypaisa']].map(([id, icon, label]) => (
                      <div key={id} onClick={() => setTakePayMethod(id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, cursor: 'pointer', background: takePayMethod === id ? T.accentGlow : T.card, border: `1px solid ${takePayMethod === id ? T.accent + '88' : T.border}`, transition: 'all 0.15s' }}>
                        <span style={{ fontSize: 18 }}>{icon}</span>
                        <span style={{ fontSize: 13, fontWeight: takePayMethod === id ? 700 : 500, color: takePayMethod === id ? T.accent : T.text }}>{label}</span>
                        {takePayMethod === id && <span style={{ marginLeft: 'auto', color: T.accent, fontWeight: 800 }}>✓</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            {takePrintRdy ? (
              <div style={{ padding: '20px 24px', borderTop: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
                <div style={{ textAlign: 'center', marginBottom: 14 }}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>🖨</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: T.text, marginBottom: 4 }}>Payment Confirmed!</div>
                  <div style={{ fontSize: 13, color: T.textMid }}>Would you like to print the receipt?</div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { printTakeawayReceipt(); closeTakeawayModal(); }} style={{ flex: 1, background: T.accent, color: '#000', border: 'none', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Syne', sans-serif" }}>
                    🖨 Yes, Print Receipt
                  </button>
                  <button onClick={closeTakeawayModal} style={{ background: T.surface, color: T.textMid, border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Syne', sans-serif" }}>
                    Skip
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ padding: '14px 24px 20px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: 10, flexShrink: 0 }}>
                <button onClick={closeTakeawayModal} style={{ background: T.surface, color: T.textMid, border: `1px solid ${T.border}`, borderRadius: 10, padding: '11px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Syne', sans-serif" }}>
                  Cancel
                </button>
                <button onClick={handleTakeawayPay} disabled={takePaying} style={{ flex: 1, background: takePaying ? T.border : T.green, color: takePaying ? T.textMid : '#fff', border: 'none', borderRadius: 10, padding: '11px', fontSize: 14, fontWeight: 800, cursor: takePaying ? 'not-allowed' : 'pointer', fontFamily: "'Syne', sans-serif", transition: 'all 0.2s' }}>
                  {takePaying ? '⏳ Processing…' : `✓ Confirm ${takePayMethod.charAt(0).toUpperCase() + takePayMethod.slice(1)} Payment`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
