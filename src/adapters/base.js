/**
 * Abstrakt bas-klass for alla marknadsplats-adapters.
 *
 * @typedef {Object} ListingResult
 * @property {string} id - Unikt annons-ID
 * @property {string} platform - "blocket" | "tradera" | "klaravik" | "blinto" | etc
 * @property {string} title - Annonsrubrik
 * @property {string} [subtitle] - Undertitel/modell
 * @property {number|null} price - Pris i SEK / aktuellt bud
 * @property {string} currency - "SEK"
 * @property {string} location - Plats
 * @property {string} url - Direktlank till annonsen
 * @property {string} [imageUrl] - Forsta bilden
 * @property {string} [createdAt] - Publiceringsdatum
 * @property {string|null} [description] - Kort eller full beskrivning
 * @property {string|null} [detailText] - Extraherad detaljtext
 * @property {Object} [metadata] - Extra metadata for AI-filtrering
 * @property {string} [auctionEnd] - Sluttid ISO 8601 eller "YYYY-MM-DD HH:mm"
 * @property {number} [bidCount] - Antal bud
 * @property {boolean} [noReserve] - Inget reservationspris
 * @property {boolean} [reserveMet] - Reservationspris uppnatt
 * @property {boolean} [ended] - Auktionen ar avslutad
 * @property {string} [tradeType] - Annonsens typ, t.ex. "Saljes" eller "Kopes"
 */

export class BaseAdapter {
  /**
   * @param {string} name - Adapternamn ("blocket", "tradera", etc)
   */
  constructor(name) {
    this.name = name;
  }

  /**
   * Sok efter annonser som matchar en bevakning.
   * @param {Object} watch
   * @returns {Promise<ListingResult[]>}
   */
  async search(watch) {
    throw new Error(`search() maste implementeras av ${this.name}`);
  }

  /**
   * Hamta detaljerad listing-data for AI-filtrering.
   * @param {ListingResult} listing
   * @returns {Promise<ListingResult>}
   */
  async getListingDetails(listing) {
    return listing;
  }
}
