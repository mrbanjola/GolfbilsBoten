import { BaseAdapter } from './base.js';
import * as cheerio from 'cheerio';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const BUDI_BASE = 'https://www.budi.se';
const RESULT_LIMIT = 10;

export class BudiAdapter extends BaseAdapter {
  constructor(delayMs = 1000) {
    super('budi');
    this.delayMs = delayMs;
  }

  async search(watch) {
    try {
      const params = new URLSearchParams({ q: watch.query, s: 'sho' });
      const url = `${BUDI_BASE}/objekt?${params}`;
      console.log(`[Budi] Söker: ${watch.query}`);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);

      let response;
      try {
        response = await fetch(url, {
          headers: {
            'accept': '*/*',
            'x-requested-with': 'XMLHttpRequest',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
            'referer': `${BUDI_BASE}/objekt`,
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        console.error(`[Budi] HTTP ${response.status} för query="${watch.query}"`);
        return [];
      }

      const html = await response.text();
      await sleep(this.delayMs);

      const listings = this.parseResults(html);
      console.log(`[Budi] Parsade ${listings.length} auktioner (topp ${RESULT_LIMIT} kortast tid kvar)`);

      return this.filterByPrice(listings, watch.min_price, watch.max_price);
    } catch (err) {
      console.error(`[Budi] Fel vid sökning för "${watch.query}":`, err.message);
      return [];
    }
  }

  parseResults(html) {
    const $ = cheerio.load(html);
    const results = [];

    $('.budi-auctionobject__card').slice(0, RESULT_LIMIT).each((_, el) => {
      const $el = $(el);
      const id = $el.attr('data-budi-auctionobject-id');
      const ended = $el.attr('data-budi-auctionobject-isended') === 'true';
      const auctionEnd = $el.attr('data-budi-auctionobject-endingdatetimeiso') ?? null;

      if (!id || ended) return;

      const href = $el.attr('href') ?? '';
      const url = href.startsWith('http') ? href : `${BUDI_BASE}${href}`;
      const title = $el.find('.budi-auctionobject__desc p').first().text().trim();
      const priceText = $el.find('.budi-auctionobject__bid-current-amount').text();
      const price = this.parsePrice(priceText);
      const location = $el.find('.budi-auctionobject__location').text().trim();
      const imageUrl = $el.find('.budi-auctionobject__card-thumb-img').attr('src') ?? null;
      const bidCount = parseInt($el.find('.budi-auctionobject__bid-count').text().match(/\d+/)?.[0] ?? '0', 10);

      if (!title || !url) return;

      results.push({
        id,
        platform: 'budi',
        title,
        price,
        currency: 'SEK',
        location,
        url,
        imageUrl,
        auctionEnd,
        bidCount,
        noReserve: false,
        reserveMet: false,
        ended: false,
        metadata: {},
      });
    });

    return results;
  }

  parsePrice(text) {
    const digits = text.replace(/[^\d]/g, '');
    return digits ? parseInt(digits, 10) : null;
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
