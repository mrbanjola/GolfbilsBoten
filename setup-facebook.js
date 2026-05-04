/**
 * Engångsscript för att logga in på Facebook och spara sessionen.
 * Kör: node setup-facebook.js
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';

const authFile = join('data', 'facebook-auth.json');
mkdirSync('data', { recursive: true });

const rl = createInterface({ input: process.stdin, output: process.stdout });
const waitForEnter = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

console.log('Öppnar Facebook...');
const browser = await chromium.launch({ headless: false, slowMo: 50 });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
});
const page = await context.newPage();
await page.goto('https://www.facebook.com/login');

await waitForEnter('\nLogga in i webbläsarfönstret och tryck sedan Enter här...\n');

await context.storageState({ path: authFile });
console.log(`✓ Session sparad till ${authFile}`);

await browser.close();
rl.close();
