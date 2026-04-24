import 'dotenv/config';
import * as cheerio from 'cheerio';

async function debugKlaravikDetails() {
  const query = 'Traktor';
  const url = `https://www.klaravik.se/auktion/?searchtext=${encodeURIComponent(query)}`;

  console.log(`\n🔍 Detaljerad debug av Klaravik för: "${query}"\n`);

  try {
    const response = await fetch(url, {
      headers: {
        'accept': 'text/html',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    const html = await response.text();
    const $ = cheerio.load(html);

    const first = $('div[id^="object_li_"]').eq(0);
    console.log('📋 Första auktion struktur:\n');

    // Titel
    const title = first.find('a').first().attr('title');
    console.log(`✓ Titel: ${title}`);

    // URL
    const href = first.find('a').first().attr('href');
    console.log(`✓ Href: ${href}`);

    // Bild
    const img = first.find('img').first().attr('src');
    console.log(`✓ Bild: ${img?.slice(0, 80)}...`);

    // Auktionsdata
    const span = first.find('[class*="addFav_"]');
    console.log(`✓ data-auction-close: ${span.attr('data-auction-close')}`);
    console.log(`✓ data-auction-start: ${span.attr('data-auction-start')}`);

    // Alla textnoder
    console.log('\n📝 Alla textnoder i första element (första 2000 chars):\n');
    const allText = first.text();
    console.log(allText.slice(0, 2000));

    console.log('\n\n🔎 Söker efter pris-element:\n');
    // Sök efter pris
    const priceSelectors = [
      '.product_card__current-bid',
      '.price',
      '[class*="price"]',
      '[class*="bid"]',
      '[class*="current"]',
    ];

    priceSelectors.forEach((sel) => {
      const el = first.find(sel);
      if (el.length > 0) {
        console.log(`   ${sel}: trovato "${el.first().text().trim()}"`);
      }
    });

    // Visa all HTML med limited width
    console.log('\n\n📄 Full HTML av första element:\n');
    const fullHTML = first.html();
    console.log(fullHTML?.slice(0, 3000));
  } catch (err) {
    console.error('❌ Fel:', err.message);
  }
}

debugKlaravikDetails();
