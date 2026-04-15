/**
 * Unified email sender — supports SMTP (nodemailer) and API providers.
 * Provider is read from system_config key 'email.provider':
 *   'smtp'     — classic SMTP via nodemailer (may be blocked by hosting)
 *   'resend'   — Resend API (https://resend.com) — port 443, never blocked
 *   'mailgun'  — Mailgun API
 *   'sendgrid' — SendGrid API
 */
const https = require('https');

// Simple HTTPS POST helper
const httpsPost = (hostname, path, headers, body) => new Promise((resolve, reject) => {
  const data = JSON.stringify(body);
  const req = https.request(
    { hostname, path, method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
    (res) => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    }
  );
  req.on('error', reject);
  req.write(data);
  req.end();
});

exports.sendEmail = async (to, subject, html) => {
  const { getConfig } = require('./config');

  const provider = (await getConfig('email.provider', 'EMAIL_PROVIDER')) || 'smtp';
  const from     = await getConfig('smtp.from', 'SMTP_FROM');
  const fromAddr = from || 'noreply@restaurantos.app';

  // ── Resend ─────────────────────────────────────────────────────────────────
  if (provider === 'resend') {
    const apiKey = await getConfig('email.api_key', 'RESEND_API_KEY');
    if (!apiKey) throw new Error('Resend API key not configured (email.api_key)');
    const r = await httpsPost('api.resend.com', '/emails',
      { Authorization: `Bearer ${apiKey}` },
      { from: fromAddr, to: Array.isArray(to) ? to : [to], subject, html }
    );
    if (r.status >= 400) throw new Error(`Resend error ${r.status}: ${JSON.stringify(r.body)}`);
    return { provider: 'resend', id: r.body.id };
  }

  // ── Mailgun ────────────────────────────────────────────────────────────────
  if (provider === 'mailgun') {
    const apiKey  = await getConfig('email.api_key',  'MAILGUN_API_KEY');
    const domain  = await getConfig('email.mg_domain','MAILGUN_DOMAIN');
    if (!apiKey || !domain) throw new Error('Mailgun API key and domain required');
    const auth = Buffer.from(`api:${apiKey}`).toString('base64');
    // Mailgun uses form-data, so use raw https with urlencoded
    const params = new URLSearchParams({ from: fromAddr, to, subject, html }).toString();
    const r = await new Promise((resolve, reject) => {
      const req = https.request(
        { hostname: 'api.mailgun.net', path: `/v3/${domain}/messages`, method: 'POST',
          headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(params) } },
        (res) => { let d = ''; res.on('data', c => { d += c; }); res.on('end', () => resolve({ status: res.statusCode, body: d })); }
      );
      req.on('error', reject); req.write(params); req.end();
    });
    if (r.status >= 400) throw new Error(`Mailgun error ${r.status}: ${r.body}`);
    return { provider: 'mailgun' };
  }

  // ── SendGrid ───────────────────────────────────────────────────────────────
  if (provider === 'sendgrid') {
    const apiKey = await getConfig('email.api_key', 'SENDGRID_API_KEY');
    if (!apiKey) throw new Error('SendGrid API key not configured');
    const r = await httpsPost('api.sendgrid.com', '/v3/mail/send',
      { Authorization: `Bearer ${apiKey}` },
      { personalizations: [{ to: [{ email: to }] }], from: { email: fromAddr }, subject, content: [{ type: 'text/html', value: html }] }
    );
    if (r.status >= 400) throw new Error(`SendGrid error ${r.status}: ${JSON.stringify(r.body)}`);
    return { provider: 'sendgrid' };
  }

  // ── SMTP (nodemailer) ──────────────────────────────────────────────────────
  const nodemailer = require('nodemailer');
  const [host, port, secure, user, pass, rejectUnauth] = await Promise.all([
    getConfig('smtp.host',              'SMTP_HOST'),
    getConfig('smtp.port',              'SMTP_PORT'),
    getConfig('smtp.secure',            'SMTP_SECURE'),
    getConfig('smtp.user',              'SMTP_USER'),
    getConfig('smtp.pass',              'SMTP_PASS'),
    getConfig('smtp.reject_unauthorized','SMTP_REJECT_UNAUTHORIZED'),
  ]);
  if (!host || !user || !pass) throw new Error('SMTP not configured');
  const isSSL = secure === 'true';
  const transport = nodemailer.createTransport({
    host, port: parseInt(port) || 587, secure: isSSL, requireTLS: !isSSL,
    connectionTimeout: 15000, greetingTimeout: 15000, family: 4,
    auth: { user, pass },
    tls: { rejectUnauthorized: rejectUnauth === 'true' },
  });
  const info = await transport.sendMail({ from: fromAddr, to, subject, html });
  return { provider: 'smtp', messageId: info.messageId };
};
