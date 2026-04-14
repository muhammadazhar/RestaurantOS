const https = require('https');

/**
 * Send a WhatsApp message via Meta Cloud API.
 * config: { phone_number_id, access_token }
 */
exports.sendWhatsApp = (to, message, config) => {
  return new Promise((resolve, reject) => {
    const { phone_number_id, access_token } = config || {};
    if (!phone_number_id || !access_token) return resolve({ skipped: true });

    const body = JSON.stringify({
      messaging_product: 'whatsapp',
      to: String(to).replace(/\D/g, ''),
      type: 'text',
      text: { body: message },
    });

    const options = {
      hostname: 'graph.facebook.com',
      path: `/v20.0/${phone_number_id}/messages`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
};
