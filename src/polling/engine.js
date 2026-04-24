import cron from 'node-cron';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
import { getActiveWatches, markInitialScanDone } from '../db/database.js';
import { BlocketAdapter } from '../adapters/blocket.js';
import { TraderaAdapter } from '../adapters/tradera.js';
import { KlaravikAdapter } from '../adapters/klaravik.js';
import { BlintoAdapter } from '../adapters/blinto.js';
import { filterAndMarkNew, markAllSeen } from './dedup.js';
import { applyAllFilters } from './filter.js';

/** @type {((listing: import('../adapters/base.js').ListingResult, watch: Object) => void)|null} */
let notifyCallback = null;

/** @type {((listings: import('../adapters/base.js').ListingResult[], watch: Object) => void)|null} */
let summaryCallback = null;

/** @type {Map<string, import('../adapters/base.js').BaseAdapter>} */
const adapters = new Map();

/** Håller reda på när Tradera senast pollades (för att respektera längre intervall) */
let lastTraderaPoll = 0;
let traderaPollIntervalMs = 30 * 60 * 1000;

/**
 * Initierar polling engine med adapters och konfiguration.
 * @param {Object} config
 * @param {string} config.blocketApiBase
 * @param {number} config.pollDelayMs
 * @param {number} config.pollIntervalMinutes
 * @param {string|null} config.traderaAppId
 * @param {string|null} config.traderaAppKey
 * @param {number} config.traderaPollIntervalMinutes
 * @param {(listing: Object, watch: Object) => void} onNewListing
 * @param {(listings: Object[], watch: Object) => void} onInitialScan
 */
export function startPollingEngine(config, onNewListing, onInitialScan) {
  notifyCallback = onNewListing;
  summaryCallback = onInitialScan ?? null;
  traderaPollIntervalMs = config.traderaPollIntervalMinutes * 60 * 1000;

  adapters.set('blocket', new BlocketAdapter(config.blocketApiBase, config.pollDelayMs));
  adapters.set('klaravik', new KlaravikAdapter(config.pollDelayMs));
  adapters.set('blinto', new BlintoAdapter(config.pollDelayMs));

  if (config.traderaAppId && config.traderaAppKey) {
    adapters.set('tradera', new TraderaAdapter(config.traderaAppId, config.traderaAppKey, config.pollDelayMs));
    console.log(`[Poller] Tradera aktiverad — pollar var ${config.traderaPollIntervalMinutes}:e minut`);
  } else {
    console.log('[Poller] Tradera ej konfigurerad (saknar TRADERA_APP_ID/KEY)');
  }

  const cronExpr = `*/${config.pollIntervalMinutes} * * * *`;
  console.log(`[Poller] Startar — Blocket var ${config.pollIntervalMinutes}:e minut`);

  cron.schedule(cronExpr, () => {
    runPollCycle({ manual: false }).catch((err) => console.error('[Poller] Oväntat fel i poll-cykel:', err));
  });
}

/**
 * Kör en komplett poll-cykel för alla aktiva bevakningar.
 * @param {{ manual?: boolean }} options
 */
export async function runPollCycle({ manual = false } = {}) {
  const watches = getActiveWatches();
  if (watches.length === 0) return { totalNew: 0, manual };

  const now = Date.now();
  const pollTradera = manual || (now - lastTraderaPoll >= traderaPollIntervalMs);

  console.log(`[Poller] Kör poll-cykel — ${watches.length} aktiva bevakningar${pollTradera ? ' (inkl. Tradera)' : ''}`);
  let totalNew = 0;

  for (const watch of watches) {
    const platforms = watch.platforms.split(',').map((p) => p.trim());

    for (const platformName of platforms) {
      if (platformName === 'tradera' && !pollTradera) continue;

      const adapter = adapters.get(platformName);
      if (!adapter) {
        console.warn(`[Poller] Ingen adapter för plattform: ${platformName}`);
        continue;
      }

      try {
        const raw = await adapter.search(watch);
        const listings = applyAllFilters(raw, watch);

        if (!watch.initial_scan_done) {
          markAllSeen(listings, watch.id);
          markInitialScanDone(watch.id);
          console.log(`[Poller] Initial scan klar för bevakning #${watch.id} "${watch.query}" — ${listings.length} annonser indexerade`);
          if (summaryCallback && listings.length > 0) {
            await summaryCallback(listings, watch);
          }
        } else {
          const newListings = filterAndMarkNew(listings, watch.id);
          console.log(`[Poller] "${watch.query}" (${platformName}): ${listings.length} hämtade, ${newListings.length} nya`);
          totalNew += newListings.length;

          const MAX_PER_BATCH = 10;
          const toNotify = newListings.slice(0, MAX_PER_BATCH);
          if (newListings.length > MAX_PER_BATCH) {
            console.log(`[Poller] Begränsar till ${MAX_PER_BATCH} notiser`);
          }
          if (notifyCallback && toNotify.length > 0) {
            await notifyCallback(toNotify, watch);
          }
        }
      } catch (err) {
        console.error(`[Poller] Fel vid poll av "${watch.query}" på ${platformName}:`, err.message);
      }
    }
  }

  if (pollTradera) lastTraderaPoll = now;

  if (totalNew > 0) {
    console.log(`[Poller] Cykel klar — ${totalNew} nya annonser totalt`);
  }
  return { totalNew, manual };
}
