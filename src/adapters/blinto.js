import { BaseAdapter } from './base.js';
import * as cheerio from 'cheerio';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class BlintoAdapter extends BaseAdapter {
  /**
   * @param {number} delayMs - Delay mellan requests
   */
  constructor(delayMs = 1000) {
    super('blinto');
    this.delayMs = delayMs;
    this.apiKey = process.env.BLINTO_API_KEY || 'ca02b829-4051-4f28-998d-f9c69a733aa9';
  }

  /**
   * Sök efter auktioner på Blinto via HelloRetail API.
   * @param {Object} watch
   * @returns {Promise<import('./base.js').ListingResult[]>}
   */
  async search(watch) {
    try {
      const params = new URLSearchParams({
        key: this.apiKey,
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

      const url = 'https://core.helloretail.com/api/v1/search/partnerSearch';
      console.log(`[Blinto] Söker: ${watch.query}`);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);

      let response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'origin': 'https://www.blinto.se',
            'referer': 'https://www.blinto.se/',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          body: params.toString(),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      console.log(`[Blinto] Svar: ${response.status}`);

      if (!response.ok) {
        console.error(`[Blinto] HTTP ${response.status} för query="${watch.query}"`);
        return [];
      }

      const data = await response.json();
      await sleep(this.delayMs);

      const results = this.parseBlintoResults(data);
      console.log(`[Blinto] Parsade ${results.length} auktioner`);

      return this.filterByPrice(results, watch.min_price, watch.max_price);
    } catch (err) {
      console.error(`[Blinto] Fel vid sökning för "${watch.query}":`, err.message);
      return [];
    }
  }

  /**
   * Parsera Blinto/HelloRetail API-respons.
   * @param {any} data
   * @returns {import('./base.js').ListingResult[]}
   */
  parseBlintoResults(data) {
    try {
      if (!data.result || data.product_results === 0) {
        console.log('[Blinto] Inga resultat');
        return [];
      }

      const $ = cheerio.load(data.result);
      const results = [];

      $('.hr-search-overlay-product').each((_, el) => {
        const $el = $(el);
        const rawId = $el.attr('id') || '';
        const id = rawId.replace('hr_searchresult_', '');

        if (!id) return;

        const $link = $el.find('.hr-search-overlay-product-link');
        const title = $el.find('.hr-search-overlay-product-title').text().trim();
        const subtitle = $el.find('.hr-search-overlay-product-longtitle').text().trim();
        const priceText = $el.find('.hr-search-overlay-product-price').text();
        const price = this.parsePrice(priceText);
        const location = $el.find('.hr-search-overlay-product-town').text().trim();
        const url = $link.attr('href') || '';
        const imageUrl = $el.find('.hr-search-overlay-product-image').attr('src') || null;
        const auctionEnd = $el.attr('data-endingtime') || null;
        const bidCountText = $el.find('.hr-search-overlay-product-bids').text();
        const bidCount = this.parseBidCount(bidCountText);
        const auctionStatus = $el.attr('data-auctionstatus');
        const ended = auctionStatus !== '2'; // 2 = aktiv

        if (ended || !title || !url) return;

        results.push({
          id,
          platform: 'blinto',
          title,
          subtitle: subtitle || undefined,
          price,
          currency: 'SEK',
          location,
          url,
          imageUrl,
          auctionEnd,
          bidCount,
          noReserve: false,
          reserveMet: false,
          ended,
          metadata: {},
        });
      });

      return results;
    } catch (err) {
      console.error('[Blinto] Fel vid HTML-parsing:', err.message);
      return [];
    }
  }

  /**
   * Parse pris från sträng.
   * @param {string} text
   * @returns {number|null}
   */
  parsePrice(text) {
    const clean = text.replace(/[^\d,]/g, '').replace(',', '.');
    const match = clean.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Parse antal bud från sträng (t.ex. "48 bud").
   * @param {string} text
   * @returns {number}
   */
  parseBidCount(text) {
    const match = text.trim().match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Filtrera på pris.
   * @param {import('./base.js').ListingResult[]} listings
   * @param {number|null} minPrice
   * @param {number|null} maxPrice
   * @returns {import('./base.js').ListingResult[]}
   */
  filterByPrice(listings, minPrice, maxPrice) {
    return listings.filter((l) => {
      if (l.price === null || l.price <= 0) return false;
      if (minPrice && l.price < minPrice) return false;
      if (maxPrice && l.price > maxPrice) return false;
      return true;
    });
  }
}
