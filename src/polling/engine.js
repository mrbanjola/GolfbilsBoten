import cron from 'node-cron';
import { getActiveWatches, getAiSettings, markInitialScanDone } from '../db/database.js';
import { BlocketAdapter } from '../adapters/blocket.js';
import { TraderaAdapter } from '../adapters/tradera.js';
import { KlaravikAdapter } from '../adapters/klaravik.js';
import { BlintoAdapter } from '../adapters/blinto.js';
import { AuctionetAdapter } from '../adapters/auctionet.js';
import { BudiAdapter } from '../adapters/budi.js';
import { JunoraAdapter } from '../adapters/junora.js';
import { FacebookAdapter } from '../adapters/facebook.js';
import { filterAndMarkNew, getUnseenListings, markAllSeen } from './dedup.js';
import { getEndingSoonUnnotified, markEndingSoonNotified } from '../db/database.js';
import { applyAllFilters } from './filter.js';
import { filterListingsWithClaude } from '../ai/claude.js';

let notifyCallback = null;
let summaryCallback = null;
const adapters = new Map();
let lastTraderaPoll = 0;
let traderaPollIntervalMs = 30 * 60 * 1000;
let lastFacebookPoll = 0;
const FACEBOOK_POLL_INTERVAL_MS = 30 * 60 * 1000;
let claudeApiKey = null;
const INITIAL_SCAN_AI_LIMIT = 20;
const AUCTION_PLATFORMS = new Set(['klaravik', 'blinto', 'auctionet', 'budi', 'junora']);
const ENDING_SOON_MS = 60 * 60 * 1000;

function getEndingSoonListings(listings) {
  const now = Date.now();
  return listings.filter((l) => {
    if (!l.auctionEnd) return false;
    const end = new Date(l.auctionEnd).getTime();
    return end > now && (end - now) <= ENDING_SOON_MS;
  });
}

export function startPollingEngine(config, onNewListing, onInitialScan) {
  notifyCallback = onNewListing;
  summaryCallback = onInitialScan ?? null;
  traderaPollIntervalMs = config.traderaPollIntervalMinutes * 60 * 1000;
  claudeApiKey = config.claudeApiKey ?? null;

  adapters.set('blocket', new BlocketAdapter(config.blocketApiBase, config.pollDelayMs));
  adapters.set('klaravik', new KlaravikAdapter(config.pollDelayMs));
  adapters.set('blinto', new BlintoAdapter(config.pollDelayMs));
  adapters.set('auctionet', new AuctionetAdapter(config.pollDelayMs));
  adapters.set('budi', new BudiAdapter(config.pollDelayMs));
  adapters.set('junora', new JunoraAdapter(config.pollDelayMs));
  adapters.set('facebook', new FacebookAdapter(config.claudeApiKey, config.dataDir, config.pollDelayMs));

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

        const decisionMap = new Map(result.decisions.map((decision) => [decision.id, decision]));
        for (const listing of enriched) {
          const decision = decisionMap.get(listing.id);
          const priceLabel = listing.price != null ? `${listing.price} ${listing.currency ?? 'SEK'}` : 'okant pris';
          if (decision?.keep) {
            console.log(
              `[Claude][Keep] "${watch.query}" - ${listing.id} - ${listing.title} - ${priceLabel} - ${decision.reasonCode}` +
              `${decision.note ? ` - ${decision.note}` : ''}`
            );
            continue;
          }
          if (!decision) continue;
          console.log(
            `[Claude][Reject] "${watch.query}" - ${listing.id} - ${listing.title} - ${priceLabel} - ${decision.reasonCode}` +
            `${decision.note ? ` - ${decision.note}` : ''}`
          );
        }
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
  const pollFacebook = manual || (now - lastFacebookPoll >= FACEBOOK_POLL_INTERVAL_MS);

  console.log(`[Poller] Kor poll-cykel - ${watches.length} aktiva bevakningar${pollTradera ? ' (inkl. Tradera)' : ''}`);
  console.log(`[Claude] Installningar - enabled=${aiSettings.enabled} model=${aiSettings.model} batch=${aiSettings.batch_size} timeout=${aiSettings.timeout_ms} apiKey=${claudeApiKey ? 'yes' : 'no'}`);
  let totalNew = 0;

  for (const watch of watches) {
    const platforms = watch.platforms.split(',').map((platform) => platform.trim());

    for (const platformName of platforms) {
      if (platformName === 'tradera' && !pollTradera) continue;
      if (platformName === 'facebook' && !pollFacebook) continue;

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
          const initialAiCandidates = filtered.slice(0, INITIAL_SCAN_AI_LIMIT);
          const initialApproved = await applyAiRelevanceFilter({
            adapter,
            watch,
            listings: initialAiCandidates,
            aiSettings,
          });

          console.log(
            `[Poller] Initial scan klar for bevakning #${watch.id} "${watch.query}" - ` +
            `${filtered.length} annonser indexerade, ${initialAiCandidates.length} granskade av AI, ${initialApproved.length} godkanda`
          );
          if (summaryCallback && initialApproved.length > 0) {
            await summaryCallback(initialApproved, watch);
          }
          continue;
        }

        if (AUCTION_PLATFORMS.has(platformName)) {
          // Auktionsplattform: tysta nykomna auktioner, notifiera bara när < 1h kvar
          const newUnseen = getUnseenListings(filtered);
          if (newUnseen.length > 0) markAllSeen(newUnseen, watch.id);

          const endingSoon = getEndingSoonListings(filtered);
          const unnotified = getEndingSoonUnnotified(endingSoon);
          console.log(`[Poller] "${watch.query}" (${platformName}): ${filtered.length} aktiva, ${endingSoon.length} slutar inom 1h, ${unnotified.length} ej notifierade`);

          if (unnotified.length > 0) {
            const aiFiltered = await applyAiRelevanceFilter({ adapter, watch, listings: unnotified, aiSettings });
            markEndingSoonNotified(unnotified, watch.id);
            totalNew += aiFiltered.length;
            const toNotify = aiFiltered.slice(0, 10);
            if (notifyCallback && toNotify.length > 0) await notifyCallback(toNotify, watch);
          }
        } else {
          const unseen = getUnseenListings(filtered);
          const aiFiltered = await applyAiRelevanceFilter({
            adapter,
            watch,
            listings: unseen,
            aiSettings,
          });

          const approvedIds = new Set(aiFiltered.map((listing) => listing.id));
          const rejectedUnseen = unseen.filter((listing) => !approvedIds.has(listing.id));
          if (rejectedUnseen.length > 0) {
            markAllSeen(rejectedUnseen, watch.id);
          }

          const newListings = filterAndMarkNew(aiFiltered, watch.id);
          console.log(`[Poller] "${watch.query}" (${platformName}): ${filtered.length} efter regler, ${unseen.length} osedda, ${aiFiltered.length} efter AI, ${rejectedUnseen.length} avvisade/markerade, ${newListings.length} nya`);
          totalNew += newListings.length;

          const toNotify = newListings.slice(0, 10);
          if (newListings.length > 10) console.log(`[Poller] Begransar till 10 notiser`);
          if (notifyCallback && toNotify.length > 0) await notifyCallback(toNotify, watch);
        }
      } catch (err) {
        console.error(`[Poller] Fel vid poll av "${watch.query}" pa ${platformName}:`, err.message);
      }
    }
  }

  if (pollTradera) lastTraderaPoll = now;
  if (pollFacebook) lastFacebookPoll = now;

  if (totalNew > 0) {
    console.log(`[Poller] Cykel klar - ${totalNew} nya annonser totalt`);
  }
  return { totalNew, manual };
}
