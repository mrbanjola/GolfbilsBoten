import { BaseAdapter } from './base.js';
import { fetchListingPageDetails } from './detail-fetch.js';

const BASE_URL = 'https://api.tradera.com/v4';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class TraderaAdapter extends BaseAdapter {
  constructor(appId, appKey, delayMs = 1000) {
    super('tradera');
    this.appId = appId;
    this.appKey = appKey;
    this.delayMs = delayMs;
  }

  async search(watch) {
    try {
      const params = new URLSearchParams();
      params.set('query', watch.query);
      params.set('pageNumber', '1');

      const url = `${BASE_URL}/search?${params.toString()}`;
      console.log(`[Tradera] Soker: ${url}`);

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
        console.error(`[Tradera] API returnerade ${response.status} - ${body.slice(0, 200)}`);
        return [];
      }

      const data = await response.json();
      await sleep(this.delayMs);

      const results = this.mapResults(data);
      return this.filterByPrice(results, watch.min_price, watch.max_price);
    } catch (err) {
      console.error(`[Tradera] Fel vid sokning for "${watch.query}":`, err.message);
      return [];
    }
  }

  mapResults(data) {
    const items = data?.items ?? [];
    if (!Array.isArray(items)) return [];

    return items.map((item) => {
      const id = String(item.id ?? '');
      const title = item.shortDescription ?? '';
      const price = item.buyItNowPrice ?? item.nextBid ?? null;
      const url = item.itemUrl?.replace('http://', 'https://') ?? '';
      const imageUrl = item.imageLinks?.find((link) => link.format === 'gallery')?.url
        ?? item.thumbnailLink
        ?? undefined;

      return {
        id,
        platform: 'tradera',
        title,
        price: price !== null ? Number(price) : null,
        currency: 'SEK',
        location: '',
        url,
        imageUrl,
        createdAt: undefined,
        tradeType: item.itemType === 'WantedItem' ? 'Kopes' : 'Saljes',
        metadata: {},
      };
    }).filter((listing) => listing.id);
  }

  filterByPrice(listings, minPrice, maxPrice) {
    return listings.filter((listing) => {
      if (listing.price === null || listing.price <= 0) return false;
      if (minPrice && listing.price < minPrice) return false;
      if (maxPrice && listing.price > maxPrice) return false;
      return true;
    });
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
      console.warn(`[Tradera] Kunde inte hamta detaljsida for ${listing.id}: ${err.message}`);
      return listing;
    }
  }
}
