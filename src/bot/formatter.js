/**
 * Formaterar ett pris för visning i WhatsApp.
 * @param {number|null} price
 * @returns {string}
 */
function fmtPrice(price) {
  if (price == null) return 'Pris saknas';
  return price.toLocaleString('sv-SE') + ' kr';
}

/**
 * Formaterar sluttid för auktion.
 * @param {string} isoOrText - ISO 8601 eller "YYYY-MM-DD HH:mm"
 * @returns {string} Läsbar tid, t.ex. "30 apr 09:22"
 */
function fmtAuctionEnd(isoOrText) {
  if (!isoOrText) return 'N/A';
  try {
    const date = new Date(isoOrText);
    if (isNaN(date.getTime())) return isoOrText; // fallback
    const months = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const hours = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    return `${day} ${month} ${hours}:${mins}`;
  } catch {
    return isoOrText;
  }
}

/**
 * Formaterar notis för en auktion som avslutas snart (< 1h).
 * @param {import('../adapters/base.js').ListingResult} listing
 * @param {Object} watch - Bevakningsobjektet
 * @returns {string}
 */
export function formatAuctionNotice(listing, watch) {
  const priceStr = listing.price != null ? fmtPrice(listing.price) : 'Pris saknas';
  const locationStr = listing.location || 'Okänd plats';
  const bidStr = listing.bidCount ? `${listing.bidCount} bud` : 'Inga bud';
  const endTimeStr = listing.auctionEnd ? fmtAuctionEnd(listing.auctionEnd) : 'N/A';

  let timeLeftStr = '';
  if (listing.auctionEnd) {
    const minsLeft = Math.max(0, Math.round((new Date(listing.auctionEnd).getTime() - Date.now()) / 60000));
    timeLeftStr = ` (${minsLeft} min kvar)`;
  }

  let reserveStr = '';
  if (listing.noReserve) {
    reserveStr = '\n🏷️ Inget reservationspris';
  } else if (listing.reserveMet) {
    reserveStr = '\n✅ Reservationspris uppnått';
  }

  const tagsStr = listing.tags?.length ? `\n🏷️ ${listing.tags.join(' · ')}` : '';
  const profitStr = listing.profitEstimate ? (() => {
    const pe = listing.profitEstimate;
    const low = pe.low >= 0 ? `+${pe.low.toLocaleString('sv')}` : pe.low.toLocaleString('sv');
    const high = pe.high >= 0 ? `+${pe.high.toLocaleString('sv')}` : pe.high.toLocaleString('sv');
    return `\n💰 Potential: ${low}–${high} kr${pe.rationale ? ` · ${pe.rationale}` : ''}`;
  })() : '';
  return (
    `⏳ *Avslutas snart!*\n` +
    `Bevakning: "${watch.query}"\n\n` +
    `*${listing.title}*\n` +
    `${priceStr} · ${bidStr}\n` +
    `📍 ${locationStr}\n` +
    `⏰ ${endTimeStr}${timeLeftStr}${reserveStr}${tagsStr}${profitStr}\n\n` +
    `${listing.url}`
  );
}

/**
 * Formaterar notis för en ny annons.
 * @param {import('../adapters/base.js').ListingResult} listing
 * @param {Object} watch - Bevakningsobjektet
 * @returns {string}
 */
export function formatNewListing(listing, watch) {
  // Om det är en auktion, använd auktionsformat
  if (listing.auctionEnd) {
    return formatAuctionNotice(listing, watch);
  }

  // Vanligt format för annonser
  const platformLabel = listing.platform.charAt(0).toUpperCase() + listing.platform.slice(1);
  const priceStr = listing.price != null ? fmtPrice(listing.price) : 'Pris saknas';
  const locationStr = listing.location || 'Okänd plats';

  const tagsStr = listing.tags?.length ? `🏷️ ${listing.tags.join(' · ')}\n` : '';
  const profitStr = listing.profitEstimate ? (() => {
    const pe = listing.profitEstimate;
    const low = pe.low >= 0 ? `+${pe.low.toLocaleString('sv')}` : pe.low.toLocaleString('sv');
    const high = pe.high >= 0 ? `+${pe.high.toLocaleString('sv')}` : pe.high.toLocaleString('sv');
    return `💰 Potential: ${low}–${high} kr${pe.rationale ? ` · ${pe.rationale}` : ''}\n`;
  })() : '';
  return (
    `🔔 *Ny träff!*\n` +
    `Bevakning: "${watch.query}"\n\n` +
    `*${listing.title}*\n` +
    `${priceStr} · ${locationStr}\n` +
    `${platformLabel}\n` +
    `${tagsStr}${profitStr}\n` +
    `${listing.url}`
  );
}

/**
 * Formaterar listan av aktiva bevakningar.
 * @param {Object[]} watches
 * @param {boolean} compact - Visa bara numrering (för ta-bort/ändra-flödet)
 * @returns {string}
 */
export function formatWatchesList(watches, compact = false) {
  if (watches.length === 0) {
    return 'Inga aktiva bevakningar. Skriv *Lägg till* för att starta en.';
  }

  const lines = watches.map((w, i) => {
    if (compact) {
      const priceStr = w.max_price ? ` (max ${fmtPrice(w.max_price)})` : '';
      return `${i + 1}. ${w.query}${priceStr}`;
    }
    return `${i + 1}. ${formatWatchSummary(w)}`;
  });

  if (compact) return lines.join('\n');
  return `*Aktiva bevakningar (${watches.length} st):*\n\n${lines.join('\n\n')}`;
}

/**
 * Formaterar en bevakning med alla filter för visning.
 * @param {Object} w
 * @returns {string}
 */
export function formatWatchSummary(w) {
  const lines = [`*${w.query}*`];
  if (w.max_price) lines.push(`💰 Max ${fmtPrice(w.max_price)}`);
  if (w.min_price) lines.push(`💰 Min ${fmtPrice(w.min_price)}`);
  lines.push(`📍 ${w.location ?? 'Hela Sverige'}`);
  if (w.ad_type && w.ad_type !== 'all') {
    lines.push(`🏷️ ${w.ad_type === 'sell' ? 'Bara säljes' : 'Bara köpes'}`);
  }
  if (w.exclude_words) lines.push(`🚫 Exkl: ${w.exclude_words}`);
  
  // Visa plattformar
  const platforms = (w.platforms || 'blocket').split(',').map(p => p.trim());
  const platformLabels = platforms.map(p => {
    switch(p) {
      case 'blocket': return 'Blocket';
      case 'tradera': return 'Tradera';
      case 'klaravik': return 'Klaravik';
      case 'blinto': return 'Blinto';
      default: return p;
    }
  });
  lines.push(`📡 ${platformLabels.join(', ')}`);
  
  return lines.join('\n   ');
}

/**
 * Formaterar flera nya träffar som ett samlat meddelande.
 * @param {import('../adapters/base.js').ListingResult[]} listings
 * @param {Object} watch
 * @returns {string}
 */
export function formatNewListingsBatch(listings, watch) {
  const hasAuctions = listings.some((l) => l.auctionEnd);
  const header = hasAuctions
    ? `⏳ *${listings.length} auktioner avslutas snart för "${watch.query}":*\n`
    : `🔔 *${listings.length} nya träffar för "${watch.query}":*\n`;
  const lines = listings.map((l) => {
    const platformLabel = l.platform.charAt(0).toUpperCase() + l.platform.slice(1);
    const price = l.price != null ? fmtPrice(l.price) : 'Pris saknas';
    const loc = l.location ? ` · ${l.location}` : '';
    const tags = l.tags?.length ? `\n  🏷️ ${l.tags.join(' · ')}` : '';
    if (l.auctionEnd) {
      const minsLeft = Math.max(0, Math.round((new Date(l.auctionEnd).getTime() - Date.now()) / 60000));
      const bids = l.bidCount ? ` · ${l.bidCount} bud` : '';
      return `• *${l.title}*\n  ${price}${bids}${loc} · ${minsLeft} min kvar${tags}\n  ${l.url}`;
    }
    return `• *${l.title}*\n  ${price}${loc} · ${platformLabel}${tags}\n  ${l.url}`;
  });
  return header + '\n' + lines.join('\n\n');
}

/**
 * Formaterar bekräftelse för ny bevakning.
 * @param {string} query
 * @param {number|null} maxPrice
 * @param {number} id
 * @param {string} platforms - Kommaseparerad lista, t.ex. "blocket,klaravik,blinto"
 * @returns {string}
 */
export function formatWatchAdded(query, maxPrice, id, platforms = 'blocket') {
  const priceStr = maxPrice ? `\nMaxpris: ${fmtPrice(maxPrice)}` : '\nMaxpris: inget tak';
  
  // Formatera plattformsnamn
  const platformList = (platforms || 'blocket').split(',').map(p => p.trim()).map(p => {
    switch(p) {
      case 'blocket': return 'Blocket';
      case 'tradera': return 'Tradera';
      case 'klaravik': return 'Klaravik';
      case 'blinto': return 'Blinto';
      default: return p;
    }
  }).join(', ');

  return (
    `✓ Bevakar nu: "${query}"\n` +
    `Plattformar: ${platformList}${priceStr}\n` +
    `Pollar var 3:e minut.\n` +
    `_(ID: ${id})_`
  );
}

/**
 * Formaterar bekräftelse för borttagen bevakning.
 * @param {Object} watch
 * @returns {string}
 */
export function formatWatchRemoved(watch) {
  return `✓ Borttagen: "${watch.query}"`;
}

/**
 * Formaterar initial scan-summering som en lista med klickbara länkar.
 * @param {import('../adapters/base.js').ListingResult[]} listings
 * @param {Object} watch
 * @returns {string}
 */
export function formatInitialScanSummary(listings, watch) {
  const priceStr = watch.max_price ? ` under ${fmtPrice(watch.max_price)}` : '';
  const header = `📋 *${listings.length} befintliga träffar för "${watch.query}"${priceStr}:*\n`;

  const lines = listings.map((l) => {
    const price = l.price != null ? fmtPrice(l.price) : 'Pris saknas';
    const loc = l.location || 'Okänd plats';
    return `• *${l.title}*\n  ${price} · ${loc}\n  ${l.url}`;
  });

  // WhatsApp-meddelanden kan bli långa — dela upp om fler än 20 träffar
  const MAX_PER_MSG = 20;
  if (lines.length <= MAX_PER_MSG) {
    return header + '\n' + lines.join('\n\n');
  }

  // Returnera array-signal via speciellt prefix som index.js delar upp
  return JSON.stringify({
    __chunked: true,
    header,
    lines,
    chunkSize: MAX_PER_MSG,
  });
}

/**
 * Formaterar hjälptext.
 * @returns {string}
 */
export function formatHelp() {
  return (
    `*Begagnat Monitor — kommandon:*\n\n` +
    `*Visa* — Lista alla aktiva bevakningar\n` +
    `*Lägg till* — Lägg till en ny bevakning\n` +
    `*Ändra* — Ändra filter på en bevakning\n` +
    `*Ta bort* — Ta bort en bevakning\n` +
    `*Sök* — Tvinga en omedelbar sökning\n` +
    `*Hjälp* — Visa den här hjälpen\n\n` +
    `Tips: Skriv t.ex. "VW LT under 40000" för att bevaka med maxpris.`
  );
}
