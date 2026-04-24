# Begagnat Monitor — Filterplan (v2)

## Mål

Göra bevakningarna smartare utan att offra den breda sökningen som är vår edge. Default förblir bred (alla kategorier, hela Sverige, säljes+köpes). Filter läggs till som opt-in via "Ändra"-kommandot eller inline vid skapande.

---

## Del 1: Utöka datamodellen

### Ny schema för watches-tabellen

```sql
CREATE TABLE watches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  max_price INTEGER,
  min_price INTEGER,
  platforms TEXT NOT NULL DEFAULT 'blocket',
  -- NYA FÄLT:
  locations TEXT,              -- Kommaseparerad, t.ex. "STOCKHOLM,UPPSALA" (null = hela Sverige)
  category TEXT,               -- En kategori, t.ex. "FORDON" (null = alla)
  ad_type TEXT DEFAULT 'all',  -- "sell" | "buy" | "all"
  exclude_words TEXT,          -- Kommaseparerad, t.ex. "köpes,sökes,reservdelar"
  sort_order TEXT DEFAULT 'PUBLISHED_DESC',
  -- BEFINTLIGA:
  region TEXT,                 -- Kan fasas ut till förmån för locations
  created_at TEXT DEFAULT (datetime('now')),
  active INTEGER DEFAULT 1,
  initial_scan_done INTEGER DEFAULT 0
);
```

### Migration

Lägg till de nya kolumnerna med ALTER TABLE om tabellen redan finns. Claude Code bör lägga till en enkel migreringslogik i `database.js` som kollar vilka kolumner som finns och lägger till saknade.

---

## Del 2: Tillgängliga filtervärden

### Steg 1 — Discovery (VIKTIGT)

Innan vi hårdkodar värden, be Claude Code testa vilka parametrar blocket-api.se faktiskt accepterar. Kör dessa curl-anrop och logga svaren:

```bash
# Generell sökning med locations-param
curl "https://blocket-api.se/v1/search?query=test&locations=STOCKHOLM"

# Generell sökning med category-param
curl "https://blocket-api.se/v1/search?query=test&category=FORDON"

# Kolla om sort_order fungerar
curl "https://blocket-api.se/v1/search?query=test&sort_order=PRICE_ASC"

# Kolla om price_from/price_to fungerar
curl "https://blocket-api.se/v1/search?query=test&price_from=100&price_to=5000"
```

Baserat på Python-bibliotekets enum-namn och REST API-exemplen bör dessa värden fungera, men verifiera:

### Locations (baserat på Python-bibliotekets Location-enum)

```
STOCKHOLM, GOTEBORG, MALMO, UPPSALA, BLEKINGE, DALARNA,
GAVLEBORG, GOTLAND, HALLAND, JAMTLAND, JONKOPING,
KALMAR, KRONOBERG, NORRBOTTEN, SKANE, SODERMANLAND,
VARMLAND, VASTERBOTTEN, VASTERNORRLAND, VASTMANLAND,
VASTRA_GOTALAND, OREBRO, OSTERGOTLAND
```

### Categories (baserat på Python-bibliotekets Category-enum)

```
FORDON, BOSTAD, ELEKTRONIK, FOR_HEMMET, PERSONLIGT,
FRITID_HOBBY_OCH_UNDERHALLNING, AFFARSVERKSAMHET,
HUSDJUR, OVRIGT
```

### Sort order

```
PUBLISHED_DESC (nyast först — bäst default för bevakning)
PUBLISHED_ASC
PRICE_ASC
PRICE_DESC
RELEVANCE
```

### Annonstyp

Blockets API använder `st`-parametern internt:
- `s` = säljes
- `k` = köpes
- Ingen param = alla

Undersök om blocket-api.se exponerar denna parameter eller om vi behöver filtrera client-side.

---

## Del 3: Client-side filtrering (exkluderingsord)

Oavsett vad API:et stöder behövs filtrering efter att resultaten kommit tillbaka. Implementera i polling-engine eller i en ny `filter.js`:

```javascript
/**
 * Filtrera bort annonser som matchar exkluderingsord.
 * Kollar i titel (och beskrivning om tillgänglig).
 * @param {ListingResult[]} listings
 * @param {string|null} excludeWords - kommaseparerad sträng
 * @returns {ListingResult[]}
 */
function applyExcludeFilter(listings, excludeWords) {
  if (!excludeWords) return listings;
  const words = excludeWords.split(',').map(w => w.trim().toLowerCase());
  return listings.filter(listing => {
    const text = `${listing.title} ${listing.description || ''}`.toLowerCase();
    return !words.some(word => text.includes(word));
  });
}
```

Dessutom: filtrera bort köpes-annonser client-side genom att kolla om titeln innehåller "köpes" eller "sökes", om API-parametern inte stöds.

---

## Del 4: Nytt WhatsApp-kommando "Ändra"

### State machine — utöka med nya states

```
Nuvarande:  idle → awaiting_query → idle
            idle → awaiting_selection (ta bort) → idle

Nytt:       idle → awaiting_selection (ändra) → awaiting_edit_choice → awaiting_edit_value → idle
```

### Flöde

```
User: "Ändra"
Bot:  Vilken bevakning vill du ändra?
      1. VW LT (max 50 000 kr) — alla kategorier, hela Sverige
      2. Canon EOS — alla kategorier, hela Sverige
      → state = awaiting_selection, action = 'edit'

User: "1"
Bot:  Vad vill du ändra för "VW LT"?
      1. Region (nu: hela Sverige)
      2. Kategori (nu: alla)
      3. Bara säljes (nu: allt)
      4. Exkludera ord (nu: inga)
      5. Maxpris (nu: 50 000 kr)
      6. Minpris (nu: inget)
      → state = awaiting_edit_choice, selectedWatch = 1

User: "1"
Bot:  Välj region:
      1. Stockholm
      2. Göteborg
      3. Malmö
      4. Uppsala
      ...
      0. Hela Sverige (ta bort filter)
      → state = awaiting_edit_value, editField = 'location'

User: "1"
Bot:  ✓ "VW LT" filtrerar nu på Stockholm
      → uppdatera DB, state = idle
```

### Alternativ: inline vid skapande

Användaren ska OCKSÅ kunna ange filter direkt vid "Lägg till":

```
User: "Lägg till VW LT under 50000 stockholm säljes"
Bot:  ✓ Bevakar nu: "VW LT"
      Max: 50 000 kr
      Region: Stockholm
      Typ: bara säljes
```

Parsning: efter att ha extraherat sökord och maxpris, matcha resterande ord mot kända locations och nyckelord som "säljes"/"köpes". Allt som inte matchas inkluderas i söktermen.

---

## Del 5: Uppdatera "Visa"-kommandot

Visa mer info per bevakning:

```
User: "Visa"
Bot:  Dina bevakningar:

      1. VW LT
         💰 Max 50 000 kr
         📍 Stockholm
         🏷️ Bara säljes
         🚫 Exkl: köpes, sökes
         📡 Blocket

      2. Canon EOS 700D
         💰 Inget tak
         📍 Hela Sverige
         🏷️ Alla typer
         📡 Blocket
```

---

## Del 6: Uppdatera Blocket-adaptern

### Skicka filter som query params

```javascript
async search(watch) {
  const params = {
    query: watch.query,
    sort_order: watch.sort_order || 'PUBLISHED_DESC',
  };

  if (watch.max_price) params.price_to = watch.max_price;
  if (watch.min_price) params.price_from = watch.min_price;
  if (watch.locations) params.locations = watch.locations; // "STOCKHOLM,UPPSALA"
  if (watch.category) params.category = watch.category;    // "FORDON"

  const res = await fetch(`${this.baseUrl}/search?${new URLSearchParams(params)}`);
  let results = await this.parseResults(res);

  // Client-side filtrering
  results = applyExcludeFilter(results, watch.exclude_words);
  results = applyAdTypeFilter(results, watch.ad_type);

  return results;
}
```

---

## Del 7: Uppdatera databas-queries

Nya queries:

```javascript
updateWatchLocation(watchId, location)    // UPDATE watches SET locations = ? WHERE id = ?
updateWatchCategory(watchId, category)    //   ""     category
updateWatchAdType(watchId, adType)        //   ""     ad_type
updateWatchExcludeWords(watchId, words)   //   ""     exclude_words
updateWatchPrice(watchId, field, value)   //   ""     max_price / min_price
```

Eller en generisk:
```javascript
updateWatch(watchId, field, value)        // UPDATE watches SET {field} = ? WHERE id = ?
```

Med validering att `field` är ett tillåtet kolumnnamn (undvik SQL injection).

---

## Byggordning

1. **Discovery** — Testa vilka query params blocket-api.se faktiskt accepterar (curl-anrop)
2. **Datamodell** — Utöka watches-tabellen + migrering
3. **Filter-logik** — `filter.js` med exclude-words och ad-type-filtrering
4. **Adapter** — Uppdatera Blocket-adaptern att skicka filter-params
5. **DB-queries** — Uppdatera database.js med nya update-queries
6. **"Visa"-kommando** — Utöka med filterinfo
7. **"Ändra"-kommando** — Ny state machine med flerstegsflöde
8. **Inline-parsning** — Matcha filter-nyckelord vid "Lägg till"
9. **Testa** — Skapa bevakning, lägg till filter, verifiera att polling respekterar dem

---

## Noteringar till Claude Code

- Steg 1 (discovery) är KRITISKT — gör inte antaganden om vilka params som fungerar. Testa med curl först.
- Behåll bred sökning som default. Filter ska vara opt-in, aldrig automatiskt pålagda.
- `fromMe`-filtret i whatsapp.js ska INTE finnas — boten ska reagera på alla meddelanden i gruppen oavsett avsändare.
- Enum-värdena för locations/categories kan behöva justeras baserat på vad API:et faktiskt accepterar — det som listas ovan är baserat på Python-bibliotekets enum-namn och kanske inte mappar 1:1 till REST-API:ets params.
- Validera alltid input från WhatsApp — om användaren skriver "Stockholm" matcha det case-insensitively mot "STOCKHOLM".
- Migreringslogik ska vara idempotent — det ska gå att köra om utan att förlora data.
