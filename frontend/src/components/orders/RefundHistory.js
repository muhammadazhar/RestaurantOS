import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getOrders } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Card, Badge, Spinner, Table, PageHeader, T, useT } from '../shared/UI';
import toast from 'react-hot-toast';

const ALL_REFUND_STATUSES = ['manual_refund_required', 'refund_pending', 'refund_failed', 'refunded'];
const PENDING_REFUND_STATUSES = ['manual_refund_required', 'refund_pending', 'refund_failed'];

const today = () => new Date().toISOString().slice(0, 10);
const fmt = n => `PKR ${Number(n || 0).toLocaleString('en-PK')}`;
const fmtDateTime = d => d ? new Date(d).toLocaleString('en-PK', { dateStyle: 'short', timeStyle: 'short' }) : '-';
const labelize = value => String(value || '').replace(/_/g, ' ');

const statusBadgeColor = (status) => {
  if (status === 'refunded') return T.green;
  if (status === 'refund_failed') return T.red;
  return T.red;
};

export default function RefundHistory() {
  useT();
  const { user } = useAuth();
  const canView = user?.isSuperAdmin || (user?.permissions || []).includes('settings');

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [refundStatus, setRefundStatus] = useState('all');
  const [typeF, setTypeF] = useState('all');
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo] = useState(today());

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const params = {
        refund_status: refundStatus === 'all' ? ALL_REFUND_STATUSES.join(',') : refundStatus,
      };
      if (typeF !== 'all') params.order_type = typeF;
      const res = await getOrders(params);
      const from = new Date(dateFrom + 'T00:00:00');
      const to = new Date(dateTo + 'T23:59:59');
      setOrders((Array.isArray(res.data) ? res.data : []).filter(order => {
        const createdAt = new Date(order.created_at);
        return createdAt >= from && createdAt <= to;
      }));
    } catch {
      toast.error('Failed to load refund history');
    } finally {
      setLoading(false);
    }
  }, [canView, dateFrom, dateTo, refundStatus, typeF]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => orders.filter(order => {
    if (!search) return true;
    const term = search.toLowerCase();
    return [
      order.order_number,
      order.customer_name,
      order.refund_reference,
      order.refund_reason,
      order.refund_note,
      order.payment_method,
    ].some(value => String(value || '').toLowerCase().includes(term));
  }), [orders, search]);

  const pendingOrders = filtered.filter(order => PENDING_REFUND_STATUSES.includes(order.refund_status) || order.payment_status === 'refund_pending');
  const refundedOrders = filtered.filter(order => order.refund_status === 'refunded' || order.payment_status === 'refunded');
  const pendingValue = pendingOrders.reduce((sum, order) => sum + Number(order.refund_amount || order.total_amount || 0), 0);
  const refundedValue = refundedOrders.reduce((sum, order) => sum + Number(order.refund_amount || order.total_amount || 0), 0);

  const columns = [
    {
      key: 'order',
      label: 'Order',
      render: (row) => (
        <div>
          <div style={{ fontWeight: 800, color: T.text, fontFamily: 'monospace' }}>{row.order_number}</div>
          <div style={{ fontSize: 11, color: T.textMid, marginTop: 4 }}>
            {row.customer_name || 'Walk-in'} · {labelize(row.order_type) || '-'}
          </div>
        </div>
      ),
    },
    {
      key: 'refund_status',
      label: 'Refund Status',
      render: (row) => <Badge color={statusBadgeColor(row.refund_status)} small>{labelize(row.refund_status)}</Badge>,
    },
    {
      key: 'refund_amount',
      label: 'Amount',
      render: (row) => (
        <span style={{ fontFamily: 'monospace', color: row.refund_status === 'refunded' ? T.green : T.red, fontWeight: 800 }}>
          {fmt(row.refund_amount || row.total_amount || 0)}
        </span>
      ),
    },
    {
      key: 'timeline',
      label: 'Timeline',
      render: (row) => (
        <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.5 }}>
          <div>Requested: {fmtDateTime(row.refund_requested_at || row.updated_at || row.created_at)}</div>
          <div>Completed: {fmtDateTime(row.refunded_at)}</div>
        </div>
      ),
    },
    {
      key: 'reason',
      label: 'Reason / Ref',
      render: (row) => (
        <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.5, minWidth: 220 }}>
          <div style={{ color: T.text }}>{row.refund_reason || '-'}</div>
          <div>Ref: <span style={{ fontFamily: 'monospace', color: T.text }}>{row.refund_reference || '-'}</span></div>
          {row.refund_required_action && <div>Action: {labelize(row.refund_required_action)}</div>}
        </div>
      ),
    },
  ];

  if (!canView) {
    return (
      <div>
        <PageHeader title="Refund History" subtitle="Finance and admin refund records" />
        <Card>
          <div style={{ fontSize: 14, color: T.textMid }}>Only admin or finance-level users can access refund history.</div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Refund History"
        subtitle={`${filtered.length} refund records across cancelled online orders`}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 18 }}>
        <Card style={{ padding: '16px 18px', border: `1px solid ${T.red}33` }}>
          <div style={{ fontSize: 11, color: T.textMid, fontWeight: 700, textTransform: 'uppercase' }}>Pending Refunds</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: T.red, fontFamily: 'monospace', marginTop: 6 }}>{pendingOrders.length}</div>
          <div style={{ fontSize: 12, color: T.textMid, marginTop: 4 }}>{fmt(pendingValue)} still waiting for action</div>
        </Card>
        <Card style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 11, color: T.textMid, fontWeight: 700, textTransform: 'uppercase' }}>Refunded Orders</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: T.green, fontFamily: 'monospace', marginTop: 6 }}>{refundedOrders.length}</div>
          <div style={{ fontSize: 12, color: T.textMid, marginTop: 4 }}>{fmt(refundedValue)} returned to customers</div>
        </Card>
        <Card style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 11, color: T.textMid, fontWeight: 700, textTransform: 'uppercase' }}>Total Refund Records</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: T.text, fontFamily: 'monospace', marginTop: 6 }}>{filtered.length}</div>
          <div style={{ fontSize: 12, color: T.textMid, marginTop: 4 }}>Manual refund workflow and completed refunds</div>
        </Card>
      </div>

      <Card style={{ marginBottom: 18, padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 11, color: T.textMid, marginBottom: 5, fontWeight: 600 }}>From</div>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 12px', color: T.text, fontSize: 13, fontFamily: "'Inter', sans-serif", outline: 'none' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: T.textMid, marginBottom: 5, fontWeight: 600 }}>To</div>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 12px', color: T.text, fontSize: 13, fontFamily: "'Inter', sans-serif", outline: 'none' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: T.textMid, marginBottom: 5, fontWeight: 600 }}>Refund Status</div>
            <select value={refundStatus} onChange={e => setRefundStatus(e.target.value)}
              style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 12px', color: T.text, fontSize: 13, fontFamily: "'Inter', sans-serif", outline: 'none' }}>
              <option value="all">All Refund States</option>
              <option value={PENDING_REFUND_STATUSES.join(',')}>Pending Refunds</option>
              <option value="manual_refund_required">Manual Refund Required</option>
              <option value="refund_pending">Refund Pending</option>
              <option value="refund_failed">Refund Failed</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: T.textMid, marginBottom: 5, fontWeight: 600 }}>Type</div>
            <select value={typeF} onChange={e => setTypeF(e.target.value)}
              style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 12px', color: T.text, fontSize: 13, fontFamily: "'Inter', sans-serif", outline: 'none' }}>
              <option value="all">All Types</option>
              <option value="online">Online</option>
              <option value="delivery">Delivery</option>
              <option value="takeaway">Takeaway</option>
              <option value="dine_in">Dine In</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 11, color: T.textMid, marginBottom: 5, fontWeight: 600 }}>Search</div>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Order, customer, refund ref, reason..."
              style={{ width: '100%', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 12px', color: T.text, fontSize: 13, fontFamily: "'Inter', sans-serif", outline: 'none' }}
            />
          </div>
        </div>
      </Card>

      {loading ? <Spinner /> : filtered.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: 40, color: T.textMid }}>
            No refund records found for the selected filters.
          </div>
        </Card>
      ) : (
        <Table columns={columns} rows={filtered} />
      )}
    </div>
  );
}
