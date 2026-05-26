import * as cheerio from 'cheerio';

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function truncate(text, maxLength) {
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

// Recursively search an object for the first value of any of the given keys.
function deepFind(obj, keys, maxDepth = 8, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > maxDepth) return undefined;
  for (const key of keys) {
    if (key in obj) {
      const val = obj[key];
      if (val !== null && val !== undefined && val !== '') return val;
    }
  }
  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const found = deepFind(val, keys, maxDepth, depth + 1);
      if (found !== undefined) return found;
    }
  }
  // Also recurse into arrays (e.g. pageProps arrays)
  for (const val of Object.values(obj)) {
    if (Array.isArray(val)) {
      for (const item of val) {
        const found = deepFind(item, keys, maxDepth, depth + 1);
        if (found !== undefined) return found;
      }
    }
  }
  return undefined;
}

function extractFromJsonLd($) {
  let price = null;
  let description = null;

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() ?? '');
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (!description && typeof item.description === 'string' && item.description.length > 20) {
          description = item.description;
        }
        if (price === null && item.offers) {
          const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
          const p = offer?.price ?? offer?.lowPrice;
          if (p !== undefined) price = Number(p);
        }
      }
    } catch { /* malformed JSON-LD, skip */ }
  });

  return { price, description };
}

function extractFromNextData($) {
  try {
    const raw = $('#__NEXT_DATA__').html();
    if (!raw) return {};
    const data = JSON.parse(raw);
    const description = deepFind(data, ['description', 'body']);
    // 'amount' matches Blocket's price.amount field without false-positives from generic 'value'
    const rawPrice = deepFind(data, ['amount']);
    const price = rawPrice !== undefined ? Number(rawPrice) : null;
    return {
      description: typeof description === 'string' && description.length > 20 ? description : null,
      price: price !== null && !isNaN(price) && price > 0 ? price : null,
    };
  } catch {
    return {};
  }
}

function extractRelevantDetailText($) {
  const selectors = [
    '[itemprop="description"]',
    '[data-testid*="description"]',
    '[class*="description"]',
    '[class*="desc"]',
    'main article',
    'main',
    'article',
  ];

  for (const selector of selectors) {
    const text = normalizeWhitespace($(selector).first().text());
    if (text && text.length >= 80) {
      return truncate(text, 4000);
    }
  }

  return null;
}

export async function fetchListingPageDetails(url, headers = {}) {
  if (!url) return { description: null, detailText: null, price: null, metadata: {} };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      headers: {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        ...headers,
      },
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    const $ = cheerio.load(html);

    const jsonLd = extractFromJsonLd($);
    const nextData = extractFromNextData($);

    $('script, style, noscript').remove();

    const title = normalizeWhitespace(
      $('meta[property="og:title"]').attr('content')
      || $('title').text()
      || ''
    );

    const metaDescription = normalizeWhitespace(
      $('meta[name="description"]').attr('content')
      || $('meta[property="og:description"]').attr('content')
      || ''
    ) || null;

    // Prefer full text sources over truncated meta description
    const description = jsonLd.description || nextData.description || metaDescription;

    const detailText = extractRelevantDetailText($);

    const imageUrl = $('meta[property="og:image"]').attr('content') || null;

    const price = jsonLd.price ?? nextData.price ?? null;

    return {
      description,
      detailText,
      price,
      imageUrl,
      metadata: {
        pageTitle: title || null,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
