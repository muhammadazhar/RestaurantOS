import React, { useEffect, useState, useCallback } from 'react';
import { Card, Badge, Spinner, Btn, Modal, Input, Select, PageHeader, T, useT } from '../shared/UI';
import toast from 'react-hot-toast';
import API from '../../services/api';

const today = () => new Date().toISOString().slice(0,10);
const fmtDT = d => new Date(d).toLocaleString('en-PK',{dateStyle:'short',timeStyle:'short'});
const STATUS_COLOR = { confirmed: T.blue, pending: T.accent, seated: T.green, cancelled: T.red, no_show: T.textDim };

const isExpired = (res) => {
  if (!['confirmed','pending'].includes(res.status)) return false;
  const expiry = new Date(res.reserved_at).getTime() + (res.duration_min || 90) * 60000;
  return Date.now() > expiry;
};

// ─── API calls ────────────────────────────────────────────────────────────────
const getReservations  = (p)    => API.get('/reservations', { params: p });
const createReservation= (d)    => API.post('/reservations', d);
const updateReservation= (id,d) => API.patch(`/reservations/${id}`, d);
const getTables        = ()     => API.get('/tables');

// ─── Add/Edit Modal ───────────────────────────────────────────────────────────
const BLANK = { guest_name:'', guest_phone:'', guest_count:2, table_id:'', reserved_at:'', duration_min:90, notes:'' };

function ReservationModal({ open, onClose, onSaved, editRes, tables }) {
  const [form, setForm]     = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const isEdit = !!editRes;

  useEffect(() => {
    if (open) {
      if (editRes) {
        const dt = new Date(editRes.reserved_at);
        const local = new Date(dt.getTime() - dt.getTimezoneOffset()*60000).toISOString().slice(0,16);
        setForm({ ...BLANK, ...editRes, reserved_at: local });
      } else {
        const now = new Date();
        now.setMinutes(0,0,0);
        now.setHours(now.getHours()+1);
        const local = new Date(now.getTime() - now.getTimezoneOffset()*60000).toISOString().slice(0,16);
        setForm({ ...BLANK, reserved_at: local });
      }
    }
  }, [open, editRes]);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    if (!form.guest_name.trim()) return toast.error('Guest name required');
    if (!form.reserved_at)       return toast.error('Date & time required');
    setSaving(true);
    try {
      if (isEdit) {
        await updateReservation(editRes.id, form);
        toast.success('Reservation updated!');
      } else {
        await createReservation(form);
        toast.success('Reservation created!');
      }
      onSaved(); onClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Save failed'); }
    finally { setSaving(false); }
  };

  const availTables = tables.filter(t => t.status === 'vacant' || t.status === 'reserved' || (isEdit && t.id === editRes?.table_id));

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Reservation' : 'New Reservation'} width={480}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 14px' }}>
        <Input label="Guest Name *"  value={form.guest_name}  onChange={set('guest_name')}  placeholder="Ahmed Khan" />
        <Input label="Phone"         value={form.guest_phone} onChange={set('guest_phone')} placeholder="+92-300-0000000" />
        <Input label="Date & Time *" type="datetime-local" value={form.reserved_at} onChange={set('reserved_at')} />
        <Input label="Guest Count"   type="number" value={form.guest_count} onChange={set('guest_count')} min={1} max={50} />
        <Select label="Table (optional)" value={form.table_id} onChange={set('table_id')}>
          <option value="">— Assign Later —</option>
          {availTables.map(t => <option key={t.id} value={t.id}>{t.label} · {t.section} ({t.capacity} seats)</option>)}
        </Select>
        <Input label="Duration (min)" type="number" value={form.duration_min} onChange={set('duration_min')} />
      </div>
      <Input label="Notes" value={form.notes} onChange={set('notes')} placeholder="Occasion, special requests…" />
      <Btn onClick={handleSave} disabled={saving} style={{ width:'100%', marginTop:4 }}>
        {saving ? '⏳ Saving…' : isEdit ? '✓ Save Changes' : '✓ Create Reservation'}
      </Btn>
    </Modal>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Reservations() {
  useT();
  const [reservations, setReservations] = useState([]);
  const [tables,       setTables]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [modal,        setModal]        = useState(false);
  const [editRes,      setEditRes]      = useState(null);
  const [dateFilter,   setDateFilter]   = useState(today());
  const [statusFilter, setStatusFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { date: dateFilter };
      if (statusFilter !== 'all') params.status = statusFilter;
      const [resRes, tabRes] = await Promise.all([getReservations(params), getTables()]);
      setReservations(resRes.data);
      setTables(tabRes.data);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [dateFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleStatusChange = async (id, status) => {
    try { await updateReservation(id, { status }); toast.success(`Reservation ${status}`); load(); }
    catch { toast.error('Update failed'); }
  };

  const confirmed = reservations.filter(r => r.status === 'confirmed').length;
  const seated    = reservations.filter(r => r.status === 'seated').length;
  const pending   = reservations.filter(r => r.status === 'pending').length;

  // Group by hour
  const hours = [...new Set(reservations.map(r => new Date(r.reserved_at).getHours()))].sort((a,b)=>a-b);

  return (
    <div>
      <PageHeader
        title="📅 Reservations"
        subtitle={`${reservations.length} reservations · ${confirmed} confirmed · ${seated} seated`}
        action={<Btn onClick={() => { setEditRes(null); setModal(true); }}>+ New Reservation</Btn>}
      />

      {/* Filters */}
      <div style={{ display:'flex', gap:12, alignItems:'center', marginBottom:20, flexWrap:'wrap' }}>
        <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
          style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:10, padding:'8px 14px', color:T.text, fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none' }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:10, padding:'8px 14px', color:T.text, fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none' }}>
          <option value="all">All Statuses</option>
          {['pending','confirmed','seated','cancelled','no_show'].map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
        </select>

        {/* Quick day buttons */}
        {['Today','Tomorrow'].map((lbl, i) => {
          const d = new Date(); d.setDate(d.getDate()+i);
          const ds = d.toISOString().slice(0,10);
          return (
            <button key={lbl} onClick={() => setDateFilter(ds)} style={{ background: dateFilter===ds ? T.accent : T.card, color: dateFilter===ds ? '#000' : T.textMid, border:`1px solid ${dateFilter===ds ? T.accent : T.border}`, borderRadius:8, padding:'8px 14px', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>
              {lbl}
            </button>
          );
        })}

        {/* Summary pills */}
        {[[confirmed,'Confirmed',T.blue],[seated,'Seated',T.green],[pending,'Pending',T.accent]].map(([v,l,c]) => (
          <div key={l} style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:10, padding:'6px 14px', display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:c }} />
            <span style={{ fontSize:12, color:T.textMid }}>{l}</span>
            <span style={{ fontSize:16, fontWeight:800, color:c, fontFamily:'monospace' }}>{v}</span>
          </div>
        ))}
      </div>

      {loading ? <Spinner /> : reservations.length === 0 ? (
        <div style={{ textAlign:'center', padding:80, color:T.textDim }}>
          <div style={{ fontSize:48, marginBottom:12 }}>📅</div>
          <div style={{ fontSize:16, fontWeight:700, color:T.textMid }}>No reservations for {dateFilter}</div>
          <Btn onClick={() => { setEditRes(null); setModal(true); }} style={{ marginTop:16 }}>+ Add Reservation</Btn>
        </div>
      ) : (
        /* Timeline view */
        hours.map(hour => (
          <div key={hour} style={{ marginBottom:24 }}>
            <div style={{ fontSize:11, fontWeight:700, color:T.textMid, letterSpacing:1, textTransform:'uppercase', marginBottom:10 }}>
              🕐 {hour.toString().padStart(2,'0')}:00
            </div>
            {reservations
              .filter(r => new Date(r.reserved_at).getHours() === hour)
              .map(res => {
                const expired = isExpired(res);
                const borderColor = expired ? T.red : STATUS_COLOR[res.status];
                return (
                <div key={res.id} style={{
                  display:'flex', alignItems:'center', gap:14,
                  background: expired ? T.redDim : T.card,
                  border:`1px solid ${borderColor+'44'}`,
                  borderLeft:`3px solid ${borderColor}`,
                  borderRadius:12, padding:'12px 16px', marginBottom:8, cursor:'pointer',
                }} onClick={() => { setEditRes(res); setModal(true); }}>
                  {/* Time + expiry */}
                  <div style={{ textAlign:'center', flexShrink:0 }}>
                    <div style={{ fontFamily:'monospace', fontWeight:800, fontSize:16, color: expired ? T.red : T.accent }}>
                      {new Date(res.reserved_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                    </div>
                    <div style={{ fontSize:10, color:T.textDim }}>{res.duration_min}min</div>
                    {expired && <div style={{ fontSize:9, fontWeight:800, color:T.red, marginTop:2 }}>EXPIRED</div>}
                  </div>

                  {/* Guest info */}
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:14, color: expired ? T.red : T.text }}>{res.guest_name}</div>
                    <div style={{ fontSize:11, color:T.textMid, marginTop:2 }}>
                      👥 {res.guest_count} guests
                      {res.guest_phone ? ` · ${res.guest_phone}` : ''}
                      {res.table_label ? ` · ${res.table_label}` : ' · No table assigned'}
                    </div>
                    {res.notes && <div style={{ fontSize:11, color:T.textDim, marginTop:3 }}>📝 {res.notes}</div>}
                    {expired && <div style={{ fontSize:11, fontWeight:700, color:T.red, marginTop:3 }}>⚠️ Guest did not arrive — reservation expired</div>}
                  </div>

                  <Badge color={expired ? T.red : STATUS_COLOR[res.status]}>
                    {expired ? '❌ No Show' : res.status.replace('_',' ')}
                  </Badge>

                  {/* Quick actions */}
                  <div style={{ display:'flex', gap:6, flexDirection:'column' }} onClick={e => e.stopPropagation()}>
                    {!expired && res.status === 'confirmed' && (
                      <button onClick={() => handleStatusChange(res.id,'seated')} style={{ background:T.greenDim, color:T.green, border:`1px solid ${T.green}44`, borderRadius:7, padding:'4px 10px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>Seat</button>
                    )}
                    {!expired && ['confirmed','pending'].includes(res.status) && (
                      <button onClick={() => handleStatusChange(res.id,'cancelled')} style={{ background:T.redDim, color:T.red, border:`1px solid ${T.red}44`, borderRadius:7, padding:'4px 10px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>Cancel</button>
                    )}
                    {!expired && res.status === 'confirmed' && (
                      <button onClick={() => handleStatusChange(res.id,'no_show')} style={{ background:T.surface, color:T.textMid, border:`1px solid ${T.border}`, borderRadius:7, padding:'4px 10px', fontSize:11, cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>No-show</button>
                    )}
                    {expired && (
                      <button onClick={() => handleStatusChange(res.id,'no_show')} style={{ background:T.red, color:'#fff', border:'none', borderRadius:7, padding:'5px 12px', fontSize:11, fontWeight:800, cursor:'pointer', fontFamily:"'Inter',sans-serif", whiteSpace:'nowrap' }}>
                        Clear Reservation
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))
      )}

      <ReservationModal
        open={modal}
        onClose={() => { setModal(false); setEditRes(null); }}
        onSaved={load}
        editRes={editRes}
        tables={tables}
      />
    </div>
  );
}
