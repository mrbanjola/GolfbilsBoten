import 'dotenv/config';
import * as cheerio from 'cheerio';

async function debugKlaravik() {
  const query = 'Traktor';
  const url = `https://www.klaravik.se/auktion/?searchtext=${encodeURIComponent(query)}`;

  console.log(`\n🔍 Debuggning av Klaravik HTML för: "${query}"\n`);
  console.log(`URL: ${url}\n`);

  try {
    const response = await fetch(url, {
      headers: {
        'accept': 'text/html',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    const html = await response.text();
    const $ = cheerio.load(html);

    console.log(`✅ Hämtad HTML: ${html.length} bytes\n`);

    // Sök efter artikel-wrappers
    console.log('🔎 Söker efter olika möjliga artikel-structure:\n');

    // Försök 1: article med ID
    const articles = $('article[id^="product_card--"]');
    console.log(`   article[id^="product_card--"]: ${articles.length} st`);

    // Försök 2: Alla articles
    const allArticles = $('article');
    console.log(`   article (alla): ${allArticles.length} st`);

    // Försök 3: Divs med product_card klass
    const productCards = $('.product_card');
    console.log(`   .product_card: ${productCards.length} st`);

    // Försök 4: Divs med some variation
    const productItem = $('.product-item, [class*="product"], [class*="item"], [class*="listing"]');
    console.log(`   .product-item/.product/item/listing: ${productItem.length} st\n`);

    // Visa första 3 artiklar om de finns
    if (articles.length > 0) {
      console.log(`✅ Hittade ${articles.length} divs med id="object_li_*"\n`);
      console.log(`📋 Första element HTML:\n`);
      const firstHTML = $('div[id^="object_li_"]').eq(0).html();
      console.log(firstHTML?.slice(0, 2000));
      console.log('\n...\n');
    } else if (allArticles.length > 0) {
      console.log(`📋 Första <article> (generell):\n`);
      console.log(allArticles.eq(0).html()?.slice(0, 500) + '\n');
    } else if (productCards.length > 0) {
      console.log(`📋 Första .product_card:\n`);
      console.log(productCards.eq(0).html()?.slice(0, 500) + '\n');
    }

    // Presentera hela HTML-huvudet som debug
    console.log('📄 Första 1000 bytes av HTML:\n');
    console.log(html.slice(0, 1000) + '\n');
  } catch (err) {
    console.error('❌ Fel:', err.message);
  }
}

debugKlaravik();
