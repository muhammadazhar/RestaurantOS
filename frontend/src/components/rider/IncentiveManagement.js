import React, { useEffect, useState, useCallback } from 'react';
import {
  getIncentiveRules, createIncentiveRule, updateIncentiveRule, deleteIncentiveRule,
  processIncentives, getIncentivePayments, updateIncentivePayment,
  getRiders, getIncentivePaymentDeliveries,
} from '../../services/api';
import { Card, PageHeader, Btn, Input, Select, Modal, Spinner, T, useT } from '../shared/UI';
import toast from 'react-hot-toast';

function fmtCur(v) { return 'PKR ' + parseFloat(v || 0).toLocaleString('en-PK', { minimumFractionDigits: 0 }); }
function fmtDate(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('en-PK'); }
function fmtTime(ts) { if (!ts) return '—'; return new Date(ts).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }); }
function fmtMin(v) { const m = Math.round(parseFloat(v || 0)); return m ? `${m} min` : '—'; }

const RULE_TYPE_LABEL = {
  per_delivery:  'Per Delivery',
  milestone:     'Milestone Bonus',
  monthly_bonus: 'Monthly Bonus',
  rating_bonus:  'Rating Bonus',
};

const STATUS_COLOR = {
  pending:  '#F39C12',
  approved: '#3498DB',
  paid:     '#27AE60',
  rejected: '#E74C3C',
};

// ── Rule Form Modal ────────────────────────────────────────────────────────────
function RuleModal({ rule, open, onClose, onSaved }) {
  useT();
  const isEdit = !!rule?.id;
  const [form, setForm] = useState({
    name: '', description: '', rule_type: 'per_delivery',
    per_delivery_amount: '', milestone_count: '', milestone_bonus: '',
    min_deliveries: '', bonus_amount: '', period: 'monthly', is_active: true,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(rule ? {
        name:                 rule.name || '',
        description:          rule.description || '',
        rule_type:            rule.rule_type || 'per_delivery',
        per_delivery_amount:  String(rule.per_delivery_amount || ''),
        milestone_count:      String(rule.milestone_count || ''),
        milestone_bonus:      String(rule.milestone_bonus || ''),
        min_deliveries:       String(rule.min_deliveries || ''),
        bonus_amount:         String(rule.bonus_amount || ''),
        period:               rule.period || 'monthly',
        is_active:            rule.is_active !== false,
      } : { name: '', description: '', rule_type: 'per_delivery', per_delivery_amount: '', milestone_count: '', milestone_bonus: '', min_deliveries: '', bonus_amount: '', period: 'monthly', is_active: true });
    }
  }, [open, rule]);

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    if (!form.name.trim()) return toast.error('Rule name required');
    setLoading(true);
    try {
      const data = {
        name: form.name, description: form.description,
        rule_type: form.rule_type, period: form.period, is_active: form.is_active,
        per_delivery_amount: parseFloat(form.per_delivery_amount) || 0,
        milestone_count:     parseInt(form.milestone_count) || null,
        milestone_bonus:     parseFloat(form.milestone_bonus) || 0,
        min_deliveries:      parseInt(form.min_deliveries) || 0,
        bonus_amount:        parseFloat(form.bonus_amount) || 0,
      };
      if (isEdit) await updateIncentiveRule(rule.id, data);
      else        await createIncentiveRule(data);
      toast.success(isEdit ? 'Rule updated' : 'Rule created');
      onSaved();
      onClose();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to save'); }
    setLoading(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Incentive Rule' : 'New Incentive Rule'} width={500}>
      <Input label="Rule Name *" value={form.name} onChange={e => f('name', e.target.value)} placeholder="e.g. Base Delivery Bonus" />
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: T.textMid, marginBottom: 6, fontWeight: 600 }}>Description</div>
        <textarea value={form.description} onChange={e => f('description', e.target.value)}
          style={{ width: '100%', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 14px', color: T.text, fontSize: 13, fontFamily: "'Syne', sans-serif", resize: 'vertical', minHeight: 50, outline: 'none' }}
          placeholder="Optional description..." />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Select label="Rule Type" value={form.rule_type} onChange={e => f('rule_type', e.target.value)}>
          {Object.entries(RULE_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select label="Period" value={form.period} onChange={e => f('period', e.target.value)}>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </Select>
      </div>

      {form.rule_type === 'per_delivery' && (
        <Input label="Amount per Delivery (PKR)" type="number" value={form.per_delivery_amount} onChange={e => f('per_delivery_amount', e.target.value)} placeholder="50" />
      )}
      {form.rule_type === 'milestone' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Input label="Milestone Deliveries" type="number" value={form.milestone_count} onChange={e => f('milestone_count', e.target.value)} placeholder="50" />
          <Input label="Milestone Bonus (PKR)"  type="number" value={form.milestone_bonus} onChange={e => f('milestone_bonus', e.target.value)} placeholder="1000" />
        </div>
      )}
      {(form.rule_type === 'monthly_bonus' || form.rule_type === 'rating_bonus') && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Input label="Min Deliveries Required" type="number" value={form.min_deliveries} onChange={e => f('min_deliveries', e.target.value)} placeholder="30" />
          <Input label="Bonus Amount (PKR)"       type="number" value={form.bonus_amount}   onChange={e => f('bonus_amount', e.target.value)} placeholder="2000" />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => f('is_active', e.target.checked)} />
        <label htmlFor="is_active" style={{ fontSize: 13, color: T.text }}>Active</label>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <Btn variant="ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</Btn>
        <Btn onClick={handleSubmit} disabled={loading} style={{ flex: 1 }}>{loading ? 'Saving...' : isEdit ? 'Update Rule' : 'Create Rule'}</Btn>
      </div>
    </Modal>
  );
}

// ── Process Incentives Modal ───────────────────────────────────────────────────
function ProcessModal({ open, onClose, riders, onDone }) {
  useT();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';
  const [periodStart, setPeriodStart] = useState(monthStart);
  const [periodEnd,   setPeriodEnd]   = useState(today);
  const [selectedRiders, setSelectedRiders] = useState([]);
  const [loading, setLoading] = useState(false);

  const toggleRider = (id) => setSelectedRiders(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);

  const handleProcess = async () => {
    if (!periodStart || !periodEnd) return toast.error('Select period');
    setLoading(true);
    try {
      const res = await processIncentives({
        period_start: periodStart,
        period_end:   periodEnd,
        rider_ids:    selectedRiders.length ? selectedRiders : null,
      });
      toast.success(`Processed ${res.data.processed} incentive payments`);
      onDone();
      onClose();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to process'); }
    setLoading(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Process Incentives" width={460}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <Input label="Period Start" type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
        <Input label="Period End"   type="date" value={periodEnd}   onChange={e => setPeriodEnd(e.target.value)} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: T.textMid, marginBottom: 8, fontWeight: 600 }}>Riders (leave empty for all)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
          {riders.map(r => (
            <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={selectedRiders.includes(r.id)} onChange={() => toggleRider(r.id)} />
              <span style={{ fontSize: 13, color: T.text }}>{r.full_name}</span>
            </label>
          ))}
        </div>
      </div>
      <div style={{ background: '#F39C1222', border: '1px solid #F39C12', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: T.text }}>
        ⚠️ Re-processing the same date range will <strong>replace</strong> existing pending/approved payments for those riders and recalculate from scratch.
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <Btn variant="ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</Btn>
        <Btn onClick={handleProcess} disabled={loading} style={{ flex: 1 }}>{loading ? 'Processing...' : 'Process Now'}</Btn>
      </div>
    </Modal>
  );
}

// ── Delivery Detail Modal ──────────────────────────────────────────────────────
function DeliveryDetailModal({ paymentId, open, onClose }) {
  useT();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !paymentId) return;
    setLoading(true);
    getIncentivePaymentDeliveries(paymentId)
      .then(res => setData(res.data))
      .catch(() => toast.error('Failed to load deliveries'))
      .finally(() => setLoading(false));
  }, [open, paymentId]);

  const pay    = data?.payment;
  const orders = data?.orders || [];

  return (
    <Modal open={open} onClose={onClose} title="Delivery Detail" width={620}>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '30px 0' }}><Spinner /></div>
      ) : !pay ? null : (
        <>
          {/* Payment summary header */}
          <div style={{ background: T.surface, borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: T.textDim, textTransform: 'uppercase' }}>Rider</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{pay.rider_name || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.textDim, textTransform: 'uppercase' }}>Rule</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{pay.rule_name}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.textDim, textTransform: 'uppercase' }}>Period</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{fmtDate(pay.period_start)} – {fmtDate(pay.period_end)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.textDim, textTransform: 'uppercase' }}>Deliveries</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.accent }}>{pay.deliveries_count}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.textDim, textTransform: 'uppercase' }}>Amount</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#27AE60' }}>{fmtCur(pay.amount)}</div>
            </div>
          </div>

          {orders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: T.textDim }}>No delivered orders found for this period</div>
          ) : (
            <div style={{ maxHeight: 380, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: T.surface, position: 'sticky', top: 0 }}>
                    {['Order #', 'Customer', 'Amount', 'Picked', 'Delivered', 'Duration'].map(h => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 11, color: T.textMid, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id} style={{ borderTop: `1px solid ${T.border}` }}>
                      <td style={{ padding: '10px 12px', fontSize: 12, fontWeight: 700, color: T.text }}>#{o.order_number}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{o.customer_name}</div>
                        <div style={{ fontSize: 11, color: T.textDim }}>{o.customer_phone}</div>
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: T.accent }}>{fmtCur(o.total_amount)}</td>
                      <td style={{ padding: '10px 12px', fontSize: 11, color: T.textMid }}>{fmtTime(o.picked_at)}</td>
                      <td style={{ padding: '10px 12px', fontSize: 11, color: T.textMid }}>{fmtTime(o.delivered_at)}</td>
                      <td style={{ padding: '10px 12px', fontSize: 11, color: T.textDim }}>{fmtMin(o.delivery_minutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Btn variant="ghost" onClick={onClose}>Close</Btn>
          </div>
        </>
      )}
    </Modal>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function IncentiveManagement() {
  useT();
  const [tab,      setTab]      = useState('rules');
  const [rules,    setRules]    = useState([]);
  const [payments, setPayments] = useState([]);
  const [riders,   setRiders]   = useState([]);
  const [loading,  setLoading]  = useState(true);

  const [editRule,      setEditRule]      = useState(null);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [showProcess,   setShowProcess]   = useState(false);
  const [detailPayId,   setDetailPayId]   = useState(null);

  // Payments filter
  const [pFilter, setPFilter] = useState({ status: '', rider_id: '', month: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesR, ridersR] = await Promise.all([getIncentiveRules(), getRiders()]);
      setRules(rulesR.data);
      setRiders(ridersR.data);
    } catch { toast.error('Failed to load'); }
    setLoading(false);
  }, []);

  const loadPayments = useCallback(async () => {
    try {
      const res = await getIncentivePayments(pFilter);
      setPayments(res.data);
    } catch { toast.error('Failed to load payments'); }
  }, [pFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === 'payments') loadPayments(); }, [tab, loadPayments]);

  const handleDeleteRule = async (id) => {
    if (!window.confirm('Delete this incentive rule?')) return;
    try {
      await deleteIncentiveRule(id);
      toast.success('Rule deleted');
      load();
    } catch { toast.error('Failed to delete'); }
  };

  const handlePaymentStatus = async (id, status) => {
    try {
      await updateIncentivePayment(id, { status });
      toast.success(`Payment ${status}`);
      loadPayments();
    } catch { toast.error('Failed to update'); }
  };

  if (loading) return <Spinner />;

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Rider Incentives"
        subtitle="Setup incentive rules and process payments for riders"
        action={
          <div style={{ display: 'flex', gap: 10 }}>
            {tab === 'rules' && (
              <>
                <Btn variant="ghost" onClick={() => setShowProcess(true)}>Process Incentives</Btn>
                <Btn onClick={() => { setEditRule(null); setShowRuleModal(true); }}>+ New Rule</Btn>
              </>
            )}
          </div>
        }
      />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: `1px solid ${T.border}`, paddingBottom: 12 }}>
        {[['rules', 'Incentive Rules'], ['payments', 'Payments']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '8px 18px', borderRadius: 10, border: 'none',
            background: tab === key ? T.accent : 'transparent',
            color: tab === key ? '#000' : T.textMid,
            fontWeight: 700, fontSize: 13, cursor: 'pointer',
          }}>{label}</button>
        ))}
      </div>

      {/* Rules Tab */}
      {tab === 'rules' && (
        <div>
          {rules.length === 0
            ? <Card><div style={{ textAlign: 'center', padding: '40px 0', color: T.textDim }}>No incentive rules. Click "+ New Rule" to create one.</div></Card>
            : (
              <div style={{ display: 'grid', gap: 12 }}>
                {rules.map(rule => (
                  <Card key={rule.id} style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{rule.name}</span>
                          <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: rule.is_active ? '#27AE6022' : '#88888822', color: rule.is_active ? '#27AE60' : '#888' }}>
                            {rule.is_active ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                          <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, background: T.accentGlow, color: T.accent }}>
                            {RULE_TYPE_LABEL[rule.rule_type]}
                          </span>
                        </div>
                        {rule.description && <div style={{ fontSize: 12, color: T.textMid, marginTop: 4 }}>{rule.description}</div>}
                        <div style={{ marginTop: 8, fontSize: 12, color: T.text }}>
                          {rule.rule_type === 'per_delivery' && `${fmtCur(rule.per_delivery_amount)} per delivery · ${rule.period}`}
                          {rule.rule_type === 'milestone'    && `${fmtCur(rule.milestone_bonus)} bonus at ${rule.milestone_count} deliveries · ${rule.period}`}
                          {rule.rule_type === 'monthly_bonus'&& `${fmtCur(rule.bonus_amount)} bonus when ≥ ${rule.min_deliveries} deliveries · ${rule.period}`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Btn size="sm" variant="ghost" onClick={() => { setEditRule(rule); setShowRuleModal(true); }}>Edit</Btn>
                        <Btn size="sm" variant="danger" onClick={() => handleDeleteRule(rule.id)}>Delete</Btn>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )
          }
        </div>
      )}

      {/* Payments Tab */}
      {tab === 'payments' && (
        <div>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <select value={pFilter.status} onChange={e => setPFilter(p => ({ ...p, status: e.target.value }))}
              style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '8px 12px', color: T.text, fontSize: 13, outline: 'none' }}>
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="paid">Paid</option>
              <option value="rejected">Rejected</option>
            </select>
            <select value={pFilter.rider_id} onChange={e => setPFilter(p => ({ ...p, rider_id: e.target.value }))}
              style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '8px 12px', color: T.text, fontSize: 13, outline: 'none' }}>
              <option value="">All Riders</option>
              {riders.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}
            </select>
            <input type="month" value={pFilter.month} onChange={e => setPFilter(p => ({ ...p, month: e.target.value }))}
              style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '8px 12px', color: T.text, fontSize: 13, outline: 'none' }} />
            <Btn size="sm" onClick={loadPayments}>Apply</Btn>
          </div>

          {payments.length === 0
            ? <Card><div style={{ textAlign: 'center', padding: '40px 0', color: T.textDim }}>No payments found. Process incentives to generate payments.</div></Card>
            : (
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: T.surface }}>
                      {['Rider', 'Rule', 'Period', 'Deliveries', 'Amount', 'Status', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, color: T.textMid, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map(p => (
                      <tr key={p.id} style={{ borderTop: `1px solid ${T.border}` }}>
                        <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: T.text }}>{p.rider_name}</td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: T.textMid }}>{p.rule_name}</td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: T.textMid }}>{fmtDate(p.period_start)} – {fmtDate(p.period_end)}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <button
                            onClick={() => setDetailPayId(p.id)}
                            style={{
                              fontSize: 13, color: T.accent, fontWeight: 700, background: T.accentGlow,
                              border: `1px solid ${T.accent}`, borderRadius: 8, padding: '3px 10px', cursor: 'pointer',
                            }}
                            title="View deliveries"
                          >
                            {p.deliveries_count} 🔍
                          </button>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 700, color: T.accent }}>{fmtCur(p.amount)}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: (STATUS_COLOR[p.status] || '#888') + '22', color: STATUS_COLOR[p.status] || '#888' }}>
                            {p.status.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {p.status === 'pending' && (
                              <>
                                <Btn size="sm" onClick={() => handlePaymentStatus(p.id, 'approved')}>Approve</Btn>
                                <Btn size="sm" variant="danger" onClick={() => handlePaymentStatus(p.id, 'rejected')}>Reject</Btn>
                              </>
                            )}
                            {p.status === 'approved' && (
                              <>
                                <Btn size="sm" onClick={() => handlePaymentStatus(p.id, 'paid')}>Mark Paid</Btn>
                                <Btn size="sm" variant="danger" onClick={() => handlePaymentStatus(p.id, 'rejected')}>Reject</Btn>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )
          }
        </div>
      )}

      <RuleModal
        rule={editRule}
        open={showRuleModal}
        onClose={() => setShowRuleModal(false)}
        onSaved={load}
      />
      <ProcessModal
        open={showProcess}
        onClose={() => setShowProcess(false)}
        riders={riders}
        onDone={() => { load(); if (tab === 'payments') loadPayments(); }}
      />
      <DeliveryDetailModal
        paymentId={detailPayId}
        open={!!detailPayId}
        onClose={() => setDetailPayId(null)}
      />
    </div>
  );
}
