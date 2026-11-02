const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion, 
  Browsers 
} = require('@whiskeysockets/baileys');
const express = require('express');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

const app = express();
app.use(express.json());

let sock;

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
        console.log('\n=============================================');
        console.log('   SCAN THIS QR CODE IN WHATSAPP TO LINK     ');
        console.log('=============================================\n');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log(`Connection closed (Status: ${statusCode}). Reconnecting: ${shouldReconnect}`);
        
        if (shouldReconnect) {
          setTimeout(connectToWhatsApp, 5000); // 5 sec wait to prevent fast reconnection loop
        }
      } else if (connection === 'open') {
        console.log('\n✅ WhatsApp Gateway Connected & Ready to Send Messages!');
      }
    });

    sock.ev.on('creds.update', saveCreds);

  } catch (err) {
    console.error('Initialization Error:', err);
    setTimeout(connectToWhatsApp, 5000);
  }
}

connectToWhatsApp();

app.get('/', (req, res) => {
  res.send('WhatsApp Gateway is Running Online 24/7!');
});

app.post('/send-message', async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ error: 'Phone and message are required' });
    }

    if (!sock) {
      return res.status(503).json({ error: 'WhatsApp socket not ready yet' });
    }

    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('03')) {
      cleanPhone = '92' + cleanPhone.substring(1);
    }

    const jid = `${cleanPhone}@s.whatsapp.net`;

    await sock.sendMessage(jid, { text: message });
    console.log(`[Auto WhatsApp Sent] To: ${cleanPhone}`);
    return res.json({ success: true, status: 'Sent', to: cleanPhone });
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Gateway Server running on port ${PORT}`);
});