import { mkdirSync } from 'fs';
import { config } from './config.js';
import { initDatabase } from './db/database.js';
import { startServer } from './server.js';
import { startWhatsApp, sendMessage } from './bot/whatsapp.js';
import { handleMessage } from './bot/commands.js';
import { startPollingEngine, runPollCycle } from './polling/engine.js';
import { formatNewListing, formatNewListingsBatch, formatInitialScanSummary } from './bot/formatter.js';

// ── Säkerställ att data-katalogen finns ────────────────────────────────────
mkdirSync(config.dataDir, { recursive: true });

// ── Databas ────────────────────────────────────────────────────────────────
initDatabase(config.dataDir);

// ── Express server (krävs för Render) ─────────────────────────────────────
startServer(config.port, {
  dataDir: config.dataDir,
  onManualSearch: () => runPollCycle({ manual: true }),
});

// ── WhatsApp bot ───────────────────────────────────────────────────────────
await startWhatsApp(
  { dataDir: config.dataDir, groupId: config.groupId },
  handleMessage
);

// ── Polling engine ─────────────────────────────────────────────────────────
startPollingEngine(
  {
    blocketApiBase: config.blocketApiBase,
    pollDelayMs: config.pollDelayMs,
    pollIntervalMinutes: config.pollIntervalMinutes,
    traderaAppId: config.traderaAppId,
    traderaAppKey: config.traderaAppKey,
    traderaPollIntervalMinutes: config.traderaPollIntervalMinutes,
    claudeApiKey: config.claudeApiKey,
    dataDir: config.dataDir,
  },
  async (listings, watch) => {
    if (listings.length === 1) {
      await sendMessage(formatNewListing(listings[0], watch), config.mentionJids);
    } else {
      // Flera träffar — samlat meddelande
      await sendMessage(formatNewListingsBatch(listings, watch), config.mentionJids);
    }
  },
  async (listings, watch) => {
    const result = formatInitialScanSummary(listings, watch);

    // Hantera chunkat svar (>20 träffar)
    if (result.startsWith('{"__chunked":true')) {
      const { header, lines, chunkSize } = JSON.parse(result);
      for (let i = 0; i < lines.length; i += chunkSize) {
        const chunk = lines.slice(i, i + chunkSize);
        const isFirst = i === 0;
        await sendMessage((isFirst ? header + '\n' : '') + chunk.join('\n\n'));
        if (i + chunkSize < lines.length) await new Promise(r => setTimeout(r, 3000));
      }
    } else {
      await sendMessage(result);
    }
  }
);

console.log('[App] Begagnat Monitor igång!');
