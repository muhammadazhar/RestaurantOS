const IMG_BASE = process.env.REACT_APP_SOCKET_URL
  || (window.location.protocol + '//' + window.location.hostname + ':5000');

export const RECEIPT_FIELDS = [
  ['order_number', 'Order #'],
  ['order_type', 'Order Type'],
  ['table', 'Table'],
  ['customer', 'Customer'],
  ['phone', 'Phone'],
  ['address', 'Address'],
  ['date', 'Date / Time'],
  ['cashier', 'Cashier'],
  ['waiter', 'Waiter'],
  ['shift', 'Shift'],
  ['guests', 'Guests'],
  ['payment', 'Payment'],
];

export const KOT_FIELDS = [
  ['order_number', 'Order #'],
  ['order_type', 'Order Type'],
  ['table', 'Table'],
  ['customer', 'Customer'],
  ['time', 'Time'],
  ['waiter', 'Waiter'],
  ['guests', 'Guests'],
  ['cashier', 'Cashier'],
];

export const DEFAULT_PRINT_TEMPLATES = {
  receipt: {
    showLogo: false,
    logoUrl: '',
    logoWidth: 48,
    headerLines: ['The Golden Fork', 'Fine dining at its best - Karachi'],
    footerLines: ['Thank you for your order!', 'Please come again soon.'],
    fields: ['order_number', 'order_type', 'table', 'customer', 'phone', 'address', 'date', 'cashier', 'waiter', 'shift', 'guests', 'payment'],
  },
  kot: {
    showLogo: false,
    logoUrl: '',
    logoWidth: 44,
    headerLines: ['KITCHEN ORDER'],
    footerLines: [],
    fields: ['order_number', 'order_type', 'table', 'customer', 'time', 'waiter'],
  },
};

export function mergePrintTemplates(settings = {}) {
  const saved = settings.print_templates || settings;
  return {
    receipt: { ...DEFAULT_PRINT_TEMPLATES.receipt, ...(saved.receipt || {}) },
    kot: { ...DEFAULT_PRINT_TEMPLATES.kot, ...(saved.kot || {}) },
  };
}

const esc = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const isReturnedItem = item => item?.status === 'cancelled' || item?.returned === true;
const receiptLineTotal = item => {
  const unit = Number(item.unit_price ?? item.price ?? 0);
  const qty = Number(item.quantity ?? item.qty ?? 1);
  const amount = Number(item.total_price ?? (unit * qty));
  return isReturnedItem(item) ? -Math.abs(amount) : amount;
};
const fmtReceiptAmount = value => {
  const amount = Number(value || 0);
  return `${amount < 0 ? '-PKR ' : 'PKR '}${Math.abs(amount).toLocaleString()}`;
};

const logoSrc = (template, restaurant = {}) => {
  const raw = template.logoUrl || restaurant.logo_url || '';
  if (!template.showLogo || !raw) return '';
  return raw.startsWith('http') ? raw : `${IMG_BASE}${raw}`;
};

const linesHtml = (lines = [], className = '') => lines
  .filter(line => String(line || '').trim())
  .map((line, index) => `<div class="${className || (index === 0 ? 'brand' : 'small')}">${esc(line)}</div>`)
  .join('');

const receiptFieldValue = (key, data) => {
  const { order, table, methodLabel, isPaid, cashierName, waiterName, address, fmtD } = data;
  switch (key) {
    case 'order_number': return ['Order:', order.order_number];
    case 'order_type': return ['Type:', String(order.order_type || '').replace(/_/g, ' ').toUpperCase()];
    case 'table': return table || order.table_label ? ['Table:', [table?.section, table?.label || order.table_label].filter(Boolean).join(' - ')] : null;
    case 'customer': return order.customer_name || order._custName ? ['Customer:', order.customer_name || order._custName] : null;
    case 'phone': return order.customer_phone || order._custPhone ? ['Phone:', order.customer_phone || order._custPhone] : null;
    case 'address': return address ? ['Address:', address] : null;
    case 'date': return ['Date:', fmtD(order.created_at || new Date())];
    case 'cashier': return ['Cashier:', cashierName || order.server_name || '-'];
    case 'waiter': return waiterName || order.waiter_name ? ['Waiter:', waiterName || order.waiter_name] : null;
    case 'shift': return order.shift_number || data.shiftLabel ? ['Shift:', data.shiftLabel || `#${order.shift_number} ${order.shift_name || ''}`] : null;
    case 'guests': return order.guest_count ? ['Guests:', order.guest_count] : null;
    case 'payment': return isPaid ? ['Payment:', methodLabel] : null;
    default: return null;
  }
};

const kotFieldValue = (key, data) => {
  const { order, table, timeStr, cashierName, waiterName } = data;
  switch (key) {
    case 'order_number': return ['Order:', order.order_number];
    case 'order_type': return ['Type:', String(order.order_type || '').replace(/_/g, ' ').toUpperCase()];
    case 'table': return table || order.table_label ? ['Table:', [table?.section, table?.label || order.table_label].filter(Boolean).join(' - ')] : null;
    case 'customer': return order.customer_name || order._custName ? ['Customer:', order.customer_name || order._custName] : null;
    case 'time': return ['Time:', timeStr];
    case 'waiter': return waiterName || order.waiter_name ? ['Waiter:', waiterName || order.waiter_name] : null;
    case 'guests': return order.guest_count ? ['Guests:', order.guest_count] : null;
    case 'cashier': return cashierName || order.server_name ? ['Cashier:', cashierName || order.server_name] : null;
    default: return null;
  }
};

const fieldsHtml = (fields, data, resolver) => fields
  .map(key => resolver(key, data))
  .filter(Boolean)
  .map(([label, value]) => `<div class="row"><span>${esc(label)}</span><span class="bold">${esc(value)}</span></div>`)
  .join('');

const baseCss = `
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; color: #000 !important; }
  html, body { background: #fff; width: 80mm; }
  body { font-family: Consolas, 'Courier New', monospace; font-size: 12px; font-weight: 700; line-height: 1.25; padding: 2mm 3mm; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .center { text-align: center; }
  .brand { font-size: 20px; font-weight: 900; margin-bottom: 4px; }
  .bold { font-weight: 900; }
  .small { font-size: 10px; font-weight: 700; }
  .row { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; }
  .row span:last-child { text-align: right; max-width: 62%; overflow-wrap: anywhere; }
  .grid4 { display: grid; grid-template-columns: minmax(0,1fr) 24px 52px 58px; gap: 3px; padding: 4px 0; border-bottom: 1px dashed #000; align-items: start; }
  .grid4 span:first-child { overflow-wrap: anywhere; }
  .line { border-top: 1px dashed #000; margin: 8px 0; }
  .strong-line { border-top: 2px solid #000; margin: 8px 0; }
  .big { font-size: 15px; font-weight: 900; }
  .paid-stamp { border: 2px solid #000; border-radius: 4px; padding: 5px 14px; display: inline-block; font-size: 16px; font-weight: 900; letter-spacing: 2px; margin-top: 12px; }
  .cod-stamp { border: 2px solid #000; border-radius: 4px; padding: 5px 12px; display: inline-block; font-size: 13px; font-weight: 900; letter-spacing: 1px; margin-top: 12px; }
  @media print { html, body { width: 80mm; } body { padding: 2mm 3mm; } }
`;

export function renderReceiptHtml({ template, restaurant, order, items, table, taxBreakdown = [], taxLabel = 'Tax', methodLabel = '', isPaid = false, isCOD = false, tenderedAmount = '', cashierName = '', waiterName = '', address = '', shiftLabel = '' }) {
  const t = { ...DEFAULT_PRINT_TEMPLATES.receipt, ...(template || {}) };
  const fmtD = (d) => new Date(d).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' });
  const sub = Number(order.subtotal || order._subtotal || 0);
  const tax = Number(order.tax_amount || order._tax || 0);
  const disc = Number(order.discount_amount || order._discountAmt || 0);
  const ttl = Number(order.total_amount || order._total || 0);
  const logo = logoSrc(t, restaurant);
  const printItems = (items || []).filter(i => i?.name);
  const fields = fieldsHtml(t.fields || [], { order, table, methodLabel, isPaid, tenderedAmount, cashierName, waiterName, address, fmtD, shiftLabel }, receiptFieldValue);
  const taxRows = taxBreakdown.length
    ? taxBreakdown.map(tx => `<div class="row"><span>${esc(tx.name || 'Tax')} (${Number(tx.rate || 0).toLocaleString()}%)</span><span>PKR ${Number(tx.amount || 0).toLocaleString()}</span></div>`).join('')
    : `<div class="row"><span>${esc(taxLabel)}</span><span>PKR ${tax.toLocaleString()}</span></div>`;

  return `<!DOCTYPE html><html><head><title>Receipt - ${esc(order.order_number)}</title><style>${baseCss}</style></head><body>
    <div class="center">
      ${logo ? `<img src="${esc(logo)}" alt="Logo" style="max-width:${Number(t.logoWidth || 48)}px;max-height:60px;margin-bottom:5px;object-fit:contain" />` : ''}
      ${linesHtml(t.headerLines)}
    </div>
    <div class="line"></div>
    ${fields}
    <div class="line"></div>
    <div class="grid4"><span class="small">ITEM</span><span class="small" style="text-align:center">QTY</span><span class="small" style="text-align:right">UNIT</span><span class="small" style="text-align:right">TOTAL</span></div>
    ${printItems.map(i => {
      const returned = isReturnedItem(i);
      const unit = Number(i.unit_price ?? i.price ?? 0);
      const qty = Number(i.quantity ?? i.qty ?? 1);
      const lineTotal = receiptLineTotal(i);
      const returnedNote = returned ? '<br><span style="font-size:10px;font-weight:900">RETURNED - NOT CHARGED</span>' : '';
      return `<div class="grid4"><span>${returned ? '<s>' : ''}${esc(i.name)}${returned ? '</s>' : ''}${returnedNote}${i.notes ? `<br><span style="font-size:10px;color:#888">${esc(i.notes)}</span>` : ''}</span><span style="text-align:center">x${esc(qty)}</span><span style="text-align:right">PKR ${unit.toLocaleString()}</span><span style="text-align:right" class="bold">${fmtReceiptAmount(lineTotal)}</span></div>`;
    }).join('')}
    <div class="line"></div>
    <div class="row"><span>Subtotal</span><span>PKR ${sub.toLocaleString()}</span></div>
    ${taxRows}
    ${disc > 0 ? `<div class="row"><span>Discount</span><span>- PKR ${disc.toLocaleString()}</span></div>` : ''}
    <div class="line"></div>
    <div class="row big"><span>TOTAL</span><span>PKR ${ttl.toLocaleString()}</span></div>
    <div class="line"></div>
    ${isPaid ? `${tenderedAmount ? `<div class="row"><span>Tendered</span><span>PKR ${parseFloat(tenderedAmount).toLocaleString()}</span></div><div class="row bold"><span>Change</span><span>PKR ${Math.max(0, parseFloat(tenderedAmount) - ttl).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span></div>` : ''}<div class="center">${isCOD ? '<span class="cod-stamp">CASH ON DELIVERY</span>' : '<span class="paid-stamp">PAID</span>'}</div>` : ''}
    <div class="center small" style="margin-top:20px;line-height:1.8">${linesHtml(t.footerLines, 'small')}</div>
  </body></html>`;
}

export function renderKotHtml({ template, restaurant, order, items, table, orderNotes = '', cashierName = '', waiterName = '' }) {
  const t = { ...DEFAULT_PRINT_TEMPLATES.kot, ...(template || {}) };
  const logo = logoSrc(t, restaurant);
  const timeStr = new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });
  const printItems = (items || []).filter(i => i?.name);
  const fields = fieldsHtml(t.fields || [], { order, table, timeStr, cashierName, waiterName }, kotFieldValue);
  return `<!DOCTYPE html><html><head><title>KOT - ${esc(order.order_number)}</title><style>${baseCss}.kot-title{font-size:15px;font-weight:900;text-align:center}.order-num{font-size:28px;font-weight:900;text-align:center;letter-spacing:1px;margin:5px 0}.item-row{display:flex;justify-content:space-between;align-items:baseline;padding:6px 0}.item-name{font-size:15px;font-weight:900;flex:1;padding-right:8px;overflow-wrap:anywhere}.item-qty{font-size:22px;font-weight:900;min-width:40px;text-align:right}.notes{font-size:12px;padding:2px 0 4px 8px;font-style:italic;overflow-wrap:anywhere}</style></head><body>
    <div class="center">
      ${logo ? `<img src="${esc(logo)}" alt="Logo" style="max-width:${Number(t.logoWidth || 44)}px;max-height:56px;margin-bottom:5px;object-fit:contain" />` : ''}
      ${linesHtml(t.headerLines, 'kot-title')}
    </div>
    <div class="order-num">#${esc(order.order_number)}</div>
    <div class="strong-line"></div>
    ${fields}
    <div class="strong-line"></div>
    ${printItems.map(i => `<div class="item-row"><span class="item-name">${esc(i.name)}</span><span class="item-qty">x${esc(i.quantity ?? i.qty)}</span></div>${i.notes ? `<div class="notes">Note: ${esc(i.notes)}</div>` : ''}<div class="line"></div>`).join('')}
    ${orderNotes ? `<div style="margin-top:8px;padding:6px;border:1px solid #000;border-radius:4px"><span class="bold">Order Notes:</span><br><span style="font-size:13px">${esc(orderNotes)}</span></div>` : ''}
    <div class="center small" style="margin-top:14px;line-height:1.8">${linesHtml(t.footerLines, 'small')}</div>
  </body></html>`;
}
