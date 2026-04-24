import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {DatabaseSync} */
let db;

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
  const existing = db.prepare("PRAGMA table_info(watches)").all().map(r => r.name);
  const migrations = [
    { col: 'location',      sql: 'ALTER TABLE watches ADD COLUMN location TEXT' },
    { col: 'ad_type',       sql: "ALTER TABLE watches ADD COLUMN ad_type TEXT DEFAULT 'all'" },
    { col: 'exclude_words', sql: 'ALTER TABLE watches ADD COLUMN exclude_words TEXT' },
    { col: 'sort_order',    sql: "ALTER TABLE watches ADD COLUMN sort_order TEXT DEFAULT 'PUBLISHED_DESC'" },
  ];
  for (const { col, sql } of migrations) {
    if (!existing.includes(col)) {
      db.exec(sql);
      console.log(`[DB] Migration: lade till kolumn "${col}"`);
    }
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
    'INSERT INTO watches (query, max_price, min_price, platforms) VALUES (?, ?, ?, ?)'
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
  const allowed = ['location', 'ad_type', 'exclude_words', 'sort_order', 'max_price', 'min_price', 'platforms'];
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
 */
export function markAdSeen(adId, platform, watchId, title, price, url) {
  db.prepare(
    'INSERT OR IGNORE INTO seen_ads (id, platform, watch_id, title, price, url) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(adId, platform, watchId, title ?? null, price ?? null, url ?? null);
}
