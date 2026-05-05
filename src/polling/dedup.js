import { isAdSeen, markAdSeen } from '../db/database.js';

/**
 * Filtrerar fram bara annonser som inte redan är sedda, utan att markera dem.
 *
 * @param {import('../adapters/base.js').ListingResult[]} listings
 * @returns {import('../adapters/base.js').ListingResult[]}
 */
export function getUnseenListings(listings) {
  return listings.filter((listing) => !isAdSeen(listing.id, listing.platform));
}

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
      markAdSeen(listing.id, listing.platform, watchId, listing.title, listing.price, listing.url, listing.imageUrl ?? null);
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
    markAdSeen(listing.id, listing.platform, watchId, listing.title, listing.price, listing.url, listing.imageUrl ?? null);
  }
}
