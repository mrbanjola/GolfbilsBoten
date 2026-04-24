/**
 * Abstrakt bas-klass för alla marknadsplats-adapters.
 *
 * @typedef {Object} ListingResult
 * @property {string} id           - Unikt annons-ID
 * @property {string} platform     - "blocket" | "tradera" | "klaravik" | "blinto" | etc
 * @property {string} title        - Annonsrubrik
 * @property {string} [subtitle]   - Undertitel/modell (för auktioner)
 * @property {number|null} price   - Pris i SEK / Aktuellt bud
 * @property {string} currency     - "SEK"
 * @property {string} location     - Plats
 * @property {string} url          - Direktlänk till annonsen
 * @property {string} [imageUrl]   - Första bilden (om tillgänglig)
 * @property {string} [createdAt]  - Publiceringsdatum
 *
 * Auktionsspecifika fält (valfria):
 * @property {string} [auctionEnd]    - Sluttid ISO 8601 eller "YYYY-MM-DD HH:mm"
 * @property {number} [bidCount]      - Antal bud
 * @property {boolean} [noReserve]    - Inget reservationspris
 * @property {boolean} [reserveMet]   - Reservationspris uppnått
 * @property {boolean} [ended]        - Auktionen är avslutad
 */

export class BaseAdapter {
  /**
   * @param {string} name - Adapternamn ("blocket", "tradera", etc)
   */
  constructor(name) {
    this.name = name;
  }

  /**
   * Sök efter annonser som matchar en bevakning.
   * @param {Object} watch - Bevakningsobjekt från DB
   * @param {string} watch.query
   * @param {number|null} watch.max_price
   * @param {number|null} watch.min_price
   * @param {string|null} watch.region
   * @param {string|null} watch.category
   * @returns {Promise<ListingResult[]>}
   */
  async search(watch) {
    throw new Error(`search() måste implementeras av ${this.name}`);
  }
}
