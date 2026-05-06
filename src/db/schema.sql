-- Bevakningar som är aktiva
CREATE TABLE IF NOT EXISTS watches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  max_price INTEGER,
  min_price INTEGER,
  platforms TEXT NOT NULL DEFAULT 'blocket',
  is_car INTEGER DEFAULT 0,
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
  ending_soon_notified INTEGER DEFAULT 0,
  PRIMARY KEY (id, platform),
  FOREIGN KEY (watch_id) REFERENCES watches(id) ON DELETE CASCADE
);

-- Portfolio: köpta och sålda föremål
CREATE TABLE IF NOT EXISTS portfolio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  title TEXT,
  url TEXT,
  image_url TEXT,
  watch_query TEXT,
  purchase_price INTEGER NOT NULL,
  purchased_at TEXT DEFAULT (datetime('now')),
  sold_price INTEGER,
  sold_at TEXT
);

-- Extra kostnader kopplade till portfolio-poster
CREATE TABLE IF NOT EXISTS portfolio_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio_id INTEGER NOT NULL,
  description TEXT NOT NULL,
  amount INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (portfolio_id) REFERENCES portfolio(id) ON DELETE CASCADE
);

-- Portfolio-paket: grupperar flera portfolio-objekt till ett säljpaket
CREATE TABLE IF NOT EXISTS portfolio_bundles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sold_price INTEGER,
  sold_at TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Tagg-registry: konditionstaggar för annonser och portfolio
CREATE TABLE IF NOT EXISTS tags (
  data_name  TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  color      TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Taggar kopplade till portfolio-poster
CREATE TABLE IF NOT EXISTS portfolio_tags (
  portfolio_id INTEGER NOT NULL,
  tag          TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT 'manual',
  PRIMARY KEY (portfolio_id, tag),
  FOREIGN KEY (portfolio_id) REFERENCES portfolio(id) ON DELETE CASCADE
);

-- App-inställningar (AI prompt, modell, flaggor, etc.)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Global blacklist: ord som filtrerar bort annonser från alla bevakningar
CREATE TABLE IF NOT EXISTS global_blacklist (
  word TEXT PRIMARY KEY,
  added_at TEXT DEFAULT (datetime('now'))
);
