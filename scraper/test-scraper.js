const puppeteer = require('puppeteer');

// Configuration for one site (we'll expand this later)
const siteConfig = {
  'cs.twinnyservice.com': {
    loginUrl: 'http://cs.twinnyservice.com/login',
    robotsUrl: 'http://cs.twinnyservice.com/robot',
    selectors: {
      usernameInput: 'input[type="text"][placeholder*="아이디"]',
      passwordInput: 'input[type="password"][placeholder*="비밀번호"]',
      loginButton: 'button:has-text("로그인")',
      robotTable: 'table tbody tr',
      robotType: 'td:nth-child(2)',
      robotName: 'td:nth-child(3)',
      robotMac: 'td:nth-child(4)',
      robotDescription: 'td:nth-child(5)'
    }
  }
};

async function scrapeSite(siteId, username, password) {
  console.log(`\n🤖 Starting scrape for ${siteId}...`);
  
  const config = siteConfig[siteId];
  if (!config) {
    throw new Error(`No configuration found for ${siteId}`);
  }

  // Launch browser
  const browser = await puppeteer.launch({
    headless: false, // Set to true for production
    defaultViewport: { width: 1280, height: 800 }
  });

  try {
    const page = await browser.newPage();
    
    // Enable request interception to see what APIs are called
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = request.url();
      if (url.includes('/api/') || url.includes('robot')) {
        console.log('  📡 API Call:', request.method(), url);
      }
      request.continue();
    });

    page.on('response', async response => {
      const url = response.url();
      if (url.includes('/api/') || url.includes('robot')) {
        console.log('  📥 API Response:', response.status(), url);
        try {
          const contentType = response.headers()['content-type'];
          if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            console.log('  📦 Data:', JSON.stringify(data, null, 2).substring(0, 500));
          }
        } catch (e) {
          // Can't parse as JSON
        }
      }
    });

    // Step 1: Go to login page
    console.log(`  ➡️  Navigating to ${config.loginUrl}`);
    await page.goto(config.loginUrl, { waitUntil: 'networkidle2' });
    await page.waitForTimeout(1000);

    // Step 2: Fill in credentials
    console.log('  🔐 Filling in credentials...');
    await page.type(config.selectors.usernameInput, username);
    await page.type(config.selectors.passwordInput, password);
    
    // Step 3: Click login
    console.log('  🚪 Clicking login...');
    await Promise.all([
      page.click(config.selectors.loginButton),
      page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    // Step 4: Navigate to robots page
    console.log(`  ➡️  Navigating to ${config.robotsUrl}`);
    await page.goto(config.robotsUrl, { waitUntil: 'networkidle2' });
    await page.waitForTimeout(2000); // Wait for dynamic content

    // Step 5: Extract robot data from table
    console.log('  📊 Extracting robot data from table...');
    const robots = await page.evaluate((selectors) => {
      const rows = document.querySelectorAll(selectors.robotTable);
      const data = [];
      
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 5) {
          data.push({
            type: cells[1]?.textContent?.trim() || '',
            name: cells[2]?.textContent?.trim() || '',
            mac: cells[3]?.textContent?.trim() || '',
            description: cells[4]?.textContent?.trim() || ''
          });
        }
      });
      
      return data;
    }, config.selectors);

    console.log(`  ✅ Found ${robots.length} robots`);
    return robots;

  } catch (error) {
    console.error('  ❌ Error:', error.message);
    throw error;
  } finally {
    await browser.close();
  }
}

// Test function
async function main() {
  try {
    const username = 'thkim';
    const password = 'rtcl5435!!';
    
    const robots = await scrapeSite('cs.twinnyservice.com', username, password);
    
    console.log('\n📋 Results:');
    console.log(JSON.stringify(robots, null, 2));
    
    console.log(`\n✨ Successfully scraped ${robots.length} robots!`);
    
  } catch (error) {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { scrapeSite };

