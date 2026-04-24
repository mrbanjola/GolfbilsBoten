import { BaseAdapter } from './base.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class BlocketAdapter extends BaseAdapter {
  /**
   * @param {string} baseUrl - API-bas-URL, t.ex. https://blocket-api.se/v1
   * @param {number} delayMs - Delay mellan requests
   */
  constructor(baseUrl, delayMs = 1000) {
    super('blocket');
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.delayMs = delayMs;
  }

  /**
   * Sök efter annonser på Blocket via blocket-api.se.
   * @param {Object} watch
   * @returns {Promise<import('./base.js').ListingResult[]>}
   */
  async search(watch) {
    try {
      const params = new URLSearchParams();
      params.set('query', watch.query);
      params.set('page', '1');
      params.set('sort_order', watch.sort_order ?? 'PUBLISHED_DESC');
      if (watch.location) params.set('locations', watch.location);

      const url = `${this.baseUrl}/search?${params.toString()}`;
      console.log(`[Blocket] Söker: ${url}`);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);

      let response;
      try {
        response = await fetch(url, {
          headers: { 'Accept': 'application/json', 'User-Agent': 'begagnat-monitor/1.0' },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      console.log(`[Blocket] Svar: ${response.status}`);

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        console.error(`[Blocket] API returnerade ${response.status} för query="${watch.query}" — body: ${body.slice(0, 300)}`);
        return [];
      }

      console.log(`[Blocket] Läser body...`);
      const data = await response.json();
      await sleep(this.delayMs);

      const results = this._mapResults(data);
      return this._filterByPrice(results, watch.min_price, watch.max_price);
    } catch (err) {
      console.error(`[Blocket] Fel vid sökning för "${watch.query}":`, err.message);
      return [];
    }
  }

  /**
   * Filtrerar resultat på pris client-side.
   * @param {import('./base.js').ListingResult[]} listings
   * @param {number|null} minPrice
   * @param {number|null} maxPrice
   * @returns {import('./base.js').ListingResult[]}
   */
  _filterByPrice(listings, minPrice, maxPrice) {
    return listings.filter((l) => {
      if (l.price === null || l.price <= 0) return false; // filtrera bort annonser utan pris
      if (minPrice && l.price < minPrice) return false;
      if (maxPrice && l.price > maxPrice) return false;
      return true;
    });
  }

  /**
   * Mappar API-respons till ListingResult[].
   * blocket-api.se returnerar { data: [...] } eller direkt en array.
   * @param {any} data
   * @returns {import('./base.js').ListingResult[]}
   */
  _mapResults(data) {
    const items = Array.isArray(data) ? data : (data?.docs ?? data?.data ?? data?.hits ?? data?.listings ?? []);

    if (!Array.isArray(items)) {
      console.error('[Blocket] Oväntat responsformat:', JSON.stringify(data).slice(0, 200));
      return [];
    }

    return items.map((item) => {
      const id = String(item.id ?? '');
      const title = item.heading ?? item.subject ?? item.title ?? '';
      const priceRaw = item.price?.amount ?? null;
      const price = priceRaw !== null ? Number(priceRaw) : null;
      const location = typeof item.location === 'string' ? item.location : (item.location?.name ?? '');
      const adUrl = item.canonical_url ?? (id ? `https://www.blocket.se/annons/${id}` : '');
      const imageUrl = item.image?.url ?? item.image_urls?.[0] ?? undefined;
      const createdAt = item.timestamp ? new Date(item.timestamp).toISOString() : undefined;
      const tradeType = item.trade_type ?? '';

      return {
        id,
        platform: 'blocket',
        title,
        price: isNaN(price) ? null : price,
        currency: 'SEK',
        location,
        url: adUrl,
        imageUrl,
        createdAt,
        tradeType,
      };
    }).filter((r) => r.id); // filtrera bort rader utan ID
  }
}
