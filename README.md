# Begagnat Monitor

A self-hosted bot that watches Swedish secondhand marketplaces and pushes new listings to WhatsApp in real time. Built for serious buyers who want to be first — with optional AI-powered relevance filtering and a full portfolio tracker for resellers.

---

## Features

- **Multi-platform monitoring** — Blocket, Tradera, Klaravik, Blinto, Auctionet, Budi, Junora, Facebook Marketplace
- **WhatsApp notifications** — Instant alerts with price, location, and platform via the Baileys library (no third-party API needed)
- **AI relevance filtering** — Uses Claude to discard junk listings and tag condition signals (e.g. "no start", "bad batteries")
- **AI profit estimates** — When historical sales data exists for a category, Claude estimates potential resale profit per listing
- **Portfolio tracker** — Log purchases, track costs, record sales, and see per-category profit analytics
- **Auction support** — Silently tracks auction listings and only alerts when < 1 hour remains
- **Pause/resume watches** — Temporarily silence a search without deleting it
- **Admin dashboard** — Full web UI for managing watches, portfolio, tags, and settings

---

## Architecture

```
Polling Engine ──► Adapters (8 platforms)
       │                 │
       ▼                 ▼
  Deduplication     Raw listings
       │
       ▼
  Rule filters (price, location, keywords)
       │
       ▼
  Claude AI filter (optional)
       │
       ▼
  WhatsApp notification ──► Group chat

     REST API (Express) ◄──► Admin dashboard (browser)
           │
           ▼
       SQLite database
```

---

## Requirements

- Node.js 22+ (uses `node:sqlite` built-in)
- A phone with WhatsApp (for initial QR scan)
- Anthropic API key (optional, for AI filtering)

---

## Quick Start

```bash
# 1. Clone and install
git clone <repo-url>
cd GolfbilsBoten
npm install

# 2. Copy and fill in config
cp .env_EXAMPLE .env
# Edit .env — at minimum set WHATSAPP_GROUP_ID and ADMIN_PASS

# 3. Start
npm start
```

On first boot, a QR code appears in the terminal. Scan it with WhatsApp on your phone (**Linked Devices → Link a Device**). Auth is saved to `DATA_DIR/auth/` and reused on restart.

The admin dashboard is then available at `http://localhost:3000/admin`.

---

## Configuration

All settings are read from environment variables (`.env` file).

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port for the admin dashboard and API |
| `ADMIN_USER` | `admin` | Username for the admin dashboard |
| `ADMIN_PASS` | *(none)* | Password for the admin dashboard — leave unset only for local use |

### WhatsApp

| Variable | Default | Description |
|----------|---------|-------------|
| `WHATSAPP_GROUP_ID` | *(required)* | Target group JID, e.g. `120363427495534345@g.us` |
| `MENTION_JIDS` | *(none)* | Comma-separated numbers to @mention, e.g. `46761912642,46701234567` |

To find your group JID, start the bot, send a message to the group, and look for the JID printed in the console.

### Polling

| Variable | Default | Description |
|----------|---------|-------------|
| `POLL_INTERVAL_MINUTES` | `3` | How often to check Blocket and Tradera |
| `POLL_DELAY_MS` | `1000` | Delay between requests (rate limiting) |

Auction platforms (Klaravik, Blinto, Auctionet, Budi, Junora) are checked every 20 minutes. Facebook Marketplace is checked every 10 minutes.

### Marketplace APIs

| Variable | Description |
|----------|-------------|
| `BLOCKET_API_BASE` | Blocket API base URL (has a working default) |
| `TRADERA_APP_ID` | Tradera developer app ID |
| `TRADERA_APP_KEY` | Tradera developer app key |

Tradera is optional — the bot works without it.

### AI Filtering

| Variable | Description |
|----------|-------------|
| `CLAUDE_API_KEY` | Anthropic API key — enables AI-powered listing filtering |

AI filtering is configured per-watch via the admin dashboard (model, system prompt, batch size, timeout). When disabled, all listings that pass rule-based filters are notified.

### Storage

| Variable | Default | Description |
|----------|---------|-------------|
| `DATA_DIR` | `./data` | Directory for the SQLite database, portfolio images, and WhatsApp auth files |

---

## Watches

A *watch* is a saved search. Each watch has:

| Field | Description |
|-------|-------------|
| **Query** | Search term, e.g. `Yamaha utombordare` |
| **Platforms** | One or more platforms to search |
| **Price range** | Optional min/max price filter |
| **Region** | Optional Swedish region filter |
| **Ad type** | All / For sale only / Wanted only |
| **Exclude words** | Comma-separated words to filter out of titles |
| **Category** | Internal category (e.g. Golfbil) — feeds AI context and profit estimates |
| **Paused** | Temporarily skip without deleting |

Watches are managed in the **Bevakningar** tab of the admin dashboard.

### First scan behaviour

On first activation, existing listings are silently indexed (no notifications). The AI filter runs over the first 20 results and sends a summary message so you can see what's already out there.

---

## AI Filtering

When `CLAUDE_API_KEY` is set and AI filtering is enabled, each batch of new listings is sent to Claude before notification. Claude decides:

- **Keep or reject** — based on your query, price range, and global rules
- **Tags** — condition flags like *Startar inte*, *Dåliga batterier*, *Saknas delar*
- **Profit estimate** — if the watch has a category with ≥ 2 historical sales, Claude estimates a `low–high` profit range based on listing price vs. your average invested cost

The system prompt, global rules, model, batch size, and timeout are all configurable from the admin dashboard without a restart.

### Profit estimates in notifications

When profit data is available, notifications include a line like:

```
💰 Potential: +5 000–18 000 kr · Prissatt under snitt
```

This requires at least 2 sold portfolio items in the same category.

---

## Portfolio Tracker

Track every purchase from listing to sale.

- **Import** — paste a listing URL to auto-fill title and image, or upload manually
- **Costs** — add extra costs (repairs, shipping) per item
- **Tags** — tag condition issues that affected the deal
- **Category** — classify items (Golfbil, Båt, Båtmotor, etc.)
- **Bundles** — group multiple items into a single sale
- **Analytics** — per-category and per-tag profit/margin/average days to sell

Analytics appear automatically once you have sold items.

---

## Facebook Marketplace

Facebook requires a logged-in session. To set it up:

1. Run `node setup-facebook.js` locally (or use a browser extension to export cookies)
2. Paste the resulting JSON into **Inställningar → Facebook-session** in the admin dashboard

Sessions typically last a few weeks before needing renewal.

---

## WhatsApp Commands

The bot responds to messages in the configured group:

| Command | Action |
|---------|--------|
| `Visa` | List all active watches |
| `Lägg till` | Add a new watch interactively |
| `Ändra` | Modify filters on an existing watch |
| `Ta bort` | Remove a watch |
| `Sök` | Force an immediate search cycle |
| `Hjälp` | Show command list |

---

## Admin Dashboard

Available at `http://localhost:{PORT}/admin` (protected by basic auth if `ADMIN_PASS` is set).

| Tab | Content |
|-----|---------|
| **Bevakningar** | Manage watches, configure AI settings, manage Facebook session |
| **Statistik** | Indexed listings by platform/day/watch, recent notifications |
| **Portfolio** | Purchase log, profit analytics, bundle management, tag registry |

---

## Data

Everything is stored locally in `DATA_DIR` (default `./data`):

```
data/
├── begagnat.db          # SQLite database
├── portfolio-images/    # Downloaded listing photos
├── auth/                # WhatsApp Baileys session files
└── facebook-auth.json   # Facebook session (if configured)
```

Back up `begagnat.db` and `auth/` to preserve your data and avoid re-scanning on restart.

---

## Supported Platforms

| Platform | Type | Notes |
|----------|------|-------|
| Blocket | Classifieds | Polled every `POLL_INTERVAL_MINUTES` |
| Tradera | Classifieds + auctions | Requires API credentials |
| Klaravik | Auctions | Alert when < 1h remains |
| Blinto | Auctions | Alert when < 1h remains |
| Auctionet | Auctions | Alert when < 1h remains |
| Budi | Auctions | Alert when < 1h remains |
| Junora | Auctions | Alert when < 1h remains |
| Facebook Marketplace | Classifieds | Requires session cookie |
