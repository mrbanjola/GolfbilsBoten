import { BaseAdapter } from './base.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const AUCTIONET_API = 'https://auctionet.com/api/v2/items.json';

export class AuctionetAdapter extends BaseAdapter {
  constructor(delayMs = 1000) {
    super('auctionet');
    this.delayMs = delayMs;
  }

  async search(watch) {
    try {
      const params = new URLSearchParams({ state: 'published', q: watch.query });
      const url = `${AUCTIONET_API}?${params}`;
      console.log(`[Auctionet] Söker: ${watch.query}`);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);

      let response;
      try {
        response = await fetch(url, {
          headers: { 'accept': 'application/json', 'user-agent': 'Mozilla/5.0' },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        console.error(`[Auctionet] HTTP ${response.status} för query="${watch.query}"`);
        return [];
      }

      const data = await response.json();
      await sleep(this.delayMs);

      const items = Array.isArray(data.items) ? data.items : [];
      console.log(`[Auctionet] Hittade ${items.length} auktioner`);

      const listings = items.map((item) => ({
        id: String(item.id),
        platform: 'auctionet',
        title: item.title ?? '',
        price: typeof item.next_bid_amount === 'number' ? item.next_bid_amount : null,
        currency: item.currency ?? 'SEK',
        location: item.location ?? item.house ?? '',
        url: item.url ?? `https://auctionet.com/sv/items/${item.id}`,
        imageUrl: item.images?.[0]?.w640 ?? null,
        auctionEnd: item.ends_at ? new Date(item.ends_at * 1000).toISOString() : null,
        bidCount: Array.isArray(item.bids) ? item.bids.length : 0,
        noReserve: false,
        reserveMet: item.reserve_met ?? false,
        ended: false,
        metadata: {},
      })).filter((l) => l.id && l.title);

      return this.filterByPrice(listings, watch.min_price, watch.max_price);
    } catch (err) {
      console.error(`[Auctionet] Fel vid sökning för "${watch.query}":`, err.message);
      return [];
    }
  }

  filterByPrice(listings, minPrice, maxPrice) {
    return listings.filter((l) => {
      if (l.price !== null && l.price > 0) {
        if (minPrice && l.price < minPrice) return false;
        if (maxPrice && l.price > maxPrice) return false;
      }
      return true;
    });
  }
}
