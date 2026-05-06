/**
 * Client-side filtrering av annonsresultat.
 */

/**
 * Filtrerar bort annonser baserat på annonstyp.
 * Blockets trade_type-fält: "Säljes", "Köpes", "Bortskänkes" etc.
 * @param {import('../adapters/base.js').ListingResult[]} listings
 * @param {'all'|'sell'|'buy'|null} adType
 * @returns {import('../adapters/base.js').ListingResult[]}
 */
export function applyAdTypeFilter(listings, adType) {
  if (!adType || adType === 'all') return listings;

  return listings.filter((l) => {
    const title = (l.title ?? '').toLowerCase();
    const tradeType = (l.tradeType ?? '').toLowerCase();

    if (adType === 'sell') {
      // Filtrera bort köpes-annonser
      if (tradeType === 'köpes' || tradeType === 'bortskänkes') return false;
      if (title.startsWith('köpes') || title.startsWith('sökes')) return false;
      return true;
    }

    if (adType === 'buy') {
      return tradeType === 'köpes' || title.startsWith('köpes');
    }

    return true;
  });
}

/**
 * Filtrerar bort annonser vars titel innehåller exkluderingsord.
 * @param {import('../adapters/base.js').ListingResult[]} listings
 * @param {string|null} excludeWords - Kommaseparerad sträng
 * @returns {import('../adapters/base.js').ListingResult[]}
 */
export function applyExcludeFilter(listings, excludeWords) {
  if (!excludeWords) return listings;
  const words = excludeWords.split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
  if (words.length === 0) return listings;

  return listings.filter((l) => {
    const text = (l.title ?? '').toLowerCase();
    return !words.some((word) => text.includes(word));
  });
}

/**
 * Filtrerar bort annonser vars titel eller beskrivning matchar globala blacklist-ord.
 * @param {import('../adapters/base.js').ListingResult[]} listings
 * @param {string[]} blacklistWords
 * @returns {import('../adapters/base.js').ListingResult[]}
 */
export function applyBlacklistFilter(listings, blacklistWords) {
  if (!blacklistWords || blacklistWords.length === 0) return listings;
  const words = blacklistWords.map((w) => w.toLowerCase().trim()).filter(Boolean);
  if (words.length === 0) return listings;

  return listings.filter((l) => {
    const text = `${l.title ?? ''} ${l.description ?? ''}`.toLowerCase();
    return !words.some((word) => text.includes(word));
  });
}

/**
 * Kör alla client-side filter på en lista annonser.
 * @param {import('../adapters/base.js').ListingResult[]} listings
 * @param {Object} watch
 * @param {string[]} [globalBlacklist]
 * @returns {import('../adapters/base.js').ListingResult[]}
 */
export function applyAllFilters(listings, watch, globalBlacklist = []) {
  let result = listings;
  result = applyAdTypeFilter(result, watch.ad_type);
  result = applyExcludeFilter(result, watch.exclude_words);
  result = applyBlacklistFilter(result, globalBlacklist);
  return result;
}
