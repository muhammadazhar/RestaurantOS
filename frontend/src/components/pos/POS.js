import React, { useEffect, useState, useCallback, useRef } from 'react';
import { getMenu, getTables, createOrder, getOrders, updateOrderStatus, getActiveTableOrder, addOrderItems, replaceOrderItem, returnOrderItem, cancelOrderReturn, getCurrentShift, continueMyShift, closeMyShift, startMyShift, attClockIn, getRiders, getDiscountPresets, getShiftCashSummary, getEmployees } from '../../services/api';
import { Card, Badge, Spinner, Btn, Modal, T, useT } from '../shared/UI';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { mergePrintTemplates, renderKotHtml, renderReceiptHtml } from '../../utils/printTemplates';
import toast from 'react-hot-toast';

const IMG_BASE = process.env.REACT_APP_SOCKET_URL
  || (window.location.protocol + '//' + window.location.hostname + ':5000');

const apiDate = (dateStr) => {
  if (!dateStr) return new Date().toLocaleDateString('en-CA');
  if (String(dateStr).includes('T')) return new Date(dateStr).toLocaleDateString('en-CA');
  return String(dateStr).slice(0, 10);
};

const DAY_KEYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const todayDayKey = () => DAY_KEYS[new Date().getDay()];
const DEFAULT_TAX_RATES = [
  { id: 'gst', name: 'Sales Tax (GST)', rate: 8, applies_to: 'all', enabled: true },
];
const minutesFromTime = value => {
  const [hours, minutes] = String(value || '00:00').slice(0, 5).split(':').map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
};
const isShiftOpenableNow = (shift, date = new Date()) => {
  if (!shift) return false;
  const shiftDate = apiDate(shift.date);
  const currentDate = date.toLocaleDateString('en-CA');
  const now = date.getHours() * 60 + date.getMinutes();
  const start = minutesFromTime(shift.start_time);
  const end = minutesFromTime(shift.end_time);
  if (start === end) return shiftDate === currentDate;
  if (start < end) return shiftDate === currentDate && now >= start && now <= end;

  const yesterday = new Date(date);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayDate = yesterday.toLocaleDateString('en-CA');
  return (shiftDate === currentDate && now >= start) || (shiftDate === yesterdayDate && now <= end);
};
const selectOpenableScheduledShift = currentShift => {
  const primary = currentShift?.shift;
  const backendSaysStartable = currentShift?.reason === 'Start your shift before placing orders';
  const isOpenableSchedule = shift => (
    shift
    && !['active', 'in_process', 'absent'].includes(shift.status)
    && isShiftOpenableNow(shift)
  );
  if (primary && backendSaysStartable) return primary;
  if (isOpenableSchedule(primary)) return primary;

  const scheduled = (currentShift?.shifts || [])
    .filter(isOpenableSchedule)
    .sort((a, b) => minutesFromTime(b.start_time) - minutesFromTime(a.start_time));
  return scheduled[0] || null;
};
const selectDisplayScheduledShift = currentShift => {
  const openable = selectOpenableScheduledShift(currentShift);
  if (openable) return openable;
  return null;
};

// POS section
const ItemImage = ({ src, name }) => {
  const [err, setErr] = useState(false);
  const url = src && !err ? (src.startsWith('http') ? src : `${IMG_BASE}${src}`) : null;
  return (
    <div style={{ fontSize: url ? 0 : 28, width: 48, height: 48, borderRadius: 8, overflow: 'hidden', background: T.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {url
        ? <img src={url} alt={name} onError={() => setErr(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : 'IMG'
      }
    </div>
  );
};

// POS section
function ItemNotesModal({ item, open, onClose, onSave }) {
  const [notes, setNotes] = useState('');
  useEffect(() => { if (open) setNotes(item?.notes || ''); }, [open, item]);
  return (
    <Modal open={open} onClose={onClose} title={`Notes - ${item?.name}`} width={380}>
      <textarea value={notes} onChange={e => setNotes(e.target.value)}
        placeholder="e.g. No onions, extra spicy, medium-well..."
        style={{ width: '100%', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 14px', color: T.text, fontSize: 13, fontFamily: "'Inter', sans-serif", outline: 'none', resize: 'vertical', minHeight: 80, marginBottom: 12 }} />
      <Btn onClick={() => { onSave(notes); onClose(); }} style={{ width: '100%' }}>Save Notes</Btn>
    </Modal>
  );
}

export default function POS() {
  useT();
  const { mode } = useTheme();
  const light = mode === 'light';
  const S = {
    panel: {
      background: light ? '#fff' : 'rgba(15,23,42,0.82)',
      border: `1px solid ${light ? '#e2e8f0' : T.border}`,
      boxShadow: light ? '0 1px 2px rgba(15,23,42,0.05)' : 'none',
    },
    active: {
      background: light ? '#0f172a' : '#fbbf24',
      border: `1px solid ${light ? '#0f172a' : '#fbbf24'}`,
      color: light ? '#fff' : '#020617',
    },
    inactive: {
      background: light ? '#fff' : 'rgba(255,255,255,0.06)',
      border: `1px solid ${light ? '#e2e8f0' : 'rgba(255,255,255,0.10)'}`,
      color: light ? '#475569' : '#cbd5e1',
    },
    card: {
      background: light ? '#fff' : 'rgba(15,23,42,0.92)',
      border: `1px solid ${light ? '#e2e8f0' : T.border}`,
      boxShadow: light ? '0 1px 2px rgba(15,23,42,0.05)' : '0 18px 42px rgba(0,0,0,0.20)',
    },
    cardSelected: {
      background: light ? '#f8fafc' : 'rgba(251,191,36,0.10)',
      border: `1px solid ${light ? '#0f172a' : T.accent + '88'}`,
      boxShadow: light ? '0 8px 20px rgba(15,23,42,0.08)' : '0 18px 42px rgba(0,0,0,0.20)',
    },
    image: {
      background: light ? '#f1f5f9' : '#020617',
    },
  };
  const [menu,         setMenu]         = useState({ categories: [], items: [], settings: {} });
  const [tables,       setTables]       = useState([]);
  const [onlineOrders, setOnlineOrders] = useState([]);
  const [cat,          setCat]          = useState('all');
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
  const [waiterId,     setWaiterId]     = useState('');
  const [riders,       setRiders]       = useState([]);
  const [employees,    setEmployees]    = useState([]);
  const [orderNotes,   setOrderNotes]   = useState('');
  const [loading,      setLoading]      = useState(true);
  const [sending,      setSending]      = useState(false);
  const [notesItem,    setNotesItem]    = useState(null);
  const [createdOrder, setCreatedOrder] = useState(null);   // takeaway pay modal
  const [activeTableOrder, setActiveTableOrder] = useState(null);
  const [replaceTarget, setReplaceTarget] = useState(null);
  const [loadingTableOrder, setLoadingTableOrder] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [takePayMethod,setTakePayMethod]= useState('cash');
  const [takePaying,      setTakePaying]      = useState(false);
  const [takePrintRdy,    setTakePrintRdy]    = useState(false);
  const [tenderedAmount,  setTenderedAmount]  = useState('');
  const [discountPresets, setDiscountPresets] = useState([]);
  const [currentShift,    setCurrentShift]    = useState(null);   // { shift, allowed, reason }
  const [shiftEndModal,   setShiftEndModal]   = useState(false);
  const [cashSummary,     setCashSummary]     = useState(null);
  const [cashierCollection, setCashierCollection] = useState('');
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
    getEmployees().then(r => setEmployees(r.data)).catch(() => {});
    getDiscountPresets().then(r => setDiscountPresets(r.data.filter(p => p.is_active))).catch(() => {});
    on('new_order', load);
    return () => off('new_order', load);
  }, [load, loadShift, on, off]);

  // POS section
  useEffect(() => {
    const check = () => {
      if (!currentShift?.shift) return;
      if (currentShift.shift.status !== 'active') return;
      if (shiftEndAlerted.current) return;
      const now = new Date().toTimeString().slice(0, 5);
      const end = currentShift.shift.end_time?.slice(0, 5);
      if (end && now > end) {
        shiftEndAlerted.current = true;
        setCashierCollection('');
        setShiftEndModal(true);
        // Load cash summary for the shift-end modal
        getShiftCashSummary(currentShift.shift.id).then(r => setCashSummary(r.data)).catch(() => {});
      }
    };
    check();
    const timer = setInterval(check, 30000);
    return () => clearInterval(timer);
  }, [currentShift]);

  const cats = [{ id: 'all', name: 'All' }, ...menu.categories];
  const categoryCounts = menu.items.reduce((acc, item) => {
    if (item.is_available === false) return acc;
    acc[item.category_id || 'uncategorized'] = (acc[item.category_id || 'uncategorized'] || 0) + 1;
    return acc;
  }, {});

  const smartMenuSortEnabled = menu.settings?.pos_smart_menu_sort_enabled === true;
  const filtered = menu.items.filter(item => {
    const matchCat    = cat === 'all' || item.category_id === cat;
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch && item.is_available !== false;
  }).sort((a, b) => {
    if (smartMenuSortEnabled) {
      const scoreA = (Number(a.total_sold || 0) * 1000) + Number(a.gross_sales || 0) + (a.is_popular ? 500 : 0);
      const scoreB = (Number(b.total_sold || 0) * 1000) + Number(b.gross_sales || 0) + (b.is_popular ? 500 : 0);
      if (scoreA !== scoreB) return scoreB - scoreA;
    }
    const orderA = Number.isFinite(Number(a.sort_order)) ? Number(a.sort_order) : 0;
    const orderB = Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : 0;
    if (orderA !== orderB) return orderA - orderB;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  const canUseOpenPrice = (item) => {
    if (!item?.allow_open_price) return false;
    if (user?.isSuperAdmin) return true;
    const required = String(item.open_price_role || item.price_override_role || 'manager').toLowerCase();
    const role = String(user?.role || '').toLowerCase();
    if (required === 'cashier') return true;
    if (required === 'admin') return role.includes('admin') || (user?.permissions || []).includes('settings');
    return role.includes('manager') || role.includes('admin') || (user?.permissions || []).includes('settings');
  };

  const getEffectiveVariantPrice = (item, variant) => {
    const basePrice = Number(variant.price ?? item.price ?? 0);
    if (!item.weekend_price_rule) return basePrice;
    const weekendDays = Array.isArray(item.weekend_days) && item.weekend_days.length ? item.weekend_days : ['FRI', 'SAT'];
    if (!weekendDays.includes(todayDayKey())) return basePrice;
    const weekendPrice = variant.weekend_price ?? item.weekend_price;
    return weekendPrice == null || weekendPrice === '' ? basePrice : Number(weekendPrice);
  };

  const getItemVariants = (item) => (item.variants?.length ? item.variants : [{ name: 'Regular', price: item.price }])
    .filter(v => v.is_active !== false)
    .map((v, index) => ({
      ...v,
      id: v.id || `${item.id}-${index}`,
      name: v.name || 'Regular',
      base_price: Number(v.price ?? item.price ?? 0),
      price: getEffectiveVariantPrice(item, v),
      weekend_applied: item.weekend_price_rule && (Array.isArray(item.weekend_days) ? item.weekend_days : ['FRI', 'SAT']).includes(todayDayKey()) && (v.weekend_price != null || item.weekend_price != null),
    }));

  const cartFromOrder = (order) => (order?.items || []).filter(i => i.status !== 'cancelled').map(i => ({
    id: i.menu_item_id,
    menu_item_id: i.menu_item_id,
    order_item_id: i.id,
    cart_key: `existing:${i.id}`,
    name: i.name,
    base_name: i.name,
    price: Number(i.unit_price || 0),
    qty: Number(i.quantity || 1),
    notes: i.notes || '',
    existing_order_item: true,
  }));

  const clearLoadedOrder = () => {
    setActiveTableOrder(null);
    setReplaceTarget(null);
  };

  const loadActiveTableForCart = async (selectedTableId) => {
    if (!selectedTableId) {
      clearLoadedOrder();
      setCart([]);
      return;
    }
    const table = tables.find(t => t.id === selectedTableId);
    if (table?.status !== 'occupied') {
      clearLoadedOrder();
      return;
    }
    setLoadingTableOrder(true);
    try {
      const res = await getActiveTableOrder(selectedTableId);
      setActiveTableOrder(res.data);
      setCart(cartFromOrder(res.data));
      setDiscount(String(Number(res.data.discount_amount || 0) || ''));
      setGuestCount(res.data.guest_count || 1);
      setWaiterId(res.data.waiter_id || '');
      setOrderNotes(res.data.notes || '');
      toast.success(`${res.data.order_number} loaded`);
    } catch (err) {
      clearLoadedOrder();
      toast.error(err.response?.data?.error || 'No active order found for this table');
    } finally {
      setLoadingTableOrder(false);
    }
  };

  const handleTableSelect = (selectedTableId) => {
    setTableId(selectedTableId);
    loadActiveTableForCart(selectedTableId);
  };

  const processReplacement = async (menuItem, variant = getItemVariants(menuItem)[0]) => {
    if (!activeTableOrder || !replaceTarget) return;
    const reason = window.prompt(`Reason for replacing ${replaceTarget.name}?`, 'Customer requested replacement');
    if (!reason) return;
    setSending(true);
    try {
      const displayName = variant.name === 'Regular' ? menuItem.name : `${menuItem.name} - ${variant.name}`;
      const res = await replaceOrderItem(activeTableOrder.id, {
        order_item_id: replaceTarget.order_item_id,
        replacement_menu_item_id: menuItem.id,
        replacement_name: displayName,
        quantity: replaceTarget.qty,
        unit_price: variant.price,
        reason,
      });
      setActiveTableOrder(res.data.order);
      setCart(cartFromOrder(res.data.order));
      setReplaceTarget(null);
      const adjustment = Number(res.data.total_adjustment || 0);
      toast.success(adjustment === 0 ? 'Item replaced' : `Item replaced, adjustment PKR ${adjustment.toLocaleString()}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Replacement failed');
    } finally {
      setSending(false);
    }
  };

  const handleMenuItemClick = (item, variant = getItemVariants(item)[0]) => {
    if (replaceTarget) return processReplacement(item, variant);
    addToCart(item, variant);
  };

  const addToCart = (item, variant = getItemVariants(item)[0]) => setCart(prev => {
    if (activeTableOrder && item.existing_order_item) return prev;
    const cartKey = `${item.id}:${variant.id || variant.name}`;
    const displayName = variant.name === 'Regular' ? item.name : `${item.name} - ${variant.name}`;
    const ex = prev.find(c => c.cart_key === cartKey);
    if (ex) return prev.map(c => c.cart_key === cartKey ? { ...c, qty: c.qty + 1 } : c);
    return [...prev, {
      ...item,
      cart_key: cartKey,
      variant_id: variant.id,
      variant_name: variant.name,
      name: displayName,
      base_name: item.name,
      price: variant.price,
      base_price: variant.base_price ?? variant.price,
      open_price_allowed: canUseOpenPrice(item),
      weekend_applied: variant.weekend_applied,
      qty: 1,
      notes: '',
    }];
  });

  const setCartItemPrice = (cartKey, price) => setCart(prev =>
    prev.map(c => c.cart_key === cartKey ? { ...c, price: Math.max(0, Number(price || 0)) } : c)
  );

  const changeQty = (cartKey, delta) => setCart(prev =>
    prev.map(c => c.cart_key === cartKey ? { ...c, qty: Math.max(1, c.qty + delta) } : c)
        .filter(c => c.qty > 0)
  );

  const removeItem = (cartKey) => setCart(prev => prev.filter(c => c.cart_key !== cartKey));

  const cancelLoadedOrder = async () => {
    if (!activeTableOrder) return;
    const reason = window.prompt(`Reason for cancelling ${activeTableOrder.order_number}?`, 'Customer cancelled order');
    if (!reason) return;
    setSending(true);
    try {
      await cancelOrderReturn(activeTableOrder.id, { reason });
      toast.success('Order cancelled and return recorded');
      setCart([]);
      setDiscount('');
      clearLoadedOrder();
      setTableId('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Cancellation failed');
    } finally {
      setSending(false);
    }
  };

  const returnSingleItem = async (item) => {
    if (!activeTableOrder || !item?.order_item_id) return;
    const reason = window.prompt(`Reason for returning ${item.name}?`, 'Customer returned item');
    if (!reason) return;
    setSending(true);
    try {
      const res = await returnOrderItem(activeTableOrder.id, {
        order_item_id: item.order_item_id,
        reason,
      });
      if (res.data.order?.status === 'cancelled') {
        toast.success('Item returned and order cancelled');
        setCart([]);
        setDiscount('');
        clearLoadedOrder();
        setTableId('');
        load();
      } else {
        setActiveTableOrder(res.data.order);
        setCart(cartFromOrder(res.data.order));
        setReplaceTarget(null);
        const refund = Math.abs(Number(res.data.total_adjustment || 0));
        toast.success(refund ? `Item returned, refund PKR ${refund.toLocaleString()}` : 'Item returned');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Item return failed');
    } finally {
      setSending(false);
    }
  };

  const setItemNotes = (cartKey, notes) => setCart(prev =>
    prev.map(c => c.cart_key === cartKey ? { ...c, notes } : c)
  );

  const activeTaxRates = (Array.isArray(menu.settings?.tax_rates) ? menu.settings.tax_rates : DEFAULT_TAX_RATES)
    .filter(rate => rate?.enabled !== false)
    .filter(rate => ['all', orderType].includes(rate.applies_to || 'all'))
    .map(rate => ({ ...rate, rate: Number(rate.rate || 0) }))
    .filter(rate => rate.rate > 0);
  const combinedTaxRate = activeTaxRates.reduce((sum, rate) => sum + rate.rate, 0) / 100;
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discountAmt = Math.min(parseFloat(discount) || 0, subtotal);
  const discountRatio = subtotal > 0 ? discountAmt / subtotal : 0;
  const taxLines = activeTaxRates.map(rate => ({ ...rate, amount: 0 }));
  let includedTax = 0;
  let exclusiveTax = 0;

  cart.forEach(item => {
    if (item.tax_applicable === false || !activeTaxRates.length) return;
    const lineTotal = Number(item.price || 0) * Number(item.qty || 0);
    const discountedLine = lineTotal * (1 - discountRatio);
    if (discountedLine <= 0) return;

    activeTaxRates.forEach((rate, index) => {
      const rateDecimal = Number(rate.rate || 0) / 100;
      const amount = item.tax_included === true
        ? discountedLine * (rateDecimal / (1 + combinedTaxRate))
        : discountedLine * rateDecimal;
      taxLines[index].amount += amount;
      if (item.tax_included === true) includedTax += amount;
      else exclusiveTax += amount;
    });
  });

  const taxBreakdown = taxLines
    .map(line => ({ ...line, amount: Math.round(line.amount * 100) / 100 }))
    .filter(line => line.amount > 0);
  const tax = Math.round((includedTax + exclusiveTax) * 100) / 100;
  const total = Math.round((subtotal - discountAmt + exclusiveTax) * 100) / 100;
  const taxLabel = activeTaxRates.length ? activeTaxRates.map(r => `${r.name || 'Tax'} ${Number(r.rate).toLocaleString()}%`).join(' + ') : 'Tax';
  const newCartItems = cart.filter(c => !c.existing_order_item);

  const sendToKitchen = async () => {
    if (!cart.length)                             return toast.error('Cart is empty');
    if (orderType === 'dine_in' && !tableId)      return toast.error('Select a table');
    if (['takeaway','delivery'].includes(orderType) && !custName) return toast.error('Customer name required');
    const orderItems = activeTableOrder ? cart.filter(c => !c.existing_order_item) : cart;
    if (activeTableOrder && !orderItems.length) return toast.error('Add a new item, or use Return/Replace on existing items.');
    setSending(true);
    try {
      if (activeTableOrder) {
        const res = await addOrderItems(activeTableOrder.id, {
          notes: orderNotes || undefined,
          items: orderItems.map(c => ({
            menu_item_id: c.id, name: c.name,
            quantity: c.qty, unit_price: c.price,
            notes: c.notes || undefined,
          })),
        });
        printKOT(res.data.order, orderItems);
        setActiveTableOrder(res.data.order);
        setCart(cartFromOrder(res.data.order));
        setReplaceTarget(null);
        toast.success('Items added to order and sent to kitchen');
        load();
        return;
      }
      const res = await createOrder({
        table_id:          tableId || null,
        order_type:        orderType,
        guest_count:       parseInt(guestCount) || 1,
        shift_id:          currentShift?.shift?.id || undefined,
        shift_session_id:  currentShift?.shift?.session_id || undefined,
        customer_name:     custName  || undefined,
        customer_phone:    custPhone || undefined,
        customer_address:  orderType === 'delivery' ? custAddr || undefined : undefined,
        customer_lat:      orderType === 'delivery' ? custLat  || undefined : undefined,
        customer_lng:      orderType === 'delivery' ? custLng  || undefined : undefined,
        rider_id:          orderType === 'delivery' ? delivRiderId || undefined : undefined,
        waiter_id:         orderType === 'dine_in'  ? waiterId    || undefined : undefined,
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
          _taxBreakdown: taxBreakdown,
          _taxLabel: taxLabel,
          _total:      total,
          _custName:   custName,
          _custPhone:  custPhone,
        });
        setTakePayMethod(orderType === 'delivery' ? 'cod' : 'cash');
        setTakePrintRdy(false);
        setShowPayModal(true);
      } else {
        toast.success('Order sent to kitchen!');
        setCart([]); setDiscount(''); setCustName(''); setCustPhone(''); setCustAddr(''); setCustLat(''); setCustLng(''); setDelivRiderId(''); setWaiterId(''); setOrderNotes(''); setGuestCount(1);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send order');
    } finally { setSending(false); }
  };

  const handleTakeawayPay = async () => {
    if (!createdOrder) return;
    // POS section
    if (takePayMethod === 'cod') {
      setTakePrintRdy(true);
      return;
    }
    setTakePaying(true);
    try {
      await updateOrderStatus(createdOrder.id, 'paid', takePayMethod);
      toast.success('Payment confirmed!');
      setTakePrintRdy(true);
    } catch {
      toast.error('Payment failed - please try again');
    } finally { setTakePaying(false); }
  };

  // POS section
  const printKOT = (order, cartItems) => {
    const items = (cartItems && cartItems.length
      ? cartItems.map(c => ({ name: c.name, quantity: c.qty || c.quantity, notes: c.notes }))
      : (order.items || [])
    ).filter(i => i?.name);

    const tbl = tableId ? tables.find(t => t.id === tableId) : null;
    const templates = mergePrintTemplates(menu.settings || {});
    const waiterName = waiterId ? employees.find(e => e.id === waiterId)?.full_name : order.waiter_name;

    const w = window.open('', '_blank', 'width=360,height=600');
    if (!w) { toast.error('Pop-up blocked - please allow pop-ups for KOT printing'); return; }
    w.document.write(renderKotHtml({
      template: templates.kot,
      restaurant: { logo_url: menu.settings?.logo_url },
      order: { ...order, order_type: order.order_type || orderType, customer_name: custName || order.customer_name },
      items,
      table: tbl,
      orderNotes,
      cashierName: user?.full_name || user?.name || '',
      waiterName,
    }));
    w.document.close();
    setTimeout(() => { w.print(); }, 300);
  };

  const printTakeawayReceipt = () => {
    if (!createdOrder) return;
    const o = createdOrder;
    const methodLabel = { cash: 'Cash', card: 'Card', jazzcash: 'JazzCash', easypaisa: 'Easypaisa', cod: 'Cash on Delivery' }[takePayMethod] || takePayMethod;
    const isCOD = takePayMethod === 'cod';
    const items = (o.items && o.items.length ? o.items : o._cartItems.map(c => ({
      name: c.name, quantity: c.qty, unit_price: c.price, total_price: c.price * c.qty, notes: c.notes,
    }))).filter(i => i?.name);
    const sub  = Number(o.subtotal  || o._subtotal);
    const tax  = Number(o.tax_amount|| o._tax);
    const receiptTaxBreakdown = o._taxBreakdown || taxBreakdown;
    const receiptTaxLabel = o._taxLabel || taxLabel;
    const disc = Number(o.discount_amount || o._discountAmt || 0);
    const ttl  = Number(o.total_amount   || o._total);
    const w = window.open('', '_blank', 'width=420,height=720');
    const templates = mergePrintTemplates(menu.settings || {});
    const waiterName = waiterId ? employees.find(e => e.id === waiterId)?.full_name : o.waiter_name;
    w.document.write(renderReceiptHtml({
      template: templates.receipt,
      restaurant: { logo_url: menu.settings?.logo_url },
      order: { ...o, subtotal: sub, tax_amount: tax, discount_amount: disc, total_amount: ttl, order_type: o.order_type || orderType },
      items,
      taxBreakdown: receiptTaxBreakdown,
      taxLabel: receiptTaxLabel,
      methodLabel,
      isPaid: true,
      isCOD,
      tenderedAmount,
      cashierName: user?.full_name || user?.name || '-',
      waiterName,
      address: isCOD ? (o.delivery_address?.address || custAddr) : '',
      shiftLabel: currentShift?.shift ? `#${currentShift.shift.shift_number || '-'} ${currentShift.shift.shift_name} (${currentShift.shift.start_time?.slice(0,5)}-${currentShift.shift.end_time?.slice(0,5)})` : '',
    }));
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  const closeTakeawayModal = () => {
    setShowPayModal(false);
    setCreatedOrder(null);
    setTakePrintRdy(false);
    setTenderedAmount('');
    setCart([]); setDiscount(''); setCustName(''); setCustPhone(''); setCustAddr(''); setCustLat(''); setCustLng(''); setDelivRiderId(''); setWaiterId(''); setOrderNotes(''); setGuestCount(1);
  };

  if (loading) return <Spinner />;

  const needCustomer = ['takeaway', 'delivery', 'online'].includes(orderType);
  const shiftBlocked = currentShift && !currentShift.allowed;
  const isClockedIn   = currentShift?.attendance?.is_clocked_in;
  const attendColor   = isClockedIn ? T.green : T.red;
  const attendBg      = isClockedIn ? T.greenDim : T.redDim;
  const activeShift = currentShift?.shift && ['active', 'in_process'].includes(currentShift.shift.status)
    ? currentShift.shift
    : null;
  const cashierCollectionAmount = cashierCollection === '' ? null : Number(cashierCollection);
  const closeVariance = cashSummary && Number.isFinite(cashierCollectionAmount)
    ? cashierCollectionAmount - Number(cashSummary.expected_closing || 0)
    : null;
  const isActiveShiftStillScheduled = activeShift ? isShiftOpenableNow(activeShift) : false;
  const dismissShiftEndModal = () => {
    setShiftEndModal(false);
    setCashSummary(null);
    setCashierCollection('');
  };

  const openShiftCloseModal = async () => {
    if (!activeShift) return;
    setCashierCollection('');
    try {
      const r = await getShiftCashSummary(activeShift.id);
      setCashSummary(r.data);
    } catch {
      setCashSummary(null);
    }
    setShiftEndModal(true);
  };

  return (
    <div style={{ display: 'flex', gap: 8, height: 'calc(100vh - 56px)', position: 'relative' }}>

      {/* POS section */}
      {shiftBlocked && <CleanPOSGateModal currentShift={currentShift} onUnlocked={() => loadShift()} />}

      {/* POS section */}
      {shiftEndModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 32, maxWidth: 420, width: '90%', textAlign: 'center', position: 'relative' }}>
            <button
              type="button"
              onClick={dismissShiftEndModal}
              aria-label="Close"
              style={{ position: 'absolute', right: 14, top: 14, width: 30, height: 30, borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface, color: T.textMid, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
            >
              x
            </button>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1, color: T.accent, marginBottom: 12 }}>SHIFT</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.text, marginBottom: 8 }}>{isActiveShiftStillScheduled ? 'Shift Active' : 'Shift Ended'}</div>
            <div style={{ fontSize: 14, color: T.textMid, marginBottom: 8 }}>
              {isActiveShiftStillScheduled ? 'Your shift is still within the scheduled time.' : <>Your shift ended at <b style={{ color: T.text }}>{currentShift?.shift?.end_time?.slice(0,5)}</b></>}
            </div>

            {/* Cash summary */}
            {cashSummary && (
              <div style={{ background: T.surface, borderRadius: 12, padding: '12px 16px', marginBottom: 16, textAlign: 'left' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.textDim, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Cash Summary</div>
                {[
                  ['Opening Balance', cashSummary.opening_balance],
                  ['Cash Sales', cashSummary.cash_sales],
                  ['Expected Closing', cashSummary.expected_closing],
                  ['System Closing', cashSummary.closing_cash],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 13 }}>
                    <span style={{ color: T.textMid }}>{label}</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: label === 'Expected Closing' ? T.green : T.text }}>
                      PKR {Number(val || 0).toLocaleString()}
                    </span>
                  </div>
                ))}
                <label style={{ display: 'block', marginTop: 12 }}>
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Cashier Collection</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={cashierCollection}
                    onChange={e => setCashierCollection(e.target.value)}
                    placeholder="Enter collected cash"
                    style={{ width: '100%', background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '9px 10px', color: T.text, fontSize: 13, fontFamily: 'monospace', outline: 'none', textAlign: 'right' }}
                  />
                </label>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0', fontSize: 13 }}>
                  <span style={{ color: T.textMid }}>Variance</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 800, color: closeVariance == null ? T.textDim : Math.abs(closeVariance) > 0.01 ? T.red : T.green }}>
                    {closeVariance == null ? '-' : `PKR ${Number(closeVariance).toLocaleString()}`}
                  </span>
                </div>
              </div>
            )}

            <div style={{ fontSize: 13, color: T.textDim, marginBottom: 20 }}>
              {isActiveShiftStillScheduled
                ? 'You can close this window and continue the active shift, or close the shift if needed.'
                : 'Would you like to close your shift or continue working?'}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={async () => {
                  if (isActiveShiftStillScheduled) {
                    dismissShiftEndModal();
                    toast.success('Shift remains active');
                    loadShift();
                    return;
                  }
                  try {
                    await continueMyShift(currentShift.shift.id, { shift_date: apiDate(currentShift.shift.date) });
                    dismissShiftEndModal();
                    toast.success('Continuing in overtime');
                    loadShift();
                  } catch (e) { toast.error(e.response?.data?.error || 'Failed to continue shift'); }
                }}
                style={{ flex: 1, background: T.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
                Continue Working
              </button>
              <button
                onClick={async () => {
                  try {
                    if (!Number.isFinite(cashierCollectionAmount) || cashierCollectionAmount < 0) {
                      toast.error('Enter cashier collection amount');
                      return;
                    }
                    const r = await closeMyShift(currentShift.shift.id, {
                      shift_date: apiDate(currentShift.shift.date),
                      cashier_collection: cashierCollectionAmount,
                    });
                    dismissShiftEndModal();
                    const closingCash = r.data?.closing_cash;
                    const collected = r.data?.cashier_collection;
                    toast.success(closingCash != null ? `Shift closed - System: PKR ${Number(closingCash).toLocaleString()} / Collected: PKR ${Number(collected || 0).toLocaleString()}` : 'Shift closed');
                    loadShift();
                  } catch (e) { toast.error(e.response?.data?.error || 'Failed to close shift'); }
                }}
                style={{ flex: 1, background: T.red, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
                Close Shift
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POS section */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>

        {/* Top bar */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: T.text, margin: 0 }}>POS</h1>
          {currentShift?.shift && (() => {
            const s = currentShift.shift;
            const isOT = s.status === 'in_process';
            const bg = isOT ? T.accentGlow : currentShift.allowed ? T.greenDim : T.redDim;
            const clr = isOT ? T.accent : currentShift.allowed ? T.green : T.red;
            return (
              <div style={{ background: bg, border: `1px solid ${clr}44`, borderRadius: 8, padding: '4px 12px', fontSize: 11, fontWeight: 700, color: clr }}>
                Shift #{s.shift_number} - {s.shift_name} - {s.start_time?.slice(0,5)}-{s.end_time?.slice(0,5)}
                {isOT && <span style={{ marginLeft: 6, fontSize: 10 }}>OVERTIME</span>}
              </div>
            );
          })()}
          {activeShift && (
            <button onClick={openShiftCloseModal} style={{ background: T.red, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
                Close Shift
            </button>
          )}
          {currentShift && !currentShift.shift && (
            <div style={{ background: T.redDim, border: `1px solid ${T.red}44`, borderRadius: 8, padding: '4px 12px', fontSize: 11, fontWeight: 700, color: T.red }}>
              No shift today
            </div>
          )}
          {currentShift && (
            <div style={{ background: attendBg, border: `1px solid ${attendColor}44`, borderRadius: 8, padding: '4px 12px', fontSize: 11, fontWeight: 700, color: attendColor }}>
              {isClockedIn ? 'Clocked In' : 'Not Clocked In'}
            </div>
          )}

          {/* Order type */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[['dine_in','Dine In'],['takeaway','Takeaway'],['delivery','Delivery'],['online','Online']]
              .map(([v,lbl]) => (
              <button key={v} onClick={() => { setOrderType(v); if (v !== 'dine_in') { setTableId(''); clearLoadedOrder(); } }} style={{
                ...(orderType === v ? S.active : S.inactive),
                borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: "'Inter', sans-serif",
              }}>{lbl}</button>
            ))}
          </div>

          {/* Table selector (dine-in only) */}
          {orderType === 'dine_in' && (
            <select value={tableId} onChange={e => handleTableSelect(e.target.value)} style={{ background: T.card, border: `1px solid ${T.border}`, color: tableId ? T.text : T.textDim, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontFamily: "'Inter', sans-serif", outline: 'none' }}>
              <option value="">Select Table</option>
              {tables.filter(t => t.status !== 'cleaning').map(t => (
                <option key={t.id} value={t.id}>{t.label} - {t.section} ({t.status})</option>
              ))}
            </select>
          )}
          {loadingTableOrder && <Badge color={T.accent} small>Loading table order</Badge>}
          {replaceTarget && <Badge color={T.red} small>Replacing: {replaceTarget.name}</Badge>}

          {/* Search */}
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search menu..."
            style={{ marginLeft: 'auto', background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 12px', color: T.text, fontSize: 12, fontFamily: "'Inter', sans-serif", outline: 'none', width: 160 }} />
          <Badge color={smartMenuSortEnabled ? T.accent : T.textDim} small>
            {smartMenuSortEnabled ? 'Smart order' : 'Manual order'}
          </Badge>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '128px minmax(0,1fr)', gap: 6, overflow: 'hidden' }}>
          <aside style={{ borderRadius: 12, padding: 8, ...S.panel, minHeight: 0, overflowY: 'auto' }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: T.text, marginBottom: 8 }}>Categories</div>
            <div style={{ display: 'grid', gap: 5 }}>
              {cats.map(c => {
                const active = cat === c.id;
                const count = c.id === 'all' ? menu.items.filter(i => i.is_available !== false).length : (categoryCounts[c.id] || 0);
                return (
                  <button key={c.id} onClick={() => setCat(c.id)} style={{
                    borderRadius: 9,
                    ...(active ? S.active : S.inactive),
                    padding: '7px 9px',
                    fontWeight: active ? 800 : 600,
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                    width: '100%',
                    textAlign: 'left',
                  }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                    <span style={{ opacity: 0.7, fontSize: 11 }}>{count}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Menu grid */}
          <div style={{ minHeight: 0, width: '100%', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(3, 168px)', gridAutoRows: 'max-content', alignItems: 'start', justifyContent: 'start', justifyItems: 'stretch', gap: 4, alignContent: 'start', paddingBottom: 10 }}>
            {filtered.map(item => {
              const variants = getItemVariants(item);
              const itemCartQty = cart.filter(c => c.id === item.id).reduce((sum, c) => sum + c.qty, 0);
              const inCart = itemCartQty ? { qty: itemCartQty } : null;
              return (
                <div key={item.id} style={{
                  ...(itemCartQty ? S.cardSelected : S.card),
                  borderRadius: 12, overflow: 'hidden', transition: 'all 0.15s', display: 'flex', flexDirection: 'column', minHeight: 194, width: 168, justifySelf: 'stretch',
                }}>
                  {/* Image */}
                  <div onClick={() => handleMenuItemClick(item, variants[0])} style={{ height: 92, minHeight: 92, ...S.image, overflow: 'hidden', position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
                    {item.image_url ? (
                      <img src={item.image_url.startsWith('http') ? item.image_url : `${IMG_BASE}${item.image_url}`}
                        alt={item.name} onError={e => e.target.style.display='none'}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, opacity: 0.45, fontWeight: 800 }}>IMG</div>
                    )}
                    {item.is_popular && <div style={{ position: 'absolute', top: 4, right: 4 }}><Badge color={T.accent} small>Popular</Badge></div>}
                    {inCart && <div style={{ position: 'absolute', top: 4, left: 4, background: T.accent, color: '#fff', borderRadius: 20, padding: '1px 6px', fontSize: 9, fontWeight: 800 }}>x{inCart.qty}</div>}
                  </div>
                  <div style={{ padding: '9px 9px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, background: itemCartQty ? (light ? '#f8fafc' : 'rgba(251,191,36,0.05)') : (light ? '#fff' : 'rgba(15,23,42,0.92)') }}>
                    <div>
                      <div title={item.name} style={{ fontSize: 14, fontWeight: 900, color: light ? '#0f172a' : T.text, lineHeight: 1.28, marginBottom: 6, minHeight: 36, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.name}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 800, color: light ? '#0f172a' : T.accent, fontFamily: 'monospace', fontSize: 13 }}>From PKR {Number(item.price).toLocaleString()}</span>
                        <span style={{ fontSize: 10, color: T.textDim }}>{item.prep_time_min ? `~${item.prep_time_min}m` : ''}</span>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gap: 5, marginTop: 8 }}>
                      {variants.map(variant => {
                        const cartKey = `${item.id}:${variant.id || variant.name}`;
                        const selected = cart.find(c => c.cart_key === cartKey);
                        return (
                          <button key={cartKey} onClick={() => handleMenuItemClick(item, variant)} style={{
                            borderRadius: 8,
                            ...(selected ? S.active : S.inactive),
                            padding: '5px 7px',
                            minHeight: 26,
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 10,
                            fontWeight: 800,
                            width: '100%',
                            fontSize: 11.5,
                          }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{variant.name}</span>
                            <span>PKR {Number(variant.price).toLocaleString()}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 60, color: T.textDim }}>
                <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>No matches</div>
                <div>No items found</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* POS section */}
      <div style={{ width: 592, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden', paddingTop: 40 }}>
        <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text, marginBottom: 2 }}>
            Order - {orderType === 'dine_in' ? (tables.find(t => t.id === tableId)?.label || 'No table') : orderType.replace('_',' ')}
          </div>
          <div style={{ fontSize: 11, color: T.textMid, marginBottom: 12 }}>
            {cart.length} item{cart.length !== 1 ? 's' : ''} - tap to add
          </div>
          {activeTableOrder && (
            <div style={{ marginBottom: 10, background: light ? '#fee2e2' : 'rgba(239,68,68,0.14)', border: `1px solid ${T.red}55`, borderRadius: 10, padding: '9px 10px' }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: light ? '#991b1b' : T.red }}>{activeTableOrder.order_number} loaded</div>
              <div style={{ fontSize: 11, color: light ? '#7f1d1d' : T.textMid, marginTop: 3 }}>
                Select Replace on an item, then choose the new menu item.
              </div>
            </div>
          )}

          {/* Customer info for takeaway/delivery */}
          {needCustomer && (
            <div style={{ marginBottom: 10, background: T.surface, borderRadius: 10, padding: '10px 12px' }}>
              {/* POS section */}
              <input value={custName} onChange={e => setCustName(e.target.value)}
                placeholder="Customer name *" style={{ width: '100%', background: 'none', border: 'none', borderBottom: `1px solid ${T.border}`, color: T.text, fontSize: 12, fontFamily: "'Inter', sans-serif", outline: 'none', paddingBottom: 6, marginBottom: 6 }} />
              <input value={custPhone} onChange={e => setCustPhone(e.target.value)}
                placeholder="Phone number" style={{ width: '100%', background: 'none', border: 'none', color: T.text, fontSize: 12, fontFamily: "'Inter', sans-serif", outline: 'none' }} />

              {/* POS section */}
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
                        style={{ fontSize: 10, color: T.accent, display: 'inline-block', marginTop: 4 }}>View on Map</a>
                    )}
                  </div>
                  <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 8, paddingTop: 8 }}>
                    <select value={delivRiderId} onChange={e => setDelivRiderId(e.target.value)}
                      style={{ width: '100%', background: 'none', border: 'none', color: delivRiderId ? T.text : T.textDim, fontSize: 12, fontFamily: "'Inter', sans-serif", outline: 'none' }}>
                      <option value="">Assign rider (optional)</option>
                      {riders.map(r => (
                        <option key={r.id} value={r.id}>{r.full_name} ({r.active_orders} active)</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Guest count + Waiter (dine-in) */}
          {orderType === 'dine_in' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: T.textMid, flex: 1 }}>Guests</span>
                <button onClick={() => setGuestCount(g => Math.max(1, g-1))} style={{ width: 24, height: 24, borderRadius: '50%', background: T.border, border: 'none', color: T.text, cursor: 'pointer', fontWeight: 800, fontSize: 14 }}>-</button>
                <span style={{ fontWeight: 800, fontFamily: 'monospace', minWidth: 20, textAlign: 'center', color: T.text }}>{guestCount}</span>
                <button onClick={() => setGuestCount(g => g+1)} style={{ width: 24, height: 24, borderRadius: '50%', background: T.accent, border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 800, fontSize: 14 }}>+</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: T.textMid, flex: 1 }}>Waiter</span>
                <select value={waiterId} onChange={e => setWaiterId(e.target.value)}
                  style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, color: waiterId ? T.text : T.textDim, borderRadius: 6, padding: '4px 8px', fontSize: 11, fontFamily: "'Inter', sans-serif", outline: 'none', minWidth: 0 }}>
                  <option value="">Assign waiter</option>
                  {employees.filter(e => ['server','waiter'].includes((e.role_name||'').toLowerCase())).map(e => (
                    <option key={e.id} value={e.id}>{e.full_name}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Cart items */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {cart.length === 0 && (
              <div style={{ textAlign: 'center', padding: '30px 0', color: T.textDim }}>
                <div style={{ fontSize: 12, fontWeight: 800 }}>Empty</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>Cart is empty</div>
              </div>
            )}
            {cart.map(item => (
              <div key={item.cart_key} style={{ marginBottom: 6, background: 'rgba(255,255,255,0.06)', border: `1px solid ${T.border}`, borderRadius: 14, padding: '8px 10px' }}>
                {/* Main row: name + price + qty controls + remove */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                    <div style={{ fontSize: 10, color: T.textMid }}>
                      {item.open_price_allowed ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          PKR
                          <input
                            type="number"
                            min="0"
                            value={item.price}
                            onChange={e => setCartItemPrice(item.cart_key, e.target.value)}
                            style={{ width: 72, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, color: T.accent, fontSize: 10, fontFamily: 'monospace', padding: '2px 5px', outline: 'none' }}
                          />
                        </span>
                      ) : (
                        <>PKR {Number(item.price).toLocaleString()}</>
                      )}
                      {item.weekend_applied && <span style={{ color: T.accent }}> - weekend</span>}
                      {item.open_price_allowed && <span style={{ color: T.accent }}> - open</span>}
                      {item.notes && <span style={{ color: T.accent }}> - note</span>}
                    </div>
                  </div>
                  {!item.existing_order_item && (
                    <button onClick={() => changeQty(item.cart_key,-1)} style={{ width: 20, height: 20, borderRadius: '50%', background: T.border, border: 'none', color: T.text, cursor: 'pointer', fontSize: 13, lineHeight: 1, flexShrink: 0 }}>-</button>
                  )}
                  <div style={{ textAlign: 'center', fontSize: 13, color: T.textMid, fontFamily: 'monospace' }}>x{item.qty}</div>
                  {!item.existing_order_item && (
                    <button onClick={() => addToCart(item, { id: item.variant_id, name: item.variant_name, price: item.price })} style={{ width: 20, height: 20, borderRadius: '50%', background: T.accent, border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13, lineHeight: 1, flexShrink: 0 }}>+</button>
                  )}
                  <button onClick={() => setNotesItem(item)} title="Add notes" style={{ width: 28, height: 20, borderRadius: 10, background: 'none', border: `1px solid ${T.border}`, color: T.textMid, cursor: 'pointer', fontSize: 9, lineHeight: 1, flexShrink: 0 }}>Note</button>
                  {item.existing_order_item ? (
                    <>
                      <button onClick={() => setReplaceTarget(item)} title="Replace item" style={{ height: 22, borderRadius: 10, background: replaceTarget?.cart_key === item.cart_key ? T.red : T.redDim, border: `1px solid ${T.red}44`, color: replaceTarget?.cart_key === item.cart_key ? '#fff' : T.red, cursor: 'pointer', fontSize: 9, lineHeight: 1, flexShrink: 0, padding: '0 8px', fontWeight: 800 }}>Replace</button>
                      <button onClick={() => returnSingleItem(item)} title="Cancel/return this item" style={{ height: 22, borderRadius: 10, background: T.surface, border: `1px solid ${T.red}44`, color: T.red, cursor: 'pointer', fontSize: 9, lineHeight: 1, flexShrink: 0, padding: '0 8px', fontWeight: 800 }}>Return</button>
                    </>
                  ) : (
                    <button onClick={() => removeItem(item.cart_key)} title="Remove" style={{ width: 20, height: 20, borderRadius: '50%', background: T.redDim, border: `1px solid ${T.red}44`, color: T.red, cursor: 'pointer', fontSize: 11, lineHeight: 1, flexShrink: 0 }}>x</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Order notes */}
          {cart.length > 0 && (
            <input value={orderNotes} onChange={e => setOrderNotes(e.target.value)}
              placeholder="Order notes (optional)..."
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
                    <button onClick={() => setDiscount('')} style={{ background: T.redDim, color: T.red, border: `1px solid ${T.red}44`, borderRadius: 6, padding: '2px 6px', fontSize: 10, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>x</button>
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
                  <span style={{ fontSize: 12, color: T.green, fontFamily: 'monospace' }}>- PKR {discountAmt.toLocaleString()}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: T.textMid }}>{taxLabel}</span>
                <span style={{ fontSize: 12, fontFamily: 'monospace', color: T.text }}>PKR {tax.toLocaleString(undefined, {minimumFractionDigits:0})}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: T.text }}>Total</span>
                <span style={{ fontSize: 14, fontWeight: 800, fontFamily: 'monospace', color: T.accent }}>PKR {total.toLocaleString(undefined, {minimumFractionDigits:0})}</span>
              </div>
              {activeTableOrder ? (
                <>
                  <Btn onClick={sendToKitchen} disabled={sending || !newCartItems.length} style={{ width: '100%', padding: '13px' }}>
                    {sending ? 'Sending...' : newCartItems.length ? `Send Added Items (${newCartItems.length})` : 'Add Items to Send'}
                  </Btn>
                  <Btn variant="ghost" onClick={() => setReplaceTarget(null)} disabled={!replaceTarget || sending} style={{ width: '100%', marginTop: 6 }}>
                    {replaceTarget ? 'Cancel Replacement Selection' : 'Select an Item to Replace'}
                  </Btn>
                  <Btn variant="danger" onClick={cancelLoadedOrder} disabled={sending} style={{ width: '100%', marginTop: 6 }}>Cancel / Return Order</Btn>
                  <Btn variant="ghost" onClick={() => { setCart([]); setDiscount(''); clearLoadedOrder(); }} style={{ width: '100%', marginTop: 6 }}>Close Loaded Order</Btn>
                </>
              ) : (
                <>
                  <Btn onClick={sendToKitchen} disabled={sending} style={{ width: '100%', padding: '13px' }}>
                    {sending ? 'Sending...' : orderType === 'delivery' ? 'Place Delivery Order' : 'Send to Kitchen'}
                  </Btn>
                  <Btn variant="ghost" onClick={() => { setCart([]); setDiscount(''); setCustName(''); setCustPhone(''); setCustAddr(''); setCustLat(''); setCustLng(''); setDelivRiderId(''); setWaiterId(''); setOrderNotes(''); }} style={{ width: '100%', marginTop: 6 }}>Clear Cart</Btn>
                </>
              )}
            </div>
          )}
        </Card>

        {/* Online Orders Queue */}
        <Card>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 10 }}>
            Online Queue ({onlineOrders.length})
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
        onSave={(notes) => notesItem && setItemNotes(notesItem.cart_key, notes)}
      />

      {/* POS section */}
      {showPayModal && createdOrder && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', sans-serif" }}>
          <div onClick={!takePrintRdy ? undefined : closeTakeawayModal} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)' }} />
          <div style={{ position: 'relative', zIndex: 1, background: T.card, border: `1px solid ${T.borderLight}`, borderRadius: 20, width: '100%', maxWidth: 480, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}>

            {/* Header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>
                  {(createdOrder.order_type || orderType).replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())} - {createdOrder.order_number}
                </div>
                <div style={{ fontSize: 12, color: T.textMid, marginTop: 3 }}>
                  {createdOrder.customer_name || createdOrder._custName}
                  {(createdOrder.customer_phone || createdOrder._custPhone) && ` - ${createdOrder.customer_phone || createdOrder._custPhone}`}
                </div>
              </div>
              {!takePaying && <button onClick={closeTakeawayModal} style={{ background: 'none', border: 'none', color: T.textMid, fontSize: 24, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>x</button>}
            </div>

            {/* POS section */}
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
                    <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: T.text, fontFamily: 'monospace' }}>{Number(item.price * item.qty).toLocaleString()}</div>
                    <div style={{ textAlign: 'right', fontSize: 12, color: T.textMid, fontFamily: 'monospace' }}>{Number(item.price).toLocaleString()}</div>
                    <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: T.text, fontFamily: 'monospace' }}>{Number(item.price * item.qty).toLocaleString()}</div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div style={{ background: T.surface, borderRadius: 12, padding: '14px 16px', marginTop: 16 }}>
                {[
                  ['Subtotal', `PKR ${Number(createdOrder._subtotal).toLocaleString()}`],
                  [createdOrder._taxLabel || 'Tax', `PKR ${Number(createdOrder._tax).toLocaleString()}`],
                  ...(createdOrder._discountAmt > 0 ? [['Discount', `- PKR ${Number(createdOrder._discountAmt).toLocaleString()}`, true]] : []),
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

                {/* POS section */}
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
                  {/* POS section */}
                  {(createdOrder.order_type || orderType) === 'delivery' && (
                    <div onClick={() => setTakePayMethod('cod')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10, cursor: 'pointer', marginBottom: 8, background: takePayMethod === 'cod' ? '#E67E2222' : T.card, border: `2px solid ${takePayMethod === 'cod' ? '#E67E22' : T.border}`, transition: 'all 0.15s' }}>
                      <span style={{ fontSize: 12, fontWeight: 800 }}>COD</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: takePayMethod === 'cod' ? 700 : 500, color: takePayMethod === 'cod' ? '#E67E22' : T.text }}>Cash on Delivery</div>
                        <div style={{ fontSize: 11, color: T.textDim }}>Rider collects payment at door</div>
                      </div>
                      {takePayMethod === 'cod' && <span style={{ color: '#E67E22', fontWeight: 800 }}>Selected</span>}
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[['cash','Cash'],['card','Card'],['jazzcash','JazzCash'],['easypaisa','Easypaisa']].map(([id, label]) => (
                      <div key={id} onClick={() => setTakePayMethod(id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, cursor: 'pointer', background: takePayMethod === id ? T.accentGlow : T.card, border: `1px solid ${takePayMethod === id ? T.accent + '88' : T.border}`, transition: 'all 0.15s' }}>

                        <span style={{ fontSize: 13, fontWeight: takePayMethod === id ? 700 : 500, color: takePayMethod === id ? T.accent : T.text }}>{label}</span>
                        {takePayMethod === id && <span style={{ marginLeft: 'auto', color: T.accent, fontWeight: 800 }}>Selected</span>}
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
                  <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>{takePayMethod === 'cod' ? 'COD' : 'Paid'}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: T.text, marginBottom: 4 }}>
                    {takePayMethod === 'cod' ? 'Order Sent to Kitchen!' : 'Payment Confirmed!'}
                  </div>
                  <div style={{ fontSize: 13, color: T.textMid }}>
                    {takePayMethod === 'cod' ? 'Rider will collect payment on delivery.' : 'Would you like to print the receipt?'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { printTakeawayReceipt(); closeTakeawayModal(); }} style={{ flex: 1, background: T.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
                    Yes, Print Receipt
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
                  {takePaying ? 'Processing...' : takePayMethod === 'cod' ? 'Confirm Cash on Delivery' : `Confirm ${takePayMethod.charAt(0).toUpperCase() + takePayMethod.slice(1)} Payment`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// POS section
function CleanPOSGateModal({ currentShift, onUnlocked }) {
  const [acting, setActing] = useState(null);
  const [showBalanceInput, setShowBalanceInput] = useState(false);
  const [openingBalance, setOpeningBalance] = useState('');

  const hasShift = !!currentShift?.shift && ['active', 'in_process'].includes(currentShift.shift.status);
  const isClockedIn = currentShift?.attendance?.is_clocked_in;
  const scheduledShift = selectOpenableScheduledShift(currentShift);
  const displayScheduledShift = scheduledShift || selectDisplayScheduledShift(currentShift);
  const shiftDetail = hasShift
    ? `${currentShift.shift.start_time?.slice(0, 5)} - ${currentShift.shift.end_time?.slice(0, 5)}`
    : displayScheduledShift
      ? `Scheduled now: ${displayScheduledShift.shift_name} - ${displayScheduledShift.start_time?.slice(0, 5)}-${displayScheduledShift.end_time?.slice(0, 5)}`
      : (currentShift?.reason || 'No shift schedule is defined for the current date/time');

  const btnStyle = (bg, col = '#000') => ({
    background: bg, color: col, border: 'none', borderRadius: 8,
    padding: '8px 16px', fontSize: 12, fontWeight: 700,
    cursor: acting ? 'not-allowed' : 'pointer', fontFamily: "'Inter', sans-serif",
    whiteSpace: 'nowrap', opacity: acting ? 0.65 : 1,
  });

  const row = (ok, label, detail, action) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0, background: ok ? '#27AE6033' : '#E74C3C33', color: ok ? '#27AE60' : '#f87171', fontWeight: 900 }}>
        {ok ? 'OK' : 'X'}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: ok ? '#27AE60' : '#f87171' }}>{label}</div>
        {detail && <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>{detail}</div>}
      </div>
      {!ok && action}
    </div>
  );

  const handleStartShift = async () => {
    if (!scheduledShift) return;
    if (!showBalanceInput) { setShowBalanceInput(true); return; }
    setActing('shift');
    try {
      await startMyShift(scheduledShift.id, { shift_date: apiDate(scheduledShift.date), opening_balance: parseFloat(openingBalance) || 0 });
      onUnlocked();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to start shift');
    } finally { setActing(null); }
  };

  const handleClockIn = async () => {
    setActing('clock');
    try {
      await attClockIn({ source: 'web' });
      onUnlocked();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to clock in');
    } finally { setActing(null); }
  };

  const handleCloseShift = async () => {
    if (!currentShift?.shift) return;
    const collected = window.prompt('Enter cashier collection amount (PKR)');
    if (collected === null) return;
    const cashierCollectionAmount = Number(collected);
    if (!Number.isFinite(cashierCollectionAmount) || cashierCollectionAmount < 0) {
      alert('Enter a valid cashier collection amount');
      return;
    }
    setActing('close');
    try {
      await closeMyShift(currentShift.shift.id, {
        shift_date: apiDate(currentShift.shift.date),
        cashier_collection: cashierCollectionAmount,
      });
      toast.success('Shift closed');
      onUnlocked();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to close shift');
    } finally { setActing(null); }
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, backdropFilter: 'blur(4px)' }}>
      <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 20, padding: '32px 36px', maxWidth: 440, width: '90%', boxShadow: '0 24px 64px rgba(0,0,0,0.8)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 34, fontWeight: 900, color: '#f59e0b', marginBottom: 10 }}>LOCK</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 6 }}>POS Access Required</div>
          <div style={{ fontSize: 13, color: '#888' }}>Complete the steps below to unlock the POS</div>
        </div>
        {row(
          hasShift,
          hasShift ? `Shift Active - ${currentShift.shift.shift_name}` : 'Shift Not Started',
          shiftDetail,
          scheduledShift ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              {showBalanceInput && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: '#aaa', whiteSpace: 'nowrap' }}>Opening cash (PKR)</span>
                  <input type="number" min="0" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} placeholder="0" autoFocus style={{ width: 90, background: '#2a2a2a', border: '1px solid #f59e0b88', borderRadius: 6, padding: '4px 8px', color: '#fff', fontSize: 13, fontFamily: 'monospace', outline: 'none', textAlign: 'right' }} />
                </div>
              )}
              <button style={btnStyle('#f59e0b')} onClick={handleStartShift} disabled={!!acting}>{acting === 'shift' ? 'Starting...' : showBalanceInput ? 'Confirm & Start' : 'Start Shift'}</button>
            </div>
          ) : <a href="/my-shift" style={{ ...btnStyle('#444', '#fff'), textDecoration: 'none', display: 'inline-block' }}>My Shift</a>
        )}
        {row(
          isClockedIn,
          isClockedIn ? 'Clocked In' : 'Not Clocked In',
          isClockedIn ? `Since ${currentShift?.attendance?.clocked_in_at ? new Date(currentShift.attendance.clocked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}` : 'You must clock in before placing orders',
          <button style={btnStyle('#27AE60', '#fff')} onClick={handleClockIn} disabled={!!acting}>{acting === 'clock' ? 'Clocking in...' : 'Clock In'}</button>
        )}
        {hasShift && (
          <button
            onClick={handleCloseShift}
            disabled={!!acting}
            style={{ ...btnStyle('#E74C3C', '#fff'), width: '100%', marginTop: 18 }}
          >
            {acting === 'close' ? 'Closing...' : 'Close Shift'}
          </button>
        )}
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <a href="/attendance" style={{ fontSize: 12, color: '#aaa', textDecoration: 'none' }}>Go to Attendance</a>
        </div>
      </div>
    </div>
  );
}
