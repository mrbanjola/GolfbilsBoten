import { BaseAdapter } from './base.js';

const BASE_URL = 'https://api.tradera.com/v4';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class TraderaAdapter extends BaseAdapter {
  /**
   * @param {string} appId
   * @param {string} appKey
   * @param {number} delayMs
   */
  constructor(appId, appKey, delayMs = 1000) {
    super('tradera');
    this.appId = appId;
    this.appKey = appKey;
    this.delayMs = delayMs;
  }

  /**
   * @param {Object} watch
   * @returns {Promise<import('./base.js').ListingResult[]>}
   */
  async search(watch) {
    try {
      const params = new URLSearchParams();
      params.set('query', watch.query);
      params.set('pageNumber', '1');

      const url = `${BASE_URL}/search?${params.toString()}`;
      console.log(`[Tradera] Söker: ${url}`);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);

      let response;
      try {
        response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'X-App-Id': this.appId,
            'X-App-Key': this.appKey,
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        console.error(`[Tradera] API returnerade ${response.status} — ${body.slice(0, 200)}`);
        return [];
      }

      const data = await response.json();
      await sleep(this.delayMs);

      const results = this._mapResults(data);
      return this._filterByPrice(results, watch.min_price, watch.max_price);
    } catch (err) {
      console.error(`[Tradera] Fel vid sökning för "${watch.query}":`, err.message);
      return [];
    }
  }

  /**
   * @param {any} data
   * @returns {import('./base.js').ListingResult[]}
   */
  _mapResults(data) {
    const items = data?.items ?? [];
    if (!Array.isArray(items)) return [];

    return items.map((item) => {
      const id = String(item.id ?? '');
      const title = item.shortDescription ?? '';
      const price = item.buyItNowPrice ?? item.nextBid ?? null;
      const url = item.itemUrl?.replace('http://', 'https://') ?? '';
      const imageUrl = item.imageLinks?.find(l => l.format === 'gallery')?.url
        ?? item.thumbnailLink
        ?? undefined;

      return {
        id,
        platform: 'tradera',
        title,
        price: price !== null ? Number(price) : null,
        currency: 'SEK',
        location: '',  // Tradera returnerar ingen plats i sökresultatet
        url,
        imageUrl,
        createdAt: undefined,
        tradeType: item.itemType === 'WantedItem' ? 'Köpes' : 'Säljes',
      };
    }).filter((r) => r.id);
  }

  /**
   * @param {import('./base.js').ListingResult[]} listings
   * @param {number|null} minPrice
   * @param {number|null} maxPrice
   */
  _filterByPrice(listings, minPrice, maxPrice) {
    return listings.filter((l) => {
      if (l.price === null || l.price <= 0) return false;
      if (minPrice && l.price < minPrice) return false;
      if (maxPrice && l.price > maxPrice) return false;
      return true;
    });
  }
}
