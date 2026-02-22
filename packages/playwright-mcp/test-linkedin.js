const { patchPlaywright } = require('./patch');
patchPlaywright();

const { chromium } = require('playwright');

async function testLinkedIn() {
  console.log('Launching browser with humanized mouse movements...');
  
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 100,
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  
  try {
    console.log('Navigating to LinkedIn...');
    await page.goto('https://www.linkedin.com', { waitUntil: 'networkidle' });
    
    await new Promise(r => setTimeout(r, 2000));
    
    console.log('Current URL:', page.url());
    
    if (page.url().includes('login')) {
      console.log('\n=== LinkedIn Login Page ===');
      console.log('The browser is open. You can log in manually if you want.');
      console.log('Waiting 30 seconds for manual login...\n');
      
      await new Promise(r => setTimeout(r, 30000));
    }
    
    if (!page.url().includes('login')) {
      console.log('Looking for a profile to visit...');
      
      const searchInput = await page.$('input[placeholder*="Search"]');
      if (searchInput) {
        console.log('Moving to search input with human-like movement...');
        await searchInput.click();
        await page.keyboard.type('Satya Nadella', { delay: 50 + Math.random() * 100 });
        await new Promise(r => setTimeout(r, 1000));
        
        await page.keyboard.press('Enter');
        await page.waitForLoadState('networkidle');
        await new Promise(r => setTimeout(r, 2000));
        
        console.log('Search results loaded, looking for profile link...');
        
        const profileLink = await page.$('a[href*="/in/"]');
        if (profileLink) {
          console.log('Found profile, clicking with human-like movement...');
          await profileLink.click();
          await page.waitForLoadState('networkidle');
          await new Promise(r => setTimeout(r, 2000));
          
          console.log('Profile page URL:', page.url());
        }
      }
    }
    
    console.log('\n=== Test Complete ===');
    console.log('Watch the browser - mouse movements should look human-like (curved paths, not straight lines)');
    console.log('Browser will stay open for 10 more seconds...');
    
    await new Promise(r => setTimeout(r, 10000));
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

testLinkedIn().catch(console.error);
