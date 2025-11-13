const fs = require('fs');
const path = require('path');

/**
 * Merge static seed data (robotlist.txt) with live scraped data
 * Strategy: Prefer live data, use seed as fallback
 */

function normalizeMac(mac) {
  if (!mac) return '';
  const clean = mac.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  if (clean.length !== 12) return '';
  return clean.match(/.{2}/g).join(':').toUpperCase();
}

function mergeRobotData() {
  console.log('🔄 Merging static and live robot data...\n');

  // Load seed data (from robotlist.txt via parser)
  const seedDataPath = path.join(__dirname, '../public/data.json');
  let seedData = { sites: [], robots: [] };
  
  if (fs.existsSync(seedDataPath)) {
    seedData = JSON.parse(fs.readFileSync(seedDataPath, 'utf8'));
    console.log(`  ✅ Loaded seed data: ${seedData.robots.length} robots from ${seedData.sites.length} sites`);
  } else {
    console.log('  ⚠️  No seed data found, run: npm run build:data');
  }

  // Load scraped data
  const scrapedDataPath = path.join(__dirname, '../public/scraped-robots.json');
  let scrapedData = { sites: [], totalRobots: 0 };
  
  if (fs.existsSync(scrapedDataPath)) {
    scrapedData = JSON.parse(fs.readFileSync(scrapedDataPath, 'utf8'));
    const totalLive = scrapedData.sites.reduce((sum, site) => sum + (site.robots || []).length, 0);
    console.log(`  ✅ Loaded scraped data: ${totalLive} robots from ${scrapedData.sites.length} sites`);
    console.log(`     Scraped at: ${scrapedData.scrapedAt}`);
  } else {
    console.log('  ⚠️  No scraped data found, using seed data only');
    console.log('     To scrape: npm run scrape');
  }

  // Create robot map by siteId + MAC address (key = siteId:mac)
  // This allows same robot to exist on multiple sites
  const robotMap = new Map();

  // First, add all seed robots (as backup)
  seedData.robots.forEach(robot => {
    const normalizedMac = normalizeMac(robot.mac);
    if (normalizedMac && robot.siteId) {
      const key = `${robot.siteId}:${normalizedMac}`;
      robotMap.set(key, {
        ...robot,
        source: 'seed'
      });
    }
  });

  console.log(`\n  📊 Added ${robotMap.size} robots from seed data (backup)`);

  // Then, override/add with scraped robots (prefer live data)
  let liveCount = 0;
  let liveUpdates = 0;
  scrapedData.sites.forEach(site => {
    if (!site.success || !site.robots) return;
    
    site.robots.forEach(robot => {
      const normalizedMac = normalizeMac(robot.mac);
      if (normalizedMac) {
        const key = `${site.siteId}:${normalizedMac}`;
        const isUpdate = robotMap.has(key);
        
        // Create consistent robot object
        robotMap.set(key, {
          id: `live-${site.siteId}-${normalizedMac}`,
          siteId: site.siteId,
          type: robot.type || '',
          name: robot.name || '',
          description: robot.description || '',
          mac: normalizedMac,
          rawMac: robot.mac.replace(/[^0-9a-fA-F]/g, '').toLowerCase(),
          source: 'live',
          scrapedAt: site.scrapedAt,
          createdAt: robot.registeredDate || site.scrapedAt
        });
        
        liveCount++;
        if (isUpdate) liveUpdates++;
      }
    });
  });

  console.log(`  ✅ Added/updated ${liveCount} robots from live data (${liveUpdates} updates, ${liveCount - liveUpdates} new)`);

  // Convert map to array
  const mergedRobots = Array.from(robotMap.values());

  // Count by source
  const liveRobots = mergedRobots.filter(r => r.source === 'live').length;
  const seedRobots = mergedRobots.filter(r => r.source === 'seed').length;

  console.log(`\n  📈 Merge complete:`);
  console.log(`     Total robots: ${mergedRobots.length}`);
  console.log(`     Live data: ${liveRobots} (${(liveRobots / mergedRobots.length * 100).toFixed(1)}%)`);
  console.log(`     Backup data: ${seedRobots} (${(seedRobots / mergedRobots.length * 100).toFixed(1)}%)`);

  // Create merged output
  const mergedOutput = {
    sites: seedData.sites, // Use seed sites list
    robots: mergedRobots,
    scrapedAt: scrapedData.scrapedAt || null,
    mergedAt: new Date().toISOString(),
    stats: {
      total: mergedRobots.length,
      live: liveRobots,
      seed: seedRobots
    }
  };

  // Save merged data
  const outputPath = path.join(__dirname, '../public/merged-robots.json');
  fs.writeFileSync(outputPath, JSON.stringify(mergedOutput, null, 2));
  
  console.log(`\n  💾 Saved merged data to: ${outputPath}`);
  console.log(`\n✅ Merge complete!\n`);

  return mergedOutput;
}

// Run if called directly
if (require.main === module) {
  try {
    mergeRobotData();
  } catch (error) {
    console.error('\n❌ Error merging data:', error);
    process.exit(1);
  }
}

module.exports = { mergeRobotData };
