import { mkdirSync } from 'fs';
import { config } from './config.js';
import { initDatabase, getAiSettings, getPortfolioAnalytics } from './db/database.js';
import { startServer } from './server.js';
import { startWhatsApp, sendMessage } from './bot/whatsapp.js';
import { handleMessage } from './bot/commands.js';
import { startPollingEngine, runPollCycle } from './polling/engine.js';
import { formatNewListing, formatNewListingsBatch, formatInitialScanSummary } from './bot/formatter.js';
import { analyzeListingForBot } from './ai/claude.js';

// ── Säkerställ att data-katalogen finns ────────────────────────────────────
mkdirSync(config.dataDir, { recursive: true });

// ── Databas ────────────────────────────────────────────────────────────────
initDatabase(config.dataDir);

// ── Express server (krävs för Render) ─────────────────────────────────────
startServer(config.port, {
  dataDir: config.dataDir,
  adminUser: config.adminUser,
  adminPass: config.adminPass,
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
    claudeApiKey: config.claudeApiKey,
    dataDir: config.dataDir,
  },
  async (listings, watch) => {
    // Köpbedömning per annons om API-nyckel finns
    if (process.env.CLAUDE_API_KEY && listings.length > 0) {
      const analytics = getPortfolioAnalytics();
      const settings = getAiSettings();
      const results = await Promise.allSettled(
        listings.map((l) =>
          analyzeListingForBot({
            apiKey: process.env.CLAUDE_API_KEY,
            model: settings.model,
            listing: {
              url: l.url,
              pageTitle: l.title,
              description: l.description,
              detailText: l.detailText,
              price: l.price,
              location: l.location,
            },
            profitHistory: analytics,
            botPrompt: settings.bot_analysis_prompt,
          })
        )
      );
      listings = listings.filter((l, i) => {
        const r = results[i];
        if (r.status !== 'fulfilled') return true; // API-fel → skicka ändå
        const { verdict, text } = r.value;
        if (verdict === 'nej') return false;
        l.claudeVerdict = verdict;
        l.claudeAnalysis = text;
        return true;
      });
    }

    if (listings.length === 0) return;
    if (listings.length === 1) {
      await sendMessage(formatNewListing(listings[0], watch), config.mentionJids);
    } else {
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
