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
  ];
  for (const { col, sql } of seenAdsMigrations) {
    if (!seenAdsCols.includes(col)) {
      db.exec(sql);
      console.log(`[DB] Migration: lade till kolumn "seen_ads.${col}"`);
    }
  }

  const portfolioCols = db.prepare("PRAGMA table_info(portfolio)").all().map(r => r.name);
  const portfolioMigrations = [
    { col: 'notes', sql: 'ALTER TABLE portfolio ADD COLUMN notes TEXT' },
  ];
  for (const { col, sql } of portfolioMigrations) {
    if (!portfolioCols.includes(col)) {
      db.exec(sql);
      console.log(`[DB] Migration: lade till kolumn "portfolio.${col}"`);
    }
  }

  seedDefaultSettings();
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
  return db.prepare('SELECT * FROM watches WHERE active = 1').all();
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
  const allowed = ['location', 'ad_type', 'exclude_words', 'sort_order', 'max_price', 'min_price', 'platforms', 'is_car'];
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
    'UPDATE seen_ads SET notified = 1 WHERE id = ? AND platform = ?'
  );
  for (const listing of listings) {
    stmt.run(listing.id, listing.platform);
  }
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
    'SELECT s.id, s.platform, s.title, s.price, s.url, s.image_url, s.first_seen_at, w.query as watch_query FROM seen_ads s LEFT JOIN watches w ON s.watch_id = w.id WHERE s.notified = 1 ORDER BY s.first_seen_at DESC LIMIT 30'
  ).all();

  return { total, today, perPlatform, perDay, perWatch, recent };
}

// ── Portfolio ──────────────────────────────────────────────────────────────

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
  const items = db.prepare('SELECT * FROM portfolio ORDER BY purchased_at DESC').all();
  const allCosts = db.prepare('SELECT * FROM portfolio_costs ORDER BY created_at ASC').all();
  const costMap = new Map();
  for (const c of allCosts) {
    if (!costMap.has(c.portfolio_id)) costMap.set(c.portfolio_id, []);
    costMap.get(c.portfolio_id).push(c);
  }
  return items.map((item) => ({ ...item, costs: costMap.get(item.id) ?? [] }));
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
  if (parts.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE portfolio SET ${parts.join(', ')} WHERE id = ?`).run(...values);
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
  const allowed = ['enabled', 'model', 'system_prompt', 'global_rules', 'timeout_ms', 'batch_size'];
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
