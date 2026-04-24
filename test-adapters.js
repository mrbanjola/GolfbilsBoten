import 'dotenv/config';
import { KlaravikAdapter } from './src/adapters/klaravik.js';
import { BlintoAdapter } from './src/adapters/blinto.js';

const testQueries = [
  { query: 'Iveco Daily', max_price: 150000, min_price: null },
  { query: 'VW Golf', max_price: 100000, min_price: null },
  { query: 'Traktor', max_price: null, min_price: null },
];

async function runTests() {
  const klaravik = new KlaravikAdapter(500);
  const blinto = new BlintoAdapter(500);

  console.log('\n═══════════════════════════════════════════════════════════════\n');
  console.log('🧪 TESTER AV KLARAVIK OCH BLINTO ADAPTRAR\n');

  for (const testWatch of testQueries) {
    console.log(`\n📍 Test: "${testWatch.query}"\n`);

    // Klaravik
    console.log('▶ Testar Klaravik...');
    try {
      const klaravikResults = await klaravik.search(testWatch);
      console.log(`✅ Klaravik: ${klaravikResults.length} auktioner hittade\n`);
      if (klaravikResults.length > 0) {
        klaravikResults.slice(0, 3).forEach((r, i) => {
          console.log(`   ${i + 1}. ${r.title}`);
          console.log(`      Pris: ${r.price} kr | Bud: ${r.bidCount} | URL: ${r.url}`);
          console.log(`      Slut: ${r.auctionEnd || 'N/A'}`);
          console.log('');
        });
      }
    } catch (err) {
      console.error(`❌ Klaravik fel: ${err.message}\n`);
    }

    // Blinto
    console.log('▶ Testar Blinto...');
    try {
      const blintoResults = await blinto.search(testWatch);
      console.log(`✅ Blinto: ${blintoResults.length} auktioner hittade\n`);
      if (blintoResults.length > 0) {
        blintoResults.slice(0, 3).forEach((r, i) => {
          console.log(`   ${i + 1}. ${r.title}`);
          if (r.subtitle) console.log(`      ${r.subtitle}`);
          console.log(`      Pris: ${r.price} kr | Bud: ${r.bidCount} | URL: ${r.url}`);
          console.log(`      Slut: ${r.auctionEnd || 'N/A'}`);
          console.log('');
        });
      }
    } catch (err) {
      console.error(`❌ Blinto fel: ${err.message}\n`);
    }

    console.log('───────────────────────────────────────────────────────────────\n');
  }

  console.log('\n✨ Tester klar!');
}

runTests().catch(console.error);
