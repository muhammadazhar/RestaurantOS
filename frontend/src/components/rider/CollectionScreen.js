import React, { useEffect, useState, useCallback } from 'react';
import {
  getCashierSummary, getRiderOrdersForCashier,
  cashierCollect, updateCashierCollection
} from '../../services/api';
import { Card, PageHeader, Btn, Input, Modal, Spinner, T, useT } from '../shared/UI';
import toast from 'react-hot-toast';

function fmtCur(v) { return 'PKR ' + parseFloat(v || 0).toLocaleString('en-PK', { minimumFractionDigits: 0 }); }
function fmtTime(ts) { if (!ts) return '—'; return new Date(ts).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }); }

const STATUS_COLOR = {
  delivered: '#27AE60', picked: '#F39C12', out_for_delivery: '#1ABC9C',
  pending: '#888', cancelled: '#E74C3C',
};

// Rider Detail Modal
function RiderDetailModal({ rider, date, open, onClose }) {
  useT();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !rider) return;
    setLoading(true);
    getRiderOrdersForCashier(rider.rider_id, { date })
      .then(r => setOrders(r.data))
      .catch(() => toast.error('Failed to load orders'))
      .finally(() => setLoading(false));
  }, [open, rider, date]);

  if (!rider) return null;

  return (
    <Modal open={open} onClose={onClose} title={`${rider.rider_name} — Orders Detail`} width={600}>
      {loading ? <Spinner /> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 18 }}>
            {[
              { label: 'Total Orders', value: rider.total_orders },
              { label: 'Delivered', value: rider.delivered_count },
              { label: 'Expected', value: fmtCur(rider.expected_amount) },
            ].map(s => (
              <div key={s.label} style={{ background: T.surface, borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: T.accent }}>{s.value}</div>
                <div style={{ fontSize: 11, color: T.textMid }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {orders.map(o => (
              <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${T.border}` }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>#{o.order_number} · {o.customer_name}</div>
                  <div style={{ fontSize: 11, color: T.textMid }}>{o.customer_phone} · {fmtTime(o.delivered_at)}</div>
                  {o.delivery_address?.address && <div style={{ fontSize: 11, color: T.textDim }}>{o.delivery_address.address}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.accent }}>{fmtCur(o.total_amount)}</div>
                  <div style={{ fontSize: 11, color: o.collection_status === 'submitted' ? T.green : T.textMid }}>
                    {o.collection_status === 'submitted' ? 'Submitted' : o.collection_status === 'pending' ? 'Pending' : 'Not Collected'}
                    {o.total_collected > 0 && ` · ${fmtCur(o.total_collected)}`}
                  </div>
                  <div style={{ fontSize: 11, color: o.collection_method === 'card' ? '#3498DB' : T.textMid }}>
                    {o.collection_method ? o.collection_method.toUpperCase() : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <Btn variant="ghost" onClick={onClose} style={{ width: '100%', marginTop: 16 }}>Close</Btn>
    </Modal>
  );
}

// Cashier Collect Modal
function CollectModal({ rider, date, open, onClose, onDone }) {
  useT();
  const [submittedAmt, setSubmittedAmt] = useState('');
  const [shortage,     setShortage]     = useState('0');
  const [extra,        setExtra]        = useState('0');
  const [notes,        setNotes]        = useState('');
  const [loading,      setLoading]      = useState(false);

  useEffect(() => {
    if (open && rider) {
      setSubmittedAmt(String(parseFloat(rider.total_collected || rider.expected_amount || 0).toFixed(0)));
      setShortage('0'); setExtra('0'); setNotes('');
    }
  }, [open, rider]);

  if (!rider) return null;

  const expected       = parseFloat(rider.expected_amount || 0);
  const submitted      = parseFloat(submittedAmt || 0);
  const diff           = submitted - expected;
  const autoShortage   = diff < 0 ? Math.abs(diff) : 0;
  const autoExtra      = diff > 0 ? diff : 0;

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await cashierCollect({
        rider_id:         rider.rider_id,
        collection_date:  date,
        submitted_amount: submitted,
        shortage_amount:  parseFloat(shortage) || autoShortage,
        extra_amount:     parseFloat(extra) || autoExtra,
        notes,
      });
      toast.success('Collection recorded');
      onDone();
      onClose();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to record'); }
    setLoading(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={`Collect from ${rider.rider_name}`} width={440}>
      <div style={{ background: T.surface, borderRadius: 12, padding: 14, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: T.textMid }}>Deliveries</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{rider.delivered_count}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: T.textMid }}>Expected Collection</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: T.accent }}>{fmtCur(expected)}</span>
        </div>
      </div>

      <Input
        label="Submitted Amount (PKR) *"
        type="number" value={submittedAmt}
        onChange={e => setSubmittedAmt(e.target.value)}
        placeholder={String(expected)}
      />

      {diff !== 0 && submittedAmt && (
        <div style={{
          background: diff < 0 ? '#E74C3C22' : '#27AE6022',
          border: `1px solid ${diff < 0 ? '#E74C3C' : '#27AE60'}`,
          borderRadius: 10, padding: '10px 14px', marginBottom: 14,
        }}>
          <div style={{ fontSize: 12, color: T.textMid }}>{diff < 0 ? 'Shortage' : 'Extra'}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: diff < 0 ? '#E74C3C' : '#27AE60' }}>
            {fmtCur(Math.abs(diff))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Input label="Shortage (PKR)" type="number" value={shortage} onChange={e => setShortage(e.target.value)} />
        <Input label="Extra (PKR)"    type="number" value={extra}    onChange={e => setExtra(e.target.value)} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: T.textMid, marginBottom: 6, fontWeight: 600 }}>Notes</div>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          style={{ width: '100%', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 14px', color: T.text, fontSize: 13, fontFamily: "'Inter', sans-serif", resize: 'none', minHeight: 60, outline: 'none' }}
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

// Edit Shortage/Extra Modal
function EditModal({ collection, open, onClose, onDone }) {
  useT();
  const [shortage, setShortage] = useState('');
  const [extra,    setExtra]    = useState('');
  const [notes,    setNotes]    = useState('');
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    if (open && collection) {
      setShortage(String(collection.shortage_amount || 0));
      setExtra(String(collection.extra_amount || 0));
      setNotes(collection.notes || '');
    }
  }, [open, collection]);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await updateCashierCollection(collection.cashier_collection_id, {
        shortage_amount: parseFloat(shortage) || 0,
        extra_amount:    parseFloat(extra) || 0,
        notes,
      });
      toast.success('Updated');
      onDone();
      onClose();
    } catch { toast.error('Failed to update'); }
    setLoading(false);
  };

  if (!collection) return null;
  return (
    <Modal open={open} onClose={onClose} title="Edit Shortage / Extra" width={380}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Input label="Shortage (PKR)" type="number" value={shortage} onChange={e => setShortage(e.target.value)} />
        <Input label="Extra (PKR)"    type="number" value={extra}    onChange={e => setExtra(e.target.value)} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: T.textMid, marginBottom: 6, fontWeight: 600 }}>Notes</div>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          style={{ width: '100%', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 14px', color: T.text, fontSize: 13, fontFamily: "'Inter', sans-serif", resize: 'none', minHeight: 50, outline: 'none' }} />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <Btn variant="ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</Btn>
        <Btn onClick={handleSubmit} disabled={loading} style={{ flex: 1 }}>{loading ? 'Saving...' : 'Save'}</Btn>
      </div>
    </Modal>
  );
}

export default function CollectionScreen() {
  useT();
  const [riders,       setRiders]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [date,         setDate]         = useState(new Date().toISOString().slice(0, 10));
  const [collectRider, setCollectRider] = useState(null);
  const [detailRider,  setDetailRider]  = useState(null);
  const [editColl,     setEditColl]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCashierSummary({ date });
      setRiders(res.data);
    } catch { toast.error('Failed to load'); }
    setLoading(false);
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const totals = riders.reduce((acc, r) => ({
    orders:    acc.orders    + parseInt(r.total_orders || 0),
    delivered: acc.delivered + parseInt(r.delivered_count || 0),
    expected:  acc.expected  + parseFloat(r.expected_amount || 0),
    collected: acc.collected + parseFloat(r.total_collected || 0),
  }), { orders: 0, delivered: 0, expected: 0, collected: 0 });

  if (loading) return <Spinner />;

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Collection Screen"
        subtitle="Collect cash from riders at end of shift"
        action={
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ marginBottom: 0, width: 160 }} />
        }
      />

      {/* Summary Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Orders',     value: totals.orders,              icon: '📦' },
          { label: 'Delivered',        value: totals.delivered,           icon: '✅' },
          { label: 'Expected',         value: fmtCur(totals.expected),    icon: '💵' },
          { label: 'Collected',        value: fmtCur(totals.collected),   icon: '✔️' },
          { label: 'Balance',          value: fmtCur(totals.expected - totals.collected), icon: '⏳' },
        ].map(s => (
          <Card key={s.label}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.accent }}>{s.value}</div>
            <div style={{ fontSize: 11, color: T.textMid, textTransform: 'uppercase', letterSpacing: 0.8 }}>{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Rider Cards */}
      {riders.length === 0
        ? <Card><div style={{ textAlign: 'center', padding: '40px 0', color: T.textDim }}>No riders found for {date}</div></Card>
        : (
          <div style={{ display: 'grid', gap: 14 }}>
            {riders.map(rider => {
              const collected  = parseFloat(rider.total_collected || 0);
              const expected   = parseFloat(rider.expected_amount || 0);
              const balance    = expected - collected;
              const isCollected = rider.cashier_status === 'collected';

              return (
                <Card key={rider.rider_id} style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: T.accentGlow, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: T.accent, fontWeight: 800 }}>
                          {rider.rider_name[0]}
                        </div>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>{rider.rider_name}</div>
                          <div style={{ fontSize: 12, color: T.textMid }}>{rider.rider_phone}</div>
                        </div>
                        {isCollected && (
                          <span style={{ padding: '3px 10px', background: '#27AE6022', color: '#27AE60', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>COLLECTED</span>
                        )}
                        {!isCollected && rider.delivered_count > 0 && (
                          <span style={{ padding: '3px 10px', background: '#F39C1222', color: '#F39C12', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>PENDING</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 20 }}>
                        <div><span style={{ fontSize: 11, color: T.textMid }}>Deliveries: </span><span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{rider.delivered_count}</span></div>
                        <div><span style={{ fontSize: 11, color: T.textMid }}>Expected: </span><span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{fmtCur(expected)}</span></div>
                        <div><span style={{ fontSize: 11, color: T.textMid }}>Collected: </span><span style={{ fontSize: 13, fontWeight: 700, color: T.green }}>{fmtCur(collected)}</span></div>
                        {balance > 0 && <div><span style={{ fontSize: 11, color: T.textMid }}>Balance: </span><span style={{ fontSize: 13, fontWeight: 700, color: T.red }}>{fmtCur(balance)}</span></div>}
                      </div>
                      {isCollected && (
                        <div style={{ marginTop: 6, display: 'flex', gap: 16 }}>
                          {rider.shortage_amount > 0 && <span style={{ fontSize: 12, color: T.red }}>Shortage: {fmtCur(rider.shortage_amount)}</span>}
                          {rider.extra_amount > 0 && <span style={{ fontSize: 12, color: T.green }}>Extra: {fmtCur(rider.extra_amount)}</span>}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Btn size="sm" variant="ghost" onClick={() => setDetailRider(rider)}>View Orders</Btn>
                      {!isCollected && rider.delivered_count > 0 && (
                        <Btn size="sm" onClick={() => setCollectRider(rider)}>Collect Cash</Btn>
                      )}
                      {isCollected && (
                        <Btn size="sm" variant="ghost" onClick={() => setEditColl(rider)}>Edit Shortage/Extra</Btn>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )
      }

      <RiderDetailModal  rider={detailRider}  date={date} open={!!detailRider}  onClose={() => setDetailRider(null)} />
      <CollectModal      rider={collectRider} date={date} open={!!collectRider} onClose={() => setCollectRider(null)} onDone={load} />
      <EditModal         collection={editColl}            open={!!editColl}     onClose={() => setEditColl(null)}    onDone={load} />
    </div>
  );
}
