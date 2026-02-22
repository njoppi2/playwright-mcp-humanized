const { chromium } = require('playwright');
const { patchPlaywright } = require('./packages/playwright-mcp/patch');

patchPlaywright();

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 1. Navigate
  await page.goto('https://example.com/');

  // 2. Inject tracker exactly as defined
  const code1 = async (page) => {
    await page.evaluate(() => {
      window.mouseMovements = [];
      document.addEventListener('mousemove', (e) => {
        window.mouseMovements.push({ x: e.clientX, y: e.clientY });
      });
      document.addEventListener('click', (e) => {
        e.preventDefault();
        window.mouseMovements.push({ click_x: e.clientX, click_y: e.clientY });
      });
    });
    return 'Tracker injected';
  };
  await code1(page);

  // 3. Wait 1 second
  await new Promise(r => setTimeout(r, 1000));

  // 4. Click the 'Learn more' link
  const link = page.locator('a');
  await link.click();

  // 5. Wait 1 second
  await new Promise(r => setTimeout(r, 1000));

  // 6. Retrieve mouseMovements exactly as requested
  const code2 = async (page) => {
    return await page.evaluate(() => window.mouseMovements);
  };
  const movements = await code2(page);

  // 7. Write exact JSON output to tracker_output.json
  require('fs').writeFileSync('tracker_output.json', JSON.stringify(movements, null, 2));

  await browser.close();
}

run().catch(console.error);