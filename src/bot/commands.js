import { addWatch, getWatchesList, getWatchByIndex, removeWatch, updateWatch, getBlacklist, addBlacklistWord, removeBlacklistWord } from '../db/database.js';
import { sendMessage } from './whatsapp.js';
import { formatWatchesList, formatWatchAdded, formatWatchRemoved, formatHelp } from './formatter.js';
import { runPollCycle } from '../polling/engine.js';
import { LOCATIONS_LIST, CATEGORIES_LIST, findLocation } from '../constants.js';

/**
 * State machine per grupp-JID.
 * @type {Map<string, {
 *   state: string,
 *   action: string|null,
 *   selectedWatch: Object|null,
 *   editField: string|null,
 *   timeoutHandle: NodeJS.Timeout|null
 * }>}
 */
const sessions = new Map();

const STATE_IDLE               = 'idle';
const STATE_AWAITING_QUERY     = 'awaiting_query';
const STATE_AWAITING_SELECTION = 'awaiting_selection';
const STATE_AWAITING_EDIT_CHOICE = 'awaiting_edit_choice';
const STATE_AWAITING_EDIT_VALUE  = 'awaiting_edit_value';
const TIMEOUT_MS = 60_000;

function getSession(jid) {
  if (!sessions.has(jid)) {
    sessions.set(jid, { state: STATE_IDLE, action: null, selectedWatch: null, editField: null, timeoutHandle: null });
  }
  return sessions.get(jid);
}

function resetSession(jid) {
  const s = getSession(jid);
  if (s.timeoutHandle) clearTimeout(s.timeoutHandle);
  s.state = STATE_IDLE;
  s.action = null;
  s.selectedWatch = null;
  s.editField = null;
  s.timeoutHandle = null;
}

function armTimeout(jid) {
  const s = getSession(jid);
  if (s.timeoutHandle) clearTimeout(s.timeoutHandle);
  s.timeoutHandle = setTimeout(() => {
    console.log(`[Bot] Session för ${jid} timeout — återställer till idle`);
    resetSession(jid);
    sendMessage('⏱ Ingen input — åtgärd avbruten.').catch(() => {});
  }, TIMEOUT_MS);
}

/**
 * Parserar användarinput och extraherar sökterm + maxpris + plattformar.
 * @param {string} input
 * @returns {{ query: string, maxPrice: number|null, platforms: string }}
 */
function parseQuery(input) {
  let cleaned = input.trim();
  let platforms = 'blocket'; // default

  // Söka efter plattformsnamn i slutet
  const platformNames = ['blocket', 'tradera', 'klaravik', 'blinto'];
  const foundPlatforms = [];
  
  for (const platform of platformNames) {
    const regex = new RegExp(`\\b${platform}\\b`, 'gi');
    let match;
    while ((match = regex.exec(cleaned)) !== null) {
      foundPlatforms.push(platform.toLowerCase());
      // Ta bort plattformen från cleaned text
      cleaned = cleaned.substring(0, match.index) + cleaned.substring(match.index + match[0].length);
    }
  }

  if (foundPlatforms.length > 0) {
    platforms = [...new Set(foundPlatforms)].join(',');
  }

  // Nu parsea price från den resterande cleaned-texten
  cleaned = cleaned.trim();
  const underMatch = cleaned.match(/\s+under\s+(\d+)\s*$/i);
  if (underMatch) {
    return { 
      query: cleaned.slice(0, underMatch.index).trim(), 
      maxPrice: parseInt(underMatch[1], 10),
      platforms
    };
  }
  
  const ltMatch = cleaned.match(/\s*<\s*(\d+)\s*$/);
  if (ltMatch) {
    return { 
      query: cleaned.slice(0, ltMatch.index).trim(), 
      maxPrice: parseInt(ltMatch[1], 10),
      platforms
    };
  }
  
  return { query: cleaned, maxPrice: null, platforms };
}

// Filterfält som kan ändras via "Ändra"-kommandot
const EDIT_FIELDS = [
  { key: 'location',      label: 'Region' },
  { key: 'ad_type',       label: 'Annonstyp (säljes/köpes/alla)' },
  { key: 'platforms',     label: 'Plattformar' },
  { key: 'exclude_words', label: 'Exkludera ord' },
  { key: 'max_price',     label: 'Maxpris' },
  { key: 'min_price',     label: 'Minpris' },
];

function currentValueLabel(watch, field) {
  switch (field) {
    case 'location':      return watch.location ?? 'Hela Sverige';
    case 'ad_type':       return watch.ad_type === 'sell' ? 'Bara säljes' : watch.ad_type === 'buy' ? 'Bara köpes' : 'Alla';
    case 'platforms':     return watch.platforms ?? 'blocket';
    case 'exclude_words': return watch.exclude_words ?? 'Inga';
    case 'max_price':     return watch.max_price ? `${watch.max_price.toLocaleString('sv-SE')} kr` : 'Inget tak';
    case 'min_price':     return watch.min_price ? `${watch.min_price.toLocaleString('sv-SE')} kr` : 'Ingen golv';
    default: return '?';
  }
}

/**
 * Huvudfunktion — tar emot ett inkommande meddelande och hanterar kommandot.
 * @param {{ jid: string, text: string }} param0
 */
export async function handleMessage({ jid, text }) {
  const session = getSession(jid);
  const lower = text.trim().toLowerCase();

  // ── awaiting_query ────────────────────────────────────────────────────────
  if (session.state === STATE_AWAITING_QUERY) {
    resetSession(jid);
    const { query, maxPrice, platforms } = parseQuery(text);
    if (!query) {
      await sendMessage('Ingen sökterm angiven. Försök igen med "Lägg till".');
      return;
    }
    const id = addWatch(query, maxPrice, null, platforms);
    await sendMessage(formatWatchAdded(query, maxPrice, id, platforms));
    return;
  }

  // ── awaiting_selection ────────────────────────────────────────────────────
  if (session.state === STATE_AWAITING_SELECTION) {
    const num = parseInt(lower, 10);
    if (isNaN(num) || num <= 0) {
      await sendMessage('Skriv siffran för bevakningen, eller vänta 60 sekunder för att avbryta.');
      return;
    }
    const watch = getWatchByIndex(num);
    if (!watch) {
      await sendMessage(`Hittar ingen bevakning nummer ${num}. Försök igen.`);
      return;
    }

    if (session.action === 'remove') {
      resetSession(jid);
      removeWatch(watch.id);
      await sendMessage(formatWatchRemoved(watch));
    } else if (session.action === 'edit') {
      session.state = STATE_AWAITING_EDIT_CHOICE;
      session.selectedWatch = watch;
      armTimeout(jid);
      const fieldLines = EDIT_FIELDS.map((f, i) =>
        `${i + 1}. ${f.label} (nu: ${currentValueLabel(watch, f.key)})`
      ).join('\n');
      await sendMessage(`Vad vill du ändra för *"${watch.query}"*?\n\n${fieldLines}\n0. Avbryt`);
    }
    return;
  }

  // ── awaiting_edit_choice ──────────────────────────────────────────────────
  if (session.state === STATE_AWAITING_EDIT_CHOICE) {
    const num = parseInt(lower, 10);
    if (num === 0) {
      resetSession(jid);
      await sendMessage('Avbrutet.');
      return;
    }
    const field = EDIT_FIELDS[num - 1];
    if (!field) {
      await sendMessage(`Ogiltigt val. Skriv 1–${EDIT_FIELDS.length} eller 0 för att avbryta.`);
      return;
    }
    session.editField = field.key;
    session.state = STATE_AWAITING_EDIT_VALUE;
    armTimeout(jid);

    if (field.key === 'location') {
      const locLines = LOCATIONS_LIST.map((l, i) => `${i + 1}. ${l.label}`).join('\n');
      await sendMessage(`Välj region:\n\n${locLines}\n0. Hela Sverige (ta bort filter)`);
    } else if (field.key === 'platforms') {
      await sendMessage('Välj plattformar:\n\n1. Blocket\n2. Tradera\n3. Klaravik\n4. Blinto\n5. Blocket + Klaravik + Blinto\n6. Alla\n0. Avbryt\n\nOm du vill flera kombos, skriv namn kommaseparerade (t.ex. "klaravik,blinto")');
    } else if (field.key === 'ad_type') {
      await sendMessage('Välj annonstyp:\n\n1. Bara säljes\n2. Bara köpes\n3. Alla typer\n0. Avbryt');
    } else if (field.key === 'exclude_words') {
      await sendMessage('Skriv ord att exkludera, kommaseparerade.\nExempel: *köpes,sökes,reservdelar*\nEller 0 för att ta bort filter.');
    } else if (field.key === 'max_price' || field.key === 'min_price') {
      const label = field.key === 'max_price' ? 'maxpris' : 'minpris';
      await sendMessage(`Skriv nytt ${label} i kr, eller 0 för att ta bort.`);
    }
    return;
  }

  // ── awaiting_edit_value ───────────────────────────────────────────────────
  if (session.state === STATE_AWAITING_EDIT_VALUE) {
    const watch = session.selectedWatch;
    const field = session.editField;
    resetSession(jid);

    if (field === 'location') {
      const num = parseInt(lower, 10);
      if (num === 0) {
        updateWatch(watch.id, 'location', null);
        await sendMessage(`✓ *"${watch.query}"* bevakar nu hela Sverige.`);
      } else {
        const loc = LOCATIONS_LIST[num - 1];
        if (!loc) {
          await sendMessage('Ogiltigt val — ingen ändring gjord.');
          return;
        }
        updateWatch(watch.id, 'location', loc.value);
        await sendMessage(`✓ *"${watch.query}"* filtrerar nu på ${loc.label}.`);
      }
    } else if (field === 'platforms') {
      const num = parseInt(lower, 10);
      let val = null;
      const map = { 
        1: 'blocket', 
        2: 'tradera', 
        3: 'klaravik',
        4: 'blinto',
        5: 'blocket,klaravik,blinto',
        6: 'blocket,tradera,klaravik,blinto'
      };
      if (num === 0 || num === 0) { await sendMessage('Avbrutet.'); return; }
      if (!isNaN(num) && map[num]) {
        val = map[num];
      } else if (lower.includes(',')) {
        // Tillåt custom kommaseparerad lista
        val = lower.split(',').map(p => p.trim().toLowerCase()).join(',');
      } else {
        // Försök matcha enkel namn
        const platforms = ['blocket', 'tradera', 'klaravik', 'blinto'];
        if (platforms.includes(lower)) {
          val = lower;
        }
      }
      if (!val) { await sendMessage('Ogiltigt val — ingen ändring gjord.'); return; }
      updateWatch(watch.id, 'platforms', val);
      await sendMessage(`✓ *"${watch.query}"* bevakar nu: ${val}`);
    } else if (field === 'ad_type') {
      const num = parseInt(lower, 10);
      if (num === 0) { await sendMessage('Avbrutet.'); return; }
      const map = { 1: 'sell', 2: 'buy', 3: 'all' };
      const labels = { sell: 'bara säljes', buy: 'bara köpes', all: 'alla typer' };
      if (num === 0) { await sendMessage('Avbrutet.'); return; }
      const val = map[num];
      if (!val) { await sendMessage('Ogiltigt val — ingen ändring gjord.'); return; }
      updateWatch(watch.id, 'ad_type', val);
      await sendMessage(`✓ *"${watch.query}"* visar nu ${labels[val]}.`);
    } else if (field === 'exclude_words') {
      if (lower === '0') {
        updateWatch(watch.id, 'exclude_words', null);
        await sendMessage(`✓ Exkluderingsord borttagna för *"${watch.query}"*.`);
      } else {
        updateWatch(watch.id, 'exclude_words', text.trim());
        await sendMessage(`✓ Exkluderar nu: ${text.trim()}`);
      }
    } else if (field === 'max_price' || field === 'min_price') {
      const num = parseInt(lower.replace(/\s/g, ''), 10);
      if (num === 0) {
        updateWatch(watch.id, field, null);
        await sendMessage(`✓ ${field === 'max_price' ? 'Maxpris' : 'Minpris'} borttaget.`);
      } else if (isNaN(num) || num < 0) {
        await sendMessage('Ogiltigt belopp — ingen ändring gjord.');
      } else {
        updateWatch(watch.id, field, num);
        await sendMessage(`✓ ${field === 'max_price' ? 'Maxpris' : 'Minpris'} satt till ${num.toLocaleString('sv-SE')} kr.`);
      }
    }
    return;
  }

  // ── idle — tolka kommandon ────────────────────────────────────────────────
  if (lower.startsWith('visa')) {
    const watches = getWatchesList();
    await sendMessage(formatWatchesList(watches));
    return;
  }

  if (lower.startsWith('lägg till')) {
    session.state = STATE_AWAITING_QUERY;
    armTimeout(jid);
    await sendMessage('Vad vill du bevaka? Skriv sökord och valfritt maxpris.\nExempel: *VW LT under 40000*');
    return;
  }

  if (lower.startsWith('ändra') || lower.startsWith('andra')) {
    const watches = getWatchesList();
    if (watches.length === 0) {
      await sendMessage('Inga aktiva bevakningar att ändra.');
      return;
    }
    session.state = STATE_AWAITING_SELECTION;
    session.action = 'edit';
    armTimeout(jid);
    await sendMessage(`Vilken bevakning vill du ändra?\n\n${formatWatchesList(watches, true)}`);
    return;
  }

  if (lower.startsWith('ta bort')) {
    const watches = getWatchesList();
    if (watches.length === 0) {
      await sendMessage('Inga aktiva bevakningar att ta bort.');
      return;
    }
    session.state = STATE_AWAITING_SELECTION;
    session.action = 'remove';
    armTimeout(jid);
    await sendMessage(`Vilken bevakning vill du ta bort?\n\n${formatWatchesList(watches, true)}`);
    return;
  }

  if (lower.startsWith('sök') || lower.startsWith('sok')) {
    const watches = getWatchesList();
    if (watches.length === 0) {
      await sendMessage('Inga aktiva bevakningar att söka på.');
      return;
    }
    await sendMessage(`🔍 Söker manuellt på ${watches.length} bevakning${watches.length > 1 ? 'ar' : ''}...`);
    runPollCycle({ manual: true }).then(({ totalNew }) => {
      if (totalNew === 0) return sendMessage('Ingenting nytt hittades.');
    }).catch((err) => console.error('[Bot] Fel vid manuell sökning:', err));
    return;
  }

  if (lower.startsWith('svartlista') || lower.startsWith('blacklist')) {
    const rest = text.trim().slice(lower.startsWith('svartlista') ? 10 : 9).trim();
    const restLower = rest.toLowerCase();

    if (restLower.startsWith('lägg till ') || restLower.startsWith('add ')) {
      const word = rest.slice(restLower.startsWith('lägg till ') ? 10 : 4).trim().toLowerCase();
      if (!word) { await sendMessage('Ange ett ord att lägga till.'); return; }
      addBlacklistWord(word);
      await sendMessage(`🚫 "${word}" tillagd i blacklisten.`);
      return;
    }

    if (restLower.startsWith('ta bort ') || restLower.startsWith('remove ')) {
      const arg = rest.slice(restLower.startsWith('ta bort ') ? 8 : 7).trim();
      const words = getBlacklist();
      const num = parseInt(arg, 10);
      const word = !isNaN(num) && num > 0 ? words[num - 1] : arg.toLowerCase();
      if (!word) { await sendMessage('Ange ett ord eller nummer att ta bort.'); return; }
      removeBlacklistWord(word);
      await sendMessage(`✓ "${word}" borttagen från blacklisten.`);
      return;
    }

    // Visa blacklisten
    const words = getBlacklist();
    if (words.length === 0) {
      await sendMessage(
        `🚫 *Blacklist — inga ord än.*\n\n` +
        `Lägg till: *Svartlista lägg till <ord>*\n` +
        `Ta bort: *Svartlista ta bort <ord/nr>*`
      );
    } else {
      const list = words.map((w, i) => `${i + 1}. ${w}`).join('\n');
      await sendMessage(
        `🚫 *Blacklist (${words.length} ord):*\n\n${list}\n\n` +
        `Lägg till: *Svartlista lägg till <ord>*\n` +
        `Ta bort: *Svartlista ta bort <nr>*`
      );
    }
    return;
  }

  if (lower.startsWith('hjälp') || lower.startsWith('help')) {
    await sendMessage(formatHelp());
    return;
  }
}
