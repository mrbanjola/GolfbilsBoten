import { BaseAdapter } from './base.js';
import * as cheerio from 'cheerio';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class KlaravikAdapter extends BaseAdapter {
  /**
   * @param {number} delayMs - Delay mellan requests
   */
  constructor(delayMs = 1000) {
    super('klaravik');
    this.delayMs = delayMs;
  }

  /**
   * Sök efter auktioner på Klaravik via HTML-parsing.
   * @param {Object} watch
   * @returns {Promise<import('./base.js').ListingResult[]>}
   */
  async search(watch) {
    try {
      const url = `https://www.klaravik.se/auktion/?searchtext=${encodeURIComponent(watch.query)}`;
      console.log(`[Klaravik] Söker: ${url}`);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);

      let response;
      try {
        response = await fetch(url, {
          headers: {
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'accept-language': 'sv-SE,sv;q=0.9,en-US;q=0.8,en;q=0.7',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      console.log(`[Klaravik] Svar: ${response.status}`);

      if (!response.ok) {
        console.error(`[Klaravik] HTTP ${response.status} för query="${watch.query}"`);
        return [];
      }

      const html = await response.text();
      console.log(`[Klaravik] HTML längd: ${html.length} tecken`);

      await sleep(this.delayMs);

      const results = this.parseKlaravikResults(html);
      console.log(`[Klaravik] Parsade ${results.length} aktiva auktioner`);

      return this.filterByPrice(results, watch.min_price, watch.max_price);
    } catch (err) {
      console.error(`[Klaravik] Fel vid sökning för "${watch.query}":`, err.message);
      return [];
    }
  }

  /**
   * Parsera Klaravik HTML-svar.
   * @param {string} html
   * @returns {import('./base.js').ListingResult[]}
   */
  parseKlaravikResults(html) {
    try {
      const $ = cheerio.load(html);
      const results = [];

      // Varje auktion är en <article> med id "product_card--{id}"
      $('article[id^="product_card--"]').each((i, el) => {
        const $article = $(el);
        const articleId = $article.attr('id') || '';
        const id = articleId.replace('product_card--', '');

        if (!id) return;

        // Favoritknappen har auktionsdata som attribut
        const $fav = $article.find(`[class*="addFav_${id}"]`);
        const auctionEnd = $fav.attr('data-auction-close') || null;
        const auctionStart = $fav.attr('data-auction-start') || null;

        // Avgör om auktionen är avslutad:
        // Kolla sluttiden — om den har passerat är den avslutad.
        // OBS: "Avslutad"-taggen finns alltid i DOM:en men visas/döljs via CSS,
        // så vi kan INTE lita på att den har text content.
        if (auctionEnd) {
          const endDate = new Date(auctionEnd);
          if (endDate < new Date()) return; // Avslutad, skippa
        }

        const $link = $article.find('a').first();
        const href = $link.attr('href');
        const url = href ? (href.startsWith('http') ? href : 'https://www.klaravik.se' + href) : '';

        // Titel — finns både som title-attribut på länken och som text i .product_card__title
        const title = $article.find('.product_card__title').text().trim()
          || $link.attr('title')?.trim()
          || '';

        // Aktuellt bud
        const priceText = $article.find('.product_card__current-bid').text().trim();
        const price = this.parsePrice(priceText);

        // Plats — första .product_card__info-text (den med kartikonen bredvid)
        const location = $article.find('.product_card__info-text').first().text().trim() || 'Okänd plats';

        // Bild
        const imageUrl = $article.find('.product_card__listing_img img').attr('src') || null;

        // Antal bud — dedikerat element med id "antbids_{id}"
        const bidCountText = $article.find(`#antbids_${id}`).text().trim();
        const bidCount = this.parseBidCount(bidCountText);

        // Reservationspris-status
        const noReserve = $article.find('.product_card__no-reserve-tag').length > 0;
        // Artikeln har klassen "product_card--reserve-not-reached" om res.pris EJ uppnåtts
        const reserveMet = !$article.hasClass('product_card--reserve-not-reached');

        if (!title || !url) return;

        results.push({
          id,
          platform: 'klaravik',
          title,
          price,
          currency: 'SEK',
          location,
          url,
          imageUrl,
          auctionEnd,
          bidCount,
          noReserve,
          reserveMet,
          ended: false,
        });
      });

      return results;
    } catch (err) {
      console.error('[Klaravik] Fel vid HTML-parsing:', err.message);
      return [];
    }
  }

  /**
   * Parse pris från sträng typ "277 000 SEK".
   * @param {string} text
   * @returns {number|null}
   */
  parsePrice(text) {
    const clean = text.replace(/\s/g, '').replace(/SEK/i, '');
    const match = clean.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Parse antal bud från sträng typ "70".
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
      if (l.price === null) return true; // Inkludera om pris saknas
      if (minPrice && l.price < minPrice) return false;
      if (maxPrice && l.price > maxPrice) return false;
      return true;
    });
  }
}