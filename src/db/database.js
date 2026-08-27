import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {DatabaseSync} */
let db;

const DEFAULT_AI_SETTINGS = Object.freeze({
  enabled: false,
  model: 'claude-sonnet-4-20250514',
  system_prompt: [
    'You are a strict relevance filter for used-marketplace listings.',
    'Your task is to decide whether each listing is genuinely relevant to the provided watch.',
    'Use only the evidence in the payload.',
    'Reject weak, ambiguous, accessory-only, spare-part, wanted, service, rental, or unrelated matches unless the payload clearly indicates they are relevant.',
    'Return valid JSON only.',
  ].join(' '),
  global_rules: [
    'Reject accessories, spare parts, and manuals when the watch appears to target a full item or vehicle.',
    'Reject wanted ads, requests, and searches for sellers unless the watch explicitly targets those.',
    'Reject category collisions caused by broad keywords if the title/description show a different product type.',
  ].join('\n'),
  timeout_ms: 15000,
  batch_size: 8,
  bot_analysis_prompt: '',
});

/**
 * Initierar SQLite-databasen och skapar tabeller om de inte finns.
 * @param {string} dataDir - Sökväg till data-katalogen
 */
export function initDatabase(dataDir) {
  const dbPath = join(dataDir, 'begagnat.db');
  db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  runMigrations();

  console.log('[DB] Databas initierad:', dbPath);
  return db;
}

/**
 * Idempotent migrering — lägger till kolumner som saknas.
 */
function runMigrations() {
  const watchesCols = db.prepare("PRAGMA table_info(watches)").all().map(r => r.name);
  const watchesMigrations = [
    { col: 'location',      sql: 'ALTER TABLE watches ADD COLUMN location TEXT' },
    { col: 'ad_type',       sql: "ALTER TABLE watches ADD COLUMN ad_type TEXT DEFAULT 'all'" },
    { col: 'exclude_words', sql: 'ALTER TABLE watches ADD COLUMN exclude_words TEXT' },
    { col: 'sort_order',    sql: "ALTER TABLE watches ADD COLUMN sort_order TEXT DEFAULT 'PUBLISHED_DESC'" },
    { col: 'is_car',        sql: 'ALTER TABLE watches ADD COLUMN is_car INTEGER DEFAULT 0' },
    { col: 'paused',        sql: 'ALTER TABLE watches ADD COLUMN paused INTEGER DEFAULT 0' },
    { col: 'category',      sql: 'ALTER TABLE watches ADD COLUMN category TEXT' },
  ];
  for (const { col, sql } of watchesMigrations) {
    if (!watchesCols.includes(col)) {
      db.exec(sql);
      console.log(`[DB] Migration: lade till kolumn "watches.${col}"`);
    }
  }

  const seenAdsCols = db.prepare("PRAGMA table_info(seen_ads)").all().map(r => r.name);
  const seenAdsMigrations = [
    { col: 'ending_soon_notified', sql: 'ALTER TABLE seen_ads ADD COLUMN ending_soon_notified INTEGER DEFAULT 0' },
    { col: 'notified', sql: 'ALTER TABLE seen_ads ADD COLUMN notified INTEGER DEFAULT 0' },
    { col: 'image_url', sql: 'ALTER TABLE seen_ads ADD COLUMN image_url TEXT' },
    { col: 'condition', sql: 'ALTER TABLE seen_ads ADD COLUMN condition TEXT' },
    { col: 'tags', sql: 'ALTER TABLE seen_ads ADD COLUMN tags TEXT' },
    { col: 'claude_verdict', sql: 'ALTER TABLE seen_ads ADD COLUMN claude_verdict TEXT' },
    { col: 'claude_analysis', sql: 'ALTER TABLE seen_ads ADD COLUMN claude_analysis TEXT' },
  ];
  for (const { col, sql } of seenAdsMigrations) {
    if (!seenAdsCols.includes(col)) {
      db.exec(sql);
      console.log(`[DB] Migration: lade till kolumn "seen_ads.${col}"`);
    }
  }

  const portfolioCols = db.prepare("PRAGMA table_info(portfolio)").all().map(r => r.name);
  const portfolioMigrations = [
    { col: 'notes',      sql: 'ALTER TABLE portfolio ADD COLUMN notes TEXT' },
    { col: 'bundle_id',  sql: 'ALTER TABLE portfolio ADD COLUMN bundle_id INTEGER REFERENCES portfolio_bundles(id)' },
    { col: 'category',   sql: 'ALTER TABLE portfolio ADD COLUMN category TEXT' },
    { col: 'condition',  sql: 'ALTER TABLE portfolio ADD COLUMN condition TEXT' },
  ];
  for (const { col, sql } of portfolioMigrations) {
    if (!portfolioCols.includes(col)) {
      db.exec(sql);
      console.log(`[DB] Migration: lade till kolumn "portfolio.${col}"`);
    }
  }

  const tagsCols = db.prepare("PRAGMA table_info(tags)").all().map(r => r.name);
  const tagsMigrations = [
    { col: 'type',       sql: "ALTER TABLE tags ADD COLUMN type TEXT NOT NULL DEFAULT 'detail'" },
    { col: 'guidelines', sql: 'ALTER TABLE tags ADD COLUMN guidelines TEXT' },
  ];
  for (const { col, sql } of tagsMigrations) {
    if (!tagsCols.includes(col)) {
      db.exec(sql);
      console.log(`[DB] Migration: lade till kolumn "tags.${col}"`);
    }
  }

  // Migrera no_start/untested från portfolio_tags → portfolio.condition
  db.exec(`UPDATE portfolio SET condition = 'no_start' WHERE id IN (SELECT portfolio_id FROM portfolio_tags WHERE tag = 'no_start') AND condition IS NULL`);
  db.exec(`UPDATE portfolio SET condition = 'untested' WHERE id IN (SELECT portfolio_id FROM portfolio_tags WHERE tag = 'untested') AND condition IS NULL`);
  db.exec(`DELETE FROM portfolio_tags WHERE tag IN ('no_start', 'untested')`);
  db.exec(`DELETE FROM tags WHERE data_name IN ('no_start', 'untested') AND (type IS NULL OR type = 'detail')`);

  seedDefaultSettings();
  seedDefaultTags();
  seedDefaultConditions();
}

const DEFAULT_TAGS = [
  { data_name: 'bad_batteries',    label: 'Dåliga batterier' },
  { data_name: 'broken_propeller', label: 'Trasig propeller' },
  { data_name: 'missing_parts',    label: 'Saknas delar' },
  { data_name: 'flat_tire',        label: 'Punktering' },
  { data_name: 'as_is',            label: 'Säljs i befintligt skick' },
];

const DEFAULT_CONDITIONS = [
  { data_name: 'working',    label: 'Fullt fungerande', guidelines: 'Annonsen nämner inga fel eller brister. Objektet beskrivs som fungerande.' },
  { data_name: 'has_issues', label: 'Har brister',      guidelines: 'Annonsen nämner brister eller defekter men objektet startar/fungerar trots det.' },
  { data_name: 'no_start',   label: 'Startar ej',       guidelines: 'Annonsen säger uttryckligen att objektet inte startar, inte fungerar eller är trasigt.' },
  { data_name: 'untested',   label: 'Ej testad',        guidelines: 'Annonsen anger att objektet inte är testat eller att säljaren är osäker på skick.' },
];

function seedDefaultTags() {
  const insert = db.prepare("INSERT OR IGNORE INTO tags (data_name, label, type) VALUES (?, ?, 'detail')");
  for (const { data_name, label } of DEFAULT_TAGS) {
    insert.run(data_name, label);
  }
}

function seedDefaultConditions() {
  const insert = db.prepare("INSERT OR IGNORE INTO tags (data_name, label, type, guidelines) VALUES (?, ?, 'condition', ?)");
  for (const { data_name, label, guidelines } of DEFAULT_CONDITIONS) {
    insert.run(data_name, label, guidelines);
  }
}

function seedDefaultSettings() {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))'
  );
  for (const [key, value] of Object.entries(DEFAULT_AI_SETTINGS)) {
    insert.run(key, serializeSettingValue(value));
  }
}

// ── Watches ────────────────────────────────────────────────────────────────

/**
 * Hämtar alla aktiva bevakningar.
 * @returns {Object[]}
 */
export function getActiveWatches() {
  return db.prepare('SELECT * FROM watches WHERE active = 1 AND (paused IS NULL OR paused = 0)').all();
}

/**
 * Hämtar alla aktiva bevakningar för visning (numrerad lista).
 * @returns {Object[]}
 */
export function getWatchesList() {
  return db.prepare('SELECT * FROM watches WHERE active = 1 ORDER BY id ASC').all();
}

/**
 * Lägger till en ny bevakning.
 * @param {string} query
 * @param {number|null} maxPrice
 * @param {number|null} minPrice
 * @param {string} platforms
 * @returns {number} ID för den nya bevakningen
 */
export function addWatch(query, maxPrice = null, minPrice = null, platforms = 'blocket') {
  const stmt = db.prepare(
    'INSERT INTO watches (query, max_price, min_price, platforms, is_car) VALUES (?, ?, ?, ?, 0)'
  );
  const result = stmt.run(query, maxPrice, minPrice, platforms);
  return Number(result.lastInsertRowid);
}

/**
 * Soft-deletar en bevakning (sätter active = 0).
 * @param {number} id
 * @returns {boolean} true om något uppdaterades
 */
export function removeWatch(id) {
  const result = db.prepare('UPDATE watches SET active = 0 WHERE id = ? AND active = 1').run(id);
  return result.changes > 0;
}

/**
 * Hämtar en specifik bevakning med index (1-baserat) från aktiva bevakningar.
 * @param {number} index - 1-baserat index
 * @returns {Object|null}
 */
export function getWatchByIndex(index) {
  const watches = getWatchesList();
  return watches[index - 1] ?? null;
}

/**
 * Uppdaterar ett fält på en bevakning.
 * @param {number} id
 * @param {'location'|'ad_type'|'exclude_words'|'sort_order'|'max_price'|'min_price'} field
 * @param {string|number|null} value
 */
export function updateWatch(id, field, value) {
  const allowed = ['query', 'location', 'ad_type', 'exclude_words', 'sort_order', 'max_price', 'min_price', 'platforms', 'is_car', 'paused', 'category'];
  if (!allowed.includes(field)) throw new Error(`Otillåtet fält: ${field}`);
  db.prepare(`UPDATE watches SET ${field} = ? WHERE id = ?`).run(value, id);
}

/**
 * Markerar att initial scan är klar för en bevakning.
 * @param {number} id
 */
export function markInitialScanDone(id) {
  db.prepare('UPDATE watches SET initial_scan_done = 1 WHERE id = ?').run(id);
}

// ── Seen ads ───────────────────────────────────────────────────────────────

/**
 * Kontrollerar om en annons redan är sedd.
 * @param {string} adId
 * @param {string} platform
 * @returns {boolean}
 */
export function isAdSeen(adId, platform) {
  const row = db.prepare('SELECT 1 FROM seen_ads WHERE id = ? AND platform = ?').get(adId, platform);
  return !!row;
}

/**
 * Markerar en annons som sedd.
 * @param {string} adId
 * @param {string} platform
 * @param {number} watchId
 * @param {string} title
 * @param {number|null} price
 * @param {string} url
 * @param {string|null} imageUrl
 */
export function markAdSeen(adId, platform, watchId, title, price, url, imageUrl = null) {
  db.prepare(
    'INSERT OR IGNORE INTO seen_ads (id, platform, watch_id, title, price, url, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(adId, platform, watchId, title ?? null, price ?? null, url ?? null, imageUrl ?? null);
}

/**
 * Returnerar de listings vars auktion slutar snart och som inte fått ending-soon-notis.
 * @param {Object[]} listings
 * @returns {Object[]}
 */
export function getEndingSoonUnnotified(listings) {
  if (listings.length === 0) return [];
  return listings.filter((listing) => {
    const row = db.prepare(
      'SELECT ending_soon_notified FROM seen_ads WHERE id = ? AND platform = ?'
    ).get(listing.id, listing.platform);
    return !row || row.ending_soon_notified === 0;
  });
}

/**
 * Markerar listings som notifierade för "slutar snart" (upsert).
 * @param {Object[]} listings
 * @param {number} watchId
 */
export function markEndingSoonNotified(listings, watchId) {
  const stmt = db.prepare(
    'INSERT INTO seen_ads (id, platform, watch_id, title, price, url, ending_soon_notified) VALUES (?, ?, ?, ?, ?, ?, 1) ' +
    'ON CONFLICT(id, platform) DO UPDATE SET ending_soon_notified = 1'
  );
  for (const listing of listings) {
    stmt.run(listing.id, listing.platform, watchId, listing.title ?? null, listing.price ?? null, listing.url ?? null);
  }
}

export function markNotified(listings) {
  const stmt = db.prepare(
    'UPDATE seen_ads SET notified = 1, condition = ?, tags = ? WHERE id = ? AND platform = ?'
  );
  for (const listing of listings) {
    const tagsJson = listing.tags?.length ? JSON.stringify(listing.tags) : null;
    stmt.run(listing.condition ?? null, tagsJson, listing.id, listing.platform);
  }
}

export function saveListingAnalysis(id, platform, verdict, analysis) {
  db.prepare('UPDATE seen_ads SET claude_verdict = ?, claude_analysis = ? WHERE id = ? AND platform = ?')
    .run(verdict, analysis ?? null, id, platform);
}

export function getStats() {
  const total = db.prepare('SELECT COUNT(*) as n FROM seen_ads').get().n;

  const today = db.prepare(
    "SELECT COUNT(*) as n FROM seen_ads WHERE date(first_seen_at) = date('now')"
  ).get().n;

  const perPlatform = db.prepare(
    'SELECT platform, COUNT(*) as count, ROUND(AVG(price)) as avg_price FROM seen_ads GROUP BY platform ORDER BY count DESC'
  ).all();

  const perDay = db.prepare(
    "SELECT date(first_seen_at) as day, COUNT(*) as count FROM seen_ads WHERE first_seen_at >= datetime('now', '-30 days') GROUP BY day ORDER BY day ASC"
  ).all();

  const perWatch = db.prepare(
    'SELECT w.query, COUNT(s.id) as count FROM seen_ads s JOIN watches w ON s.watch_id = w.id GROUP BY s.watch_id ORDER BY count DESC LIMIT 10'
  ).all();

  const recent = db.prepare(
    'SELECT s.id, s.platform, s.title, s.price, s.url, s.image_url, s.condition, s.tags, s.claude_verdict, s.claude_analysis, s.first_seen_at, w.query as watch_query FROM seen_ads s LEFT JOIN watches w ON s.watch_id = w.id WHERE s.notified = 1 ORDER BY s.first_seen_at DESC LIMIT 30'
  ).all();

  return { total, today, perPlatform, perDay, perWatch, recent };
}

// ── Portfolio ──────────────────────────────────────────────────────────────

// Auctions

const AUCTION_REVIEW_STATES = new Set(['unreviewed', 'interesting', 'ignored']);

/**
 * Normaliserar plattformarnas olika sluttidsformat till UTC ISO 8601.
 * Tider utan offset (Blinto) tolkas som svensk lokal tid.
 */
function normalizeAuctionEnd(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const localMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (localMatch) {
    const [, year, month, day, hour, minute, second = '0'] = localMatch;
    const targetAsUtc = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Stockholm',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    });
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(targetAsUtc)).map((part) => [part.type, part.value])
    );
    const stockholmAsUtc = Date.UTC(
      +parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second
    );
    return new Date(targetAsUtc - (stockholmAsUtc - targetAsUtc)).toISOString();
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Skapar eller uppdaterar auktioner från en lyckad bevakningssökning.
 * review_state ändras aldrig av pollingen.
 */
export function upsertAuctions(listings, watch) {
  if (!listings.length) return { created: 0, updated: 0 };

  const existsStmt = db.prepare(
    'SELECT 1 FROM auction_items WHERE platform = ? AND external_id = ?'
  );
  const upsertItem = db.prepare(`
    INSERT INTO auction_items (
      platform, external_id, title, subtitle, current_price, currency, bid_count,
      auction_end, location, url, image_url, no_reserve, reserve_met, auction_status,
      ended_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(platform, external_id) DO UPDATE SET
      title = excluded.title,
      subtitle = excluded.subtitle,
      current_price = excluded.current_price,
      currency = excluded.currency,
      bid_count = excluded.bid_count,
      auction_end = excluded.auction_end,
      location = excluded.location,
      url = excluded.url,
      image_url = COALESCE(excluded.image_url, auction_items.image_url),
      no_reserve = excluded.no_reserve,
      reserve_met = excluded.reserve_met,
      auction_status = excluded.auction_status,
      last_seen_at = datetime('now'),
      updated_at = datetime('now'),
      ended_at = excluded.ended_at
  `);
  const upsertMatch = db.prepare(`
    INSERT INTO auction_matches (platform, external_id, watch_id, category)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(platform, external_id, watch_id) DO UPDATE SET
      category = excluded.category,
      last_matched_at = datetime('now')
  `);

  let created = 0;
  let updated = 0;
  db.exec('BEGIN');
  try {
    for (const listing of listings) {
      const platform = String(listing.platform ?? '').trim();
      const externalId = String(listing.id ?? '').trim();
      if (!platform || !externalId || !listing.title || !listing.url) continue;

      const existed = !!existsStmt.get(platform, externalId);
      const auctionEnd = normalizeAuctionEnd(listing.auctionEnd);
      const ended = Boolean(listing.ended) || (auctionEnd ? Date.parse(auctionEnd) <= Date.now() : false);
      upsertItem.run(
        platform,
        externalId,
        String(listing.title),
        listing.subtitle ? String(listing.subtitle) : null,
        Number.isFinite(listing.price) ? Math.round(listing.price) : null,
        listing.currency ? String(listing.currency) : 'SEK',
        Number.isFinite(listing.bidCount) ? Math.max(0, Math.round(listing.bidCount)) : 0,
        auctionEnd,
        listing.location ? String(listing.location) : null,
        String(listing.url),
        listing.imageUrl ? String(listing.imageUrl) : null,
        listing.noReserve ? 1 : 0,
        listing.reserveMet ? 1 : 0,
        ended ? 'ended' : 'active',
        ended ? new Date().toISOString() : null,
      );
      upsertMatch.run(platform, externalId, Number(watch.id), watch.category || 'uncategorized');
      if (existed) updated++;
      else created++;
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { created, updated };
}

/** Markerar auktioner vars sluttid passerat som avslutade. */
export function expireAuctions() {
  const result = db.prepare(`
    UPDATE auction_items
    SET auction_status = 'ended', ended_at = COALESCE(ended_at, datetime('now')), updated_at = datetime('now')
    WHERE auction_status = 'active'
      AND auction_end IS NOT NULL
      AND julianday(auction_end) <= julianday('now')
  `).run();
  return Number(result.changes);
}

function auctionWhereClause(filters = {}) {
  const clauses = [];
  const values = [];
  const status = filters.status || 'active';
  if (status !== 'all') {
    clauses.push('ai.auction_status = ?');
    values.push(status);
  }

  const review = filters.review || 'visible';
  if (review === 'visible') clauses.push("ai.review_state != 'ignored'");
  else if (AUCTION_REVIEW_STATES.has(review)) {
    clauses.push('ai.review_state = ?');
    values.push(review);
  }

  if (filters.platform) {
    clauses.push('ai.platform = ?');
    values.push(filters.platform);
  }
  if (filters.category) {
    clauses.push(`EXISTS (
      SELECT 1 FROM auction_matches am_filter
      WHERE am_filter.platform = ai.platform
        AND am_filter.external_id = ai.external_id
        AND am_filter.category = ?
    )`);
    values.push(filters.category);
  }
  if (filters.q) {
    clauses.push('(ai.title LIKE ? OR ai.subtitle LIKE ? OR ai.location LIKE ?)');
    const pattern = `%${filters.q}%`;
    values.push(pattern, pattern, pattern);
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', values };
}

/** Hämtar filtrerade och sorterade auktioner. */
export function getAuctions(filters = {}) {
  expireAuctions();
  const { sql: whereSql, values } = auctionWhereClause(filters);
  const sortOptions = {
    end_asc: '(ai.auction_end IS NULL) ASC, ai.auction_end ASC',
    end_desc: '(ai.auction_end IS NULL) ASC, ai.auction_end DESC',
    price_asc: '(ai.current_price IS NULL) ASC, ai.current_price ASC',
    price_desc: '(ai.current_price IS NULL) ASC, ai.current_price DESC',
    newest: 'ai.first_seen_at DESC',
    interesting: "(ai.review_state = 'interesting') DESC, (ai.auction_end IS NULL) ASC, ai.auction_end ASC",
  };
  const orderBy = sortOptions[filters.sort] || sortOptions.end_asc;
  const limit = Math.min(Math.max(Number(filters.limit) || 100, 1), 250);
  const offset = Math.max(Number(filters.offset) || 0, 0);

  const items = db.prepare(`
    SELECT ai.*,
      GROUP_CONCAT(DISTINCT COALESCE(am.category, 'uncategorized')) AS category_list,
      GROUP_CONCAT(DISTINCT w.query) AS watch_query_list
    FROM auction_items ai
    LEFT JOIN auction_matches am
      ON am.platform = ai.platform AND am.external_id = ai.external_id
    LEFT JOIN watches w ON w.id = am.watch_id
    ${whereSql}
    GROUP BY ai.platform, ai.external_id
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...values, limit, offset);

  const total = db.prepare(`SELECT COUNT(*) AS count FROM auction_items ai ${whereSql}`)
    .get(...values).count;

  return {
    items: items.map((item) => ({
      ...item,
      categories: item.category_list ? item.category_list.split(',') : ['uncategorized'],
      watch_queries: item.watch_query_list ? item.watch_query_list.split(',') : [],
      category_list: undefined,
      watch_query_list: undefined,
    })),
    total: Number(total),
    limit,
    offset,
  };
}

/** Summering för auktionsdashboarden. Ignorerade räknas separat men inte i utbudet. */
export function getAuctionSummary() {
  expireAuctions();
  const totals = db.prepare(`
    SELECT
      SUM(CASE WHEN auction_status = 'active' AND review_state != 'ignored' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN auction_status = 'active' AND review_state = 'interesting' THEN 1 ELSE 0 END) AS interesting,
      SUM(CASE WHEN auction_status = 'active' AND review_state = 'ignored' THEN 1 ELSE 0 END) AS ignored,
      SUM(CASE WHEN auction_status = 'active' AND review_state != 'ignored'
        AND auction_end IS NOT NULL AND julianday(auction_end) <= julianday('now', '+1 hour') THEN 1 ELSE 0 END) AS ending_1h,
      SUM(CASE WHEN auction_status = 'active' AND review_state != 'ignored'
        AND auction_end IS NOT NULL AND julianday(auction_end) <= julianday('now', '+6 hours') THEN 1 ELSE 0 END) AS ending_6h,
      SUM(CASE WHEN auction_status = 'active' AND review_state != 'ignored'
        AND auction_end IS NOT NULL AND julianday(auction_end) <= julianday('now', '+24 hours') THEN 1 ELSE 0 END) AS ending_24h,
      MAX(last_seen_at) AS last_updated_at
    FROM auction_items
  `).get();

  const byCategory = db.prepare(`
    SELECT am.category,
      COUNT(DISTINCT ai.platform || ':' || ai.external_id) AS count,
      ROUND(AVG(ai.current_price)) AS avg_price
    FROM auction_items ai
    JOIN auction_matches am
      ON am.platform = ai.platform AND am.external_id = ai.external_id
    WHERE ai.auction_status = 'active' AND ai.review_state != 'ignored'
    GROUP BY am.category
    ORDER BY count DESC, am.category ASC
  `).all();

  const byPlatform = db.prepare(`
    SELECT platform, COUNT(*) AS count
    FROM auction_items
    WHERE auction_status = 'active' AND review_state != 'ignored'
    GROUP BY platform
    ORDER BY count DESC, platform ASC
  `).all();

  return {
    active: Number(totals.active ?? 0),
    interesting: Number(totals.interesting ?? 0),
    ignored: Number(totals.ignored ?? 0),
    ending_1h: Number(totals.ending_1h ?? 0),
    ending_6h: Number(totals.ending_6h ?? 0),
    ending_24h: Number(totals.ending_24h ?? 0),
    last_updated_at: totals.last_updated_at ?? null,
    byCategory: byCategory.map((row) => ({
      ...row,
      count: Number(row.count),
      avg_price: row.avg_price == null ? null : Number(row.avg_price),
    })),
    byPlatform: byPlatform.map((row) => ({ ...row, count: Number(row.count) })),
  };
}

/** Ändrar användarens klassificering av en auktion. */
export function updateAuctionReview(platform, externalId, reviewState) {
  if (!AUCTION_REVIEW_STATES.has(reviewState)) throw new Error('Ogiltig auktionsstatus');
  const result = db.prepare(`
    UPDATE auction_items
    SET review_state = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
    WHERE platform = ? AND external_id = ?
  `).run(reviewState, platform, externalId);
  return result.changes > 0;
}

export function addPurchase({ listingId, platform, title, url, imageUrl, watchQuery, purchasePrice }) {
  const result = db.prepare(
    'INSERT INTO portfolio (listing_id, platform, title, url, image_url, watch_query, purchase_price) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(listingId, platform, title ?? null, url ?? null, imageUrl ?? null, watchQuery ?? null, purchasePrice);
  return Number(result.lastInsertRowid);
}

export function markSold(id, soldPrice) {
  const result = db.prepare(
    "UPDATE portfolio SET sold_price = ?, sold_at = datetime('now') WHERE id = ?"
  ).run(soldPrice, id);
  return result.changes > 0;
}

export function getPortfolio() {
  const items = db.prepare(
    'SELECT p.*, pb.name as bundle_name FROM portfolio p LEFT JOIN portfolio_bundles pb ON p.bundle_id = pb.id ORDER BY p.purchased_at DESC'
  ).all();
  const allCosts = db.prepare('SELECT * FROM portfolio_costs ORDER BY created_at ASC').all();
  const allTags = db.prepare('SELECT * FROM portfolio_tags').all();
  const costMap = new Map();
  for (const c of allCosts) {
    if (!costMap.has(c.portfolio_id)) costMap.set(c.portfolio_id, []);
    costMap.get(c.portfolio_id).push(c);
  }
  const tagMap = new Map();
  for (const t of allTags) {
    if (!tagMap.has(t.portfolio_id)) tagMap.set(t.portfolio_id, []);
    tagMap.get(t.portfolio_id).push(t.tag);
  }
  return items.map((item) => ({ ...item, costs: costMap.get(item.id) ?? [], tags: tagMap.get(item.id) ?? [] }));
}

// ── Portfolio bundles ──────────────────────────────────────────────────────

export function createBundle(name, itemIds) {
  const result = db.prepare(
    "INSERT INTO portfolio_bundles (name) VALUES (?)"
  ).run(name);
  const bundleId = Number(result.lastInsertRowid);
  const stmt = db.prepare(
    'UPDATE portfolio SET bundle_id = ?, sold_at = NULL, sold_price = NULL WHERE id = ? AND bundle_id IS NULL'
  );
  for (const id of itemIds) {
    stmt.run(bundleId, id);
  }
  return bundleId;
}

export function getBundles() {
  const bundles = db.prepare('SELECT * FROM portfolio_bundles ORDER BY created_at DESC').all();
  const allItems = getPortfolio();
  return bundles.map((b) => ({
    ...b,
    items: allItems.filter((i) => i.bundle_id === b.id),
  }));
}

export function markBundleSold(id, soldPrice) {
  const result = db.prepare(
    "UPDATE portfolio_bundles SET sold_price = ?, sold_at = datetime('now') WHERE id = ?"
  ).run(soldPrice, id);
  return result.changes > 0;
}

export function updateBundle(id, updates = {}) {
  const parts = [];
  const values = [];
  if ('name' in updates) { parts.push('name = ?'); values.push(updates.name); }
  if ('notes' in updates) { parts.push('notes = ?'); values.push(updates.notes ?? null); }
  if (parts.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE portfolio_bundles SET ${parts.join(', ')} WHERE id = ?`).run(...values);
}

export function dissolveBundle(id) {
  db.prepare('UPDATE portfolio SET bundle_id = NULL WHERE bundle_id = ?').run(id);
  db.prepare('DELETE FROM portfolio_bundles WHERE id = ?').run(id);
}

export function replacePortfolioCosts(portfolioId, costs) {
  db.prepare('DELETE FROM portfolio_costs WHERE portfolio_id = ?').run(portfolioId);
  const insert = db.prepare('INSERT INTO portfolio_costs (portfolio_id, description, amount) VALUES (?, ?, ?)');
  for (const c of costs) {
    insert.run(portfolioId, String(c.description), Number(c.amount));
  }
}

export function updatePortfolioImageUrl(id, imageUrl) {
  db.prepare('UPDATE portfolio SET image_url = ? WHERE id = ?').run(imageUrl, id);
}

export function updatePortfolioItem(id, updates = {}) {
  const { purchasePrice, soldPrice, imageUrl } = updates;
  const parts = [];
  const values = [];
  if ('purchasePrice' in updates) {
    parts.push('purchase_price = ?');
    values.push(purchasePrice ?? null);
  }
  if ('soldPrice' in updates) {
    parts.push('sold_price = ?');
    values.push(soldPrice ?? null);
    parts.push(soldPrice ? "sold_at = COALESCE(sold_at, datetime('now'))" : 'sold_at = NULL');
  }
  if ('imageUrl' in updates) {
    parts.push('image_url = ?');
    values.push(updates.imageUrl ?? null);
  }
  if ('notes' in updates) {
    parts.push('notes = ?');
    values.push(updates.notes ?? null);
  }
  if ('category' in updates) {
    parts.push('category = ?');
    values.push(updates.category ?? null);
  }
  if ('condition' in updates) {
    parts.push('condition = ?');
    values.push(updates.condition ?? null);
  }
  if (parts.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE portfolio SET ${parts.join(', ')} WHERE id = ?`).run(...values);
}

export function deletePortfolioItem(id) {
  db.prepare('DELETE FROM portfolio WHERE id = ?').run(id);
}

export function getPortfolioAnalytics() {
  const byCategory = db.prepare(`
    SELECT
      COALESCE(p.category, '_none') AS category,
      COUNT(*) AS items,
      SUM(CASE WHEN p.sold_at IS NOT NULL THEN 1 ELSE 0 END) AS sold,
      SUM(CASE WHEN p.sold_at IS NOT NULL THEN p.purchase_price + COALESCE(c.total, 0) ELSE 0 END) AS invested_sold,
      SUM(COALESCE(p.sold_price, 0)) AS revenue,
      ROUND(AVG(CASE WHEN p.sold_at IS NOT NULL
        THEN julianday(p.sold_at) - julianday(p.purchased_at) END)) AS avg_days
    FROM portfolio p
    LEFT JOIN (SELECT portfolio_id, SUM(amount) AS total FROM portfolio_costs GROUP BY portfolio_id) c
      ON c.portfolio_id = p.id
    WHERE p.bundle_id IS NULL
    GROUP BY COALESCE(p.category, '_none')
    ORDER BY (SUM(COALESCE(p.sold_price, 0)) - SUM(CASE WHEN p.sold_at IS NOT NULL THEN p.purchase_price + COALESCE(c.total, 0) ELSE 0 END)) DESC
  `).all();

  const byTag = db.prepare(`
    SELECT
      t.data_name, t.label,
      COUNT(DISTINCT p.id) AS items,
      SUM(CASE WHEN p.sold_at IS NOT NULL THEN 1 ELSE 0 END) AS sold,
      SUM(CASE WHEN p.sold_at IS NOT NULL THEN p.purchase_price + COALESCE(c.total, 0) ELSE 0 END) AS invested_sold,
      SUM(COALESCE(p.sold_price, 0)) AS revenue
    FROM portfolio_tags pt
    JOIN tags t ON t.data_name = pt.tag
    JOIN portfolio p ON p.id = pt.portfolio_id
    LEFT JOIN (SELECT portfolio_id, SUM(amount) AS total FROM portfolio_costs GROUP BY portfolio_id) c
      ON c.portfolio_id = p.id
    GROUP BY t.data_name, t.label
    ORDER BY (SUM(COALESCE(p.sold_price, 0)) - SUM(CASE WHEN p.sold_at IS NOT NULL THEN p.purchase_price + COALESCE(c.total, 0) ELSE 0 END)) DESC
  `).all();

  return { byCategory, byTag };
}

export function getProfitHistory(category) {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS sold_items,
      ROUND(AVG(p.purchase_price + COALESCE(c.total, 0))) AS avg_invested,
      ROUND(AVG(p.sold_price)) AS avg_sold,
      ROUND(AVG(p.sold_price - (p.purchase_price + COALESCE(c.total, 0)))) AS avg_profit,
      ROUND(MIN(p.sold_price - (p.purchase_price + COALESCE(c.total, 0)))) AS min_profit,
      ROUND(MAX(p.sold_price - (p.purchase_price + COALESCE(c.total, 0)))) AS max_profit
    FROM portfolio p
    LEFT JOIN (SELECT portfolio_id, SUM(amount) AS total FROM portfolio_costs GROUP BY portfolio_id) c
      ON c.portfolio_id = p.id
    WHERE p.category = ? AND p.sold_at IS NOT NULL AND p.bundle_id IS NULL
  `).get(category);

  if (!row || row.sold_items === 0) return null;

  const tagRows = db.prepare(`
    SELECT t.data_name, t.label, COUNT(*) AS count,
      ROUND(AVG(p.sold_price - (p.purchase_price + COALESCE(c.total, 0)))) AS avg_profit
    FROM portfolio_tags pt
    JOIN tags t ON t.data_name = pt.tag
    JOIN portfolio p ON p.id = pt.portfolio_id
    LEFT JOIN (SELECT portfolio_id, SUM(amount) AS total FROM portfolio_costs GROUP BY portfolio_id) c
      ON c.portfolio_id = p.id
    WHERE p.category = ? AND p.sold_at IS NOT NULL AND p.bundle_id IS NULL
    GROUP BY t.data_name
    ORDER BY count DESC
  `).all(category);

  return {
    sold_items: row.sold_items,
    avg_invested: row.avg_invested,
    avg_sold: row.avg_sold,
    avg_profit: row.avg_profit,
    min_profit: row.min_profit,
    max_profit: row.max_profit,
    tag_insights: tagRows.map((r) => ({ data_name: r.data_name, label: r.label, count: r.count, avg_profit: r.avg_profit })),
  };
}

// ── Tags ───────────────────────────────────────────────────────────────────

export function getTags() {
  return db.prepare("SELECT * FROM tags WHERE type = 'detail' ORDER BY label ASC").all();
}

export function getConditionTags() {
  return db.prepare(`
    SELECT * FROM tags WHERE type = 'condition'
    ORDER BY CASE data_name WHEN 'working' THEN 1 WHEN 'has_issues' THEN 2 WHEN 'no_start' THEN 3 WHEN 'untested' THEN 4 ELSE 5 END
  `).all();
}

export function addTag(dataName, label, color = null, guidelines = null) {
  db.prepare("INSERT OR REPLACE INTO tags (data_name, label, color, guidelines, type) VALUES (?, ?, ?, ?, 'detail')").run(dataName, label, color, guidelines);
}

export function updateTagGuidelines(dataName, guidelines) {
  db.prepare('UPDATE tags SET guidelines = ? WHERE data_name = ?').run(guidelines ?? null, dataName);
}

export function deleteTag(dataName) {
  db.prepare("DELETE FROM tags WHERE data_name = ? AND type = 'detail'").run(dataName);
}

// ── Global Blacklist ───────────────────────────────────────────────────────

export function getBlacklist() {
  return db.prepare('SELECT word FROM global_blacklist ORDER BY added_at ASC').all().map((r) => r.word);
}

export function addBlacklistWord(word) {
  db.prepare('INSERT OR IGNORE INTO global_blacklist (word) VALUES (?)').run(word.toLowerCase().trim());
}

export function removeBlacklistWord(word) {
  db.prepare('DELETE FROM global_blacklist WHERE word = ?').run(word.toLowerCase().trim());
}

export function setPortfolioTags(portfolioId, tagDataNames) {
  db.prepare('DELETE FROM portfolio_tags WHERE portfolio_id = ?').run(portfolioId);
  const insert = db.prepare("INSERT INTO portfolio_tags (portfolio_id, tag, source) VALUES (?, ?, 'manual')");
  for (const tag of tagDataNames) {
    insert.run(portfolioId, tag);
  }
}

function serializeSettingValue(value) {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function parseSettingValue(key, value) {
  if (key === 'enabled') return value === 'true';
  if (key === 'timeout_ms' || key === 'batch_size') return parseInt(value, 10);
  return value;
}

export function getAiSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = { ...DEFAULT_AI_SETTINGS };
  for (const row of rows) {
    if (row.key in settings) {
      settings[row.key] = parseSettingValue(row.key, row.value);
    }
  }
  return settings;
}

export function updateAiSettings(updates) {
  const allowed = ['enabled', 'model', 'system_prompt', 'global_rules', 'timeout_ms', 'batch_size', 'bot_analysis_prompt'];
  const entries = Object.entries(updates).filter(([key]) => allowed.includes(key));
  if (entries.length === 0) return getAiSettings();

  const stmt = db.prepare(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\')) ' +
    'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
  );

  for (const [key, value] of entries) {
    stmt.run(key, serializeSettingValue(value));
  }

  return getAiSettings();
}
