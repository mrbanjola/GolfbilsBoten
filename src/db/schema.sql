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

-- Levande katalog över auktioner. Separat från seen_ads som används för notisdeduplicering.
CREATE TABLE IF NOT EXISTS auction_items (
  platform TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  current_price INTEGER,
  currency TEXT NOT NULL DEFAULT 'SEK',
  bid_count INTEGER NOT NULL DEFAULT 0,
  auction_end TEXT,
  location TEXT,
  url TEXT NOT NULL,
  image_url TEXT,
  no_reserve INTEGER NOT NULL DEFAULT 0,
  reserve_met INTEGER NOT NULL DEFAULT 0,
  auction_status TEXT NOT NULL DEFAULT 'active'
    CHECK (auction_status IN ('active', 'ended', 'unknown')),
  review_state TEXT NOT NULL DEFAULT 'unreviewed'
    CHECK (review_state IN ('unreviewed', 'interesting', 'ignored')),
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  reviewed_at TEXT,
  PRIMARY KEY (platform, external_id)
);

-- En auktion kan matcha flera bevakningar och därmed flera kategorier.
CREATE TABLE IF NOT EXISTS auction_matches (
  platform TEXT NOT NULL,
  external_id TEXT NOT NULL,
  watch_id INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT 'uncategorized',
  first_matched_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_matched_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (platform, external_id, watch_id),
  FOREIGN KEY (platform, external_id) REFERENCES auction_items(platform, external_id) ON DELETE CASCADE,
  FOREIGN KEY (watch_id) REFERENCES watches(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auction_items_active_end
  ON auction_items (auction_status, auction_end);
CREATE INDEX IF NOT EXISTS idx_auction_items_review
  ON auction_items (review_state, auction_status);
CREATE INDEX IF NOT EXISTS idx_auction_items_price
  ON auction_items (current_price);
CREATE INDEX IF NOT EXISTS idx_auction_matches_category
  ON auction_matches (category, platform, external_id);
