const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Load site configurations
const siteConfigs = require('./site-configs.json');

// Master credentials
const CREDENTIALS = {
  username: 'thkim',
  password: 'rtcl5435!!'
};

/**
 * Scrape robots from a single TCS MASTER site
 */
async function scrapeSite(siteConfig, options = {}) {
  const { headless = true, timeout = 30000 } = options;
  
  console.log(`\n🤖 Scraping ${siteConfig.id}...`);
  
  const browser = await puppeteer.launch({
    headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 800 }
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(timeout);

    // Step 1: Navigate to login page
    console.log(`  ➡️  Navigating to ${siteConfig.loginUrl}`);
    await page.goto(siteConfig.loginUrl, { waitUntil: 'networkidle2' });
    await page.waitForTimeout(1000);

    // Step 2: Fill credentials
    console.log(`  🔐 Logging in as ${CREDENTIALS.username}...`);
    await page.waitForSelector(siteConfig.selectors.usernameInput);
    await page.type(siteConfig.selectors.usernameInput, CREDENTIALS.username, { delay: 50 });
    await page.type(siteConfig.selectors.passwordInput, CREDENTIALS.password, { delay: 50 });

    // Step 3: Click login and wait for navigation
    await Promise.all([
      page.click(siteConfig.selectors.loginButton),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout }).catch(() => {
        console.log('  ⚠️  Navigation timeout (may be ok if SPA)');
      })
    ]);

    await page.waitForTimeout(1000);

    // Step 4: Navigate to robots page
    console.log(`  ➡️  Navigating to ${siteConfig.robotsUrl}`);
    await page.goto(siteConfig.robotsUrl, { waitUntil: 'networkidle2' });

    // Step 5: Wait for table to load
    console.log(`  ⏳ Waiting for robot table...`);
    await page.waitForSelector(siteConfig.selectors.waitForElement, { timeout: 10000 });
    await page.waitForTimeout(2000); // Extra wait for dynamic content

    // Step 6: Extract robot data using site-specific column mapping
    console.log(`  📊 Extracting robot data...`);
    const robots = await page.evaluate((columnMapping) => {
      const rows = document.querySelectorAll('table tbody tr');
      const data = [];

      rows.forEach((row, index) => {
        const cells = row.querySelectorAll('td');
        
        // Skip if not enough cells (might be header or empty row)
        if (cells.length < 5) return;

        // Extract data using the column mapping specific to this site
        const robot = {
          type: cells[columnMapping.type]?.textContent?.trim() || '',
          name: cells[columnMapping.name]?.textContent?.trim() || '',
          mac: cells[columnMapping.mac]?.textContent?.trim() || '',
          description: cells[columnMapping.description]?.textContent?.trim() || '',
          registeredDate: cells[columnMapping.registeredDate]?.textContent?.trim() || ''
        };

        // Only add if we have at least a name
        if (robot.name) {
          data.push(robot);
        }
      });

      return data;
    }, siteConfig.columnMapping);

    console.log(`  ✅ Found ${robots.length} robots`);
    return {
      siteId: siteConfig.id,
      robots,
      scrapedAt: new Date().toISOString(),
      success: true
    };

  } catch (error) {
    console.error(`  ❌ Error scraping ${siteConfig.id}:`, error.message);
    return {
      siteId: siteConfig.id,
      robots: [],
      scrapedAt: new Date().toISOString(),
      success: false,
      error: error.message
    };
  } finally {
    await browser.close();
  }
}

/**
 * Scrape all configured sites
 */
async function scrapeAllSites(options = {}) {
  console.log('🚀 Starting scrape of all TCS MASTER sites...\n');
  
  const results = {
    scrapedAt: new Date().toISOString(),
    sites: [],
    totalRobots: 0
  };

  for (const siteConfig of siteConfigs.sites) {
    try {
      const result = await scrapeSite(siteConfig, options);
      results.sites.push(result);
      if (result.success) {
        results.totalRobots += result.robots.length;
      }
    } catch (error) {
      console.error(`Fatal error scraping ${siteConfig.id}:`, error);
      results.sites.push({
        siteId: siteConfig.id,
        robots: [],
        scrapedAt: new Date().toISOString(),
        success: false,
        error: error.message
      });
    }

    // Wait between sites to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  return results;
}

/**
 * Save scraped data to file
 */
function saveResults(results, filename = 'scraped-robots.json') {
  const outputPath = path.join(__dirname, '../public', filename);
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Saved results to ${outputPath}`);
  
  // Also save a summary
  const summary = {
    scrapedAt: results.scrapedAt,
    totalRobots: results.totalRobots,
    sites: results.sites.map(s => ({
      id: s.siteId,
      success: s.success,
      robotCount: s.robots.length,
      error: s.error
    }))
  };
  
  console.log('\n📊 Summary:');
  console.log(JSON.stringify(summary, null, 2));
  
  return outputPath;
}

// Main execution
async function main() {
  try {
    // Check for --visible flag (cross-platform)
    const isVisible = process.argv.includes('--visible');
    
    const options = {
      headless: !isVisible, // --visible flag shows browser
      timeout: 30000
    };

    if (isVisible) {
      console.log('🔍 Running in visible mode (browser window will appear)');
    }

    const results = await scrapeAllSites(options);
    saveResults(results);

    const successCount = results.sites.filter(s => s.success).length;
    console.log(`\n✨ Scrape complete!`);
    console.log(`   Successfully scraped: ${successCount}/${results.sites.length} sites`);
    console.log(`   Total robots found: ${results.totalRobots}`);
    
    process.exit(0);
  } catch (error) {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { scrapeSite, scrapeAllSites, saveResults };

