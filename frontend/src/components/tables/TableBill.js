import React, { useEffect, useState, useRef } from 'react';
import { getOrders, updateOrderStatus } from '../../services/api';
import { T, useT } from '../shared/UI';
import toast from 'react-hot-toast';

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmt  = (n) => `PKR ${Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 0 })}`;
const fmtD = (d) => new Date(d).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' });

const DashedLine = () => (
  <div style={{ borderTop: `1px dashed ${T.border}`, margin: '12px 0' }} />
);

const TotalRow = ({ label, value, bold, accent, large }) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0',
    fontSize: large ? 16 : 13, fontWeight: bold ? 800 : 500,
    color: accent ? T.accent : bold ? T.text : T.textMid,
  }}>
    <span>{label}</span>
    <span style={{ fontFamily: 'monospace' }}>{value}</span>
  </div>
);

const StatusPill = ({ status }) => {
  const MAP = {
    pending:   [T.blue,   '● Pending'],
    preparing: [T.accent, '● Preparing'],
    ready:     [T.green,  '● Ready'],
    served:    [T.textMid,'● Served'],
    paid:      [T.green,  '✓ Paid'],
  };
  const [color, label] = MAP[status] || [T.textDim, status];
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, color,
      background: color + '22', borderRadius: 20, padding: '3px 10px',
    }}>{label}</span>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
export default function TableBill({ table, onClose, onPaid }) {
  useT();
  const [order,           setOrder]           = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [paying,          setPaying]          = useState(false);
  const [showPayPanel,    setShowPayPanel]     = useState(false);
  const [payMethod,       setPayMethod]        = useState('cash');
  const [tenderedAmount,  setTenderedAmount]   = useState('');
  const [showPrintPrompt, setShowPrintPrompt]  = useState(false);
  const printRef = useRef();

  useEffect(() => {
    if (!table?.id) return;
    setLoading(true);
    getOrders({ status: 'pending,preparing,ready,served' })
      .then(res => {
        const found = res.data.find(
          o => o.table_id === table.id && o.payment_status !== 'paid'
        );
        setOrder(found || null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [table?.id]);

  const handlePay = async () => {
    if (!order) return;
    setPaying(true);
    try {
      await updateOrderStatus(order.id, 'paid', payMethod);
      toast.success(`✅ Payment confirmed for ${table.label}!`);
      onPaid && onPaid();
      setShowPayPanel(false);
      setShowPrintPrompt(true);  // ask to print instead of closing immediately
    } catch {
      toast.error('Payment failed — please try again');
    } finally {
      setPaying(false);
    }
  };

  const handlePrint = (paidMethod) => {
    if (!order) return;
    const method = paidMethod || payMethod;
    const methodLabel = { cash: 'Cash', card: 'Card', jazzcash: 'JazzCash', easypaisa: 'Easypaisa' }[method] || method;
    const isPaid = showPrintPrompt || order.payment_status === 'paid';
    const w = window.open('', '_blank', 'width=420,height=720');
    w.document.write(`
      <!DOCTYPE html><html><head><title>Receipt — ${table.label}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Courier New', monospace; font-size: 13px; padding: 24px 20px; color: #111; }
        .center { text-align: center; }
        .right  { text-align: right; }
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
        <div class="row"><span>Table:</span><span class="bold">${table.label} (${table.section})</span></div>
        <div class="row"><span>Order:</span><span>${order.order_number}</span></div>
        <div class="row"><span>Cashier:</span><span>${order.server_name || '—'}</span></div>
        ${order.waiter_name ? `<div class="row"><span>Waiter:</span><span class="bold">${order.waiter_name}</span></div>` : ''}
        <div class="row"><span>Guests:</span><span>${order.guest_count}</span></div>
        <div class="row"><span>Date:</span><span>${fmtD(order.created_at)}</span></div>
        <div class="line"></div>
        <div class="grid4">
          <span class="small">ITEM</span>
          <span class="small" style="text-align:center">QTY</span>
          <span class="small" style="text-align:right">UNIT</span>
          <span class="small" style="text-align:right">TOTAL</span>
        </div>
        ${(order.items || []).filter(i => i?.name).map(i => `
          <div class="grid4">
            <span>${i.name}</span>
            <span style="text-align:center">x${i.quantity}</span>
            <span style="text-align:right">PKR ${Number(i.unit_price).toLocaleString()}</span>
            <span style="text-align:right" class="bold">PKR ${Number(i.total_price).toLocaleString()}</span>
          </div>
        `).join('')}
        <div class="line"></div>
        <div class="row"><span>Subtotal</span><span>PKR ${Number(order.subtotal).toLocaleString()}</span></div>
        <div class="row"><span>Tax (8%)</span><span>PKR ${Number(order.tax_amount).toLocaleString()}</span></div>
        ${Number(order.discount_amount) > 0 ? `<div class="row"><span>Discount</span><span>- PKR ${Number(order.discount_amount).toLocaleString()}</span></div>` : ''}
        <div class="line"></div>
        <div class="row big"><span>TOTAL</span><span>PKR ${Number(order.total_amount).toLocaleString()}</span></div>
        <div class="line"></div>
        ${isPaid ? `
        <div class="row"><span>Payment</span><span class="bold">${methodLabel}</span></div>
        ${method === 'cash' && tenderedAmount ? `
          <div class="row"><span>Tendered</span><span>PKR ${parseFloat(tenderedAmount).toLocaleString()}</span></div>
          <div class="row bold"><span>Change</span><span>PKR ${Math.max(0, parseFloat(tenderedAmount) - Number(order.total_amount)).toLocaleString(undefined, {minimumFractionDigits:0,maximumFractionDigits:2})}</span></div>
        ` : ''}
        <div class="center" style="margin-top:12px"><span class="paid-stamp">★ PAID ★</span></div>
        ` : ''}
        <div class="center small" style="margin-top:20px; line-height:1.8">
          Thank you for dining with us!<br>
          Please come again soon.<br>
          ★★★★★
        </div>
      </body></html>
    `);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter', sans-serif",
    }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)',
      }} />

      {/* Bill card */}
      <div style={{
        position: 'relative', zIndex: 1,
        background: T.card, border: `1px solid ${T.borderLight}`,
        borderRadius: 20, width: '100%', maxWidth: 500,
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: '20px 24px 16px', borderBottom: `1px solid ${T.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>
              🧾 Bill — {table?.label}
            </div>
            <div style={{ fontSize: 12, color: T.textMid, marginTop: 3 }}>
              {table?.section} · Capacity {table?.capacity}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: T.textMid,
            fontSize: 24, cursor: 'pointer', lineHeight: 1, padding: '0 4px',
          }}>×</button>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }} ref={printRef}>

          {/* Loading */}
          {loading && (
            <div style={{ textAlign: 'center', padding: 56, color: T.textDim }}>
              <div style={{ fontSize: 30, marginBottom: 12 }}>⏳</div>
              <div style={{ fontSize: 14 }}>Loading bill…</div>
            </div>
          )}

          {/* No order */}
          {!loading && !order && (
            <div style={{ textAlign: 'center', padding: 56, color: T.textDim }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>🍽</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.textMid, marginBottom: 8 }}>No active order</div>
              <div style={{ fontSize: 13 }}>This table has no unpaid bill.</div>
            </div>
          )}

          {/* Bill content */}
          {!loading && order && (
            <>
              {/* Order meta grid */}
              <div style={{
                background: T.surface, borderRadius: 12, padding: '14px 16px',
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20,
              }}>
                {[
                  ['Order #',  order.order_number],
                  ['Cashier',  order.server_name || '—'],
                  ['Waiter',   order.waiter_name || '—'],
                  ['Guests',   order.guest_count],
                  ['Type',     order.order_type?.replace('_', ' ')],
                  ['Date',     new Date(order.created_at).toLocaleDateString()],
                  ['Time',     new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 3 }}>{k}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Status row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 11, color: T.textDim, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700 }}>Order Status</span>
                <StatusPill status={order.status} />
              </div>

              {/* Items table */}
              <div style={{ marginBottom: 4 }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 52px 88px 92px',
                  gap: 8, padding: '6px 0', borderBottom: `1px solid ${T.border}`,
                  fontSize: 10, color: T.textDim, letterSpacing: 0.8, textTransform: 'uppercase',
                }}>
                  <span>Item</span>
                  <span style={{ textAlign: 'center' }}>Qty</span>
                  <span style={{ textAlign: 'right' }}>Unit Price</span>
                  <span style={{ textAlign: 'right' }}>Total</span>
                </div>

                {(order.items || []).filter(i => i?.name).map((item, idx) => (
                  <div key={idx} style={{
                    display: 'grid', gridTemplateColumns: '1fr 52px 88px 92px',
                    gap: 8, padding: '11px 0', borderBottom: `1px solid ${T.border}`,
                    alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{item.name}</div>
                      {item.notes && (
                        <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>{item.notes}</div>
                      )}
                    </div>
                    <div style={{ textAlign: 'center', fontSize: 13, color: T.textMid, fontFamily: 'monospace' }}>
                      ×{item.quantity}
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 12, color: T.textMid, fontFamily: 'monospace' }}>
                      {Number(item.unit_price).toLocaleString()}
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: T.text, fontFamily: 'monospace' }}>
                      {Number(item.total_price).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div style={{ background: T.surface, borderRadius: 12, padding: '14px 16px', marginTop: 16 }}>
                <TotalRow label="Subtotal"  value={fmt(order.subtotal)} />
                <TotalRow label="Tax (8%)"  value={fmt(order.tax_amount)} />
                {Number(order.discount_amount) > 0 && (
                  <TotalRow label="Discount" value={`− ${fmt(order.discount_amount)}`} accent />
                )}
                <DashedLine />
                <TotalRow label="TOTAL DUE" value={fmt(order.total_amount)} bold large />
              </div>

              {/* Payment method selector + tendered */}
              {showPayPanel && (
                <div style={{
                  marginTop: 16, background: T.surface, borderRadius: 12,
                  padding: '14px 16px', border: `1px solid ${T.accent}44`,
                }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: T.textMid,
                    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12,
                  }}>
                    Payment Method
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                      ['cash',      '💵', 'Cash'],
                      ['card',      '💳', 'Card'],
                      ['jazzcash',  '📱', 'JazzCash'],
                      ['easypaisa', '📲', 'Easypaisa'],
                    ].map(([id, icon, label]) => (
                      <div key={id} onClick={() => setPayMethod(id)} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                        background: payMethod === id ? T.accentGlow : T.card,
                        border: `1px solid ${payMethod === id ? T.accent + '88' : T.border}`,
                        transition: 'all 0.15s',
                      }}>
                        <span style={{ fontSize: 18 }}>{icon}</span>
                        <span style={{
                          fontSize: 13, fontWeight: payMethod === id ? 700 : 500,
                          color: payMethod === id ? T.accent : T.text,
                        }}>{label}</span>
                        {payMethod === id && (
                          <span style={{ marginLeft: 'auto', color: T.accent, fontWeight: 800 }}>✓</span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Tendered amount + change — cash only */}
                  {payMethod === 'cash' && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px dashed ${T.border}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 13, color: T.textMid, flex: 1 }}>Tendered (PKR)</span>
                        <input type="number" min="0" value={tenderedAmount}
                          onChange={e => setTenderedAmount(e.target.value)}
                          placeholder={Number(order.total_amount).toFixed(0)}
                          style={{ width: 110, background: T.card, border: `1px solid ${T.accent}88`, borderRadius: 8, padding: '6px 10px', color: T.text, fontSize: 14, fontFamily: 'monospace', outline: 'none', textAlign: 'right', fontWeight: 700 }} />
                      </div>
                      {tenderedAmount !== '' && parseFloat(tenderedAmount) >= Number(order.total_amount) && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', background: T.greenDim, border: `1px solid ${T.green}44`, borderRadius: 8, padding: '6px 10px' }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: T.green }}>Change</span>
                          <span style={{ fontSize: 14, fontWeight: 800, fontFamily: 'monospace', color: T.green }}>
                            PKR {(parseFloat(tenderedAmount) - Number(order.total_amount)).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                      {tenderedAmount !== '' && parseFloat(tenderedAmount) < Number(order.total_amount) && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', background: T.redDim, border: `1px solid ${T.red}44`, borderRadius: 8, padding: '6px 10px' }}>
                          <span style={{ fontSize: 13, color: T.red }}>Shortfall</span>
                          <span style={{ fontSize: 13, fontFamily: 'monospace', color: T.red }}>
                            PKR {(Number(order.total_amount) - parseFloat(tenderedAmount)).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Print prompt (after payment) ── */}
        {showPrintPrompt && (
          <div style={{
            padding: '20px 24px', borderTop: `1px solid ${T.border}`,
            background: T.surface, flexShrink: 0,
          }}>
            <div style={{ textAlign: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 32, marginBottom: 6 }}>🖨</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: T.text, marginBottom: 4 }}>
                Payment Confirmed!
              </div>
              <div style={{ fontSize: 13, color: T.textMid }}>
                Would you like to print the receipt?
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { handlePrint(payMethod); onClose(); }}
                style={{
                  flex: 1, background: T.accent, color: '#000', border: 'none',
                  borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 800,
                  cursor: 'pointer', fontFamily: "'Inter', sans-serif",
                }}
              >
                🖨 Yes, Print Receipt
              </button>
              <button
                onClick={onClose}
                style={{
                  background: T.surface, color: T.textMid,
                  border: `1px solid ${T.border}`, borderRadius: 10,
                  padding: '12px 20px', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: "'Inter', sans-serif",
                }}
              >
                Skip
              </button>
            </div>
          </div>
        )}

        {/* ── Footer actions ── */}
        {!loading && order && !showPrintPrompt && (
          <div style={{
            padding: '14px 24px 20px', borderTop: `1px solid ${T.border}`,
            display: 'flex', gap: 10, flexShrink: 0,
          }}>
            <button onClick={() => handlePrint()} style={{
              background: T.surface, color: T.text,
              border: `1px solid ${T.border}`, borderRadius: 10,
              padding: '11px 16px', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: "'Inter', sans-serif",
              display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
            }}>
              🖨 Print
            </button>

            {!showPayPanel ? (
              <button onClick={() => setShowPayPanel(true)} style={{
                flex: 1, background: T.accent, color: '#000', border: 'none',
                borderRadius: 10, padding: '11px', fontSize: 14, fontWeight: 800,
                cursor: 'pointer', fontFamily: "'Inter', sans-serif",
              }}>
                💳 Process Payment — {fmt(order.total_amount)}
              </button>
            ) : (
              <>
                <button onClick={() => setShowPayPanel(false)} style={{
                  background: T.surface, color: T.textMid, border: `1px solid ${T.border}`,
                  borderRadius: 10, padding: '11px 14px', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: "'Inter', sans-serif",
                }}>
                  Back
                </button>
                <button onClick={handlePay} disabled={paying} style={{
                  flex: 1, background: paying ? T.border : T.green,
                  color: paying ? T.textMid : '#fff', border: 'none',
                  borderRadius: 10, padding: '11px', fontSize: 14, fontWeight: 800,
                  cursor: paying ? 'not-allowed' : 'pointer',
                  fontFamily: "'Inter', sans-serif", transition: 'all 0.2s',
                }}>
                  {paying
                    ? '⏳ Processing…'
                    : `✓ Confirm ${payMethod.charAt(0).toUpperCase() + payMethod.slice(1)} Payment`
                  }
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
