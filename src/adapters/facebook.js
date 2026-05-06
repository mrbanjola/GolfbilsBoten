import { BaseAdapter } from './base.js';
import { chromium } from 'playwright';
import { existsSync } from 'fs';
import { join } from 'path';
import { isAdSeen } from '../db/database.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Örebro, 402km radius — täcker större delen av södra Sverige inklusive Göteborg, Malmö, Linköping, Jönköping etc.
const DEFAULT_LOCATION_ID = '110611878960213';
// Max antal detaljsidor att besöka per poll-cykel (varje sida tar ~3 sek)
const MAX_DETAIL_FETCHES = 10;
// Stäng webbläsaren efter denna tid utan aktivitet
const BROWSER_IDLE_MS = 5 * 60 * 1000;

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-zygote',
  '--single-process',
  '--disable-extensions',
  '--disable-background-networking',
];

export class FacebookAdapter extends BaseAdapter {
  constructor(claudeApiKey, dataDir, delayMs = 1000) {
    super('facebook');
    this.authFile = join(dataDir, 'facebook-auth.json');
    this.delayMs = delayMs;
    this._browser = null;
    this._context = null;
    this._idleTimer = null;
  }

  async _getContext() {
    clearTimeout(this._idleTimer);

    if (!this._browser?.isConnected()) {
      this._browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
      this._context = await this._browser.newContext({
        storageState: this.authFile,
        viewport: { width: 1440, height: 900 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      });

      // Blockera bilder, media, fonter och CSS — sparar 100-150 MB per sidladdning
      await this._context.route('**/*', (route) => {
        const t = route.request().resourceType();
        if (['image', 'media', 'font', 'stylesheet'].includes(t)) route.abort();
        else route.continue();
      });

      console.log('[Facebook] Webbläsare startad');
    }

    this._idleTimer = setTimeout(() => this._closeBrowser(), BROWSER_IDLE_MS);
    return this._context;
  }

  async _closeBrowser() {
    clearTimeout(this._idleTimer);
    if (this._browser) {
      await this._browser.close().catch(() => {});
      this._browser = null;
      this._context = null;
      console.log('[Facebook] Webbläsare stängd (idle)');
    }
  }

  async search(watch) {
    if (!existsSync(this.authFile)) {
      console.warn('[Facebook] Ingen inloggningssession — kör setup-facebook.js för att logga in');
      return [];
    }

    const locationId = watch.location || DEFAULT_LOCATION_ID;
    const url = `https://www.facebook.com/marketplace/${locationId}/search/?daysSinceListed=1&query=${encodeURIComponent(watch.query)}&exact=false`;
    console.log(`[Facebook] Söker: ${watch.query}`);

    let page = null;
    try {
      const context = await this._getContext();
      page = await context.newPage();

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      if (page.url().includes('login')) {
        console.warn('[Facebook] Session utgången — kör setup-facebook.js för att logga in igen');
        return [];
      }

      await this.dismissDialogs(page);

      try {
        await page.waitForSelector('a[href*="/marketplace/item/"]', { timeout: 15000 });
      } catch {
        console.warn(`[Facebook] Inga annonser hittades för "${watch.query}"`);
        return [];
      }

      await sleep(2000);

      // Hämta unika annons-URLs — stanna innan "Resultat utanför din sökning"-sektionen
      const hrefs = await page.$$eval('a[href*="/marketplace/item/"]', (links) => {
        const headings = [...document.querySelectorAll('h2, [role="heading"]')];
        const outsideSection = headings.find((el) =>
          el.textContent.trim().includes('Resultat utanför din sökning')
        );

        const seen = new Set();
        const results = [];
        for (const link of links) {
          // DOCUMENT_POSITION_FOLLOWING (4): länken ligger efter rubriken → hoppa över
          if (outsideSection && (outsideSection.compareDocumentPosition(link) & 4)) continue;
          const href = link.href.split('?')[0];
          if (seen.has(href)) continue;
          seen.add(href);
          results.push(href);
        }
        return results;
      });

      if (hrefs.length === 0) {
        console.warn(`[Facebook] Inga annonser hittades för "${watch.query}"`);
        return [];
      }

      console.log(`[Facebook] Hittade ${hrefs.length} unika annons-URLs`);

      const unseenHrefs = hrefs.filter((href) => {
        const m = href.match(/\/marketplace\/item\/(\d+)/);
        return m ? !isAdSeen(m[1], 'facebook') : true;
      });

      if (unseenHrefs.length === 0) {
        console.log(`[Facebook] Alla ${hrefs.length} annonser redan sedda`);
        return [];
      }

      const toFetch = unseenHrefs.slice(0, MAX_DETAIL_FETCHES);
      console.log(`[Facebook] Öppnar ${toFetch.length} detaljsidor (${unseenHrefs.length} osedda av ${hrefs.length})`);

      const listings = [];
      for (const href of toFetch) {
        const idMatch = href.match(/\/marketplace\/item\/(\d+)/);
        const id = idMatch?.[1];
        if (!id) continue;

        await sleep(this.delayMs);
        const detail = await this.fetchListingDetail(href, context);

        if (!detail.title) {
          console.log(`[Facebook] Ingen titel för annons ${id} — hoppar`);
          continue;
        }

        listings.push({
          id,
          platform: 'facebook',
          title: detail.title,
          price: detail.price,
          currency: 'SEK',
          location: detail.location ?? '',
          url: href,
          imageUrl: undefined,
          description: detail.description ?? null,
        });
      }

      return this.filterByPrice(listings, watch.min_price, watch.max_price);
    } catch (err) {
      console.error(`[Facebook] Fel vid sökning för "${watch.query}":`, err.message);
      return [];
    } finally {
      await page?.close().catch(() => {});
    }
  }

  // Besöker en enskild annons och extraherar data ur detaljsidans DOM.
  async fetchListingDetail(url, context) {
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sleep(1500);

      return await page.evaluate(() => {
        // Rubrik: h1 är alltid annonstiteln på detaljsidan
        const title = document.querySelector('h1')?.textContent?.trim() || null;

        // Pris: hitta första textnod som matchar svenskt prisformat ("15 000 kr")
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let priceText = null;
        let node;
        while ((node = walker.nextNode())) {
          if (/^\d[\d\s]*\s*kr$/i.test(node.textContent.trim())) {
            priceText = node.textContent.trim();
            break;
          }
        }
        const price = priceText ? parseInt(priceText.replace(/\D/g, ''), 10) || null : null;

        // Ort: "Publicerades ... i Ort, Län" — parsa ut ortsnamnet
        const bodyText = document.body.innerText;
        const locMatch = bodyText.match(/\bi\s+([A-ZÅÄÖ][a-zåäö]+(?:\s+[A-ZÅÄÖ][a-zåäö]+)?)\s*,\s*[A-Z]{2}\b/);
        const location = locMatch?.[1] || null;

        // Beskrivning: texten under "Säljarens beskrivning"-rubriken
        const descMatch = bodyText.match(/Säljarens beskrivning\s*\n([\s\S]{10,600}?)(?:\n{2,}|\nSkick\b|\nLeveransmetod\b|\nInformation om)/);
        const description = descMatch?.[1]?.trim().slice(0, 400) || null;

        return { title, price, location, description };
      });
    } catch (err) {
      console.warn(`[Facebook] Kunde inte hämta ${url}: ${err.message}`);
      return { title: null, price: null, location: null, description: null };
    } finally {
      await page.close();
    }
  }

  // Returnerar listing med description redan ifylld från search() — ingen extra hämtning nödvändig.
  async getListingDetails(listing) {
    return listing;
  }

  async dismissDialogs(page) {
    const dismissSelectors = [
      '[aria-label="Stäng"]',
      '[aria-label="Close"]',
      'div[role="dialog"] [aria-label="Stäng"]',
    ];
    for (const sel of dismissSelectors) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 1000 })) {
          await btn.click();
          await sleep(500);
        }
      } catch {
        // ignorera — dialogen kanske inte finns
      }
    }
  }

  filterByPrice(listings, minPrice, maxPrice) {
    return listings.filter((l) => {
      if (l.price !== null) {
        if (minPrice && l.price < minPrice) return false;
        if (maxPrice && l.price > maxPrice) return false;
      }
      return true;
    });
  }
}
