import React, { useEffect, useState, useCallback } from 'react';
import { getMenu, getRiders, createPhoneOrder, assignRider, getOrders } from '../../services/api';
import { Card, PageHeader, Btn, Input, Select, Modal, Spinner, Badge, T, useT } from '../shared/UI';
import toast from 'react-hot-toast';

const IMG_BASE = process.env.REACT_APP_SOCKET_URL
  || (window.location.protocol + '//' + window.location.hostname + ':5000');

const STATUS_COLOR = {
  pending: '#F39C12', confirmed: '#3498DB', preparing: '#9B59B6',
  ready: '#27AE60', picked: '#2ECC71', out_for_delivery: '#1ABC9C',
  delivered: '#27AE60', paid: '#27AE60', cancelled: '#E74C3C',
};

function fmtCur(v) { return 'PKR ' + parseFloat(v || 0).toLocaleString('en-PK', { minimumFractionDigits: 0 }); }

export default function PhoneOrder() {
  useT();
  const [menu,      setMenu]      = useState({ categories: [], items: [] });
  const [riders,    setRiders]    = useState([]);
  const [orders,    setOrders]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [sending,   setSending]   = useState(false);

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

  // Modal state
  const [assignModal, setAssignModal] = useState(null); // { orderId }
  const [assignRiderId, setAssignRiderId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [menuR, ridersR, ordersR] = await Promise.all([
        getMenu(),
        getRiders(),
        getOrders({ order_type: 'delivery', source: 'phone' }),
      ]);
      setMenu(menuR.data);
      setRiders(ridersR.data);
      setOrders(ordersR.data.filter(o => o.source === 'phone' || o.order_type === 'delivery'));
    } catch { toast.error('Failed to load'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredItems = menu.items.filter(i => {
    const matchCat = cat === 'All' || i.category_name === cat;
    const matchQ   = !search || i.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchQ && i.is_available;
  });

  const addToCart = (item) => {
    setCart(c => {
      const idx = c.findIndex(x => x.menu_item_id === item.id);
      if (idx >= 0) { const n = [...c]; n[idx] = { ...n[idx], quantity: n[idx].quantity + 1, total_price: (n[idx].quantity + 1) * n[idx].unit_price }; return n; }
      return [...c, { menu_item_id: item.id, name: item.name, quantity: 1, unit_price: parseFloat(item.price), total_price: parseFloat(item.price) }];
    });
  };

  const removeFromCart = (id) => setCart(c => {
    const idx = c.findIndex(x => x.menu_item_id === id);
    if (idx < 0) return c;
    const item = c[idx];
    if (item.quantity <= 1) return c.filter(x => x.menu_item_id !== id);
    const n = [...c]; n[idx] = { ...item, quantity: item.quantity - 1, total_price: (item.quantity - 1) * item.unit_price }; return n;
  });

  const subtotal     = cart.reduce((s, i) => s + i.total_price, 0);
  const disc         = parseFloat(discount) || 0;
  const total        = Math.max(0, subtotal - disc);

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
      toast.success('Order created!');
      setCart([]); setCustName(''); setCustPhone(''); setCustAddr('');
      setCustLat(''); setCustLng(''); setRiderId(''); setDiscount(''); setNotes('');
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to create order'); }
    setSending(false);
  };

  const handleAssign = async () => {
    if (!assignRiderId) return toast.error('Select a rider');
    try {
      await assignRider(assignModal.orderId, { rider_id: assignRiderId });
      toast.success('Rider assigned');
      setAssignModal(null); setAssignRiderId('');
      load();
    } catch { toast.error('Failed to assign rider'); }
  };

  if (loading) return <Spinner />;

  return (
    <div style={{ padding: 24 }}>
      <PageHeader title="Phone Order" subtitle="Take delivery orders over the phone and assign riders" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
        {/* ── Left: Menu + Customer Form ── */}
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
              <a
                href={`https://www.google.com/maps?q=${custLat},${custLng}`}
                target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: T.accent, display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}
              >
                View on Map →
              </a>
            )}
          </Card>

          {/* Menu Browser */}
          <Card>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 14 }}>Add Items</div>
            <Input placeholder="Search menu..." value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {['All', ...menu.categories.map(c => c.name)].map(c => (
                <button key={c} onClick={() => setCat(c)} style={{
                  padding: '5px 14px', borderRadius: 20, border: `1px solid ${cat===c ? T.accent : T.border}`,
                  background: cat===c ? T.accentGlow : 'transparent', color: cat===c ? T.accent : T.textMid,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}>{c}</button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
              {filteredItems.map(item => {
                const inCart = cart.find(x => x.menu_item_id === item.id);
                return (
                  <div key={item.id} onClick={() => addToCart(item)} style={{
                    background: inCart ? T.accentGlow : T.surface,
                    border: `1px solid ${inCart ? T.accent : T.border}`,
                    borderRadius: 12, padding: '10px 12px', cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{item.name}</div>
                    <div style={{ fontSize: 12, color: T.textMid, marginTop: 2 }}>{fmtCur(item.price)}</div>
                    {inCart && <div style={{ fontSize: 11, color: T.accent, fontWeight: 700, marginTop: 4 }}>x{inCart.quantity} in cart</div>}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* ── Right: Cart + Order Summary ── */}
        <div style={{ position: 'sticky', top: 20 }}>
          <Card>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 14 }}>Order Summary</div>

            {!cart.length
              ? <div style={{ color: T.textDim, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No items added</div>
              : cart.map(item => (
                  <div key={item.menu_item_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: T.text }}>{item.name}</div>
                      <div style={{ fontSize: 11, color: T.textMid }}>{fmtCur(item.unit_price)} each</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button onClick={() => removeFromCart(item.menu_item_id)} style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>-</button>
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.text, minWidth: 20, textAlign: 'center' }}>{item.quantity}</span>
                      <button onClick={() => addToCart({ id: item.menu_item_id, name: item.name, price: item.unit_price })} style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                      <span style={{ fontSize: 13, fontWeight: 600, color: T.accent, minWidth: 60, textAlign: 'right' }}>{fmtCur(item.total_price)}</span>
                    </div>
                  </div>
                ))
            }

            <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 14, paddingTop: 14 }}>
              <Input label="Discount (PKR)" value={discount} onChange={e => setDiscount(e.target.value)} type="number" placeholder="0" />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: T.textMid, marginBottom: 4 }}>
                <span>Subtotal</span><span>{fmtCur(subtotal)}</span>
              </div>
              {disc > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: T.red }}>
                <span>Discount</span><span>-{fmtCur(disc)}</span>
              </div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, color: T.accent, marginTop: 8 }}>
                <span>Total</span><span>{fmtCur(total)}</span>
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 14, paddingTop: 14 }}>
              <Select label="Assign Rider (optional)" value={riderId} onChange={e => setRiderId(e.target.value)}>
                <option value="">-- No rider yet --</option>
                {riders.map(r => <option key={r.id} value={r.id}>{r.full_name} ({r.active_orders} active)</option>)}
              </Select>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: T.textMid, marginBottom: 6, fontWeight: 600 }}>Notes</div>
                <textarea value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Special instructions..."
                  style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 14px', color: T.text, fontSize: 13, width: '100%', outline: 'none', resize: 'vertical', minHeight: 60, fontFamily: "'Syne', sans-serif" }} />
              </div>
              <Btn onClick={handleSubmit} disabled={sending} style={{ width: '100%' }}>
                {sending ? 'Placing Order...' : 'Place Phone Order'}
              </Btn>
            </div>
          </Card>
        </div>
      </div>

      {/* ── Recent Phone Orders ── */}
      <div style={{ marginTop: 28 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: T.text, marginBottom: 16 }}>Today's Delivery Orders</div>
        {orders.length === 0
          ? <Card><div style={{ color: T.textDim, textAlign: 'center', padding: '20px 0' }}>No delivery orders today</div></Card>
          : (
            <div style={{ display: 'grid', gap: 12 }}>
              {orders.map(order => (
                <Card key={order.id} style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: T.text }}>#{order.order_number}</span>
                        <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: STATUS_COLOR[order.status] + '22', color: STATUS_COLOR[order.status] }}>
                          {order.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: T.text, marginTop: 4 }}>{order.customer_name} · {order.customer_phone}</div>
                      {order.delivery_address?.address && <div style={{ fontSize: 12, color: T.textMid }}>{order.delivery_address.address}</div>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: T.accent }}>{fmtCur(order.total_amount)}</div>
                      {order.rider_name
                        ? <div style={{ fontSize: 12, color: T.green }}>Rider: {order.rider_name}</div>
                        : (
                          <Btn size="sm" variant="secondary" onClick={() => { setAssignModal({ orderId: order.id }); setAssignRiderId(''); }} style={{ marginTop: 4 }}>
                            Assign Rider
                          </Btn>
                        )
                      }
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )
        }
      </div>

      {/* Assign Rider Modal */}
      <Modal open={!!assignModal} onClose={() => setAssignModal(null)} title="Assign Rider" width={380}>
        <Select label="Select Rider" value={assignRiderId} onChange={e => setAssignRiderId(e.target.value)}>
          <option value="">-- Choose a rider --</option>
          {riders.map(r => <option key={r.id} value={r.id}>{r.full_name} · {r.active_orders} active orders</option>)}
        </Select>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <Btn variant="ghost" onClick={() => setAssignModal(null)} style={{ flex: 1 }}>Cancel</Btn>
          <Btn onClick={handleAssign} style={{ flex: 1 }}>Assign</Btn>
        </div>
      </Modal>
    </div>
  );
}
