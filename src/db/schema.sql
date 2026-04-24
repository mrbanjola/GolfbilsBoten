-- Bevakningar som är aktiva
CREATE TABLE IF NOT EXISTS watches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  max_price INTEGER,
  min_price INTEGER,
  platforms TEXT NOT NULL DEFAULT 'blocket',
  region TEXT,
  category TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  active INTEGER DEFAULT 1,
  initial_scan_done INTEGER DEFAULT 0
);

-- Sedda annonser (för dedup)
CREATE TABLE IF NOT EXISTS seen_ads (
  id TEXT NOT NULL,
  platform TEXT NOT NULL,
  watch_id INTEGER NOT NULL,
  title TEXT,
  price INTEGER,
  url TEXT,
  first_seen_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (id, platform),
  FOREIGN KEY (watch_id) REFERENCES watches(id) ON DELETE CASCADE
);
