import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../../context/ThemeContext';
import {
  adminGetAllTickets, adminGetTicketMessages,
  adminAddTicketMessage, adminAssignTicket, adminResolveTicket,
} from '../../services/api';
import toast from 'react-hot-toast';

const STATUS_COLOR = {
  open:        '#F39C12',
  assigned:    '#3498DB',
  in_progress: '#9B59B6',
  resolved:    '#27AE60',
  closed:      '#7F8C8D',
};

const STATUS_LABEL = {
  open:        'Open',
  assigned:    'Assigned',
  in_progress: 'In Progress',
  resolved:    'Resolved',
  closed:      'Closed',
};

const ALL_STATUSES = ['', 'open', 'assigned', 'in_progress', 'resolved', 'closed'];

export default function AdminSupport() {
  const { theme: T } = useTheme();
  const [tickets, setTickets]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState('');
  const [selected, setSelected]     = useState(null);
  const [messages, setMessages]     = useState([]);
  const [msgInput, setMsgInput]     = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [assignName, setAssignName] = useState('');
  const [showAssign, setShowAssign] = useState(false);
  const [resolving, setResolving]   = useState(false);
  const msgEndRef                   = useRef();

  const IMG_BASE = process.env.REACT_APP_SOCKET_URL
    || (window.location.protocol + '//' + window.location.hostname + ':5000');

  useEffect(() => { load(); }, [filter]);
  useEffect(() => {
    if (selected) loadMessages(selected.id);
  }, [selected]);
  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await adminGetAllTickets(filter ? { status: filter } : {});
      setTickets(r.data);
    } catch { toast.error('Failed to load tickets'); }
    finally { setLoading(false); }
  };

  const loadMessages = async (id) => {
    try {
      const r = await adminGetTicketMessages(id);
      setMessages(r.data);
    } catch {}
  };

  const handleSendMessage = async () => {
    if (!msgInput.trim() || !selected) return;
    setSendingMsg(true);
    try {
      await adminAddTicketMessage(selected.id, msgInput.trim());
      setMsgInput('');
      loadMessages(selected.id);
    } catch { toast.error('Failed to send message'); }
    finally { setSendingMsg(false); }
  };

  const handleAssign = async () => {
    if (!assignName.trim()) return toast.error('Enter a team member name');
    try {
      const r = await adminAssignTicket(selected.id, assignName.trim());
      toast.success(`Ticket assigned to ${assignName}`);
      setShowAssign(false);
      setAssignName('');
      setSelected(r.data);
      load();
    } catch { toast.error('Failed to assign ticket'); }
  };

  const handleResolve = async () => {
    setResolving(true);
    try {
      const r = await adminResolveTicket(selected.id);
      toast.success('Ticket resolved');
      setSelected(r.data);
      load();
    } catch { toast.error('Failed to resolve ticket'); }
    finally { setResolving(false); }
  };

  const openCount = tickets.filter(t => t.status === 'open').length;
  const assignedCount = tickets.filter(t => t.status === 'assigned').length;

  const card = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 12 };
  const inp  = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '10px 12px', color: T.text, fontSize: 13, fontFamily: "'Inter', sans-serif", outline: 'none', width: '100%', boxSizing: 'border-box' };

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", color: T.text }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🎫 Support Tickets</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: T.textMid }}>Manage and respond to restaurant support requests</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total', value: tickets.length, color: T.accent },
          { label: 'Open', value: openCount, color: '#F39C12' },
          { label: 'Assigned', value: assignedCount, color: '#3498DB' },
          { label: 'Resolved', value: tickets.filter(t => t.status === 'resolved').length, color: '#27AE60' },
        ].map(s => (
          <div key={s.label} style={{ ...card, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: T.textMid, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {ALL_STATUSES.map(s => (
          <button
            key={s}
            onClick={() => { setFilter(s); setSelected(null); }}
            style={{
              background: filter === s ? T.accent : T.surface,
              color: filter === s ? '#000' : T.textMid,
              border: `1px solid ${filter === s ? T.accent : T.border}`,
              borderRadius: 20, padding: '5px 14px', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: "'Inter', sans-serif",
            }}
          >
            {s ? STATUS_LABEL[s] : 'All'}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '380px 1fr' : '1fr', gap: 16 }}>

        {/* ── Ticket list ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading ? (
            <p style={{ color: T.textMid }}>Loading…</p>
          ) : tickets.length === 0 ? (
            <div style={{ ...card, padding: 32, textAlign: 'center' }}>
              <p style={{ color: T.textMid, margin: 0 }}>No tickets found.</p>
            </div>
          ) : tickets.map(t => (
            <div
              key={t.id}
              onClick={() => setSelected(t)}
              style={{
                ...card, padding: '14px 16px', cursor: 'pointer',
                borderColor: selected?.id === t.id ? T.accent : T.border,
                transition: 'border-color 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{t.title}</div>
                  <div style={{ fontSize: 11, color: T.accent, marginTop: 2 }}>🏪 {t.restaurant_name}</div>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                  background: STATUS_COLOR[t.status] + '22',
                  color: STATUS_COLOR[t.status],
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {STATUS_LABEL[t.status] || t.status}
                </span>
              </div>
              {t.assigned_to_name && (
                <p style={{ margin: '4px 0 0', fontSize: 11, color: T.textMid }}>
                  Assigned to: <strong style={{ color: T.text }}>{t.assigned_to_name}</strong>
                </p>
              )}
              <p style={{ margin: '4px 0 0', fontSize: 10, color: T.textDim }}>
                {new Date(t.created_at).toLocaleDateString()} · #{t.id.slice(0, 8).toUpperCase()}
              </p>
            </div>
          ))}
        </div>

        {/* ── Ticket detail ── */}
        {selected && (
          <div style={{ ...card, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{selected.title}</h3>
                <div style={{ fontSize: 12, color: T.accent, marginTop: 2 }}>🏪 {selected.restaurant_name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: STATUS_COLOR[selected.status] + '22', color: STATUS_COLOR[selected.status] }}>
                    {STATUS_LABEL[selected.status]}
                  </span>
                  {selected.assigned_to_name && (
                    <span style={{ fontSize: 11, color: T.textMid }}>
                      Assigned to: <strong style={{ color: T.text }}>{selected.assigned_to_name}</strong>
                    </span>
                  )}
                </div>
                {selected.description && (
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: T.textMid, lineHeight: 1.5 }}>{selected.description}</p>
                )}
                {selected.screenshot_url && (
                  <a
                    href={selected.screenshot_url.startsWith('http') ? selected.screenshot_url : `${IMG_BASE}${selected.screenshot_url}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'inline-block', marginTop: 8, fontSize: 11, color: T.accent }}
                  >
                    📎 View Screenshot
                  </a>
                )}
                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  {selected.status !== 'resolved' && selected.status !== 'closed' && (
                    <button
                      onClick={() => setShowAssign(true)}
                      style={{ background: '#3498DB22', color: '#3498DB', border: '1px solid #3498DB55', borderRadius: 8, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}
                    >
                      Assign Ticket
                    </button>
                  )}
                  {selected.status !== 'resolved' && selected.status !== 'closed' && (
                    <button
                      onClick={handleResolve}
                      disabled={resolving}
                      style={{ background: '#27AE6022', color: '#27AE60', border: '1px solid #27AE6055', borderRadius: 8, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: resolving ? 'not-allowed' : 'pointer', fontFamily: "'Inter', sans-serif", opacity: resolving ? 0.7 : 1 }}
                    >
                      {resolving ? 'Resolving…' : 'Mark Resolved'}
                    </button>
                  )}
                </div>

                {/* Assign form inline */}
                {showAssign && (
                  <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      value={assignName}
                      onChange={e => setAssignName(e.target.value)}
                      placeholder="Team member name…"
                      style={{ ...inp, maxWidth: 220 }}
                      onKeyDown={e => e.key === 'Enter' && handleAssign()}
                    />
                    <button onClick={handleAssign} style={{ background: T.accent, color: '#000', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap' }}>
                      Assign
                    </button>
                    <button onClick={() => { setShowAssign(false); setAssignName(''); }} style={{ background: 'none', border: 'none', color: T.textMid, fontSize: 18, cursor: 'pointer', padding: '0 4px' }}>×</button>
                  </div>
                )}
              </div>
              <button
                onClick={() => setSelected(null)}
                style={{ background: 'none', border: 'none', color: T.textMid, fontSize: 18, cursor: 'pointer', padding: 0, lineHeight: 1 }}
              >×</button>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 320 }}>
              {messages.length === 0 && (
                <p style={{ color: T.textMid, fontSize: 12, textAlign: 'center', margin: 'auto' }}>No messages yet.</p>
              )}
              {messages.map(m => (
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: m.sender_type === 'admin' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '75%',
                    background: m.sender_type === 'admin' ? T.accent + '22' : T.surface,
                    border: `1px solid ${m.sender_type === 'admin' ? T.accent + '55' : T.border}`,
                    borderRadius: 10,
                    padding: '8px 12px',
                  }}>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: m.sender_type === 'admin' ? T.accent : T.textMid, marginBottom: 4 }}>
                      {m.sender_name} · {m.sender_type === 'admin' ? 'Support' : 'Restaurant'}
                    </p>
                    <p style={{ margin: 0, fontSize: 13, color: T.text, lineHeight: 1.5 }}>{m.message}</p>
                    <p style={{ margin: '4px 0 0', fontSize: 10, color: T.textDim }}>
                      {new Date(m.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={msgEndRef} />
            </div>

            {/* Reply */}
            <div style={{ padding: '12px 20px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: 10 }}>
              <input
                value={msgInput}
                onChange={e => setMsgInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                placeholder="Reply to restaurant…"
                style={{ ...inp, flex: 1 }}
              />
              <button
                onClick={handleSendMessage}
                disabled={sendingMsg || !msgInput.trim()}
                style={{ background: T.accent, color: '#000', border: 'none', borderRadius: 8, padding: '0 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Inter', sans-serif", opacity: sendingMsg || !msgInput.trim() ? 0.6 : 1 }}
              >
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
