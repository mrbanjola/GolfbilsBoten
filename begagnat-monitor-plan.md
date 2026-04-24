# Begagnat Monitor — Genomförandeplan (MVP)

## Projektöversikt

En Node.js-applikation för att bevaka svenska begagnatmarknadsplatser (Blocket, Tradera, med fler som tillkommer senare) och leverera notiser via WhatsApp. Två användare delar bevakningar via en WhatsApp-gruppchatt.

**Stack:** Node.js (ESM), Express, Baileys (WhatsApp), better-sqlite3, node-cron

**Körmiljö:** Lokalt eller VPS (Render-kompatibelt). Ingen Docker krävs för MVP.

---

## Arkitektur

```
┌─────────────────────────────────────────────────────┐
│                    Express Server                    │
│                   (port från env)                    │
├──────────┬──────────┬──────────┬────────────────────┤
│  WhatsApp │  Polling  │  Adapter  │     Database      │
│   Bot     │  Engine   │  Layer    │    (SQLite)       │
│ (Baileys) │(node-cron)│          │                    │
└──────────┴──────────┴──────────┴────────────────────┘
```

### Komponentöversikt

1. **WhatsApp Bot** — Tar emot kommandon, skickar notiser
2. **Polling Engine** — Schemalagd polling av alla aktiva bevakningar
3. **Adapter Layer** — Plattformsspecifika datakällor (Blocket först, Tradera sen)
4. **Database** — SQLite för bevakningar, sedda annonser, config

---

## Filstruktur

```
begagnat-monitor/
├── package.json
├── .env.example
├── .gitignore
├── src/
│   ├── index.js              # Entry point: startar Express, WhatsApp, poller
│   ├── config.js             # Läser env-variabler, defaults
│   ├── server.js             # Express-server (health check, framtida dashboard)
│   ├── db/
│   │   ├── database.js       # SQLite-setup, migrations, queries
│   │   └── schema.sql        # Tabellstruktur (referens)
│   ├── bot/
│   │   ├── whatsapp.js       # Baileys-uppkoppling, QR-hantering, reconnect
│   │   ├── commands.js       # Kommandotolk + state machine
│   │   └── formatter.js      # Formattera meddelanden (bevakningslista, notiser)
│   ├── polling/
│   │   ├── engine.js         # Cron-loop, kör alla aktiva bevakningar
│   │   └── dedup.js          # Kontrollera/spara sedda annonser
│   └── adapters/
│       ├── base.js           # Adapter-interface (abstrakt klass)
│       ├── blocket.js        # Blocket via blocket-api.se REST
│       └── tradera.js        # Tradera (stub, implementeras senare)
└── data/
    └── .gitkeep              # SQLite-fil + Baileys auth hamnar här
```

---

## Databas (SQLite via better-sqlite3)

### Tabeller

```sql
-- Bevakningar som är aktiva
CREATE TABLE watches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,                    -- Sökterm, t.ex. "VW LT"
  max_price INTEGER,                     -- Max pris i SEK (null = inget tak)
  min_price INTEGER,                     -- Min pris i SEK (null = ingen golv)
  platforms TEXT NOT NULL DEFAULT 'blocket', -- Kommaseparerad: "blocket,tradera"
  region TEXT,                           -- Regionfilter (null = hela Sverige)
  category TEXT,                         -- Kategorifilter (null = alla)
  created_at TEXT DEFAULT (datetime('now')),
  active INTEGER DEFAULT 1
);

-- Sedda annonser (för dedup)
CREATE TABLE seen_ads (
  id TEXT NOT NULL,                       -- Annons-ID från plattformen
  platform TEXT NOT NULL,                 -- "blocket" | "tradera" | etc
  watch_id INTEGER NOT NULL,
  title TEXT,
  price INTEGER,
  url TEXT,
  first_seen_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (id, platform),
  FOREIGN KEY (watch_id) REFERENCES watches(id) ON DELETE CASCADE
);
```

### Queries som behövs

- `getActiveWatches()` — alla bevakningar med `active = 1`
- `addWatch(query, maxPrice, platforms)` — ny bevakning, returnera ID
- `removeWatch(id)` — sätt `active = 0` (soft delete)
- `getWatchesList()` — för "Visa"-kommandot, returnera numrerad lista
- `isAdSeen(adId, platform)` — dedup-check
- `markAdSeen(adId, platform, watchId, title, price, url)` — spara sedd annons

---

## WhatsApp Bot (Baileys)

### Uppkoppling (`bot/whatsapp.js`)

```
Använd: @whiskeysockets/baileys
Auth: useMultiFileAuthState('./data/auth')
QR: Skrivs ut i terminalen vid första start, skannas med telefonen
Reconnect: Automatisk reconnect vid alla DisconnectReason utom loggedOut
```

**Viktiga detaljer:**

- Boten ska bara lyssna på meddelanden i EN specifik grupp (grupp-ID lagras i .env som `WHATSAPP_GROUP_ID`)
- Ignorera alla andra meddelanden (DM, andra grupper)
- Ignorera botens egna meddelanden (kontrollera `msg.key.fromMe`)
- Grupp-ID:t hittar man genom att logga alla inkommande meddelanden vid start och leta efter `remoteJid` som slutar på `@g.us`

### Kommandon (`bot/commands.js`)

Implementera en enkel state machine:

```
States: 'idle' | 'awaiting_query' | 'awaiting_selection'
State lagras per grupp-ID (bara en grupp, men gör det rätt)

Tillåtna kommandon (case-insensitive, matcha på starts-with):
  "visa"      → Lista alla aktiva bevakningar, numrerade
  "lägg till" → Fråga vad som ska bevakas, vänta på svar
  "ta bort"   → Visa numrerad lista, vänta på siffra
  "hjälp"     → Visa tillgängliga kommandon
  [siffra]    → Bara giltigt i awaiting_selection-state
```

**Konversationsflöde "Lägg till":**

```
User: "Lägg till"
Bot:  "Vad vill du bevaka? Skriv sökord och valfritt maxpris.
       Exempel: VW LT under 40000"
       → state = awaiting_query

User: "Johnson utomborare 25-35 hk"
Bot:  "✓ Bevakar nu: \"Johnson utomborare 25-35 hk\"
       Plattformar: Blocket
       Maxpris: inget tak
       Pollar var 3:e minut."
       → spara i DB, state = idle
```

**Parsning av användarinput (enkel):**

Matcha mönster som "under XXXXX" eller "<XXXXX" för att extrahera maxpris.
Allt annat är sökterm. Inget behov av NLP i MVP — håll det enkelt.

```
Input: "VW LT under 40000"
→ query: "VW LT", maxPrice: 40000

Input: "Johnson utomborare 25-35 hk"
→ query: "Johnson utomborare 25-35 hk", maxPrice: null

Input: "surfbräda <2000"
→ query: "surfbräda", maxPrice: 2000
```

**Konversationsflöde "Ta bort":**

```
User: "Ta bort"
Bot:  "Vilken bevakning vill du ta bort?
       1. VW LT (max 40 000 kr)
       2. Johnson utomborare 25-35 hk
       3. surfbräda (max 2 000 kr)"
       → state = awaiting_selection, action = 'remove'

User: "2"
Bot:  "✓ Borttagen: \"Johnson utomborare 25-35 hk\""
       → soft-delete i DB, state = idle
```

**Timeout:** Om ingen input kommer inom 60 sekunder i ett awaiting-state, återställ till idle. Använd setTimeout.

### Notisformat (`bot/formatter.js`)

```
🔔 *Ny träff!*
Bevakning: "VW LT"

*VW LT 31 Camper 1987*
35 000 kr · Göteborg
Blocket

https://www.blocket.se/annons/goteborg/vw-lt-31/12345678
```

Använd WhatsApp markdown: `*bold*` för titel/pris, vanlig text för resten.
Skicka annons-bild som separat meddelande om URL finns (via `sock.sendMessage` med `image: { url: '...' }`).

---

## Polling Engine (`polling/engine.js`)

### Logik

```
1. node-cron kör var 3:e minut (konfigurerbart via env)
2. Hämta alla aktiva bevakningar från DB
3. För varje bevakning:
   a. Kör sökning via rätt adapter (baserat på platforms-fältet)
   b. För varje resultat:
      - Kolla om annons-ID redan finns i seen_ads
      - Om ny: spara i seen_ads + skicka WhatsApp-notis
4. Logga antal nya träffar per körning
```

### Rate limiting

- Max 1 request per sekund mot varje plattform
- Implementera en enkel sleep mellan requests
- Logga om en adapter returnerar fel (men krascha inte)

### Första körningen

Vid första körningen av en ny bevakning: hämta resultat men markera ALLA som sedda utan att skicka notis. Annars får man en flod av gamla annonser. Flagga detta i watches-tabellen med `initial_scan_done INTEGER DEFAULT 0`.

---

## Blocket Adapter (`adapters/blocket.js`)

### Datakälla

Använd blocket-api.se REST API (hostad tredjepartstjänst som wrapprar Blockets interna API).

**Bas-URL:** `https://blocket-api.se/v1`

### Endpoints

**Generell sökning:**
```
GET /v1/search?q={query}&page=1
```

**Bilsökning:**
```
GET /v1/search/car?page=1&price_from={min}&price_to={max}&locations={region}
```

**Båtsökning:**
```
GET /v1/search/boat?q={query}&price_from={min}&price_to={max}
```

**Annonsdetaljer:**
```
GET /v1/ad/{type}/{id}
```

### Respons-mapping

Mappa API-responsen till ett gemensamt format som alla adapters returnerar:

```typescript
interface ListingResult {
  id: string;           // Unikt annons-ID
  platform: string;     // "blocket"
  title: string;        // Annonsrubrik
  price: number | null; // Pris i SEK
  currency: string;     // "SEK"
  location: string;     // Plats
  url: string;          // Direktlänk till annonsen
  imageUrl?: string;    // Första bilden (om tillgänglig)
  createdAt?: string;   // Publiceringsdatum
}
```

### Felhantering

- Om blocket-api.se returnerar 4xx/5xx: logga, skippa, försök igen nästa poll-cykel
- Om blocket-api.se är nere en längre period: överväg fallback direkt mot api.blocket.se (men det är en separat uppgift)

---

## Adapter-interface (`adapters/base.js`)

```javascript
export class BaseAdapter {
  constructor(name) {
    this.name = name; // "blocket", "tradera", etc
  }

  /**
   * Sök efter annonser som matchar en bevakning.
   * @param {Object} watch - Bevakningsobjekt från DB
   * @param {string} watch.query - Sökterm
   * @param {number|null} watch.max_price - Maxpris
   * @param {number|null} watch.min_price - Minpris
   * @param {string|null} watch.region - Region
   * @param {string|null} watch.category - Kategori
   * @returns {Promise<ListingResult[]>}
   */
  async search(watch) {
    throw new Error('search() must be implemented by subclass');
  }
}
```

---

## Express Server (`server.js`)

Minimal Express-server med:

- `GET /health` — returnerar `{ status: 'ok', uptime: ..., activeWatches: N }`
- `GET /watches` — JSON-lista av aktiva bevakningar (för debugging)
- Statisk port från `PORT` env-variabel (default 3000)

Render kräver att appen binder till en port, annars räknas den som kraschad. Express-servern löser det.

---

## Konfiguration (`.env`)

```env
# Server
PORT=3000

# WhatsApp
WHATSAPP_GROUP_ID=              # Grupp-ID, hittas via loggning vid start

# Polling
POLL_INTERVAL_MINUTES=3         # Hur ofta pollning körs
POLL_DELAY_MS=1000              # Delay mellan requests (rate limiting)

# Blocket
BLOCKET_API_BASE=https://blocket-api.se/v1

# Tradera (för framtiden)
TRADERA_APP_ID=
TRADERA_APP_KEY=

# Data
DATA_DIR=./data                 # Sökväg för SQLite-fil och Baileys auth
```

---

## Entry Point (`index.js`)

```
1. Ladda config från .env
2. Initiera SQLite databas (skapa tabeller om de inte finns)
3. Starta Express server
4. Starta WhatsApp-bot (Baileys)
   - Vid första start: visa QR-kod i terminalen
   - Vid reconnect: använd sparad session
5. Starta polling engine (node-cron)
6. Koppla ihop:
   - Bot skickar kommandon → commands.js → database
   - Poller hittar ny annons → formatter.js → bot skickar till grupp
```

---

## npm Dependencies

```json
{
  "type": "module",
  "dependencies": {
    "@whiskeysockets/baileys": "latest",
    "better-sqlite3": "^11",
    "express": "^4",
    "node-cron": "^3",
    "dotenv": "^16",
    "qrcode-terminal": "^0.12"
  }
}
```

---

## Deployment på Render

- **Typ:** Web Service (inte Background Worker, pga port-kravet)
- **Build Command:** `npm install`
- **Start Command:** `node src/index.js`
- **Disk:** Persistent disk krävs för SQLite + Baileys auth (annars försvinner sessionen vid varje deploy). Rendera har detta som tillägg.
- **Env vars:** Lägg in allt från .env i Render dashboard

---

## Saker som INTE ingår i MVP (men förbereds för)

- [ ] Tradera-adapter (interface finns, stub i adapters/)
- [ ] Sellpy/Vinted scraping-adapters
- [ ] AI-baserad filtrering via Claude API
- [ ] Webb-dashboard med historik och statistik
- [ ] Ändra befintlig bevakning (bara lägg till + ta bort i MVP)
- [ ] Plattformsspecifika filter (bilmärke, båttyp etc.)
- [ ] Bildskickning i notiser (bara text + länk i MVP)

---

## Steg-för-steg bygginstruktioner

Följ denna ordning:

1. **Projektsetup** — `package.json`, `.env.example`, `.gitignore`, filstruktur
2. **Databas** — `database.js` med schema-skapning och alla queries
3. **Blocket-adapter** — `blocket.js` som faktiskt hämtar data från blocket-api.se
4. **Polling engine** — `engine.js` med cron + dedup-logik
5. **WhatsApp bot** — `whatsapp.js` med Baileys-uppkoppling
6. **Kommandotolk** — `commands.js` med state machine
7. **Formatter** — `formatter.js` för snygga meddelanden
8. **Entry point** — `index.js` som kopplar ihop allt
9. **Express server** — `server.js` med health endpoint
10. **Test** — Starta, skanna QR, skicka "Hjälp" i gruppen

---

## Noteringar till Claude Code

- Använd ESM (`import/export`), inte CommonJS
- Ingen TypeScript i MVP — ren JavaScript med JSDoc-kommentarer
- Logga med `console.log` med prefix `[Bot]`, `[Poller]`, `[Blocket]` etc.
- Alla async-funktioner ska ha try/catch med loggning
- Baileys kräver speciell hantering av `proto` — använd exakt de patterns som finns i Baileys README
- `better-sqlite3` är synkront — det är en feature, inte en bugg. Inga Promises behövs för DB-anrop.
- Testa blocket-api.se genom att curl:a `https://blocket-api.se/v1/search?q=test` innan du bygger adaptern — verifiera att den svarar
