# Begagnat Monitor — Auktionsadaptrar (Klaravik + Blinto)

## Mål

Lägga till Klaravik och Blinto som datakällor i begagnat-monitorn. Samma bevakningsmodell som Blocket — sökord, polling, dedup, WhatsApp-notis. Auktioner har dock extra data (sluttid, antal bud, aktuellt bud) som ska visas i notisen.

---

## Övergripande

- Båda adaptrarna ska extenda samma `BaseAdapter`-interface som Blocket-adaptern
- Bevakningar styr vilka plattformar som pollas via `platforms`-fältet i watches-tabellen (t.ex. "blocket,klaravik,blinto")
- Polling-intervall för auktionssajter kan vara längre — var 15-30 min räcker, eller manuellt en gång om dagen
- Auktionsdata kräver utökade fält i `ListingResult`

---

## Utökat ListingResult-format

```javascript
/**
 * @typedef {Object} ListingResult
 * @property {string} id              - Unikt annons/auktions-ID
 * @property {string} platform        - "blocket" | "klaravik" | "blinto"
 * @property {string} title           - Rubrik
 * @property {string} [subtitle]      - Undertitel/modell (Blinto har detta separat)
 * @property {number|null} price      - Aktuellt bud / pris i SEK
 * @property {string} currency        - "SEK"
 * @property {string} location        - Plats/ort
 * @property {string} url             - Direktlänk
 * @property {string} [imageUrl]      - Första bilden
 * @property {string} [createdAt]     - Publiceringsdatum
 *
 * Auktionsspecifika fält:
 * @property {string} [auctionEnd]    - Sluttid ISO 8601 eller "YYYY-MM-DD HH:mm"
 * @property {number} [bidCount]      - Antal bud
 * @property {boolean} [noReserve]    - Inget reservationspris
 * @property {boolean} [reserveMet]   - Reservationspris uppnått
 * @property {boolean} [ended]        - Auktionen är avslutad
 */
```

---

## Adapter 1: Klaravik (`adapters/klaravik.js`)

### Datakälla

Server-side rendered HTML. Vanligt HTTP GET-anrop, svaret är en komplett HTML-sida.

### URL-struktur

```
Sökning:    https://www.klaravik.se/auktion/?searchtext={query}
Kategori:   https://www.klaravik.se/auktion/fordon/
Alla:       https://www.klaravik.se/auktion/
```

### HTTP-anrop

```javascript
const response = await fetch(`https://www.klaravik.se/auktion/?searchtext=${encodeURIComponent(query)}`, {
  headers: {
    'accept': 'text/html',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  }
});
const html = await response.text();
```

Inget behov av cookies, auth, eller session för att hämta sökresultat.

### HTML-parsning (Cheerio)

Varje auktion är en `<article>` med id `product_card--{id}`.

```javascript
import * as cheerio from 'cheerio';

function parseKlaravikResults(html) {
  const $ = cheerio.load(html);
  const results = [];

  $('article[id^="product_card--"]').each((_, el) => {
    const $el = $(el);
    const id = $el.attr('id').replace('product_card--', '');
    const $link = $el.find('a').first();
    const $fav = $el.find('[class*="addFav_"]');

    // Kolla om auktionen är avslutad — skippa i så fall
    const endedTag = $el.find('.product_card__ended-tag').text().trim();
    if (endedTag === 'Avslutad') return;

    results.push({
      id,
      platform: 'klaravik',
      title: $el.find('.product_card__title').text().trim(),
      price: parsePrice($el.find('.product_card__current-bid').text()),
      currency: 'SEK',
      location: $el.find('.product_card__info-text').text().trim(),
      url: 'https://www.klaravik.se' + $link.attr('href'),
      imageUrl: $el.find('.product_card__listing_img img').attr('src') || null,

      // Auktionsdata
      auctionEnd: $fav.attr('data-auction-close') || null,
      bidCount: parseBidCount($el.find('[id^="antbids_"]').text()),
      noReserve: $el.find('.product_card__no-reserve-tag').length > 0,
      reserveMet: !$el.hasClass('product_card--reserve-not-reached'),
      ended: false,
    });
  });

  return results;
}

function parsePrice(text) {
  const match = text.replace(/\s/g, '').match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function parseBidCount(text) {
  const match = text.trim().match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}
```

### Selektorer sammanfattning

| Data | Selektor |
|------|----------|
| Artikel-wrapper | `article[id^="product_card--"]` |
| Titel | `.product_card__title` |
| Aktuellt bud | `.product_card__current-bid` |
| Plats | `.product_card__info-text` |
| Antal bud | `[id^="antbids_"]` (text) |
| Länk | `a[href]` (första i article) |
| Bild | `.product_card__listing_img img[src]` |
| Sluttid | `.addFav_*[data-auction-close]` |
| Startdatum | `.addFav_*[data-auction-start]` |
| Avslutad | `.product_card__ended-tag` innehåller "Avslutad" |
| Inget res.pris | `.product_card__no-reserve-tag` finns |
| Res.pris uppnått | Klassen `product_card--reserve-not-reached` saknas |

### Dependency

```bash
npm install cheerio
```

---

## Adapter 2: Blinto (`adapters/blinto.js`)

### Datakälla

Blinto använder HelloRetail som extern söktjänst. POST-anrop till deras API returnerar JSON med HTML-fragment i `result`-fältet.

### Endpoint

```
POST https://core.helloretail.com/api/v1/search/partnerSearch
Content-Type: application/x-www-form-urlencoded
```

### HTTP-anrop

```javascript
async search(watch) {
  const params = new URLSearchParams({
    key: 'ca02b829-4051-4f28-998d-f9c69a733aa9',
    q: watch.query,
    'filters[]': 'inStock:true',
    device_type: 'DESKTOP',
    product_count: '42',
    product_start: '0',
    category_count: '12',
    category_start: '0',
    id: '49118',
    return_filters: 'true',
    websiteUuid: 'b2912bc1-fd48-4a6a-8b7a-05356931ff35',
    trackingUserId: '000000000000000000000000',
  });

  const response = await fetch('https://core.helloretail.com/api/v1/search/partnerSearch', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'origin': 'https://www.blinto.se',
      'referer': 'https://www.blinto.se/',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    body: params.toString(),
  });

  const data = await response.json();
  return this.parseResults(data);
}
```

### Parametrar

| Param | Värde | Beskrivning |
|-------|-------|-------------|
| `key` | `ca02b829-4051-4f28-998d-f9c69a733aa9` | Blintos publika HelloRetail-nyckel |
| `q` | sökterm | Sökfråga |
| `filters[]` | `inStock:true` | Bara aktiva auktioner |
| `product_count` | `42` | Antal resultat per sida |
| `product_start` | `0` | Offset för paginering |
| `websiteUuid` | `b2912bc1-fd48-4a6a-8b7a-05356931ff35` | Blintos site-ID |
| `trackingUserId` | `000000000000000000000000` | Kan vara nollor |

### Respons-format

```json
{
  "result": "<div class='hr-results'>...HTML...</div>",
  "product_results": 3,
  "start": 0,
  "product_start": 0,
  "results": 3
}
```

### HTML-parsning (Cheerio)

HTML:en sitter i `data.result`. Varje auktion är en `.hr-search-overlay-product`.

```javascript
function parseBlintoResults(data) {
  if (!data.result || data.product_results === 0) return [];

  const $ = cheerio.load(data.result);
  const results = [];

  $('.hr-search-overlay-product').each((_, el) => {
    const $el = $(el);
    const rawId = $el.attr('id') || '';
    const id = rawId.replace('hr_searchresult_', '');
    const $link = $el.find('.hr-search-overlay-product-link');

    results.push({
      id,
      platform: 'blinto',
      title: $el.find('.hr-search-overlay-product-title').text().trim(),
      subtitle: $el.find('.hr-search-overlay-product-longtitle').text().trim(),
      price: parsePrice($el.find('.hr-search-overlay-product-price').text()),
      currency: 'SEK',
      location: $el.find('.hr-search-overlay-product-town').text().trim(),
      url: $link.attr('href') || '',
      imageUrl: $el.find('.hr-search-overlay-product-image').attr('src') || null,

      // Auktionsdata
      auctionEnd: $el.attr('data-endingtime') || null,
      bidCount: parseBidCount($el.find('.hr-search-overlay-product-bids').text()),
      noReserve: false,
      reserveMet: false,
      ended: $el.attr('data-auctionstatus') !== '2',
    });
  });

  return results;
}
```

### Selektorer sammanfattning

| Data | Selektor / Attribut |
|------|---------------------|
| Wrapper | `.hr-search-overlay-product` |
| ID | `#hr_searchresult_{id}` (elementets id-attribut) |
| Titel | `.hr-search-overlay-product-title` |
| Modell/undertitel | `.hr-search-overlay-product-longtitle` |
| Pris | `.hr-search-overlay-product-price` |
| Plats | `.hr-search-overlay-product-town` |
| Antal bud | `.hr-search-overlay-product-bids` (text, t.ex. "48 bud") |
| Sluttid | `data-endingtime` på wrappern (format: "2026-04-27 11:19") |
| Auktionsstatus | `data-auctionstatus` på wrappern (2 = aktiv) |
| Länk | `.hr-search-overlay-product-link[href]` (full URL) |
| Bild | `.hr-search-overlay-product-image[src]` |

---

## Uppdatera notisformatet (`bot/formatter.js`)

Auktionsnotiser ska se annorlunda ut än vanliga Blocket-annonser:

```
🔨 *Ny auktion!*
Bevakning: "Iveco Daily"

*Lastbil Iveco Daily 72-180*
317 000 SEK · 70 bud
📍 Oskarshamn
⏰ Avslutas: 30 apr 09:22
🏷️ Inget reservationspris

https://www.klaravik.se/auktion/produkt/3187266-lastbil-iveco/
```

Logik:
- Använd 🔨 istället för 🔔 för auktioner (visuell distinktion)
- Visa antal bud och aktuellt bud
- Visa sluttid — formatera `auctionEnd` till läsbart datum
- Visa reservationspris-status om relevant
- Källa (Klaravik/Blinto) framgår av URL:en

---

## Uppdatera watches-tabellen

Fältet `platforms` ska stödja "klaravik" och "blinto" som värden:

```
platforms TEXT NOT NULL DEFAULT 'blocket'
-- Tillåtna värden: kommaseparerad lista av "blocket", "klaravik", "blinto"
-- Exempel: "blocket,klaravik,blinto"
```

Ingen schemaändring behövs — fältet är redan en fri textsträng.

---

## Uppdatera polling-engine (`polling/engine.js`)

Polling-enginen ska:
1. Läsa `platforms`-fältet från varje bevakning
2. Splitta på komma
3. Köra sökning via rätt adapter per plattform
4. Dedup sker per plattform+id (redan implementerat via `seen_ads` primary key)

```javascript
const adapters = {
  blocket: new BlocketAdapter(),
  klaravik: new KlaravikAdapter(),
  blinto: new BlintoAdapter(),
};

for (const watch of activeWatches) {
  const platforms = watch.platforms.split(',').map(p => p.trim());
  for (const platform of platforms) {
    const adapter = adapters[platform];
    if (!adapter) continue;
    const results = await adapter.search(watch);
    // ... dedup + notis som vanligt
  }
}
```

---

## Uppdatera WhatsApp-kommandon

### "Lägg till" — stödja plattformsval

Inline vid skapande:

```
User: "Lägg till Iveco Daily under 100000 klaravik blinto"
Bot:  ✓ Bevakar nu: "Iveco Daily"
      Max: 100 000 kr
      Plattformar: Klaravik, Blinto
```

Parsning: matcha ord mot kända plattformsnamn ("blocket", "klaravik", "blinto") och separera från söktermen. Om inga plattformar anges, default till "blocket".

### "Ändra" — plattformsval

Lägg till som alternativ i ändra-flödet:

```
Vad vill du ändra för "Iveco Daily"?
1. Region
2. Kategori
3. Bara säljes
4. Exkludera ord
5. Maxpris
6. Minpris
7. Plattformar (nu: Blocket)
```

### "Visa" — visa plattformar

```
1. Iveco Daily (max 100 000 kr)
   📡 Klaravik, Blinto
```

---

## Byggordning

1. **`npm install cheerio`**
2. **Klaravik-adapter** — implementera `adapters/klaravik.js` med parsning enligt selektorerna ovan
3. **Blinto-adapter** — implementera `adapters/blinto.js` med HelloRetail POST + parsning
4. **Testa adaptrarna isolerat** — kör sökningar och logga resultaten innan du kopplar in dem i polling-loopen
5. **Uppdatera polling-engine** — hantera `platforms`-fältet och routea till rätt adapter
6. **Uppdatera formatter** — auktionsspecifikt notisformat
7. **Uppdatera kommandotolk** — plattformsval vid "Lägg till" och "Ändra"
8. **Uppdatera admin-sida** — plattformsval vid redigering av bevakningar

---

## Noteringar till Claude Code

- Cheerio behövs bara för Klaravik och Blinto, inte för Blocket (som använder JSON API)
- Klaravik returnerar HTML direkt, Blinto returnerar JSON med HTML i `result`-fältet — parsningslogiken är separat men båda använder Cheerio
- Blinto-sökningen är ett cross-origin POST mot HelloRetail — `origin` och `referer` headers behövs
- HelloRetail-nyckeln (`key`) och `websiteUuid` är publika och hårdkodade i Blintos frontend — de är inte hemliga
- `trackingUserId` kan vara nollor, det påverkar inte sökresultaten
- Filtrera bort avslutade auktioner i parsern, inte i polling-engine — det är plattformsspecifik logik
- Sluttidsformaten skiljer sig: Klaravik ger ISO 8601 med tidszon, Blinto ger "YYYY-MM-DD HH:mm" utan tidszon (anta CET/CEST)
- `data-auctionstatus="2"` på Blinto betyder aktiv auktion — andra värden innebär avslutad eller kommande
- Paginering: för normala bevakningssökningar behövs troligen inte paginering (under 42 resultat per sökord). Implementera bara om det visar sig behövas.
- Rate limiting: max 1 request per sekund per plattform, samma som för Blocket
- Testa med riktiga sökord som "iveco", "traktor", "grävmaskin" för att verifiera parsningen
