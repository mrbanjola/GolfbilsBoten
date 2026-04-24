import cron from 'node-cron';
import { getActiveWatches, getAiSettings, markInitialScanDone } from '../db/database.js';
import { BlocketAdapter } from '../adapters/blocket.js';
import { TraderaAdapter } from '../adapters/tradera.js';
import { KlaravikAdapter } from '../adapters/klaravik.js';
import { BlintoAdapter } from '../adapters/blinto.js';
import { filterAndMarkNew, markAllSeen } from './dedup.js';
import { applyAllFilters } from './filter.js';
import { filterListingsWithClaude } from '../ai/claude.js';

let notifyCallback = null;
let summaryCallback = null;
const adapters = new Map();
let lastTraderaPoll = 0;
let traderaPollIntervalMs = 30 * 60 * 1000;
let claudeApiKey = null;

export function startPollingEngine(config, onNewListing, onInitialScan) {
  notifyCallback = onNewListing;
  summaryCallback = onInitialScan ?? null;
  traderaPollIntervalMs = config.traderaPollIntervalMinutes * 60 * 1000;
  claudeApiKey = config.claudeApiKey ?? null;

  adapters.set('blocket', new BlocketAdapter(config.blocketApiBase, config.pollDelayMs));
  adapters.set('klaravik', new KlaravikAdapter(config.pollDelayMs));
  adapters.set('blinto', new BlintoAdapter(config.pollDelayMs));

  if (config.traderaAppId && config.traderaAppKey) {
    adapters.set('tradera', new TraderaAdapter(config.traderaAppId, config.traderaAppKey, config.pollDelayMs));
    console.log(`[Poller] Tradera aktiverad - pollar var ${config.traderaPollIntervalMinutes}:e minut`);
  } else {
    console.log('[Poller] Tradera ej konfigurerad (saknar TRADERA_APP_ID/KEY)');
  }

  const cronExpr = `*/${config.pollIntervalMinutes} * * * *`;
  console.log(`[Poller] Startar - Blocket var ${config.pollIntervalMinutes}:e minut`);

  cron.schedule(cronExpr, () => {
    runPollCycle({ manual: false }).catch((err) => console.error('[Poller] Ovantat fel i poll-cykel:', err));
  });
}

async function enrichListingsForAi(adapter, listings, batchSize) {
  const enriched = [];

  for (const listing of listings.slice(0, batchSize)) {
    try {
      enriched.push(await adapter.getListingDetails(listing));
    } catch (err) {
      console.warn(`[Poller] Kunde inte enrich:a listing ${listing.id}: ${err.message}`);
      enriched.push(listing);
    }
  }

  return enriched;
}

async function applyAiRelevanceFilter({ adapter, watch, listings, aiSettings }) {
  if (!aiSettings.enabled || listings.length === 0) {
    if (!aiSettings.enabled) {
      console.log(`[Claude] AI-filtrering avstangd for "${watch.query}"`);
    }
    return listings;
  }

  const batchSize = Math.max(1, aiSettings.batch_size || listings.length);
  const approved = [];

  for (let i = 0; i < listings.length; i += batchSize) {
    const chunk = listings.slice(i, i + batchSize);
    const enriched = await enrichListingsForAi(adapter, chunk, batchSize);

    try {
      const result = await filterListingsWithClaude({
        apiKey: claudeApiKey,
        aiSettings,
        watch,
        listings: enriched,
      });

      if (!result.skipped) {
        const rejected = enriched.length - result.approved.length;
        console.log(`[Claude] "${watch.query}" - godkande ${result.approved.length}/${enriched.length}, avslog ${rejected}`);
      }

      approved.push(...result.approved);
    } catch (err) {
      console.error(`[Claude] Fel vid AI-filtrering for "${watch.query}":`, err.message);
      approved.push(...chunk);
    }
  }

  return approved;
}

export async function runPollCycle({ manual = false } = {}) {
  const watches = getActiveWatches();
  if (watches.length === 0) return { totalNew: 0, manual };

  const aiSettings = getAiSettings();
  const now = Date.now();
  const pollTradera = manual || (now - lastTraderaPoll >= traderaPollIntervalMs);

  console.log(`[Poller] Kor poll-cykel - ${watches.length} aktiva bevakningar${pollTradera ? ' (inkl. Tradera)' : ''}`);
  console.log(`[Claude] Installningar - enabled=${aiSettings.enabled} model=${aiSettings.model} batch=${aiSettings.batch_size} timeout=${aiSettings.timeout_ms} apiKey=${claudeApiKey ? 'yes' : 'no'}`);
  let totalNew = 0;

  for (const watch of watches) {
    const platforms = watch.platforms.split(',').map((platform) => platform.trim());

    for (const platformName of platforms) {
      if (platformName === 'tradera' && !pollTradera) continue;

      const adapter = adapters.get(platformName);
      if (!adapter) {
        console.warn(`[Poller] Ingen adapter for plattform: ${platformName}`);
        continue;
      }

      try {
        const raw = await adapter.search(watch);
        const filtered = applyAllFilters(raw, watch);

        if (!watch.initial_scan_done) {
          markAllSeen(filtered, watch.id);
          markInitialScanDone(watch.id);
          console.log(`[Poller] Initial scan klar for bevakning #${watch.id} "${watch.query}" - ${filtered.length} annonser indexerade`);
          if (summaryCallback && filtered.length > 0) {
            await summaryCallback(filtered, watch);
          }
          continue;
        }

        const aiFiltered = await applyAiRelevanceFilter({
          adapter,
          watch,
          listings: filtered,
          aiSettings,
        });

        const newListings = filterAndMarkNew(aiFiltered, watch.id);
        console.log(`[Poller] "${watch.query}" (${platformName}): ${filtered.length} efter regler, ${aiFiltered.length} efter AI, ${newListings.length} nya`);
        totalNew += newListings.length;

        const maxPerBatch = 10;
        const toNotify = newListings.slice(0, maxPerBatch);
        if (newListings.length > maxPerBatch) {
          console.log(`[Poller] Begransar till ${maxPerBatch} notiser`);
        }
        if (notifyCallback && toNotify.length > 0) {
          await notifyCallback(toNotify, watch);
        }
      } catch (err) {
        console.error(`[Poller] Fel vid poll av "${watch.query}" pa ${platformName}:`, err.message);
      }
    }
  }

  if (pollTradera) lastTraderaPoll = now;

  if (totalNew > 0) {
    console.log(`[Poller] Cykel klar - ${totalNew} nya annonser totalt`);
  }
  return { totalNew, manual };
}
