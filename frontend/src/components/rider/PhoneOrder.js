import React, { useEffect, useState, useCallback } from 'react';
import {
  getMenu, getRiders, createPhoneOrder, assignRider,
  getPhoneOrders, updateOrderStatus, previewDeliveryFee,
} from '../../services/api';
import { Card, PageHeader, Btn, Input, Select, Modal, Spinner, T, useT } from '../shared/UI';
import toast from 'react-hot-toast';

const IMG_BASE = process.env.REACT_APP_SOCKET_URL
  || (window.location.protocol + '//' + window.location.hostname + ':5000');

const STATUS_COLOR = {
  pending: '#F39C12', confirmed: '#3498DB', preparing: '#9B59B6',
  ready: '#27AE60', picked: '#2ECC71', out_for_delivery: '#1ABC9C',
  delivered: '#27AE60', paid: '#27AE60', cancelled: '#E74C3C',
};

function fmtCur(v) {
  return 'PKR ' + parseFloat(v || 0).toLocaleString('en-PK', { minimumFractionDigits: 0 });
}
function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });
}

// ─── Item thumbnail (same as POS) ─────────────────────────────────────────────
const ItemImage = ({ src, name }) => {
  const [err, setErr] = useState(false);
  const url = src && !err ? (src.startsWith('http') ? src : `${IMG_BASE}${src}`) : null;
  return (
    <div style={{ fontSize: url ? 0 : 28, width: 56, height: 56, borderRadius: 10, overflow: 'hidden', background: T.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {url
        ? <img src={url} alt={name} onError={() => setErr(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : '🍽'
      }
    </div>
  );
};

// ─── Per-item notes modal (same as POS) ───────────────────────────────────────
function ItemNotesModal({ item, open, onClose, onSave }) {
  const [notes, setNotes] = useState('');
  useEffect(() => { if (open) setNotes(item?.notes || ''); }, [open, item]);
  return (
    <Modal open={open} onClose={onClose} title={`Notes — ${item?.name}`} width={380}>
      <textarea value={notes} onChange={e => setNotes(e.target.value)}
        placeholder="e.g. No onions, extra spicy, medium-well…"
        style={{ width: '100%', minHeight: 90, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 12px', color: T.text, fontSize: 13, fontFamily: "'Inter', sans-serif", outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <Btn variant="ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</Btn>
        <Btn onClick={() => { onSave(notes); onClose(); }} style={{ flex: 1 }}>Save Notes</Btn>
      </div>
    </Modal>
  );
}

// ─── Menu item card with image ─────────────────────────────────────────────────
function MenuItemCard({ item, inCart, onAdd, onRemove }) {
  useT();
  const [imgErr, setImgErr] = useState(false);
  const imgUrl = item.image_url && !imgErr
    ? (item.image_url.startsWith('http') ? item.image_url : `${IMG_BASE}${item.image_url}`)
    : null;

  return (
    <div
      onClick={() => onAdd(item)}
      style={{
        background: inCart ? T.accentGlow : T.surface,
        border: `2px solid ${inCart ? T.accent : T.border}`,
        borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
        transition: 'all 0.2s', position: 'relative',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Image area — fixed 130px height */}
      <div style={{
        height: 130, background: T.card,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', flexShrink: 0,
        borderBottom: `1px solid ${T.border}`,
      }}>
        {imgUrl
          ? <img
              src={imgUrl}
              alt={item.name}
              onError={() => setImgErr(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          : <span style={{ fontSize: 40, opacity: 0.4 }}>🍽</span>
        }
      </div>

      {/* Info area */}
      <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, lineHeight: 1.3, marginBottom: 4 }}>{item.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: T.accent }}>
            {fmtCur(item.price)}
          </span>
          {inCart && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
              <button
                onClick={() => onRemove(item.id)}
                style={{ width: 22, height: 22, borderRadius: 6, border: `1px solid ${T.border}`, background: T.card, color: T.text, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
              >−</button>
              <span style={{ fontSize: 13, fontWeight: 800, color: T.accent, minWidth: 16, textAlign: 'center' }}>{inCart.quantity}</span>
              <button
                onClick={() => onAdd(item)}
                style={{ width: 22, height: 22, borderRadius: 6, border: `1px solid ${T.accent}`, background: T.accentGlow, color: T.accent, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
              >+</button>
            </div>
          )}
        </div>
      </div>

      {/* In-cart badge */}
      {inCart && (
        <div style={{
          position: 'absolute', top: 8, right: 8,
          background: T.accent, color: '#fff',
          borderRadius: '50%', width: 22, height: 22,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800,
        }}>{inCart.quantity}</div>
      )}
    </div>
  );
}

// ─── Today's phone orders list ─────────────────────────────────────────────────
function PhoneOrdersList({ orders, riders, onRefresh }) {
  useT();
  const [assignModal,   setAssignModal]   = useState(null);
  const [assignRiderId, setAssignRiderId] = useState('');

  const handleAssign = async () => {
    if (!assignRiderId) return toast.error('Select a rider');
    try {
      await assignRider(assignModal.orderId, { rider_id: assignRiderId });
      toast.success('Rider assigned');
      setAssignModal(null); setAssignRiderId('');
      onRefresh();
    } catch { toast.error('Failed to assign rider'); }
  };

  if (!orders.length)
    return <div style={{ textAlign: 'center', padding: '30px 0', color: T.textDim }}>No phone orders today</div>;

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {orders.map(order => (
          <div key={order.id} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', background: T.surface, borderRadius: 12,
            border: `1px solid ${T.border}`, flexWrap: 'wrap', gap: 10,
          }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: T.text }}>#{order.order_number}</span>
                <span style={{
                  padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                  background: (STATUS_COLOR[order.status] || '#888') + '22',
                  color: STATUS_COLOR[order.status] || '#888',
                }}>{order.status.replace(/_/g, ' ').toUpperCase()}</span>
              </div>
              <div style={{ fontSize: 13, color: T.text }}>{order.customer_name} · {order.customer_phone}</div>
              {order.delivery_address?.address && (
                <div style={{ fontSize: 11, color: T.textMid, marginTop: 2 }}>{order.delivery_address.address}</div>
              )}
              {order.rider_name && (
                <div style={{ fontSize: 11, color: T.green, marginTop: 2 }}>Rider: {order.rider_name}</div>
              )}
              <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>{fmtTime(order.created_at)}</div>
            </div>
            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.accent }}>{fmtCur(order.total_amount)}</div>
              {!order.rider_id && order.status !== 'cancelled' && (
                <Btn size="sm" onClick={() => { setAssignModal({ orderId: order.id }); setAssignRiderId(''); }}>
                  Assign Rider
                </Btn>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal open={!!assignModal} onClose={() => setAssignModal(null)} title="Assign Rider" width={380}>
        <Select label="Select Rider" value={assignRiderId} onChange={e => setAssignRiderId(e.target.value)}>
          <option value="">-- Choose a rider --</option>
          {riders.map(r => (
            <option key={r.id} value={r.id}>{r.full_name} · {r.active_orders} active</option>
          ))}
        </Select>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <Btn variant="ghost" onClick={() => setAssignModal(null)} style={{ flex: 1 }}>Cancel</Btn>
          <Btn onClick={handleAssign} style={{ flex: 1 }}>Assign</Btn>
        </div>
      </Modal>
    </>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function PhoneOrder() {
  useT();
  const [menu,      setMenu]      = useState({ categories: [], items: [] });
  const [riders,    setRiders]    = useState([]);
  const [orders,    setOrders]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [sending,   setSending]   = useState(false);
  const [tab,       setTab]       = useState('new');
  const [date,      setDate]      = useState(new Date().toISOString().slice(0, 10));

  // Form state
  const [cat,        setCat]       = useState('All');
  const [search,     setSearch]    = useState('');
  const [cart,       setCart]      = useState([]);
  const [notesItem,  setNotesItem] = useState(null);
  const [orderNotes, setOrderNotes] = useState('');
  const [custName,   setCustName]  = useState('');
  const [custPhone,  setCustPhone] = useState('');
  const [custAddr,   setCustAddr]  = useState('');
  const [custLat,    setCustLat]   = useState('');
  const [custLng,    setCustLng]   = useState('');
  const [areaName,   setAreaName]  = useState('');
  const [riderId,    setRiderId]   = useState('');
  const [discount,   setDiscount]  = useState('');
  const [feeData,    setFeeData]   = useState(null);  // { zone, finalFee, riderPayout, surgeAdj, breakdown }
  const [feeLoading, setFeeLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [menuR, ridersR] = await Promise.all([getMenu(), getRiders()]);
      setMenu(menuR.data);
      setRiders(ridersR.data);
    } catch { toast.error('Failed to load menu'); }
    setLoading(false);
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      const res = await getPhoneOrders({ date });
      setOrders(res.data);
    } catch { /* silent */ }
  }, [date]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadOrders(); }, [loadOrders]);

  const filteredItems = menu.items.filter(i => {
    const matchCat = cat === 'All' || i.category_name === cat;
    const matchQ   = !search || i.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchQ && i.is_available;
  });

  const addToCart = (item) => {
    setCart(c => {
      const idx = c.findIndex(x => x.id === item.id);
      if (idx >= 0) {
        const n = [...c];
        n[idx] = { ...n[idx], quantity: n[idx].quantity + 1 };
        return n;
      }
      return [...c, {
        id: item.id,
        name: item.name,
        price: parseFloat(item.price),
        image_url: item.image_url || null,
        quantity: 1,
        notes: '',
      }];
    });
  };

  const changeQty = (id, delta) => {
    setCart(c => c
      .map(x => x.id === id ? { ...x, quantity: x.quantity + delta } : x)
      .filter(x => x.quantity > 0)
    );
  };

  const removeItem = (id) => setCart(c => c.filter(x => x.id !== id));

  const setItemNotes = (id, notes) => {
    setCart(c => c.map(x => x.id === id ? { ...x, notes } : x));
  };

  // For MenuItemCard backward compat (uses menu_item_id key)
  const addToCartFromCard = (item) => addToCart(item);
  const removeFromCartForCard = (id) => changeQty(id, -1);
  const cartForCard = (itemId) => {
    const found = cart.find(x => x.id === itemId);
    return found ? { quantity: found.quantity } : null;
  };

  const calcFee = async () => {
    if (!areaName && !custLat && !custLng && !custPhone) return;
    setFeeLoading(true);
    try {
      const r = await previewDeliveryFee({ customerLat: custLat || undefined, customerLng: custLng || undefined, areaName: areaName || undefined, customerPhone: custPhone || undefined });
      setFeeData(r.data);
    } catch { setFeeData(null); }
    finally { setFeeLoading(false); }
  };

  const deliveryFee = feeData ? (feeData.finalFee || 0) : 0;
  const riderPayout = feeData ? (feeData.riderPayout || 0) : 0;

  const subtotal    = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const discountAmt = Math.min(parseFloat(discount) || 0, subtotal);
  const taxable     = subtotal - discountAmt;
  const tax         = Math.round(taxable * 0.08 * 100) / 100;
  const total       = taxable + tax + deliveryFee;

  const handleSubmit = async () => {
    if (!custName.trim()) return toast.error('Customer name required');
    if (!custPhone.trim()) return toast.error('Customer phone required');
    if (!cart.length) return toast.error('Add items to order');
    setSending(true);
    try {
      await createPhoneOrder({
        customer_name: custName, customer_phone: custPhone,
        customer_address: custAddr, customer_lat: custLat || null,
        customer_lng: custLng || null, area_name: areaName || null,
        items: cart.map(i => ({
          menu_item_id: i.id, name: i.name,
          quantity: i.quantity, unit_price: i.price,
          total_price: i.price * i.quantity, notes: i.notes || undefined,
        })),
        discount_amount: discountAmt || undefined,
        notes: orderNotes || undefined,
        rider_id: riderId || null,
        delivery_fee: deliveryFee || undefined,
        rider_payout: riderPayout || undefined,
      });
      toast.success('Order placed!');
      setCart([]); setCustName(''); setCustPhone(''); setCustAddr('');
      setCustLat(''); setCustLng(''); setAreaName(''); setRiderId(''); setDiscount('');
      setOrderNotes(''); setFeeData(null);
      loadOrders();
      setTab('orders');
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to create order'); }
    setSending(false);
  };

  if (loading) return <Spinner />;

  return (
    <div style={{ padding: 24 }}>
      <PageHeader title="Phone Orders" subtitle="Take delivery orders over the phone, assign riders" />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {[['new', '+ New Order'], ['orders', `Today's Orders (${orders.length})`]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '9px 20px', borderRadius: 10, border: 'none',
            background: tab === key ? T.accent : T.surface,
            color: tab === key ? '#000' : T.textMid,
            fontWeight: 700, fontSize: 13, cursor: 'pointer',
            border: `1px solid ${tab === key ? T.accent : T.border}`,
          }}>{label}</button>
        ))}
      </div>

      {/* ── Today's orders tab ── */}
      {tab === 'orders' && (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Phone Delivery Orders</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 10px', color: T.text, fontSize: 12, outline: 'none' }} />
              <Btn size="sm" variant="ghost" onClick={loadOrders}>Refresh</Btn>
            </div>
          </div>
          <PhoneOrdersList orders={orders} riders={riders} onRefresh={loadOrders} />
        </Card>
      )}

      {/* ── New order tab ── */}
      {tab === 'new' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>

          {/* Left: Customer Info + Menu */}
          <div>
            {/* Customer Info */}
            <Card style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 14 }}>Customer Information</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Input label="Customer Name *" value={custName} onChange={e => setCustName(e.target.value)} placeholder="Full name" />
                <Input label="Phone Number *" value={custPhone} onChange={e => setCustPhone(e.target.value)} placeholder="+92 3xx xxxxxxx" />
                <div style={{ gridColumn: '1/-1' }}>
                  <Input label="Delivery Address" value={custAddr} onChange={e => setCustAddr(e.target.value)} placeholder="Street, area, city" />
                </div>
                <Input label="Latitude (GPS)" value={custLat} onChange={e => setCustLat(e.target.value)} placeholder="24.8607" type="number" step="any" />
                <Input label="Longitude (GPS)" value={custLng} onChange={e => setCustLng(e.target.value)} placeholder="67.0011" type="number" step="any" />
                <Input label="Area Name (for zone lookup)" value={areaName} onChange={e => setAreaName(e.target.value)} placeholder="e.g. Nazimabad, Block 5" />
                <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
                  <button
                    type="button" onClick={calcFee} disabled={feeLoading}
                    style={{ padding: '8px 14px', borderRadius: 8, background: T.accent, color: '#fff', border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: feeLoading ? 0.6 : 1, height: 36 }}
                  >
                    {feeLoading ? '⏳' : '💲 Calc Fee'}
                  </button>
                </div>
              </div>
              {custLat && custLng && (
                <a href={`https://www.google.com/maps?q=${custLat},${custLng}`} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 12, color: T.accent, display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  View on Map →
                </a>
              )}
              {feeData && (
                <div style={{ marginTop: 10, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: T.textMid }}>Zone: <strong style={{ color: T.text }}>{feeData.zone?.name || 'Default'}</strong></span>
                    <span style={{ fontWeight: 800, color: T.accent }}>Customer Fee: PKR {Number(feeData.finalFee || 0).toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ color: T.textMid }}>Rider Payout: PKR {Number(feeData.riderPayout || 0).toLocaleString()}</span>
                    {feeData.surgeAdj > 0 && <span style={{ color: '#F5A623' }}>⚡ Surge +PKR {Number(feeData.surgeAdj).toLocaleString()}</span>}
                    {feeData.breakdown && <span style={{ color: '#2ECC71' }}>{feeData.breakdown}</span>}
                  </div>
                </div>
              )}
            </Card>

            {/* Menu with images */}
            <Card>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 12 }}>Select Items</div>

              <Input
                placeholder="Search menu items..."
                value={search} onChange={e => setSearch(e.target.value)}
                style={{ marginBottom: 12 }}
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${T.border}` }}>
                {['All', ...menu.categories.map(c => c.name)].map(c => (
                  <button key={c} onClick={() => setCat(c)} style={{
                    padding: '5px 14px', borderRadius: 20,
                    border: `1px solid ${cat === c ? T.accent : T.border}`,
                    background: cat === c ? T.accentGlow : 'transparent',
                    color: cat === c ? T.accent : T.textMid,
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}>{c}</button>
                ))}
              </div>

              {filteredItems.length === 0
                ? <div style={{ textAlign: 'center', padding: '30px 0', color: T.textDim }}>No items found</div>
                : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                    {filteredItems.map(item => (
                      <MenuItemCard
                        key={item.id}
                        item={item}
                        inCart={cartForCard(item.id)}
                        onAdd={addToCartFromCard}
                        onRemove={removeFromCartForCard}
                      />
                    ))}
                  </div>
                )
              }
            </Card>
          </div>

          {/* Right: Order Summary — same structure as POS */}
          <div style={{ position: 'sticky', top: 20 }}>
            <Card style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.text, marginBottom: 2 }}>
                Phone Order
              </div>
              <div style={{ fontSize: 11, color: T.textMid, marginBottom: 12 }}>
                {cart.length} item{cart.length !== 1 ? 's' : ''} · tap to add
              </div>

              {/* Assign Rider (phone-order specific, like guest count in POS) */}
              <div style={{ marginBottom: 10, background: T.surface, borderRadius: 10, padding: '8px 10px' }}>
                <select
                  value={riderId} onChange={e => setRiderId(e.target.value)}
                  style={{ width: '100%', background: 'none', border: 'none', color: riderId ? T.text : T.textDim, fontSize: 12, fontFamily: "'Inter', sans-serif", outline: 'none' }}
                >
                  <option value="">🏍 Assign rider (optional)</option>
                  {riders.map(r => (
                    <option key={r.id} value={r.id}>{r.full_name} ({r.active_orders} active)</option>
                  ))}
                </select>
              </div>

              {/* Cart items */}
              <div style={{ flex: 1, overflowY: 'auto', maxHeight: 320 }}>
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
                        <button onClick={() => changeQty(item.id, -1)} style={{ width: 20, height: 20, borderRadius: '50%', background: T.border, border: 'none', color: T.text, cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>−</button>
                        <span style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: 12, color: T.text, minWidth: 16, textAlign: 'center' }}>{item.quantity}</span>
                        <button onClick={() => changeQty(item.id, 1)} style={{ width: 20, height: 20, borderRadius: '50%', background: T.accent, border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>+</button>
                      </div>
                    </div>
                    {/* Per-item action row */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${T.border}` }}>
                      <button onClick={() => setNotesItem(item)} style={{ flex: 1, background: 'none', border: `1px solid ${T.border}`, color: T.textMid, borderRadius: 6, padding: '3px 0', fontSize: 10, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>📝 Notes</button>
                      <button onClick={() => removeItem(item.id)} style={{ background: T.redDim, border: `1px solid ${T.red}44`, color: T.red, borderRadius: 6, padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Order notes */}
              {cart.length > 0 && (
                <input value={orderNotes} onChange={e => setOrderNotes(e.target.value)}
                  placeholder="Order notes (optional)…"
                  style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 10px', color: T.text, fontSize: 11, fontFamily: "'Inter', sans-serif", outline: 'none', width: '100%', marginTop: 8, boxSizing: 'border-box' }} />
              )}

              {/* Totals */}
              {cart.length > 0 && (
                <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10, marginTop: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: T.textMid }}>Subtotal</span>
                    <span style={{ fontSize: 12, fontFamily: 'monospace', color: T.text }}>PKR {subtotal.toLocaleString()}</span>
                  </div>
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
                    <span style={{ fontSize: 12, fontFamily: 'monospace', color: T.text }}>PKR {tax.toLocaleString(undefined, { minimumFractionDigits: 0 })}</span>
                  </div>
                  {deliveryFee > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: T.textMid }}>Delivery Fee {feeData?.zone ? `(${feeData.zone.name})` : ''}</span>
                      <span style={{ fontSize: 12, fontFamily: 'monospace', color: T.accent }}>PKR {deliveryFee.toLocaleString()}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: T.text }}>Total</span>
                    <span style={{ fontSize: 14, fontWeight: 800, fontFamily: 'monospace', color: T.accent }}>PKR {total.toLocaleString(undefined, { minimumFractionDigits: 0 })}</span>
                  </div>
                  <Btn onClick={handleSubmit} disabled={sending} style={{ width: '100%', padding: '13px' }}>
                    {sending ? '⏳ Sending…' : '🏍 Place Phone Order'}
                  </Btn>
                  <Btn variant="ghost" onClick={() => setCart([])} style={{ width: '100%', marginTop: 6 }}>Clear Cart</Btn>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* Per-item notes modal */}
      <ItemNotesModal
        item={notesItem}
        open={!!notesItem}
        onClose={() => setNotesItem(null)}
        onSave={(notes) => notesItem && setItemNotes(notesItem.id, notes)}
      />
    </div>
  );
}
