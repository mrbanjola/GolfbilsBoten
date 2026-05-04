import { BaseAdapter } from './base.js';
import { chromium } from 'playwright';
import { existsSync } from 'fs';
import { join } from 'path';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Örebro, 402km radius — täcker hela Sverige
const DEFAULT_LOCATION_ID = '110611878960213';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

export class FacebookAdapter extends BaseAdapter {
  constructor(claudeApiKey, dataDir, delayMs = 1000) {
    super('facebook');
    this.claudeApiKey = claudeApiKey;
    this.authFile = join(dataDir, 'facebook-auth.json');
    this.delayMs = delayMs;
  }

  async search(watch) {
    if (!this.claudeApiKey) {
      console.warn('[Facebook] CLAUDE_API_KEY saknas — kan inte parsa sökresultat');
      return [];
    }
    if (!existsSync(this.authFile)) {
      console.warn('[Facebook] Ingen inloggningssession — kör setup-facebook.js för att logga in');
      return [];
    }

    const locationId = watch.location || DEFAULT_LOCATION_ID;
    const url = `https://www.facebook.com/marketplace/${locationId}/search/?daysSinceListed=1&query=${encodeURIComponent(watch.query)}&exact=false`;
    console.log(`[Facebook] Söker: ${watch.query}`);

    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        storageState: this.authFile,
        viewport: { width: 1440, height: 900 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      });
      const page = await context.newPage();

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Kontrollera om sessionen gick ut
      if (page.url().includes('login')) {
        console.warn('[Facebook] Session utgången — kör setup-facebook.js för att logga in igen');
        return [];
      }

      // Stäng eventuella dialoger (cookie-banner, notiser etc.)
      await this.dismissDialogs(page);

      // Vänta på att annonser laddas
      try {
        await page.waitForSelector('a[href*="/marketplace/item/"]', { timeout: 15000 });
      } catch {
        console.warn(`[Facebook] Inga annonser hittades för "${watch.query}"`);
        return [];
      }

      // Ge sidan lite extra tid att rendera bilder och priser
      await sleep(2000);

      // Extrahera hrefs — URL-mönstret är stabilt oavsett UI-förändringar
      const hrefs = await page.$$eval('a[href*="/marketplace/item/"]', (links) => {
        const seen = new Set();
        return links
          .map((l) => l.href.split('?')[0]) // ta bort query-params
          .filter((href) => {
            if (seen.has(href)) return false;
            seen.add(href);
            return true;
          });
      });

      if (hrefs.length === 0) {
        console.warn(`[Facebook] Inga hrefs hittades för "${watch.query}"`);
        return [];
      }

      console.log(`[Facebook] Hittade ${hrefs.length} unika annons-URLs`);

      // Skärmdump av resultatsidan
      const screenshot = await page.screenshot({ type: 'jpeg', quality: 75 });

      await sleep(this.delayMs);

      // Claude vision tolkar vad som syns
      const extracted = await this.parseWithVision(screenshot, watch.query);
      console.log(`[Facebook] Claude extraherade ${extracted.length} annonser`);

      // Kombinera hrefs (DOM-ordning) med Claude-data (visuell ordning) via position
      const listings = hrefs.slice(0, extracted.length).map((href, i) => {
        const item = extracted[i];
        const idMatch = href.match(/\/marketplace\/item\/(\d+)/);
        const id = idMatch?.[1] ?? `fb-${i}`;

        return {
          id,
          platform: 'facebook',
          title: item.title || `Facebook-annons ${id}`,
          price: typeof item.price === 'number' ? item.price : null,
          currency: 'SEK',
          location: item.location ?? '',
          url: href,
          imageUrl: undefined,
          metadata: {},
        };
      }).filter((l) => l.id && l.url);

      return this.filterByPrice(listings, watch.min_price, watch.max_price);
    } catch (err) {
      console.error(`[Facebook] Fel vid sökning för "${watch.query}":`, err.message);
      return [];
    } finally {
      await browser.close();
    }
  }

  async dismissDialogs(page) {
    // Försök stänga vanliga Facebook-dialoger utan att krascha om de inte finns
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

  async parseWithVision(screenshotBuffer, query) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.claudeApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: screenshotBuffer.toString('base64'),
                },
              },
              {
                type: 'text',
                text: `Facebook Marketplace search results for "${query}". Extract every visible listing card, left-to-right, top-to-bottom. For each card: title (use image description if no text title visible, e.g. "Röd golfbil" or "VW Golf 2015"), price as integer SEK (null if not shown), location string. Return only valid JSON: {"listings":[{"title":"...","price":95000,"location":"Örebro"}]}`,
              },
            ],
          }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Claude vision ${response.status}: ${body.slice(0, 200)}`);
      }

      const json = await response.json();
      const text = json.content?.[0]?.text ?? '';

      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Inget JSON i Claude-svar');

      const parsed = JSON.parse(match[0]);
      return Array.isArray(parsed.listings) ? parsed.listings : [];
    } catch (err) {
      console.error('[Facebook] Vision-parsing misslyckades:', err.message);
      return [];
    } finally {
      clearTimeout(timer);
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
