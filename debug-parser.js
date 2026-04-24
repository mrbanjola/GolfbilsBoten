import 'dotenv/config';
import { KlaravikAdapter } from './src/adapters/klaravik.js';
import * as cheerio from 'cheerio';

async function debugParser() {
  const url = 'https://www.klaravik.se/auktion/?searchtext=Traktor';

  try {
    const response = await fetch(url, {
      headers: {
        'accept': 'text/html',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    const html = await response.text();
    const $ = cheerio.load(html);

    console.log(`\n📊 Parser Debug\n`);
    console.log(`HTML längd: ${html.length} bytes`);

    // Testa selektor
    const count = $('div[id^="object_li_"]').length;
    console.log(`Divs med id="object_li_*": ${count}`);

    if (count === 0) {
      // Försök andra selektorer
      console.log(`\nFörsöker andra selektorer:`);
      console.log(`  div.product_card: ${$('div.product_card').length}`);
      console.log(`  div[id*="object"]: ${$('div[id*="object"]').length}`);
      console.log(`  div[id]: ${$('div[id]').length}`);
      console.log(`  li.product: ${$('li.product').length}`);
      console.log(`  [class*="listing"]: ${$('[class*="listing"]').length}`);
    }

    // Kör parser
    const adapter = new KlaravikAdapter();
    const results = adapter.parseKlaravikResults(html);
    console.log(`\n✅ Parser returnerade: ${results.length} resultat`);

    if (results.length > 0) {
      console.log(`\nFörsta resultat:`);
      console.log(results[0]);
    }
  } catch (err) {
    console.error(err);
  }
}

debugParser();
