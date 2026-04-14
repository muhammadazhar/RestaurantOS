import React, { useEffect, useState, useCallback, useRef } from 'react';
import { getMenu, getTables, createOrder, getOrders, updateOrderStatus, getCurrentShift, continueMyShift, closeMyShift, startMyShift, attClockIn, getRiders, getDiscountPresets, getShiftCashSummary } from '../../services/api';
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
        style={{ width: '100%', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 14px', color: T.text, fontSize: 13, fontFamily: "'Inter', sans-serif", outline: 'none', resize: 'vertical', minHeight: 80, marginBottom: 12 }} />
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
  const [orderType,    setOrderType]    = useState('dine_in');
  const [guestCount,   setGuestCount]   = useState(1);
  const [discount,     setDiscount]     = useState('');
  const [custName,     setCustName]     = useState('');
  const [custPhone,    setCustPhone]    = useState('');
  const [custAddr,     setCustAddr]     = useState('');
  const [custLat,      setCustLat]      = useState('');
  const [custLng,      setCustLng]      = useState('');
  const [delivRiderId, setDelivRiderId] = useState('');
  const [riders,       setRiders]       = useState([]);
  const [orderNotes,   setOrderNotes]   = useState('');
  const [loading,      setLoading]      = useState(true);
  const [sending,      setSending]      = useState(false);
  const [notesItem,    setNotesItem]    = useState(null);
  const [createdOrder, setCreatedOrder] = useState(null);   // takeaway pay modal
  const [showPayModal, setShowPayModal] = useState(false);
  const [takePayMethod,setTakePayMethod]= useState('cash');
  const [takePaying,      setTakePaying]      = useState(false);
  const [takePrintRdy,    setTakePrintRdy]    = useState(false);
  const [tenderedAmount,  setTenderedAmount]  = useState('');
  const [discountPresets, setDiscountPresets] = useState([]);
  const [currentShift,    setCurrentShift]    = useState(null);   // { shift, allowed, reason }
  const [shiftEndModal,   setShiftEndModal]   = useState(false);
  const [cashSummary,     setCashSummary]     = useState(null);
  const shiftEndAlerted = useRef(false);
  const { on, off } = useSocket();
  const { user } = useAuth();

  const loadShift = useCallback(() => {
    getCurrentShift()
      .then(r => setCurrentShift(r.data))
      .catch(() => setCurrentShift({ shift: null, allowed: true, reason: null })); // fail open
  }, []);

  const load = useCallback(() => {
    Promise.all([
      getMenu(),
      getTables().catch(() => ({ data: [] })),
      getOrders({ order_type: 'online', status: 'pending' }),
    ])
      .then(([m, t, o]) => { setMenu(m.data); setTables(t.data); setOnlineOrders(o.data); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    loadShift();
    getRiders().then(r => setRiders(r.data)).catch(() => {});
    getDiscountPresets().then(r => setDiscountPresets(r.data.filter(p => p.is_active))).catch(() => {});
    on('new_order', load);
    return () => off('new_order', load);
  }, [load, loadShift, on, off]);

  // Detect shift end while on POS — prompt user to close or continue
  useEffect(() => {
    const check = () => {
      if (!currentShift?.shift) return;
      if (currentShift.shift.status !== 'active') return;
      if (shiftEndAlerted.current) return;
      const now = new Date().toTimeString().slice(0, 5);
      const end = currentShift.shift.end_time?.slice(0, 5);
      if (end && now > end) {
        shiftEndAlerted.current = true;
        setShiftEndModal(true);
        // Load cash summary for the shift-end modal
        getShiftCashSummary(currentShift.shift.id).then(r => setCashSummary(r.data)).catch(() => {});
      }
    };
    check();
    const timer = setInterval(check, 30000);
    return () => clearInterval(timer);
  }, [currentShift]);

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
        table_id:          tableId || null,
        order_type:        orderType,
        guest_count:       parseInt(guestCount) || 1,
        shift_id:          currentShift?.shift?.id || undefined,
        customer_name:     custName  || undefined,
        customer_phone:    custPhone || undefined,
        customer_address:  orderType === 'delivery' ? custAddr || undefined : undefined,
        customer_lat:      orderType === 'delivery' ? custLat  || undefined : undefined,
        customer_lng:      orderType === 'delivery' ? custLng  || undefined : undefined,
        rider_id:          orderType === 'delivery' ? delivRiderId || undefined : undefined,
        notes:             orderNotes || undefined,
        discount_amount:   discountAmt || undefined,
        items: cart.map(c => ({
          menu_item_id: c.id, name: c.name,
          quantity: c.qty, unit_price: c.price,
          notes: c.notes || undefined,
        })),
      });
      // Print KOT first for all order types
      printKOT(res.data, cart);

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
        setTakePayMethod(orderType === 'delivery' ? 'cod' : 'cash');
        setTakePrintRdy(false);
        setShowPayModal(true);
      } else {
        toast.success('Order sent to kitchen! 🍳');
        setCart([]); setDiscount(''); setCustName(''); setCustPhone(''); setCustAddr(''); setCustLat(''); setCustLng(''); setDelivRiderId(''); setOrderNotes(''); setGuestCount(1);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send order');
    } finally { setSending(false); }
  };

  const handleTakeawayPay = async () => {
    if (!createdOrder) return;
    // COD: order already in kitchen, payment collected by rider — skip status update
    if (takePayMethod === 'cod') {
      setTakePrintRdy(true);
      return;
    }
    setTakePaying(true);
    try {
      await updateOrderStatus(createdOrder.id, 'paid', takePayMethod);
      toast.success('✅ Payment confirmed!');
      setTakePrintRdy(true);
    } catch {
      toast.error('Payment failed — please try again');
    } finally { setTakePaying(false); }
  };

  // ── Kitchen Order Ticket (KOT) ──────────────────────────────────────────────
  const printKOT = (order, cartItems) => {
    const items = (order.items && order.items.length
      ? order.items
      : cartItems.map(c => ({ name: c.name, quantity: c.qty, notes: c.notes }))
    ).filter(i => i?.name);

    const tbl = tableId ? tables.find(t => t.id === tableId) : null;
    const typeLabel = (order.order_type || orderType).replace(/_/g, ' ').toUpperCase();
    const timeStr = new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });

    const w = window.open('', '_blank', 'width=360,height=600');
    if (!w) { toast.error('Pop-up blocked — please allow pop-ups for KOT printing'); return; }
    w.document.write(`
      <!DOCTYPE html><html><head><title>KOT — ${order.order_number}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Courier New', monospace; font-size: 14px; padding: 16px 12px; color: #000; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .kot-header { font-size: 15px; font-weight: 900; text-align: center; letter-spacing: 1px; }
        .order-num { font-size: 34px; font-weight: 900; text-align: center; letter-spacing: 4px; margin: 8px 0; }
        .line { border-top: 2px solid #000; margin: 8px 0; }
        .dline { border-top: 1px dashed #aaa; margin: 5px 0; }
        .row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 13px; }
        .item-row { display: flex; justify-content: space-between; align-items: baseline; padding: 6px 0; }
        .item-name { font-size: 16px; font-weight: 800; flex: 1; }
        .item-qty { font-size: 24px; font-weight: 900; min-width: 48px; text-align: right; }
        .notes { font-size: 12px; color: #555; padding: 2px 0 4px 8px; font-style: italic; }
        @media print { body { padding: 0 4px; } }
      </style></head>
      <body>
        <div class="kot-header">⬛ KITCHEN ORDER</div>
        <div class="order-num">#${order.order_number}</div>
        <div class="line"></div>
        <div class="row"><span class="bold">Type:</span><span>${typeLabel}</span></div>
        ${tbl ? `<div class="row"><span class="bold">Table:</span><span>${tbl.section ? tbl.section + ' · ' : ''}${tbl.label}</span></div>` : ''}
        ${(custName || order.customer_name) ? `<div class="row"><span class="bold">Customer:</span><span>${custName || order.customer_name}</span></div>` : ''}
        <div class="row"><span class="bold">Time:</span><span>${timeStr}</span></div>
        <div class="line"></div>
        ${items.map(i => `
          <div class="item-row">
            <span class="item-name">${i.name}</span>
            <span class="item-qty">×${i.quantity ?? i.qty}</span>
          </div>
          ${i.notes ? `<div class="notes">📝 ${i.notes}</div>` : ''}
          <div class="dline"></div>
        `).join('')}
        ${orderNotes ? `<div style="margin-top:8px;padding:6px;border:1px solid #000;border-radius:4px"><span class="bold">⚠ Order Notes:</span><br><span style="font-size:13px">${orderNotes}</span></div>` : ''}
      </body></html>
    `);
    w.document.close();
    setTimeout(() => { w.print(); }, 300);
  };

  const printTakeawayReceipt = () => {
    if (!createdOrder) return;
    const o = createdOrder;
    const methodLabel = { cash: 'Cash', card: 'Card', jazzcash: 'JazzCash', easypaisa: 'Easypaisa', cod: 'Cash on Delivery' }[takePayMethod] || takePayMethod;
    const isCOD = takePayMethod === 'cod';
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
        .cod-stamp  { border: 3px solid #e67e22; border-radius: 6px; padding: 6px 16px; display: inline-block; font-size: 15px; font-weight: bold; letter-spacing: 2px; margin-top: 14px; color: #e67e22; }
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
        ${isCOD && (o.delivery_address?.address || custAddr) ? `<div class="row"><span>Address:</span><span>${o.delivery_address?.address || custAddr}</span></div>` : ''}
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
        ${takePayMethod === 'cash' && tenderedAmount ? `
          <div class="row"><span>Tendered</span><span>PKR ${parseFloat(tenderedAmount).toLocaleString()}</span></div>
          <div class="row bold"><span>Change</span><span>PKR ${Math.max(0, parseFloat(tenderedAmount) - ttl).toLocaleString(undefined, {minimumFractionDigits:0,maximumFractionDigits:2})}</span></div>
        ` : ''}
        <div class="center" style="margin-top:12px">
          ${isCOD
            ? `<span class="cod-stamp">🏍 CASH ON DELIVERY</span>`
            : `<span class="paid-stamp">★ PAID ★</span>`}
        </div>
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
    setTenderedAmount('');
    setCart([]); setDiscount(''); setCustName(''); setCustPhone(''); setCustAddr(''); setCustLat(''); setCustLng(''); setDelivRiderId(''); setOrderNotes(''); setGuestCount(1);
  };

  if (loading) return <Spinner />;

  const needCustomer = ['takeaway', 'delivery', 'online'].includes(orderType);
  const shiftBlocked = currentShift && !currentShift.allowed;
  const isClockedIn   = currentShift?.attendance?.is_clocked_in;
  const attendColor   = isClockedIn ? T.green : T.red;
  const attendBg      = isClockedIn ? T.greenDim : T.redDim;

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 56px)', position: 'relative' }}>

      {/* ── Shift/Attendance gate modal ── */}
      {shiftBlocked && <POSGateModal currentShift={currentShift} onUnlocked={() => loadShift()} />}

      {/* ── Shift-end confirmation modal ── */}
      {shiftEndModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 32, maxWidth: 420, width: '90%', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⏰</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.text, marginBottom: 8 }}>Shift Ended</div>
            <div style={{ fontSize: 14, color: T.textMid, marginBottom: 8 }}>
              Your shift ended at <b style={{ color: T.text }}>{currentShift?.shift?.end_time?.slice(0,5)}</b>
            </div>

            {/* Cash summary */}
            {cashSummary && (
              <div style={{ background: T.surface, borderRadius: 12, padding: '12px 16px', marginBottom: 16, textAlign: 'left' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.textDim, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Cash Summary</div>
                {[
                  ['Opening Balance', cashSummary.opening_balance],
                  ['Cash Sales', cashSummary.cash_sales],
                  ['Expected Closing', cashSummary.expected_closing],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 13 }}>
                    <span style={{ color: T.textMid }}>{label}</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: label === 'Expected Closing' ? T.green : T.text }}>
                      PKR {Number(val || 0).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ fontSize: 13, color: T.textDim, marginBottom: 20 }}>
              Would you like to close your shift or continue working?
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={async () => {
                  try {
                    await continueMyShift(currentShift.shift.id);
                    setShiftEndModal(false);
                    setCashSummary(null);
                    toast.success('Continuing in overtime');
                    loadShift();
                  } catch (e) { toast.error(e.response?.data?.error || 'Failed to continue shift'); }
                }}
                style={{ flex: 1, background: T.accent, color: '#000', border: 'none', borderRadius: 10, padding: '10px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
                ⏩ Continue Working
              </button>
              <button
                onClick={async () => {
                  try {
                    const r = await closeMyShift(currentShift.shift.id);
                    setShiftEndModal(false);
                    setCashSummary(null);
                    const closingCash = r.data?.closing_cash;
                    toast.success(closingCash != null ? `Shift closed · Closing cash: PKR ${Number(closingCash).toLocaleString()}` : 'Shift closed');
                    loadShift();
                  } catch (e) { toast.error(e.response?.data?.error || 'Failed to close shift'); }
                }}
                style={{ flex: 1, background: T.red, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
                ⏹ Close Shift
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Menu panel ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>

        {/* Top bar */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: T.text, margin: 0 }}>📲 POS</h1>
          {currentShift?.shift && (() => {
            const s = currentShift.shift;
            const isOT = s.status === 'in_process';
            const bg = isOT ? T.accentGlow : currentShift.allowed ? T.greenDim : T.redDim;
            const clr = isOT ? T.accent : currentShift.allowed ? T.green : T.red;
            const ico = isOT ? '🟡' : currentShift.allowed ? '🟢' : '🔴';
            return (
              <div style={{ background: bg, border: `1px solid ${clr}44`, borderRadius: 8, padding: '4px 12px', fontSize: 11, fontWeight: 700, color: clr }}>
                {ico} Shift #{s.shift_number} · {s.shift_name} · {s.start_time?.slice(0,5)}–{s.end_time?.slice(0,5)}
                {isOT && <span style={{ marginLeft: 6, fontSize: 10 }}>OVERTIME</span>}
              </div>
            );
          })()}
          {currentShift && !currentShift.shift && (
            <div style={{ background: T.redDim, border: `1px solid ${T.red}44`, borderRadius: 8, padding: '4px 12px', fontSize: 11, fontWeight: 700, color: T.red }}>
              🔴 No shift today
            </div>
          )}
          {currentShift && (
            <div style={{ background: attendBg, border: `1px solid ${attendColor}44`, borderRadius: 8, padding: '4px 12px', fontSize: 11, fontWeight: 700, color: attendColor }}>
              {isClockedIn ? '✅ Clocked In' : '⛔ Not Clocked In'}
            </div>
          )}

          {/* Order type */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[['dine_in','🪑','Dine In'],['takeaway','🛍','Takeaway'],['delivery','🛵','Delivery'],['online','📲','Online']]
              .map(([v,ico,lbl]) => (
              <button key={v} onClick={() => setOrderType(v)} style={{
                background: orderType === v ? T.accent : T.card, color: orderType === v ? '#000' : T.textMid,
                border: `1px solid ${orderType === v ? T.accent : T.border}`,
                borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: "'Inter', sans-serif",
              }}>{ico} {lbl}</button>
            ))}
          </div>

          {/* Table selector (dine-in only) */}
          {orderType === 'dine_in' && (
            <select value={tableId} onChange={e => setTableId(e.target.value)} style={{ background: T.card, border: `1px solid ${T.border}`, color: tableId ? T.text : T.textDim, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontFamily: "'Inter', sans-serif", outline: 'none' }}>
              <option value="">Select Table</option>
              {tables.filter(t => t.status !== 'cleaning').map(t => (
                <option key={t.id} value={t.id}>{t.label} — {t.section} ({t.status})</option>
              ))}
            </select>
          )}

          {/* Search */}
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search menu…"
            style={{ marginLeft: 'auto', background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 12px', color: T.text, fontSize: 12, fontFamily: "'Inter', sans-serif", outline: 'none', width: 160 }} />
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
      <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
        <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text, marginBottom: 2 }}>
            Order — {orderType === 'dine_in' ? (tables.find(t => t.id === tableId)?.label || 'No table') : orderType.replace('_',' ')}
          </div>
          <div style={{ fontSize: 11, color: T.textMid, marginBottom: 12 }}>
            {cart.length} item{cart.length !== 1 ? 's' : ''} · tap to add
          </div>

          {/* Customer info for takeaway/delivery */}
          {needCustomer && (
            <div style={{ marginBottom: 10, background: T.surface, borderRadius: 10, padding: '10px 12px' }}>
              {/* Name + Phone — always shown for takeaway & delivery */}
              <input value={custName} onChange={e => setCustName(e.target.value)}
                placeholder="Customer name *" style={{ width: '100%', background: 'none', border: 'none', borderBottom: `1px solid ${T.border}`, color: T.text, fontSize: 12, fontFamily: "'Inter', sans-serif", outline: 'none', paddingBottom: 6, marginBottom: 6 }} />
              <input value={custPhone} onChange={e => setCustPhone(e.target.value)}
                placeholder="Phone number" style={{ width: '100%', background: 'none', border: 'none', color: T.text, fontSize: 12, fontFamily: "'Inter', sans-serif", outline: 'none' }} />

              {/* Extra fields — delivery only */}
              {orderType === 'delivery' && (
                <>
                  <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 8, paddingTop: 8 }}>
                    <input value={custAddr} onChange={e => setCustAddr(e.target.value)}
                      placeholder="Delivery address" style={{ width: '100%', background: 'none', border: 'none', borderBottom: `1px solid ${T.border}`, color: T.text, fontSize: 12, fontFamily: "'Inter', sans-serif", outline: 'none', paddingBottom: 6, marginBottom: 6 }} />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input value={custLat} onChange={e => setCustLat(e.target.value)}
                        placeholder="Lat" type="number" step="any"
                        style={{ flex: 1, background: 'none', border: 'none', borderBottom: `1px solid ${T.border}`, color: T.text, fontSize: 11, fontFamily: "'Inter', sans-serif", outline: 'none', paddingBottom: 4, minWidth: 0 }} />
                      <input value={custLng} onChange={e => setCustLng(e.target.value)}
                        placeholder="Lng" type="number" step="any"
                        style={{ flex: 1, background: 'none', border: 'none', borderBottom: `1px solid ${T.border}`, color: T.text, fontSize: 11, fontFamily: "'Inter', sans-serif", outline: 'none', paddingBottom: 4, minWidth: 0 }} />
                    </div>
                    {custLat && custLng && (
                      <a href={`https://www.google.com/maps?q=${custLat},${custLng}`} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 10, color: T.accent, display: 'inline-block', marginTop: 4 }}>📍 View on Map</a>
                    )}
                  </div>
                  <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 8, paddingTop: 8 }}>
                    <select value={delivRiderId} onChange={e => setDelivRiderId(e.target.value)}
                      style={{ width: '100%', background: 'none', border: 'none', color: delivRiderId ? T.text : T.textDim, fontSize: 12, fontFamily: "'Inter', sans-serif", outline: 'none' }}>
                      <option value="">🏍 Assign rider (optional)</option>
                      {riders.map(r => (
                        <option key={r.id} value={r.id}>{r.full_name} ({r.active_orders} active)</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
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
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {cart.length === 0 && (
              <div style={{ textAlign: 'center', padding: '30px 0', color: T.textDim }}>
                <div style={{ fontSize: 28 }}>🛒</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>Cart is empty</div>
              </div>
            )}
            {cart.map(item => (
              <div key={item.id} style={{ marginBottom: 4, background: T.surface, borderRadius: 8, padding: '6px 8px' }}>
                {/* Main row: name + price + qty controls + remove */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                    <div style={{ fontSize: 10, color: T.textMid }}>PKR {Number(item.price).toLocaleString()} {item.notes && <span style={{ color: T.accent }}>· 📝</span>}</div>
                  </div>
                  <button onClick={() => changeQty(item.id,-1)} style={{ width: 20, height: 20, borderRadius: '50%', background: T.border, border: 'none', color: T.text, cursor: 'pointer', fontSize: 13, lineHeight: 1, flexShrink: 0 }}>−</button>
                  <span style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: 12, color: T.text, minWidth: 16, textAlign: 'center', flexShrink: 0 }}>{item.qty}</span>
                  <button onClick={() => addToCart(item)} style={{ width: 20, height: 20, borderRadius: '50%', background: T.accent, border: 'none', color: '#000', cursor: 'pointer', fontSize: 13, lineHeight: 1, flexShrink: 0 }}>+</button>
                  <button onClick={() => setNotesItem(item)} title="Add notes" style={{ width: 20, height: 20, borderRadius: '50%', background: 'none', border: `1px solid ${T.border}`, color: T.textMid, cursor: 'pointer', fontSize: 10, lineHeight: 1, flexShrink: 0 }}>📝</button>
                  <button onClick={() => removeItem(item.id)} title="Remove" style={{ width: 20, height: 20, borderRadius: '50%', background: T.redDim, border: `1px solid ${T.red}44`, color: T.red, cursor: 'pointer', fontSize: 11, lineHeight: 1, flexShrink: 0 }}>✕</button>
                </div>
              </div>
            ))}
          </div>

          {/* Order notes */}
          {cart.length > 0 && (
            <input value={orderNotes} onChange={e => setOrderNotes(e.target.value)}
              placeholder="Order notes (optional)…"
              style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 10px', color: T.text, fontSize: 11, fontFamily: "'Inter', sans-serif", outline: 'none', width: '100%', marginTop: 8 }} />
          )}

          {/* Totals */}
          {cart.length > 0 && (
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10, marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: T.textMid }}>Subtotal</span>
                <span style={{ fontSize: 12, fontFamily: 'monospace', color: T.text }}>PKR {subtotal.toLocaleString()}</span>
              </div>
              {/* Discount presets */}
              {discountPresets.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
                  {discountPresets.map(p => {
                    const amt = p.type === 'percent' ? Math.round(subtotal * p.value / 100) : Math.min(p.value, subtotal);
                    return (
                      <button key={p.id} onClick={() => setDiscount(String(amt))} title={p.type === 'percent' ? `${p.value}%` : `PKR ${p.value}`}
                        style={{ background: parseFloat(discount) === amt ? T.accent : T.surface, color: parseFloat(discount) === amt ? '#000' : T.textMid, border: `1px solid ${parseFloat(discount) === amt ? T.accent : T.border}`, borderRadius: 6, padding: '2px 7px', fontSize: 10, cursor: 'pointer', fontFamily: "'Inter', sans-serif", fontWeight: 600 }}>
                        {p.name}
                      </button>
                    );
                  })}
                  {parseFloat(discount) > 0 && (
                    <button onClick={() => setDiscount('')} style={{ background: T.redDim, color: T.red, border: `1px solid ${T.red}44`, borderRadius: 6, padding: '2px 6px', fontSize: 10, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>✕</button>
                  )}
                </div>
              )}
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
                {sending ? '⏳ Sending…' : orderType === 'delivery' ? '🏍 Place Delivery Order' : '🍳 Send to Kitchen'}
              </Btn>
              <Btn variant="ghost" onClick={() => { setCart([]); setDiscount(''); setCustName(''); setCustPhone(''); setCustAddr(''); setCustLat(''); setCustLng(''); setDelivRiderId(''); setOrderNotes(''); }} style={{ width: '100%', marginTop: 6 }}>Clear Cart</Btn>
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
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', sans-serif" }}>
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

                {/* Tendered amount + change — cash only */}
                {takePayMethod === 'cash' && !takePrintRdy && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${T.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: T.textMid, flex: 1 }}>Tendered (PKR)</span>
                      <input type="number" min="0" value={tenderedAmount}
                        onChange={e => setTenderedAmount(e.target.value)}
                        placeholder={Number(createdOrder._total).toFixed(0)}
                        style={{ width: 110, background: T.card, border: `1px solid ${T.accent}88`, borderRadius: 8, padding: '6px 10px', color: T.text, fontSize: 14, fontFamily: 'monospace', outline: 'none', textAlign: 'right', fontWeight: 700 }} />
                    </div>
                    {tenderedAmount !== '' && parseFloat(tenderedAmount) >= Number(createdOrder._total) && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', background: T.greenDim, border: `1px solid ${T.green}44`, borderRadius: 8, padding: '6px 10px' }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: T.green }}>Change</span>
                        <span style={{ fontSize: 14, fontWeight: 800, fontFamily: 'monospace', color: T.green }}>
                          PKR {(parseFloat(tenderedAmount) - Number(createdOrder._total)).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                    {tenderedAmount !== '' && parseFloat(tenderedAmount) < Number(createdOrder._total) && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', background: T.redDim, border: `1px solid ${T.red}44`, borderRadius: 8, padding: '6px 10px' }}>
                        <span style={{ fontSize: 13, color: T.red }}>Shortfall</span>
                        <span style={{ fontSize: 13, fontFamily: 'monospace', color: T.red }}>
                          PKR {(Number(createdOrder._total) - parseFloat(tenderedAmount)).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Payment method selector */}
              {!takePrintRdy && (
                <div style={{ marginTop: 16, background: T.surface, borderRadius: 12, padding: '14px 16px', border: `1px solid ${T.accent}44` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.textMid, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Payment Method</div>
                  {/* COD — delivery only, shown full-width first */}
                  {(createdOrder.order_type || orderType) === 'delivery' && (
                    <div onClick={() => setTakePayMethod('cod')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10, cursor: 'pointer', marginBottom: 8, background: takePayMethod === 'cod' ? '#E67E2222' : T.card, border: `2px solid ${takePayMethod === 'cod' ? '#E67E22' : T.border}`, transition: 'all 0.15s' }}>
                      <span style={{ fontSize: 20 }}>🏍</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: takePayMethod === 'cod' ? 700 : 500, color: takePayMethod === 'cod' ? '#E67E22' : T.text }}>Cash on Delivery</div>
                        <div style={{ fontSize: 11, color: T.textDim }}>Rider collects payment at door</div>
                      </div>
                      {takePayMethod === 'cod' && <span style={{ color: '#E67E22', fontWeight: 800 }}>✓</span>}
                    </div>
                  )}
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
                  <div style={{ fontSize: 32, marginBottom: 6 }}>{takePayMethod === 'cod' ? '🏍' : '🖨'}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: T.text, marginBottom: 4 }}>
                    {takePayMethod === 'cod' ? 'Order Sent to Kitchen!' : 'Payment Confirmed!'}
                  </div>
                  <div style={{ fontSize: 13, color: T.textMid }}>
                    {takePayMethod === 'cod' ? 'Rider will collect payment on delivery.' : 'Would you like to print the receipt?'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { printTakeawayReceipt(); closeTakeawayModal(); }} style={{ flex: 1, background: T.accent, color: '#000', border: 'none', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
                    🖨 Yes, Print Receipt
                  </button>
                  <button onClick={closeTakeawayModal} style={{ background: T.surface, color: T.textMid, border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
                    Skip
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ padding: '14px 24px 20px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: 10, flexShrink: 0 }}>
                <button onClick={closeTakeawayModal} style={{ background: T.surface, color: T.textMid, border: `1px solid ${T.border}`, borderRadius: 10, padding: '11px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
                  Cancel
                </button>
                <button onClick={handleTakeawayPay} disabled={takePaying} style={{ flex: 1, background: takePaying ? T.border : T.green, color: takePaying ? T.textMid : '#fff', border: 'none', borderRadius: 10, padding: '11px', fontSize: 14, fontWeight: 800, cursor: takePaying ? 'not-allowed' : 'pointer', fontFamily: "'Inter', sans-serif", transition: 'all 0.2s' }}>
                  {takePaying ? '⏳ Processing…' : takePayMethod === 'cod' ? '🏍 Confirm Cash on Delivery' : `✓ Confirm ${takePayMethod.charAt(0).toUpperCase() + takePayMethod.slice(1)} Payment`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── POS Gate Modal — shown when shift or attendance is missing ─────────────────
function POSGateModal({ currentShift, onUnlocked }) {
  const [acting, setActing] = useState(null); // 'shift' | 'clock'
  const [showBalanceInput, setShowBalanceInput] = useState(false);
  const [openingBalance, setOpeningBalance] = useState('');

  const hasShift     = !!currentShift?.shift && ['active','in_process'].includes(currentShift.shift.status);
  const isClockedIn  = currentShift?.attendance?.is_clocked_in;
  const scheduledShift = currentShift?.shifts?.find(s => s.status === 'scheduled');

  const row = (ok, label, detail, btn) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: `1px solid rgba(255,255,255,0.08)` }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0, background: ok ? '#27AE6033' : '#E74C3C33' }}>
        {ok ? '✓' : '✗'}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: ok ? '#27AE60' : '#f87171' }}>{label}</div>
        {detail && <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>{detail}</div>}
      </div>
      {!ok && btn}
    </div>
  );

  const handleStartShift = async () => {
    if (!scheduledShift) return;
    if (!showBalanceInput) { setShowBalanceInput(true); return; }
    setActing('shift');
    try {
      await startMyShift(scheduledShift.id, { opening_balance: parseFloat(openingBalance) || 0 });
      onUnlocked();
    } catch (e) {
      const msg = e.response?.data?.error || 'Failed to start shift';
      alert(msg);
    } finally { setActing(null); }
  };

  const handleClockIn = async () => {
    setActing('clock');
    try {
      await attClockIn({ source: 'web' });
      onUnlocked();
    } catch (e) {
      const msg = e.response?.data?.error || 'Failed to clock in';
      alert(msg);
    } finally { setActing(null); }
  };

  const btnStyle = (bg, col = '#000') => ({
    background: bg, color: col, border: 'none', borderRadius: 8,
    padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
    fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap', opacity: acting ? 0.6 : 1,
  });

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, backdropFilter: 'blur(4px)' }}>
      <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 20, padding: '32px 36px', maxWidth: 440, width: '90%', boxShadow: '0 24px 64px rgba(0,0,0,0.8)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>🔐</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 6 }}>POS Access Required</div>
          <div style={{ fontSize: 13, color: '#888' }}>Complete the steps below to unlock the POS</div>
        </div>

        {row(
          hasShift,
          hasShift ? `Shift Active — ${currentShift.shift.shift_name}` : 'Shift Not Started',
          hasShift
            ? `${currentShift.shift.start_time?.slice(0,5)} – ${currentShift.shift.end_time?.slice(0,5)}`
            : scheduledShift
              ? `Scheduled: ${scheduledShift.shift_name} · ${scheduledShift.start_time?.slice(0,5)}–${scheduledShift.end_time?.slice(0,5)}`
              : 'No shift scheduled for today — ask your manager',
          scheduledShift
            ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                {showBalanceInput && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: '#aaa', whiteSpace: 'nowrap' }}>Opening cash (PKR)</span>
                    <input type="number" min="0" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)}
                      placeholder="0" autoFocus
                      style={{ width: 90, background: '#2a2a2a', border: '1px solid #f59e0b88', borderRadius: 6, padding: '4px 8px', color: '#fff', fontSize: 13, fontFamily: 'monospace', outline: 'none', textAlign: 'right' }} />
                  </div>
                )}
                <button style={btnStyle('#f59e0b')} onClick={handleStartShift} disabled={!!acting}>
                  {acting === 'shift' ? '…' : showBalanceInput ? '✓ Confirm & Start' : '▶ Start Shift'}
                </button>
              </div>
            : <a href="/my-shift" style={{ ...btnStyle('#444', '#fff'), textDecoration: 'none', display: 'inline-block' }}>My Shift ↗</a>
        )}

        {row(
          isClockedIn,
          isClockedIn ? 'Attendance — Clocked In' : 'Not Clocked In',
          isClockedIn ? `Since ${currentShift?.attendance?.clocked_in_at ? new Date(currentShift.attendance.clocked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}` : 'You must clock in before placing orders',
          <button style={btnStyle('#27AE60', '#fff')} onClick={handleClockIn} disabled={!!acting}>
            {acting === 'clock' ? '…' : '▶ Clock In'}
          </button>
        )}

        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <a href="/attendance" style={{ fontSize: 12, color: '#666', textDecoration: 'none' }}>Go to Attendance ↗</a>
        </div>
      </div>
    </div>
  );
}
