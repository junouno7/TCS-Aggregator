const fs = require('fs');
const path = require('path');

// Normalize MAC address to uppercase with colons
function normalizeMac(mac) {
  if (!mac) return { mac: '', rawMac: '' };
  
  // Remove all non-hex characters
  const clean = mac.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  
  // If not 12 hex chars, return as-is for rawMac but empty for mac
  if (clean.length !== 12) {
    console.warn(`Warning: Invalid MAC address format: ${mac}`);
    return { mac: '', rawMac: mac };
  }
  
  // Split into pairs and uppercase with colons
  const normalized = clean.match(/.{2}/g).join(':').toUpperCase();
  return { mac: normalized, rawMac: clean };
}

// Parse website list
function parseWebsites(content) {
  const lines = content.split('\n').map(l => l.trim()).filter(l => l);
  const sites = [];
  
  for (const line of lines) {
    // Extract URL and check for status markers
    let url = line.split('(')[0].trim();
    const isUnused = line.includes('NOT USED ANYMORE');
    const isDown = line.includes('Not working currently');
    
    // Normalize URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'http://' + url;
    }
    if (!url.endsWith('/')) {
      url += '/';
    }
    
    // Extract host as ID
    const urlObj = new URL(url);
    const id = urlObj.host;
    
    let status = 'active';
    if (isUnused) status = 'unused';
    else if (isDown) status = 'down';
    
    sites.push({ id, baseUrl: url, status });
  }
  
  return sites;
}

// Parse robot list
function parseRobots(content, sites) {
  const lines = content.split('\n');
  const robots = [];
  let currentSiteId = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Detect section headers like "support.twinnyservice.com robots:" or "http://twinnyshow.twinnyservice.com robots:"
    const sectionMatch = line.match(/^(?:https?:\/\/)?([\w.-]+)\s+robots:/i);
    if (sectionMatch) {
      currentSiteId = sectionMatch[1];
      continue;
    }
    
    // Skip empty lines, headers, and separator lines
    if (!line || line.startsWith('|--') || line.startsWith('ROBOTS REGISTERED')) {
      continue;
    }
    
    // Parse table rows (format: | col1 | col2 | col3 | col4 |)
    if (line.startsWith('|') && currentSiteId) {
      const parts = line.split('|').map(p => p.trim()).filter(p => p);
      
      // Skip header rows and separator rows (containing only dashes)
      if (parts.length === 4 && 
          parts[0] !== 'Robot Type' && 
          parts[1] !== 'Robot Name' &&
          !parts[0].match(/^-+$/) &&
          !parts[1].match(/^-+$/)) {
        
        const [type, name, macRaw, description] = parts;
        const { mac, rawMac } = normalizeMac(macRaw);
        
        // Only add if we have at least a name
        if (name) {
          robots.push({
            id: `seed-${robots.length}`,
            siteId: currentSiteId,
            type: type || '',
            name: name || '',
            description: description || '',
            mac,
            rawMac,
            source: 'seed',
            createdAt: new Date().toISOString()
          });
        }
      }
    }
  }
  
  console.log(`Parsed ${robots.length} robots from ${new Set(robots.map(r => r.siteId)).size} sites`);
  return robots;
}

// Main parser
function main() {
  try {
    // Read input files
    const websiteContent = fs.readFileSync(path.join(__dirname, '../websitelist.txt'), 'utf8');
    const robotContent = fs.readFileSync(path.join(__dirname, '../robotlist.txt'), 'utf8');
    
    // Parse data
    const sites = parseWebsites(websiteContent);
    const robots = parseRobots(robotContent, sites);
    
    // Filter out unused sites from the active list
    const activeSites = sites.filter(s => s.status !== 'unused');
    
    // Create output data
    const output = {
      sites: activeSites,
      robots: robots
    };
    
    // Ensure public directory exists
    const publicDir = path.join(__dirname, '../public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    
    // Write output
    const outputPath = path.join(publicDir, 'data.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    
    console.log(`✓ Generated ${outputPath}`);
    console.log(`  - ${activeSites.length} sites (${sites.filter(s => s.status === 'active').length} active, ${sites.filter(s => s.status === 'down').length} down)`);
    console.log(`  - ${robots.length} robots`);
    
  } catch (error) {
    console.error('Error parsing data:', error);
    process.exit(1);
  }
}

main();

