const fs = require('fs');
const path = require('path');

/**
 * Merge static seed/backup data with live scraped data.
 * Strategy:
 * - If a site scrape succeeds, use live data only for that site.
 * - If a site scrape fails or is missing, use seed data as fallback.
 * - Persist a rolling backup file refreshed from successful live scrapes.
 */

function normalizeMac(mac) {
  if (!mac) return '';
  const clean = mac.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  if (clean.length !== 12) return '';
  return clean.match(/.{2}/g).join(':').toUpperCase();
}

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function buildRobotFromLive(site, robot, normalizedMac, source = 'live') {
  const rawMac = (robot.mac || '').replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  const idPrefix = source === 'live' ? 'live' : 'backup';

  return {
    id: `${idPrefix}-${site.siteId}-${normalizedMac}`,
    siteId: site.siteId,
    type: robot.type || '',
    name: robot.name || '',
    description: robot.description || '',
    mac: normalizedMac,
    rawMac: rawMac || normalizedMac.replace(/:/g, '').toLowerCase(),
    source,
    scrapedAt: site.scrapedAt || null,
    createdAt: robot.registeredDate || site.scrapedAt || null
  };
}

function mergeRobotData() {
  console.log('🔄 Merging static and live robot data...\n');

  // Load static seed data (from robotlist.txt via parser)
  const seedDataPath = path.join(__dirname, '../public/data.json');
  const staticSeedData = loadJson(seedDataPath, { sites: [], robots: [] });
  if (staticSeedData.robots.length > 0 || staticSeedData.sites.length > 0) {
    console.log(`  ✅ Loaded static seed data: ${staticSeedData.robots.length} robots from ${staticSeedData.sites.length} sites`);
  } else {
    console.log('  ⚠️  No static seed data found, run: npm run build:data');
  }

  // Load rolling backup data if available, otherwise bootstrap from static seed.
  const backupDataPath = path.join(__dirname, '../public/backup-robots.json');
  const existingBackupData = loadJson(backupDataPath, null);
  const hasExistingBackup = !!(existingBackupData && Array.isArray(existingBackupData.robots));
  const fallbackData = hasExistingBackup ? existingBackupData : staticSeedData;
  const fallbackLabel = hasExistingBackup ? 'rolling backup' : 'static seed';

  if (hasExistingBackup) {
    console.log(`  ✅ Loaded rolling backup: ${fallbackData.robots.length} robots`);
  } else {
    console.log('  ℹ️  No rolling backup found, using static seed as backup baseline');
  }

  // Load scraped data
  const scrapedDataPath = path.join(__dirname, '../public/scraped-robots.json');
  const scrapedData = loadJson(scrapedDataPath, { sites: [], totalRobots: 0 });
  
  if (fs.existsSync(scrapedDataPath)) {
    const totalLive = scrapedData.sites.reduce((sum, site) => sum + (site.robots || []).length, 0);
    console.log(`  ✅ Loaded scraped data: ${totalLive} robots from ${scrapedData.sites.length} sites`);
    console.log(`     Scraped at: ${scrapedData.scrapedAt}`);
  } else {
    console.log('  ⚠️  No scraped data found, using seed data only');
    console.log('     To scrape: npm run scrape');
  }

  // If a site was successfully scraped, that site's merged robots should come from
  // the latest live result only (do not retain stale seed/backup entries).
  const successfulSiteIds = new Set(
    (scrapedData.sites || [])
      .filter(site => site && site.siteId && site.success && Array.isArray(site.robots))
      .map(site => site.siteId)
  );

  if (successfulSiteIds.size > 0) {
    console.log(`  ✅ Successful live scrape for ${successfulSiteIds.size} site(s); those sites will be live-only`);
  }

  // Build rolling backup map from fallback baseline.
  // This file is the dynamic backup used in future runs.
  const backupRobotMap = new Map();
  (fallbackData.robots || []).forEach(robot => {
    const normalizedMac = normalizeMac(robot.mac);
    if (normalizedMac && robot.siteId) {
      const key = `${robot.siteId}:${normalizedMac}`;
      backupRobotMap.set(key, {
        ...robot,
        siteId: robot.siteId,
        mac: normalizedMac,
        rawMac: (robot.rawMac || normalizedMac.replace(/:/g, '').toLowerCase()),
        source: 'seed'
      });
    }
  });

  // Remove old backup entries for successfully scraped sites, then replace with fresh live snapshot.
  let removedForLiveRefresh = 0;
  for (const key of Array.from(backupRobotMap.keys())) {
    const siteId = key.split(':')[0];
    if (successfulSiteIds.has(siteId)) {
      backupRobotMap.delete(key);
      removedForLiveRefresh++;
    }
  }

  let backupRefreshedFromLive = 0;
  (scrapedData.sites || []).forEach(site => {
    if (!site.success || !Array.isArray(site.robots)) return;

    site.robots.forEach(robot => {
      const normalizedMac = normalizeMac(robot.mac);
      if (!normalizedMac) return;
      const key = `${site.siteId}:${normalizedMac}`;
      backupRobotMap.set(key, buildRobotFromLive(site, robot, normalizedMac, 'seed'));
      backupRefreshedFromLive++;
    });
  });

  const updatedBackupRobots = Array.from(backupRobotMap.values());
  const backupOutput = {
    sites: staticSeedData.sites || [],
    robots: updatedBackupRobots,
    updatedAt: new Date().toISOString(),
    scrapedAt: scrapedData.scrapedAt || null,
    source: fallbackLabel,
    stats: {
      total: updatedBackupRobots.length,
      refreshedSites: successfulSiteIds.size,
      refreshedRobots: backupRefreshedFromLive
    }
  };

  fs.writeFileSync(backupDataPath, JSON.stringify(backupOutput, null, 2));
  console.log(`\n  💾 Updated rolling backup: ${backupDataPath}`);
  console.log(`     Baseline: ${fallbackLabel}`);
  console.log(`     Removed stale backup robots for refreshed sites: ${removedForLiveRefresh}`);
  console.log(`     Added fresh backup robots from live scrape: ${backupRefreshedFromLive}`);

  // Build merged output map by siteId + MAC (key = siteId:mac).
  // Same robot can exist on multiple sites.
  const robotMap = new Map();

  // Add backup robots only for sites without successful live scrape in this run.
  let seedAdded = 0;
  let seedSkippedForSuccessfulSites = 0;
  updatedBackupRobots.forEach(robot => {
    if (successfulSiteIds.has(robot.siteId)) {
      seedSkippedForSuccessfulSites++;
      return;
    }

    const normalizedMac = normalizeMac(robot.mac);
    if (!normalizedMac || !robot.siteId) return;

    const key = `${robot.siteId}:${normalizedMac}`;
    robotMap.set(key, {
      ...robot,
      mac: normalizedMac,
      rawMac: (robot.rawMac || normalizedMac.replace(/:/g, '').toLowerCase()),
      source: 'seed'
    });
    seedAdded++;
  });

  console.log(`\n  📊 Added ${seedAdded} robots from backup data to merged output`);
  if (seedSkippedForSuccessfulSites > 0) {
    console.log(`     Skipped ${seedSkippedForSuccessfulSites} backup robots from successfully scraped sites`);
  }

  // Then, override/add with scraped robots (prefer live data in merged output)
  let liveCount = 0;
  let liveUpdates = 0;
  (scrapedData.sites || []).forEach(site => {
    if (!site.success || !site.robots) return;
    
    site.robots.forEach(robot => {
      const normalizedMac = normalizeMac(robot.mac);
      if (normalizedMac) {
        const key = `${site.siteId}:${normalizedMac}`;
        const isUpdate = robotMap.has(key);
        
        robotMap.set(key, buildRobotFromLive(site, robot, normalizedMac, 'live'));
        
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
  const totalRobots = mergedRobots.length;
  const livePercent = totalRobots > 0 ? (liveRobots / totalRobots * 100).toFixed(1) : '0.0';
  const seedPercent = totalRobots > 0 ? (seedRobots / totalRobots * 100).toFixed(1) : '0.0';

  console.log(`\n  📈 Merge complete:`);
  console.log(`     Total robots: ${totalRobots}`);
  console.log(`     Live data: ${liveRobots} (${livePercent}%)`);
  console.log(`     Backup data: ${seedRobots} (${seedPercent}%)`);

  // Build live status per site based on scrape success
  const statusBySiteId = new Map();
  (scrapedData.sites || []).forEach(s => {
    if (!s || !s.siteId) return;
    statusBySiteId.set(s.siteId, s.success ? 'active' : 'down');
  });

  const baseSites = (staticSeedData.sites && staticSeedData.sites.length > 0)
    ? staticSeedData.sites
    : (fallbackData.sites || []);

  // Merge site list: keep seed sites, override status with live health (except 'unused')
  const mergedSites = (baseSites || []).map(site => {
    const liveStatus = statusBySiteId.get(site.id);
    const newStatus = site.status === 'unused' ? site.status : (liveStatus || site.status || 'active');
    return {
      ...site,
      status: newStatus
    };
  });

  // Create merged output
  const mergedOutput = {
    sites: mergedSites,
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
