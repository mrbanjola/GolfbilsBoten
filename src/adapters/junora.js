import { BaseAdapter } from './base.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const JUNORA_API = 'https://auctioneer-api.junora.se/api/auctions/';
const JUNORA_BASE = 'https://junora.se/auctions';
const RESULT_LIMIT = 20;

export class JunoraAdapter extends BaseAdapter {
  constructor(delayMs = 1000) {
    super('junora');
    this.delayMs = delayMs;
  }

  async search(watch) {
    try {
      const params = new URLSearchParams({
        page: '0',
        pageSize: String(RESULT_LIMIT),
        sortBy: 'timeleft-ascending',
        statusFilter: 'Active',
        search: watch.query,
      });
      const url = `${JUNORA_API}?${params}`;
      console.log(`[Junora] Söker: ${watch.query}`);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);

      let response;
      try {
        response = await fetch(url, {
          headers: {
            'accept': '*/*',
            'origin': 'https://junora.se',
            'referer': 'https://junora.se/',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        console.error(`[Junora] HTTP ${response.status} för query="${watch.query}"`);
        return [];
      }

      const data = await response.json();
      await sleep(this.delayMs);

      const items = Array.isArray(data.auctions) ? data.auctions : [];
      console.log(`[Junora] Hittade ${items.length} auktioner (av ${data.total ?? '?'} totalt)`);

      const listings = items.map((item) => ({
        id: String(item.remoteId),
        platform: 'junora',
        title: item.name ?? '',
        price: typeof item.currentPrice === 'number' ? Math.round(item.currentPrice) : null,
        currency: 'SEK',
        location: item.city ?? '',
        url: `${JUNORA_BASE}/${item.slug}`,
        imageUrl: item.imageUrl ?? null,
        auctionEnd: item.endTimeUtc ? item.endTimeUtc + 'Z' : null,
        bidCount: item.numBids ?? 0,
        noReserve: item.withoutReservationPrice ?? false,
        reserveMet: item.reservationPriceMet ?? false,
        ended: false,
        metadata: {},
      })).filter((l) => l.id && l.title);

      return this.filterByPrice(listings, watch.min_price, watch.max_price);
    } catch (err) {
      console.error(`[Junora] Fel vid sökning för "${watch.query}":`, err.message);
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
