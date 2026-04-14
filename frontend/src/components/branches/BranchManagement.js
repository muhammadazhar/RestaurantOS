import React, { useEffect, useState } from 'react';
import { Card, Spinner, PageHeader, T, useT } from '../shared/UI';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import API from '../../services/api';

const getMyGroup = () => API.get('/branches/my-group');

const STATUS_COLOR = { active: '#2ecc71', trial: '#f39c12', suspended: '#e74c3c', pending: '#3498db' };

export default function BranchManagement() {
  useT();
  const { user } = useAuth();
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyGroup()
      .then(r => setGroup(r.data))
      .catch(() => toast.error('Failed to load group info'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  if (!group) {
    return (
      <div>
        <PageHeader title="🏢 My Company Group" subtitle="Branch and group management" />
        <Card style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏪</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.textMid, marginBottom: 6 }}>Not part of a group</div>
          <div style={{ fontSize: 13, color: T.textDim }}>
            Your restaurant is not currently assigned to a company group.
            Contact your system administrator to join or create a group.
          </div>
        </Card>
      </div>
    );
  }

  const branches = group.branches || [];
  const currentBranch = branches.find(b => b.id === user?.restaurantId);

  return (
    <div>
      <PageHeader
        title="🏢 My Company Group"
        subtitle={`${group.name} · ${branches.length} branch${branches.length !== 1 ? 'es' : ''}`}
      />

      {/* Group info card */}
      <Card style={{ marginBottom: 20, display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ fontSize: 44 }}>🏢</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.text, marginBottom: 4 }}>{group.name}</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {group.email   && <span style={{ fontSize: 12, color: T.textMid }}>✉️ {group.email}</span>}
            {group.phone   && <span style={{ fontSize: 12, color: T.textMid }}>📞 {group.phone}</span>}
            {group.address && <span style={{ fontSize: 12, color: T.textMid }}>📍 {group.address}</span>}
          </div>
          {currentBranch && (
            <div style={{ marginTop: 8, background: T.accentGlow, border: `1px solid ${T.accent}44`, borderRadius: 8, padding: '6px 12px', display: 'inline-block', fontSize: 12, color: T.accent, fontWeight: 600 }}>
              You are at: {currentBranch.branch_code ? `[${currentBranch.branch_code}] ` : ''}{currentBranch.name}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: T.accent }}>{branches.length}</div>
          <div style={{ fontSize: 11, color: T.textMid }}>Branches</div>
        </div>
      </Card>

      {/* Branch grid */}
      <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 12 }}>All Branches</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {branches.map(b => {
          const isCurrent = b.id === user?.restaurantId;
          return (
            <Card
              key={b.id}
              style={{
                padding: 18,
                border: isCurrent ? `2px solid ${T.accent}` : `1px solid ${T.border}`,
                position: 'relative',
              }}
            >
              {isCurrent && (
                <div style={{
                  position: 'absolute', top: 10, right: 10,
                  background: T.accent, color: '#000', fontSize: 10, fontWeight: 800,
                  padding: '2px 8px', borderRadius: 6,
                }}>
                  YOU ARE HERE
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: isCurrent ? T.accentGlow : T.surface,
                  border: `1px solid ${isCurrent ? T.accent : T.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, flexShrink: 0,
                }}>
                  🏪
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{b.name}</div>
                  {b.branch_code && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, background: T.accentGlow,
                      color: T.accent, padding: '1px 6px', borderRadius: 4, display: 'inline-block', marginTop: 2,
                    }}>{b.branch_code}</span>
                  )}
                  {b.city && <div style={{ fontSize: 11, color: T.textMid, marginTop: 2 }}>📍 {b.city}</div>}
                  <div style={{ fontSize: 11, color: STATUS_COLOR[b.status] || T.textMid, fontWeight: 600, marginTop: 4 }}>
                    ● {b.status?.toUpperCase()}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
