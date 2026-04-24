import * as cheerio from 'cheerio';

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function truncate(text, maxLength) {
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength) : text;
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
  if (!url) return { description: null, detailText: null, metadata: {} };

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

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    $('script, style, noscript').remove();

    const title = normalizeWhitespace(
      $('meta[property="og:title"]').attr('content')
      || $('title').text()
      || ''
    );

    const description = normalizeWhitespace(
      $('meta[name="description"]').attr('content')
      || $('meta[property="og:description"]').attr('content')
      || ''
    ) || null;

    const detailText = extractRelevantDetailText($);

    return {
      description,
      detailText,
      metadata: {
        pageTitle: title || null,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
