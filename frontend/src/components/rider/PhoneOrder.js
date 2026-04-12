import React, { useEffect, useState, useCallback } from 'react';
import {
  getMenu, getRiders, createPhoneOrder, assignRider,
  getPhoneOrders, updateOrderStatus
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
          background: T.accent, color: '#000',
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
  const [tab,       setTab]       = useState('new');       // 'new' | 'orders'
  const [date,      setDate]      = useState(new Date().toISOString().slice(0, 10));

  // Form state
  const [cat,       setCat]       = useState('All');
  const [search,    setSearch]    = useState('');
  const [cart,      setCart]      = useState([]);
  const [custName,  setCustName]  = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custAddr,  setCustAddr]  = useState('');
  const [custLat,   setCustLat]   = useState('');
  const [custLng,   setCustLng]   = useState('');
  const [riderId,   setRiderId]   = useState('');
  const [discount,  setDiscount]  = useState('');
  const [notes,     setNotes]     = useState('');

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
      const idx = c.findIndex(x => x.menu_item_id === item.id);
      if (idx >= 0) {
        const n = [...c];
        n[idx] = { ...n[idx], quantity: n[idx].quantity + 1, total_price: (n[idx].quantity + 1) * n[idx].unit_price };
        return n;
      }
      return [...c, { menu_item_id: item.id, name: item.name, quantity: 1, unit_price: parseFloat(item.price), total_price: parseFloat(item.price) }];
    });
  };

  const removeFromCart = (id) => setCart(c => {
    const idx = c.findIndex(x => x.menu_item_id === id);
    if (idx < 0) return c;
    const item = c[idx];
    if (item.quantity <= 1) return c.filter(x => x.menu_item_id !== id);
    const n = [...c];
    n[idx] = { ...item, quantity: item.quantity - 1, total_price: (item.quantity - 1) * item.unit_price };
    return n;
  });

  const subtotal = cart.reduce((s, i) => s + i.total_price, 0);
  const disc     = parseFloat(discount) || 0;
  const total    = Math.max(0, subtotal - disc);

  const handleSubmit = async () => {
    if (!custName.trim()) return toast.error('Customer name required');
    if (!custPhone.trim()) return toast.error('Customer phone required');
    if (!cart.length) return toast.error('Add items to order');
    setSending(true);
    try {
      await createPhoneOrder({
        customer_name: custName, customer_phone: custPhone,
        customer_address: custAddr, customer_lat: custLat || null,
        customer_lng: custLng || null,
        items: cart, discount_amount: disc, notes,
        rider_id: riderId || null,
      });
      toast.success('Order placed!');
      setCart([]); setCustName(''); setCustPhone(''); setCustAddr('');
      setCustLat(''); setCustLng(''); setRiderId(''); setDiscount(''); setNotes('');
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>

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
              </div>
              {custLat && custLng && (
                <a href={`https://www.google.com/maps?q=${custLat},${custLng}`} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 12, color: T.accent, display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  View on Map →
                </a>
              )}
            </Card>

            {/* Menu with images */}
            <Card>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 12 }}>Select Items</div>

              {/* Search + Categories */}
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

              {/* Menu grid — image cards, consistent sizing */}
              {filteredItems.length === 0
                ? <div style={{ textAlign: 'center', padding: '30px 0', color: T.textDim }}>No items found</div>
                : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                    gap: 12,
                  }}>
                    {filteredItems.map(item => {
                      const inCart = cart.find(x => x.menu_item_id === item.id) || null;
                      return (
                        <MenuItemCard
                          key={item.id}
                          item={item}
                          inCart={inCart}
                          onAdd={addToCart}
                          onRemove={removeFromCart}
                        />
                      );
                    })}
                  </div>
                )
              }
            </Card>
          </div>

          {/* Right: Cart + Submit */}
          <div style={{ position: 'sticky', top: 20 }}>
            <Card>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.text, marginBottom: 14 }}>Order Summary</div>

              {!cart.length
                ? <div style={{ color: T.textDim, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Tap items to add</div>
                : (
                  <div style={{ maxHeight: 260, overflowY: 'auto', marginBottom: 4 }}>
                    {cart.map(item => (
                      <div key={item.menu_item_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                          <div style={{ fontSize: 11, color: T.textMid }}>{fmtCur(item.unit_price)}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
                          <button onClick={() => removeFromCart(item.menu_item_id)} style={{ width: 22, height: 22, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, cursor: 'pointer' }}>-</button>
                          <span style={{ fontSize: 13, fontWeight: 700, color: T.text, minWidth: 16, textAlign: 'center' }}>{item.quantity}</span>
                          <button onClick={() => addToCart({ id: item.menu_item_id, name: item.name, price: item.unit_price })} style={{ width: 22, height: 22, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, cursor: 'pointer' }}>+</button>
                          <span style={{ fontSize: 12, fontWeight: 700, color: T.accent, minWidth: 56, textAlign: 'right' }}>{fmtCur(item.total_price)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              }

              <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 8, paddingTop: 12 }}>
                <Input label="Discount (PKR)" value={discount} onChange={e => setDiscount(e.target.value)} type="number" placeholder="0" />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.textMid, marginBottom: 4 }}>
                  <span>Subtotal</span><span>{fmtCur(subtotal)}</span>
                </div>
                {disc > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.red }}>
                  <span>Discount</span><span>-{fmtCur(disc)}</span>
                </div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, color: T.accent, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
                  <span>Total</span><span>{fmtCur(total)}</span>
                </div>
              </div>

              <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 12, paddingTop: 12 }}>
                <Select label="Assign Rider (optional)" value={riderId} onChange={e => setRiderId(e.target.value)}>
                  <option value="">-- Riders will see this order --</option>
                  {riders.map(r => (
                    <option key={r.id} value={r.id}>{r.full_name} ({r.active_orders} active)</option>
                  ))}
                </Select>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: T.textMid, marginBottom: 6, fontWeight: 600 }}>Notes</div>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="Special instructions..."
                    style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '8px 12px', color: T.text, fontSize: 13, width: '100%', outline: 'none', resize: 'none', minHeight: 54, fontFamily: "'Syne', sans-serif" }} />
                </div>
                <Btn onClick={handleSubmit} disabled={sending || !cart.length} style={{ width: '100%' }}>
                  {sending ? 'Placing...' : 'Place Phone Order'}
                </Btn>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
