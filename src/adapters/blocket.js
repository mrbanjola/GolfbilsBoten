import { BaseAdapter } from './base.js';
import { fetchListingPageDetails } from './detail-fetch.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class BlocketAdapter extends BaseAdapter {
  constructor(baseUrl, delayMs = 1000) {
    super('blocket');
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.delayMs = delayMs;
  }

  async search(watch) {
    try {
      const params = new URLSearchParams();
      params.set('query', watch.query);
      params.set('page', '1');
      params.set('sort_order', watch.sort_order ?? 'PUBLISHED_DESC');
      if (watch.location) params.set('locations', watch.location);

      const endpoint = watch.is_car ? '/search/car' : '/search';
      const url = `${this.baseUrl}${endpoint}?${params.toString()}`;
      console.log(`[Blocket] Soker: ${url}`);

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
        console.error(`[Blocket] API returnerade ${response.status} for query="${watch.query}" - body: ${body.slice(0, 300)}`);
        return [];
      }

      const data = await response.json();
      await sleep(this.delayMs);

      const results = this.mapResults(data);
      return this.filterByPrice(results, watch.min_price, watch.max_price);
    } catch (err) {
      console.error(`[Blocket] Fel vid sokning for "${watch.query}":`, err.message);
      return [];
    }
  }

  filterByPrice(listings, minPrice, maxPrice) {
    return listings.filter((listing) => {
      if (listing.price === null || listing.price <= 0) return false;
      if (minPrice && listing.price < minPrice) return false;
      if (maxPrice && listing.price > maxPrice) return false;
      return true;
    });
  }

  mapResults(data) {
    const items = Array.isArray(data) ? data : (data?.docs ?? data?.data ?? data?.hits ?? data?.listings ?? []);

    if (!Array.isArray(items)) {
      console.error('[Blocket] Ovantat responsformat:', JSON.stringify(data).slice(0, 200));
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
        price: Number.isNaN(price) ? null : price,
        currency: 'SEK',
        location,
        url: adUrl,
        imageUrl,
        createdAt,
        tradeType,
        metadata: {},
      };
    }).filter((listing) => listing.id);
  }

  async getListingDetails(listing) {
    try {
      const details = await fetchListingPageDetails(listing.url);
      return {
        ...listing,
        description: details.description,
        detailText: details.detailText,
        metadata: { ...(listing.metadata ?? {}), ...details.metadata },
      };
    } catch (err) {
      console.warn(`[Blocket] Kunde inte hamta detaljsida for ${listing.id}: ${err.message}`);
      return listing;
    }
  }
}
