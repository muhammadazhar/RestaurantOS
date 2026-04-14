import React, { useEffect, useState, useCallback } from 'react';
import { getSystemHealth, listBackups, createBackup, downloadBackup, deleteBackup, getSystemConfig, saveSystemConfig, testSmtpEmail } from '../../services/api';
import { Card, Btn, Badge, Spinner, PageHeader, T, useT } from '../shared/UI';
import toast from 'react-hot-toast';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtBytes = (b) => {
  if (!b) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let v = b;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
};

const fmtUptime = (s) => {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(s % 60)}s`;
};

const fmtDate = (d) => new Date(d).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' });

// ─── Stat row in info card ────────────────────────────────────────────────────
const InfoRow = ({ label, value, accent }) => {
  useT();
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '9px 0', borderBottom: `1px solid ${T.border}`,
    }}>
      <span style={{ fontSize: 12, color: T.textMid, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: accent || T.text, fontFamily: 'monospace' }}>{value}</span>
    </div>
  );
};

// ─── Usage bar ────────────────────────────────────────────────────────────────
const UsageBar = ({ percent, color }) => {
  useT();
  const c = percent > 85 ? T.red : percent > 65 ? '#f39c12' : (color || T.green);
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{
        height: 8, borderRadius: 4,
        background: T.surface, border: `1px solid ${T.border}`, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${percent}%`,
          background: c, borderRadius: 4,
          transition: 'width 0.6s ease',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 11, color: T.textDim }}>0%</span>
        <span style={{ fontSize: 11, color: c, fontWeight: 700 }}>{percent}% used</span>
        <span style={{ fontSize: 11, color: T.textDim }}>100%</span>
      </div>
    </div>
  );
};

// ─── Section title ────────────────────────────────────────────────────────────
const SectionTitle = ({ icon, title }) => {
  useT();
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: T.textMid, letterSpacing: 1,
      textTransform: 'uppercase', marginBottom: 12,
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <span>{icon}</span>{title}
    </div>
  );
};

// ─── System Health Tab ────────────────────────────────────────────────────────
function HealthTab() {
  useT();
  const [health,    setHealth]    = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshed, setRefreshed] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    getSystemHealth()
      .then(r => { setHealth(r.data); setRefreshed(new Date()); })
      .catch(() => toast.error('Failed to load health data'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (!health) return null;

  const dbOk = health.database?.status === 'connected';
  const overallOk = health.status === 'healthy';

  return (
    <div>
      {/* Overall status banner */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: overallOk ? T.greenDim : T.redDim,
        border: `1px solid ${overallOk ? T.green : T.red}44`,
        borderRadius: 12, padding: '14px 20px', marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 28 }}>{overallOk ? '✅' : '⚠️'}</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: overallOk ? T.green : T.red }}>
              System {overallOk ? 'Healthy' : 'Degraded'}
            </div>
            <div style={{ fontSize: 12, color: T.textMid, marginTop: 2 }}>
              Uptime: {fmtUptime(health.uptime)}
              {refreshed && ` · Refreshed ${fmtDate(refreshed)}`}
            </div>
          </div>
        </div>
        <Btn onClick={load} size="sm" variant="ghost">↻ Refresh</Btn>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Memory */}
        <Card>
          <SectionTitle icon="🧠" title="Memory" />
          <UsageBar percent={health.memory.usedPercent} />
          <div style={{ marginTop: 12 }}>
            <InfoRow label="Total RAM"  value={fmtBytes(health.memory.total)} />
            <InfoRow label="Used"       value={fmtBytes(health.memory.used)}
              accent={health.memory.usedPercent > 85 ? T.red : health.memory.usedPercent > 65 ? '#f39c12' : T.green} />
            <InfoRow label="Free"       value={fmtBytes(health.memory.free)} />
          </div>
        </Card>

        {/* CPU */}
        <Card>
          <SectionTitle icon="⚡" title="CPU" />
          <div style={{
            background: T.surface, borderRadius: 10, padding: '14px 16px',
            marginBottom: 12, textAlign: 'center',
          }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: T.accent, fontFamily: 'monospace' }}>
              {health.cpu.cores}
            </div>
            <div style={{ fontSize: 11, color: T.textMid, marginTop: 2 }}>CPU Cores</div>
          </div>
          <InfoRow label="Model"    value={health.cpu.model.length > 28 ? health.cpu.model.slice(0, 28) + '…' : health.cpu.model} />
          <InfoRow label="Load Avg" value={health.cpu.loadAvg?.join(' / ') || '—'} />
          <InfoRow label="Platform" value={`${health.platform} / ${health.arch}`} />
        </Card>

        {/* Database */}
        <Card>
          <SectionTitle icon="🗄" title="Database" />
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: dbOk ? T.greenDim : T.redDim,
            border: `1px solid ${dbOk ? T.green : T.red}44`,
            borderRadius: 10, padding: '10px 14px', marginBottom: 12,
          }}>
            <span style={{ fontSize: 20 }}>{dbOk ? '🟢' : '🔴'}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: dbOk ? T.green : T.red }}>
                {dbOk ? 'Connected' : 'Disconnected'}
              </div>
              {health.database?.error && (
                <div style={{ fontSize: 11, color: T.red, marginTop: 2 }}>{health.database.error}</div>
              )}
            </div>
          </div>
          <InfoRow label="Engine"  value={health.database.version || '—'} />
          <InfoRow label="Latency" value={health.database.latency != null ? `${health.database.latency} ms` : '—'}
            accent={health.database.latency > 100 ? T.red : health.database.latency > 50 ? '#f39c12' : T.green} />
          <InfoRow label="Server Time" value={health.database.serverTime ? fmtDate(health.database.serverTime) : '—'} />
        </Card>

        {/* Server info */}
        <Card>
          <SectionTitle icon="🖥" title="Server" />
          <InfoRow label="Hostname"     value={health.hostname} />
          <InfoRow label="Node.js"      value={health.nodeVersion} />
          <InfoRow label="OS"           value={`${health.platform} ${health.arch}`} />
          <InfoRow label="Uptime"       value={fmtUptime(health.uptime)} accent={T.accent} />
          <InfoRow label="Backups"      value={`${health.backups?.count || 0} files · ${fmtBytes(health.backups?.size || 0)}`} />
        </Card>
      </div>
    </div>
  );
}

// ─── DB Backup Tab ────────────────────────────────────────────────────────────
function BackupTab() {
  useT();
  const [backups,   setBackups]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [creating,  setCreating]  = useState(false);
  const [deleting,  setDeleting]  = useState(null);
  const [downloading, setDownloading] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    listBackups()
      .then(r => setBackups(r.data))
      .catch(() => toast.error('Failed to load backups'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    toast.loading('Creating backup… this may take a moment', { id: 'backup' });
    try {
      const res = await createBackup();
      toast.success(`Backup created: ${res.data.filename} (${fmtBytes(res.data.size)})`, { id: 'backup', duration: 5000 });
      load();
    } catch (err) {
      const msg = err.response?.data?.error || 'Backup failed';
      toast.error(msg, { id: 'backup', duration: 8000 });
    } finally { setCreating(false); }
  };

  const handleDownload = async (filename) => {
    setDownloading(filename);
    try {
      const res = await downloadBackup(filename);
      const url  = URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url; link.download = filename;
      document.body.appendChild(link); link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Download started');
    } catch { toast.error('Download failed'); }
    finally { setDownloading(null); }
  };

  const handleDelete = async (filename) => {
    if (!window.confirm(`Delete backup "${filename}"? This cannot be undone.`)) return;
    setDeleting(filename);
    try {
      await deleteBackup(filename);
      toast.success('Backup deleted');
      setBackups(prev => prev.filter(b => b.name !== filename));
    } catch { toast.error('Delete failed'); }
    finally { setDeleting(null); }
  };

  return (
    <div>
      {/* Info + action header */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: T.text, marginBottom: 6 }}>
              🗄 PostgreSQL Database Backup
            </div>
            <div style={{ fontSize: 13, color: T.textMid, lineHeight: 1.6 }}>
              Creates a full SQL dump of the database using <code style={{ background: T.surface, padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>pg_dump</code>
              . Backups are saved to disk on the server. Download to keep an off-site copy.
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: T.textDim, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>💡</span>
              <span>Requires <strong>pg_dump</strong> to be installed and in your system PATH.</span>
            </div>
          </div>
          <Btn
            onClick={handleCreate}
            disabled={creating}
            style={{ whiteSpace: 'nowrap', flexShrink: 0, minWidth: 160 }}
          >
            {creating ? '⏳ Creating…' : '+ Create Backup'}
          </Btn>
        </div>
      </Card>

      {/* Backup list */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 110px 160px 180px',
          gap: 8, padding: '10px 20px',
          background: T.surface,
          fontSize: 10, color: T.textMid, fontWeight: 700,
          letterSpacing: 0.8, textTransform: 'uppercase',
          borderBottom: `1px solid ${T.border}`,
        }}>
          <span>Filename</span>
          <span style={{ textAlign: 'right' }}>Size</span>
          <span style={{ textAlign: 'center' }}>Created</span>
          <span style={{ textAlign: 'right' }}>Actions</span>
        </div>

        {loading && <Spinner />}

        {!loading && backups.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: T.textDim }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>💾</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.textMid, marginBottom: 6 }}>No backups yet</div>
            <div style={{ fontSize: 13 }}>Click "Create Backup" to make your first database backup.</div>
          </div>
        )}

        {!loading && backups.map((b, idx) => (
          <div key={b.name} style={{
            display: 'grid',
            gridTemplateColumns: '1fr 110px 160px 180px',
            gap: 8, padding: '13px 20px',
            alignItems: 'center',
            borderBottom: idx < backups.length - 1 ? `1px solid ${T.border}` : 'none',
            transition: 'background 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = T.surface}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            {/* Filename */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>💾</span>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 600, color: T.text,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  fontFamily: 'monospace',
                }}>
                  {b.name}
                </div>
              </div>
            </div>

            {/* Size */}
            <div style={{ textAlign: 'right', fontSize: 13, fontFamily: 'monospace', color: T.textMid }}>
              {fmtBytes(b.size)}
            </div>

            {/* Date */}
            <div style={{ textAlign: 'center', fontSize: 12, color: T.textMid }}>
              {fmtDate(b.createdAt)}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => handleDownload(b.name)}
                disabled={downloading === b.name}
                style={{
                  background: T.accentGlow, color: T.accent,
                  border: `1px solid ${T.accent}44`,
                  borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700,
                  cursor: downloading === b.name ? 'not-allowed' : 'pointer',
                  fontFamily: "'Inter', sans-serif", opacity: downloading === b.name ? 0.6 : 1,
                }}
              >
                {downloading === b.name ? '⏳' : '⬇ Download'}
              </button>
              <button
                onClick={() => handleDelete(b.name)}
                disabled={deleting === b.name}
                style={{
                  background: T.redDim, color: T.red,
                  border: `1px solid ${T.red}44`,
                  borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 700,
                  cursor: deleting === b.name ? 'not-allowed' : 'pointer',
                  fontFamily: "'Inter', sans-serif", opacity: deleting === b.name ? 0.6 : 1,
                }}
              >
                {deleting === b.name ? '…' : '🗑'}
              </button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ─── Email Config Tab ─────────────────────────────────────────────────────────
function EmailConfigTab() {
  useT();
  const EMPTY = { 'smtp.host': '', 'smtp.port': '587', 'smtp.secure': 'false', 'smtp.user': '', 'smtp.pass': '', 'smtp.from': '', 'app.admin_email': '', 'smtp.reject_unauthorized': 'false' };
  const [form,       setForm]      = useState(EMPTY);
  const [loading,    setLoading]   = useState(true);
  const [saving,     setSaving]    = useState(false);
  const [testing,    setTesting]   = useState(false);
  const [testTo,     setTestTo]    = useState('');
  const [testResult, setTestResult] = useState(null); // { ok, messageId, via, sentTo, error, code }
  const [saveOk,     setSaveOk]    = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getSystemConfig();
      setForm(f => ({ ...f, ...r.data }));
    } catch { toast.error('Failed to load config'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const f = (k, v) => { setForm(p => ({ ...p, [k]: v })); setSaveOk(false); };

  const handleSave = async () => {
    setSaving(true); setSaveOk(false);
    try {
      await saveSystemConfig(form);
      setSaveOk(true);
      setTestResult(null);
      toast.success('SMTP config saved');
    } catch (e) { toast.error(e.response?.data?.error || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleTest = async () => {
    if (!testTo.trim()) return toast.error('Enter a recipient email');
    setTesting(true); setTestResult(null);
    try {
      const r = await testSmtpEmail(testTo.trim());
      setTestResult({ ok: true, ...r.data });
    } catch (e) {
      const err = e.response?.data || {};
      setTestResult({ ok: false, error: err.error || e.message, code: err.code, hint: err.hint, resolvedIP: err.resolvedIP });
    }
    finally { setTesting(false); }
  };

  if (loading) return <Spinner />;

  const inp = (key, placeholder, type = 'text') => (
    <input
      type={type} value={form[key]} onChange={e => f(key, e.target.value)}
      placeholder={placeholder}
      style={{ width: '100%', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '9px 12px', color: T.text, fontSize: 13, fontFamily: "'Inter', sans-serif", outline: 'none', boxSizing: 'border-box' }}
    />
  );

  return (
    <div style={{ maxWidth: 620 }}>
      <Card style={{ padding: 24, marginBottom: 16 }}>
        <SectionTitle icon="📧" title="SMTP / Email Configuration" />
        <p style={{ fontSize: 13, color: T.textMid, marginBottom: 20, marginTop: -4 }}>
          Settings are stored in the database and override .env variables.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.textMid, display: 'block', marginBottom: 4 }}>SMTP Host</label>
            {inp('smtp.host', 'smtp.gmail.com')}
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.textMid, display: 'block', marginBottom: 4 }}>Port</label>
            {inp('smtp.port', '587')}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: T.textMid, display: 'block', marginBottom: 4 }}>SMTP Username</label>
          {inp('smtp.user', 'user@gmail.com')}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: T.textMid, display: 'block', marginBottom: 4 }}>
            SMTP Password
            {form['smtp.pass'] === '••••••••' && (
              <span style={{ marginLeft: 8, fontSize: 10, color: T.textDim }}>(saved — leave unchanged to keep current)</span>
            )}
          </label>
          {inp('smtp.pass', 'Enter password to update…', 'password')}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.textMid, display: 'block', marginBottom: 4 }}>From Address</label>
            {inp('smtp.from', 'noreply@yourapp.com')}
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.textMid, display: 'block', marginBottom: 4 }}>Admin Notification Email</label>
            {inp('app.admin_email', 'admin@yourapp.com')}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.textMid, display: 'block', marginBottom: 4 }}>Connection Security</label>
            <select
              value={form['smtp.secure']}
              onChange={e => {
                const val = e.target.value;
                f('smtp.secure', val);
                if (val === 'true'  && form['smtp.port'] === '587') f('smtp.port', '465');
                if (val === 'false' && form['smtp.port'] === '465') f('smtp.port', '587');
              }}
              style={{ width: '100%', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '9px 12px', color: T.text, fontSize: 13, fontFamily: "'Inter', sans-serif", outline: 'none' }}
            >
              <option value="false">STARTTLS — port 587 (C# EnableSsl=true)</option>
              <option value="true">SSL / Implicit TLS — port 465</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.textMid, display: 'block', marginBottom: 4 }}>Certificate Verification</label>
            <select
              value={form['smtp.reject_unauthorized']}
              onChange={e => f('smtp.reject_unauthorized', e.target.value)}
              style={{ width: '100%', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '9px 12px', color: T.text, fontSize: 13, fontFamily: "'Inter', sans-serif", outline: 'none' }}
            >
              <option value="false">Accept all certificates (recommended for custom SMTP)</option>
              <option value="true">Strict — reject self-signed certs</option>
            </select>
          </div>
        </div>
        <div style={{ background: T.accentGlow, border: `1px solid ${T.accent}33`, borderRadius: 8, padding: '8px 12px', fontSize: 11, color: T.textMid, marginBottom: 20 }}>
          💡 <b>C# mapping:</b> <code style={{ background: T.border, borderRadius: 3, padding: '1px 5px' }}>EnableSsl=true</code> on port 587 = <b>STARTTLS</b> here. Set Certificate to <b>Accept all</b> for netcorecloud and similar providers.
        </div>

        <Btn onClick={handleSave} disabled={saving} style={{ width: '100%' }}>
          {saving ? '⏳ Saving…' : saveOk ? '✅ Saved!' : '✓ Save SMTP Config'}
        </Btn>
      </Card>

      <Card style={{ padding: 24 }}>
        <SectionTitle icon="🧪" title="Send Test Email" />
        <p style={{ fontSize: 12, color: T.textMid, marginTop: -8, marginBottom: 14 }}>
          Sends a test email using the saved SMTP config above. Save first if you made changes.
        </p>
        <div style={{ display: 'flex', gap: 10, marginBottom: testResult ? 14 : 0 }}>
          <input
            value={testTo} onChange={e => { setTestTo(e.target.value); setTestResult(null); }}
            placeholder="recipient@example.com"
            onKeyDown={e => e.key === 'Enter' && handleTest()}
            style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '9px 12px', color: T.text, fontSize: 13, fontFamily: "'Inter', sans-serif", outline: 'none' }}
          />
          <Btn onClick={handleTest} disabled={testing}>
            {testing ? '⏳ Sending…' : '📤 Send Test'}
          </Btn>
        </div>

        {/* Persistent result block */}
        {testResult && (
          <div style={{
            borderRadius: 10, padding: '12px 16px',
            background: testResult.ok ? T.greenDim : T.redDim,
            border: `1px solid ${testResult.ok ? T.green : T.red}44`,
          }}>
            {testResult.ok ? (
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.green, marginBottom: 6 }}>
                  ✅ Email sent successfully
                </div>
                <div style={{ fontSize: 12, color: T.textMid, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span>To: <b style={{ color: T.text }}>{testResult.sentTo}</b></span>
                  <span>Via: <b style={{ color: T.text, fontFamily: 'monospace' }}>{testResult.via}</b></span>
                  {testResult.messageId && (
                    <span>Message-ID: <span style={{ color: T.textDim, fontFamily: 'monospace', fontSize: 11 }}>{testResult.messageId}</span></span>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.red, marginBottom: 8 }}>
                  ❌ {testResult.code === 'ETCP' ? 'Network unreachable' : testResult.code === 'EDNS' ? 'DNS lookup failed' : 'Failed to send email'}
                </div>
                <div style={{ fontSize: 12, color: T.text, fontFamily: 'monospace', wordBreak: 'break-word', marginBottom: 6 }}>
                  {testResult.error}
                </div>
                {testResult.resolvedIP && (
                  <div style={{ fontSize: 11, color: T.textDim, marginBottom: 4 }}>
                    Host resolved to: <span style={{ fontFamily: 'monospace' }}>{testResult.resolvedIP}</span>
                  </div>
                )}
                {testResult.code && (
                  <div style={{ fontSize: 11, color: T.textDim, marginBottom: 6 }}>Error code: {testResult.code}</div>
                )}
                {testResult.hint && (
                  <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 12, color: T.textMid, lineHeight: 1.5 }}>
                    💡 {testResult.hint}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Main SystemPanel page ────────────────────────────────────────────────────
export default function SystemPanel() {
  useT();
  const [tab, setTab] = useState('health');

  const tabs = [
    { id: 'health', icon: '❤️', label: 'System Health' },
    { id: 'backup', icon: '💾', label: 'DB Backup' },
    { id: 'email',  icon: '📧', label: 'Email / SMTP' },
  ];

  return (
    <div>
      <PageHeader
        title="🖥 System"
        subtitle="Monitor server health and manage database backups"
      />

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, borderBottom: `1px solid ${T.border}`, paddingBottom: 0 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: 'none', border: 'none',
            color: tab === t.id ? T.accent : T.textMid,
            fontWeight: tab === t.id ? 800 : 500, fontSize: 13,
            padding: '10px 18px', cursor: 'pointer',
            borderBottom: tab === t.id ? `2px solid ${T.accent}` : '2px solid transparent',
            marginBottom: -1, fontFamily: "'Inter', sans-serif",
            transition: 'all 0.15s',
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'health' && <HealthTab />}
      {tab === 'backup' && <BackupTab />}
      {tab === 'email'  && <EmailConfigTab />}
    </div>
  );
}
