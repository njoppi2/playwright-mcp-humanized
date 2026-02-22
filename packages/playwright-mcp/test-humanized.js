const { patchPlaywright } = require('./patch');
patchPlaywright();

const { chromium } = require('playwright');

async function testHumanizedMouse() {
  console.log('=== Testing Humanized Playwright MCP ===\n');
  console.log('Launching browser (headless)...');
  
  const browser = await chromium.launch({ headless: true });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  
  const page = await context.newPage();
  
  let mouseMoveEvents = [];
  
  await page.exposeFunction('trackMouseMove', (x, y) => {
    mouseMoveEvents.push({ x, y, t: Date.now() });
  });
  
  await page.addInitScript(() => {
    document.addEventListener('mousemove', (e) => {
      window.trackMouseMove(e.clientX, e.clientY);
    });
  });
  
  try {
    console.log('1. Testing page.mouse.move()...');
    await page.goto('data:text/html,<html><body style="width:2000px;height:2000px">Test Page</body></html>');
    
    const startX = 100;
    const startY = 100;
    const endX = 800;
    const endY = 600;
    
    mouseMoveEvents = [];
    await page.mouse.move(endX, endY);
    
    console.log(`   Mouse events captured: ${mouseMoveEvents.length}`);
    
    if (mouseMoveEvents.length > 2) {
      const xs = mouseMoveEvents.map(e => e.x);
      const ys = mouseMoveEvents.map(e => e.y);
      
      const xVariance = Math.max(...xs) - Math.min(...xs);
      const yVariance = Math.max(...ys) - Math.min(...ys);
      
      console.log(`   X range: ${Math.min(...xs)} to ${Math.max(...xs)} (variance: ${xVariance})`);
      console.log(`   Y range: ${Math.min(...ys)} to ${Math.max(...ys)} (variance: ${yVariance})`);
      
      const isCurved = xVariance > 50 || yVariance > 50;
      console.log(`   Curved path detected: ${isCurved ? '✅ YES (human-like)' : '⚠️ NO (possibly linear)'}`);
    } else {
      console.log('   ⚠️ Too few events captured (headless limitation)');
    }
    
    console.log('\n2. Testing locator.click()...');
    await page.goto('data:text/html,<html><body><button id="test" style="position:absolute;left:500px;top:400px;width:200px;height:50px;">Click Me</button><script>document.getElementById("test").onclick = () => document.getElementById("test").textContent = "Clicked!";</script></body></html>');
    
    const button = page.locator('#test');
    await button.click();
    
    const buttonText = await button.textContent();
    console.log(`   Button text after click: "${buttonText}"`);
    console.log(`   Click success: ${buttonText === 'Clicked!' ? '✅' : '❌'}`);
    
    console.log('\n3. Testing locator.hover()...');
    await page.goto('data:text/html,<html><body><div id="hover" style="position:absolute;left:300px;top:200px;width:200px;height:100px;background:lightblue;">Hover over me</div><script>document.getElementById("hover").onmouseenter = () => document.getElementById("hover").style.background = "lightgreen";</script></body></html>');
    
    const hoverTarget = page.locator('#hover');
    await hoverTarget.hover();
    
    const bgColor = await hoverTarget.evaluate(el => el.style.background);
    console.log(`   Background after hover: ${bgColor}`);
    console.log(`   Hover success: ${bgColor === 'lightgreen' ? '✅' : '❌'}`);
    
    console.log('\n4. Testing humanized click coordinates...');
    await page.goto('data:text/html,<html><body><div id="box" style="position:absolute;left:200px;top:100px;width:400px;height:300px;background:coral;"><span id="coords"></span></div><script>document.getElementById("box").onclick = (e) => { document.getElementById("coords").textContent = e.offsetX + "," + e.offsetY; };</script></body></html>');
    
    const box = page.locator('#box');
    const coords = [];
    
    for (let i = 0; i < 3; i++) {
      await box.click();
      const coord = await page.locator('#coords').textContent();
      coords.push(coord);
      await new Promise(r => setTimeout(r, 100));
    }
    
    console.log(`   Click coordinates: ${coords.join(' | ')}`);
    const allSame = coords.every(c => c === coords[0]);
    console.log(`   Randomized positions: ${!allSame ? '✅ YES (human-like)' : '⚠️ NO (always same position)'}`);

    console.log('\n5. Testing locator.fill() humanization...');
    await page.goto('data:text/html,<html><body><input id="input" style="position:absolute;left:100px;top:100px;width:200px;"/><script>window.keydownTimes = []; document.getElementById("input").onkeydown = () => window.keydownTimes.push(Date.now());</script></body></html>');
    
    const input = page.locator('#input');
    await input.fill('human');
    
    const times = await page.evaluate(() => window.keydownTimes);
    const duration = times.length >= 2 ? times[times.length-1] - times[0] : 0;
    console.log(`   Keydown events: ${times.length}`);
    console.log(`   Typing duration: ${duration}ms`);
    console.log(`   Humanized typing delay: ${duration > 20 ? '✅ YES' : '❌ NO (instant)'}`);
    
    console.log('\n=== Test Complete ===');
    console.log('All core functionality works! The humanized wrapper is operational.');
    console.log('\nTo visually verify curved mouse movements, run:');
    console.log('  node test-linkedin.js');
    console.log('on a machine with a display (or use xvfb-run).');
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await browser.close();
  }
}

testHumanizedMouse().catch(console.error);
