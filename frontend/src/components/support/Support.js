import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../../context/ThemeContext';
import {
  getMySupportTickets, createSupportTicket,
  getTicketMessages, addTicketMessage,
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

export default function Support() {
  const { theme: T } = useTheme();
  const [tickets, setTickets]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [selected, setSelected]         = useState(null);
  const [messages, setMessages]         = useState([]);
  const [msgInput, setMsgInput]         = useState('');
  const [sendingMsg, setSendingMsg]     = useState(false);
  const [showCreate, setShowCreate]     = useState(false);
  const [form, setForm]                 = useState({ title: '', description: '' });
  const [screenshot, setScreenshot]     = useState(null);
  const [screenshotPreview, setPreview] = useState(null);
  const [creating, setCreating]         = useState(false);
  const fileRef                         = useRef();
  const msgEndRef                       = useRef();

  const IMG_BASE = process.env.REACT_APP_SOCKET_URL
    || (window.location.protocol + '//' + window.location.hostname + ':5000');

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (selected) loadMessages(selected.id);
  }, [selected]);
  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await getMySupportTickets();
      setTickets(r.data);
    } catch { toast.error('Failed to load tickets'); }
    finally { setLoading(false); }
  };

  const loadMessages = async (id) => {
    try {
      const r = await getTicketMessages(id);
      setMessages(r.data);
    } catch {}
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error('Title required');
    setCreating(true);
    try {
      await createSupportTicket({ ...form, screenshot });
      toast.success('Ticket created');
      setShowCreate(false);
      setForm({ title: '', description: '' });
      setScreenshot(null);
      setPreview(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create ticket');
    } finally { setCreating(false); }
  };

  const handleSendMessage = async () => {
    if (!msgInput.trim() || !selected) return;
    setSendingMsg(true);
    try {
      await addTicketMessage(selected.id, msgInput.trim());
      setMsgInput('');
      loadMessages(selected.id);
    } catch { toast.error('Failed to send message'); }
    finally { setSendingMsg(false); }
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setScreenshot(file);
    setPreview(URL.createObjectURL(file));
  };

  const card = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 12 };
  const inp  = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '10px 12px', color: T.text, fontSize: 13, fontFamily: "'Inter', sans-serif", outline: 'none', width: '100%', boxSizing: 'border-box' };

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", color: T.text }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🎫 Support Tickets</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: T.textMid }}>Submit and track your support requests</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{ background: T.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}
        >
          + New Ticket
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '340px 1fr' : '1fr', gap: 16 }}>

        {/* ── Ticket list ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading ? (
            <p style={{ color: T.textMid }}>Loading…</p>
          ) : tickets.length === 0 ? (
            <div style={{ ...card, padding: 32, textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎫</div>
              <p style={{ color: T.textMid, margin: 0 }}>No tickets yet. Create one if you need help.</p>
            </div>
          ) : tickets.map(t => (
            <div
              key={t.id}
              onClick={() => setSelected(t)}
              style={{
                ...card,
                padding: '14px 16px',
                cursor: 'pointer',
                borderColor: selected?.id === t.id ? T.accent : T.border,
                transition: 'border-color 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text, flex: 1 }}>{t.title}</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                  background: STATUS_COLOR[t.status] + '22',
                  color: STATUS_COLOR[t.status],
                  whiteSpace: 'nowrap',
                }}>
                  {STATUS_LABEL[t.status] || t.status}
                </span>
              </div>
              {t.assigned_to_name && t.status === 'assigned' && (
                <p style={{ margin: '4px 0 0', fontSize: 11, color: T.textMid }}>
                  Assigned to: <strong style={{ color: T.text }}>{t.assigned_to_name}</strong>
                </p>
              )}
              <p style={{ margin: '4px 0 0', fontSize: 11, color: T.textDim }}>
                {new Date(t.created_at).toLocaleDateString()} · #{t.id.slice(0, 8).toUpperCase()}
              </p>
            </div>
          ))}
        </div>

        {/* ── Ticket detail / messages ── */}
        {selected && (
          <div style={{ ...card, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{selected.title}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: STATUS_COLOR[selected.status] + '22', color: STATUS_COLOR[selected.status] }}>
                    {STATUS_LABEL[selected.status]}
                  </span>
                  {selected.assigned_to_name && (
                    <span style={{ fontSize: 11, color: T.textMid }}>
                      Assigned to: <strong style={{ color: T.accent }}>{selected.assigned_to_name}</strong>
                    </span>
                  )}
                  {selected.resolved_at && (
                    <span style={{ fontSize: 11, color: '#27AE60' }}>
                      Resolved {new Date(selected.resolved_at).toLocaleDateString()}
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
              </div>
              <button
                onClick={() => setSelected(null)}
                style={{ background: 'none', border: 'none', color: T.textMid, fontSize: 18, cursor: 'pointer', padding: 0, lineHeight: 1 }}
              >×</button>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 360 }}>
              {messages.length === 0 && (
                <p style={{ color: T.textMid, fontSize: 12, textAlign: 'center', margin: 'auto' }}>No messages yet. Add one below.</p>
              )}
              {messages.map(m => (
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: m.sender_type === 'restaurant' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '75%',
                    background: m.sender_type === 'restaurant' ? T.accent + '22' : T.surface,
                    border: `1px solid ${m.sender_type === 'restaurant' ? T.accent + '55' : T.border}`,
                    borderRadius: 10,
                    padding: '8px 12px',
                  }}>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: m.sender_type === 'restaurant' ? T.accent : T.textMid, marginBottom: 4 }}>
                      {m.sender_name}
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

            {/* Reply input */}
            {selected.status !== 'resolved' && selected.status !== 'closed' && (
              <div style={{ padding: '12px 20px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: 10 }}>
                <input
                  value={msgInput}
                  onChange={e => setMsgInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Type a message…"
                  style={{ ...inp, flex: 1 }}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={sendingMsg || !msgInput.trim()}
                  style={{ background: T.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '0 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Inter', sans-serif", opacity: sendingMsg || !msgInput.trim() ? 0.6 : 1 }}
                >
                  Send
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Create ticket modal ── */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ ...card, width: '100%', maxWidth: 500, padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>New Support Ticket</h3>
              <button onClick={() => { setShowCreate(false); setForm({ title: '', description: '' }); setScreenshot(null); setPreview(null); }} style={{ background: 'none', border: 'none', color: T.textMid, fontSize: 20, cursor: 'pointer', padding: 0 }}>×</button>
            </div>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: T.textMid, letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>SUBJECT *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Brief description of the issue" style={inp} required />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: T.textMid, letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>DETAILS</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Describe the issue in detail…"
                  rows={4}
                  style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: T.textMid, letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>SCREENSHOT (optional)</label>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
                <button
                  type="button"
                  onClick={() => fileRef.current.click()}
                  style={{ background: T.surface, border: `1px dashed ${T.border}`, borderRadius: 8, padding: '10px 16px', color: T.textMid, fontSize: 12, cursor: 'pointer', fontFamily: "'Inter', sans-serif", width: '100%' }}
                >
                  {screenshot ? `📎 ${screenshot.name}` : '📎 Click to attach screenshot'}
                </button>
                {screenshotPreview && (
                  <img src={screenshotPreview} alt="preview" style={{ marginTop: 8, maxWidth: '100%', maxHeight: 120, borderRadius: 6, border: `1px solid ${T.border}`, objectFit: 'cover' }} />
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="button" onClick={() => { setShowCreate(false); setForm({ title: '', description: '' }); setScreenshot(null); setPreview(null); }} style={{ flex: 1, background: T.surface, color: T.text, border: `1px solid ${T.border}`, borderRadius: 10, padding: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
                  Cancel
                </button>
                <button type="submit" disabled={creating} style={{ flex: 1, background: T.accent, color: '#fff', border: 'none', borderRadius: 10, padding: 12, fontSize: 13, fontWeight: 700, cursor: creating ? 'not-allowed' : 'pointer', fontFamily: "'Inter', sans-serif", opacity: creating ? 0.7 : 1 }}>
                  {creating ? 'Submitting…' : 'Submit Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
