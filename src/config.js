import 'dotenv/config';
import { resolve } from 'path';

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  groupId: process.env.WHATSAPP_GROUP_ID || null,
  pollIntervalMinutes: parseInt(process.env.POLL_INTERVAL_MINUTES ?? '3', 10),
  pollDelayMs: parseInt(process.env.POLL_DELAY_MS ?? '1000', 10),
  blocketApiBase: process.env.BLOCKET_API_BASE ?? 'https://blocket-api.se/v1',
  dataDir: resolve(process.env.DATA_DIR ?? './data'),
  traderaAppId: process.env.TRADERA_APP_ID || null,
  traderaAppKey: process.env.TRADERA_APP_KEY || null,
  traderaPollIntervalMinutes: parseInt(process.env.TRADERA_POLL_INTERVAL_MINUTES ?? '30', 10),
  claudeApiKey: process.env.CLAUDE_API_KEY || null,
  // Kommaseparerade nummer att tagga i notiser, t.ex. "46701234567,46709876543"
  mentionJids: (process.env.MENTION_JIDS ?? '')
    .split(',')
    .map(n => n.trim())
    .filter(Boolean)
    .map(n => `${n}@s.whatsapp.net`),
};
