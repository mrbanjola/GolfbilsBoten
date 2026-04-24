import 'dotenv/config';
import * as cheerio from 'cheerio';

async function debugKlaravikActive() {
  const query = 'Traktor';
  const url = `https://www.klaravik.se/auktion/?searchtext=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(url, {
      headers: {
        'accept': 'text/html',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    const html = await response.text();
    const $ = cheerio.load(html);

    const allElements = $('div[id^="object_li_"]');
    console.log(`\n📊 Klaravik Debug — Status på ${allElements.length} auktioner\n`);

    let activeCount = 0;
    let endedCount = 0;

    const active = [];
    const ended = [];

    allElements.each((i, el) => {
      const $el = $(el);
      const id = $el.attr('id')?.replace('object_li_', '');
      const title = $el.find('a').first().attr('title') || 'N/A';
      const endedTag = $el.find('.product_card__ended-tag').text().trim();
      const isEnded = endedTag === 'Avslutad';

      if (isEnded) {
        endedCount++;
        ended.push({ id, title });
      } else {
        activeCount++;
        active.push({ id, title });
      }
    });

    console.log(`✅ AKTIVA: ${activeCount} st`);
    console.log(`❌ AVSLUTADE: ${endedCount} st\n`);

    if (active.length > 0) {
      console.log('📋 Första 5 AKTIVA auktioner:\n');
      active.slice(0, 5).forEach((a, i) => {
        console.log(`   ${i + 1}. [${a.id}] ${a.title}`);
      });
    } else {
      console.log('⚠️  Inga aktiva auktioner hittade\n');
      console.log('📋 Första 5 AVSLUTADE auktioner:\n');
      ended.slice(0, 5).forEach((a, i) => {
        console.log(`   ${i + 1}. [${a.id}] ${a.title}`);
      });
    }
  } catch (err) {
    console.error('❌ Fel:', err.message);
  }
}

debugKlaravikActive();
