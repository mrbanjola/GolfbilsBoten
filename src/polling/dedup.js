import { isAdSeen, markAdSeen } from '../db/database.js';

/**
 * Filtrerar bort redan sedda annonser och markerar nya som sedda.
 *
 * @param {import('../adapters/base.js').ListingResult[]} listings
 * @param {number} watchId
 * @returns {import('../adapters/base.js').ListingResult[]} Bara nya annonser
 */
export function filterAndMarkNew(listings, watchId) {
  const newListings = [];

  for (const listing of listings) {
    if (!isAdSeen(listing.id, listing.platform)) {
      markAdSeen(listing.id, listing.platform, watchId, listing.title, listing.price, listing.url);
      newListings.push(listing);
    }
  }

  return newListings;
}

/**
 * Markerar alla annonser som sedda utan att returnera dem (för initial scan).
 *
 * @param {import('../adapters/base.js').ListingResult[]} listings
 * @param {number} watchId
 */
export function markAllSeen(listings, watchId) {
  for (const listing of listings) {
    markAdSeen(listing.id, listing.platform, watchId, listing.title, listing.price, listing.url);
  }
}
