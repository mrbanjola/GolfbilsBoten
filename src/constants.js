/**
 * Hårdkodade platser — värden är de strängar blocket-api.se accepterar.
 * Nycklar är lowercase för enkel matchning mot användarinput.
 */
export const LOCATIONS = {
  'blekinge':         { label: 'Blekinge',          value: 'BLEKINGE' },
  'dalarna':          { label: 'Dalarna',            value: 'DALARNA' },
  'gotland':          { label: 'Gotland',            value: 'GOTLAND' },
  'gävleborg':        { label: 'Gävleborg',          value: 'GAVLEBORG' },
  'gavleborg':        { label: 'Gävleborg',          value: 'GAVLEBORG' },
  'halland':          { label: 'Halland',            value: 'HALLAND' },
  'jämtland':         { label: 'Jämtland',           value: 'JAMTLAND' },
  'jamtland':         { label: 'Jämtland',           value: 'JAMTLAND' },
  'jönköping':        { label: 'Jönköping',          value: 'JONKOPING' },
  'jonkoping':        { label: 'Jönköping',          value: 'JONKOPING' },
  'kalmar':           { label: 'Kalmar',             value: 'KALMAR' },
  'kronoberg':        { label: 'Kronoberg',          value: 'KRONOBERG' },
  'norrbotten':       { label: 'Norrbotten',         value: 'NORRBOTTEN' },
  'skåne':            { label: 'Skåne',              value: 'SKANE' },
  'skane':            { label: 'Skåne',              value: 'SKANE' },
  'stockholm':        { label: 'Stockholm',          value: 'STOCKHOLM' },
  'södermanland':     { label: 'Södermanland',       value: 'SODERMANLAND' },
  'sodermanland':     { label: 'Södermanland',       value: 'SODERMANLAND' },
  'uppsala':          { label: 'Uppsala',            value: 'UPPSALA' },
  'värmland':         { label: 'Värmland',           value: 'VARMLAND' },
  'varmland':         { label: 'Värmland',           value: 'VARMLAND' },
  'västerbotten':     { label: 'Västerbotten',       value: 'VASTERBOTTEN' },
  'vasterbotten':     { label: 'Västerbotten',       value: 'VASTERBOTTEN' },
  'västernorrland':   { label: 'Västernorrland',     value: 'VASTERNORRLAND' },
  'vasternorrland':   { label: 'Västernorrland',     value: 'VASTERNORRLAND' },
  'västmanland':      { label: 'Västmanland',        value: 'VASTMANLAND' },
  'vastmanland':      { label: 'Västmanland',        value: 'VASTMANLAND' },
  'västra götaland':  { label: 'Västra Götaland',   value: 'VASTRA_GOTALAND' },
  'vastra gotaland':  { label: 'Västra Götaland',   value: 'VASTRA_GOTALAND' },
  'göteborg':         { label: 'Västra Götaland',   value: 'VASTRA_GOTALAND' },
  'goteborg':         { label: 'Västra Götaland',   value: 'VASTRA_GOTALAND' },
  'örebro':           { label: 'Örebro',             value: 'OREBRO' },
  'orebro':           { label: 'Örebro',             value: 'OREBRO' },
  'östergötland':     { label: 'Östergötland',       value: 'OSTERGOTLAND' },
  'ostergotland':     { label: 'Östergötland',       value: 'OSTERGOTLAND' },
};

/** Lista för visning i numrerade menyer (unik per label) */
export const LOCATIONS_LIST = [
  { label: 'Blekinge',        value: 'BLEKINGE' },
  { label: 'Dalarna',         value: 'DALARNA' },
  { label: 'Gotland',         value: 'GOTLAND' },
  { label: 'Gävleborg',       value: 'GAVLEBORG' },
  { label: 'Halland',         value: 'HALLAND' },
  { label: 'Jämtland',        value: 'JAMTLAND' },
  { label: 'Jönköping',       value: 'JONKOPING' },
  { label: 'Kalmar',          value: 'KALMAR' },
  { label: 'Kronoberg',       value: 'KRONOBERG' },
  { label: 'Norrbotten',      value: 'NORRBOTTEN' },
  { label: 'Skåne',           value: 'SKANE' },
  { label: 'Stockholm',       value: 'STOCKHOLM' },
  { label: 'Södermanland',    value: 'SODERMANLAND' },
  { label: 'Uppsala',         value: 'UPPSALA' },
  { label: 'Värmland',        value: 'VARMLAND' },
  { label: 'Västerbotten',    value: 'VASTERBOTTEN' },
  { label: 'Västernorrland',  value: 'VASTERNORRLAND' },
  { label: 'Västmanland',     value: 'VASTMANLAND' },
  { label: 'Västra Götaland', value: 'VASTRA_GOTALAND' },
  { label: 'Örebro',          value: 'OREBRO' },
  { label: 'Östergötland',    value: 'OSTERGOTLAND' },
];

/**
 * Kategorier — filtreras client-side eftersom API:ets category-param inte fungerar.
 * Nyckelord är de ord vi letar efter i annonsrubriken/beskrivningen.
 */
export const CATEGORIES = {
  'fordon':     { label: 'Fordon',              keywords: ['bil', 'mc', 'moped', 'lastbil', 'buss', 'husvagn', 'husbil', 'traktor', 'atv', 'fyrhjuling'] },
  'båt':        { label: 'Båt',                 keywords: ['båt', 'motor', 'segelbåt', 'motorbåt', 'kajak', 'kanot', 'jolle', 'rib', 'gummibåt'] },
  'bat':        { label: 'Båt',                 keywords: ['båt', 'motor', 'segelbåt', 'motorbåt', 'kajak', 'kanot', 'jolle', 'rib', 'gummibåt'] },
  'elektronik': { label: 'Elektronik',          keywords: ['dator', 'mobil', 'tv', 'kamera', 'hörlurar', 'iPad', 'laptop', 'konsol'] },
  'sport':      { label: 'Sport & friluftsliv', keywords: ['cykel', 'ski', 'snowboard', 'tennis', 'golf', 'träning', 'fitness'] },
  'möbler':     { label: 'Möbler & inredning',  keywords: ['soffa', 'bord', 'stol', 'säng', 'skåp', 'hylla', 'lampa', 'matta'] },
  'mobler':     { label: 'Möbler & inredning',  keywords: ['soffa', 'bord', 'stol', 'säng', 'skåp', 'hylla', 'lampa', 'matta'] },
  'kläder':     { label: 'Kläder',              keywords: ['jacka', 'byxor', 'skor', 'klänning', 'tröja', 'skjorta', 'väska'] },
  'klader':     { label: 'Kläder',              keywords: ['jacka', 'byxor', 'skor', 'klänning', 'tröja', 'skjorta', 'väska'] },
};

export const CATEGORIES_LIST = [
  { label: 'Fordon',              value: 'fordon' },
  { label: 'Båt',                 value: 'bat' },
  { label: 'Elektronik',          value: 'elektronik' },
  { label: 'Sport & friluftsliv', value: 'sport' },
  { label: 'Möbler & inredning',  value: 'mobler' },
  { label: 'Kläder',              value: 'klader' },
];

export const PORTFOLIO_CATEGORIES = [
  { value: 'car',           label: 'Bil' },
  { value: 'boat',          label: 'Båt' },
  { value: 'golf_cart',     label: 'Golfbil' },
  { value: 'excavator',     label: 'Grävmaskin' },
  { value: 'other_machine', label: 'Övriga maskiner' },
];

/**
 * Slår upp en plats från fri text (case-insensitive).
 * @param {string} input
 * @returns {{ label: string, value: string }|null}
 */
export function findLocation(input) {
  return LOCATIONS[input.toLowerCase().trim()] ?? null;
}

/**
 * Slår upp en plats från sitt API-värde (t.ex. "STOCKHOLM").
 * @param {string} value
 * @returns {string} label eller value om ingen match
 */
export function locationLabel(value) {
  return LOCATIONS_LIST.find(l => l.value === value)?.label ?? value;
}
