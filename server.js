const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion, 
  Browsers 
} = require('@whiskeysockets/baileys');
const express = require('express');
const QRCode = require('qrcode');
const pino = require('pino');

const app = express();
app.use(express.json());

let sock;
let currentQR = null;
let isConnected = false;

async function connectToWhatsApp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'error' }),
      browser: Browsers.ubuntu('Chrome')
    });

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        currentQR = qr; // Save raw QR for browser display
        console.log('⚡ New QR code generated. Visit /qr in browser to scan.');
      }

      if (connection === 'close') {
        isConnected = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log(`Connection closed (${statusCode}). Reconnecting: ${shouldReconnect}`);
        if (shouldReconnect) {
          setTimeout(connectToWhatsApp, 5000);
        }
      } else if (connection === 'open') {
        isConnected = true;
        currentQR = null;
        console.log('✅ WhatsApp Gateway Connected & Ready!');
      }
    });

    sock.ev.on('creds.update', saveCreds);

  } catch (err) {
    console.error('Initialization Error:', err);
    setTimeout(connectToWhatsApp, 5000);
  }
}

connectToWhatsApp();

// WEB ROUTE: Open this link in any browser to scan QR clearly!
app.get('/qr', async (req, res) => {
  if (isConnected) {
    return res.send('<h2 style="font-family:sans-serif;color:green;text-align:center;margin-top:50px;">✅ WhatsApp is already Connected & Logged In!</h2>');
  }
  if (!currentQR) {
    return res.send('<h3 style="font-family:sans-serif;text-align:center;margin-top:50px;">⏳ QR code generating... please refresh page in 5 seconds.</h3><script>setTimeout(()=>location.reload(), 4000);</script>');
  }

  try {
    const qrImage = await QRCode.toDataURL(currentQR, { scale: 8 });
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Scan WhatsApp QR</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:90vh;font-family:sans-serif;background:#f0f2f5;">
          <div style="background:#fff;padding:25px;border-radius:12px;box-shadow:0 4px 15px rgba(0,0,0,0.1);text-align:center;">
            <h2 style="margin-top:0;">📲 Link WhatsApp</h2>
            <p style="color:#666;">Open WhatsApp > Linked Devices > Link a Device</p>
            <img src="${qrImage}" style="width:280px;height:280px;border:1px solid #ddd;border-radius:8px;" alt="QR Code" />
            <p style="font-size:12px;color:#999;margin-bottom:0;">Auto refreshes every 20s if expired</p>
          </div>
          <script>setTimeout(() => location.reload(), 20000);</script>
        </body>
      </html>
    `);
  } catch (e) {
    res.status(500).send('Error rendering QR image');
  }
});

app.get('/status', (req, res) => {
  res.json({ connected: isConnected });
});

app.post('/send-message', async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ error: 'Phone and message required' });
    }
    if (!isConnected || !sock) {
      return res.status(503).json({ error: 'WhatsApp not linked yet. Visit /qr to scan.' });
    }

    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('03')) {
      cleanPhone = '92' + cleanPhone.substring(1);
    }
    const jid = `${cleanPhone}@s.whatsapp.net`;

    await sock.sendMessage(jid, { text: message });
    return res.json({ success: true, status: 'Sent', to: cleanPhone });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Gateway Server running on port ${PORT}`);
});