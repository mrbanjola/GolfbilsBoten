import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { join } from 'path';
import qrcode from 'qrcode-terminal';

/** @type {import('@whiskeysockets/baileys').WASocket|null} */
let sock = null;

/** @type {string|null} */
let groupId = null;

/** @type {((msg: Object) => void)|null} */
let messageHandler = null;

/**
 * Startar WhatsApp-boten med Baileys.
 * @param {Object} config
 * @param {string} config.dataDir
 * @param {string|null} config.groupId
 * @param {(msg: Object) => void} onMessage
 */
export async function startWhatsApp(config, onMessage) {
  groupId = config.groupId || null;
  messageHandler = onMessage;

  if (!groupId) {
    console.log('[Bot] Ingen WHATSAPP_GROUP_ID satt — loggar alla inkommande remoteJid för att hitta grupp-ID');
  }

  await connect(config.dataDir);
}

/**
 * Ansluter till WhatsApp. Återanropas automatiskt vid disconnect.
 * @param {string} dataDir
 */
async function connect(dataDir) {
  const authDir = join(dataDir, 'auth');
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['BegagnatMonitor', 'Chrome', '1.0.0'],
    syncFullHistory: false,    // undviker AwaitingInitialSync-limbo
    getMessage: async () => undefined, // krävs av Baileys internt
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n[Bot] Skanna QR-koden med WhatsApp (Inställningar → Länkade enheter → Länka en enhet):\n');
      console.log(`[Bot] QR: https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`);
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log('[Bot] Utloggad — ta bort data/auth/ och starta om för att länka igen');
      } else {
        console.log(`[Bot] Anslutning stängd (reason=${reason}), återansluter...`);
        setTimeout(() => connect(dataDir), 5000);
      }
    }

    if (connection === 'open') {
      console.log('[Bot] WhatsApp ansluten!');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      const remoteJid = msg.key.remoteJid;
      if (remoteJid !== groupId) continue;

      // I multi-device skickas egna telefonmeddelanden med fromMe=true till
      // boten som länkad enhet — ignorera bara rent bot-genererade meddelanden
      // (de saknar participant i grupper)
      const isRealBotMessage = msg.key.fromMe && !msg.key.participant;
      if (isRealBotMessage) continue;

      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        '';

      if (text && messageHandler) {
        messageHandler({ jid: remoteJid, text, msg });
      }
    }
  });
}

/**
 * Skickar ett textmeddelande till gruppen.
 * @param {string} text
 * @param {string[]} [mentions] - JID:s att tagga, t.ex. ["46701234567@s.whatsapp.net"]
 */
export async function sendMessage(text, mentions = []) {
  if (!sock || !groupId) {
    console.warn('[Bot] Kan inte skicka meddelande — sock eller groupId saknas');
    return;
  }
  try {
    // Lägg till @nummer i texten — krävs för att WhatsApp ska visa och notifiera taggen
    let finalText = text;
    if (mentions.length > 0) {
      const tags = mentions.map((jid) => `@${jid.split('@')[0]}`).join(' ');
      finalText = `${text}\n${tags}`;
    }
    await sock.sendMessage(groupId, { text: finalText, mentions });
  } catch (err) {
    console.error('[Bot] Fel vid skickande av meddelande:', err.message);
  }
}

/**
 * Skickar en bild + bildtext till gruppen.
 * @param {string} imageUrl
 * @param {string} caption
 */
export async function sendImage(imageUrl, caption) {
  if (!sock || !groupId) return;
  try {
    await sock.sendMessage(groupId, { image: { url: imageUrl }, caption });
  } catch (err) {
    console.error('[Bot] Fel vid skickande av bild:', err.message);
  }
}
