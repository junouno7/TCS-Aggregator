const { getStore } = require('@netlify/blobs');
const fs = require('fs');
const path = require('path');
const https = require('https');

// CORS headers
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

// In-memory rate limiting (per function instance)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 5; // 5 requests per minute per IP

function checkRateLimit(ip) {
  const now = Date.now();
  const key = ip;
  
  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, []);
  }
  
  const requests = rateLimitMap.get(key);
  // Remove old requests outside the window
  const recentRequests = requests.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
  
  if (recentRequests.length >= RATE_LIMIT_MAX) {
    return false;
  }
  
  recentRequests.push(now);
  rateLimitMap.set(key, recentRequests);
  return true;
}

function normalizeMac(mac) {
  if (!mac) return { mac: '', rawMac: '' };
  
  // Remove all non-hex characters
  const clean = mac.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  
  // Must be exactly 12 hex chars
  if (clean.length !== 12) {
    return null;
  }
  
  // Split into pairs and uppercase with colons
  const normalized = clean.match(/.{2}/g).join(':').toUpperCase();
  return { mac: normalized, rawMac: clean };
}

function validateRobotData(data) {
  const errors = [];
  
  if (!data.siteId || typeof data.siteId !== 'string' || data.siteId.length > 100) {
    errors.push('Invalid siteId');
  }
  
  if (!data.type || typeof data.type !== 'string' || data.type.length > 100) {
    errors.push('Invalid type');
  }
  
  if (!data.name || typeof data.name !== 'string' || data.name.length > 200) {
    errors.push('Invalid name');
  }
  
  if (data.description && (typeof data.description !== 'string' || data.description.length > 500)) {
    errors.push('Description too long');
  }
  
  if (!data.mac || typeof data.mac !== 'string') {
    errors.push('MAC address required');
  }
  
  const macResult = normalizeMac(data.mac);
  if (!macResult) {
    errors.push('Invalid MAC address format (must be 12 hex characters)');
  }
  
  return { valid: errors.length === 0, errors, macResult };
}

// Attempt to read JSON from a local file (various possible locations in Netlify runtime)
function readJsonIfExists(...parts) {
  try {
    const filePath = path.join(...parts);
    if (!fs.existsSync(filePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed;
  } catch (e) {
    return null;
  }
}

// Fetch JSON from a URL (used to read published static assets when not available on filesystem)
function fetchJson(url) {
  return new Promise((resolve) => {
    try {
      https.get(url, { headers: { 'User-Agent': 'TCS-Robot-Registry' } }, (res) => {
        if (res.statusCode !== 200) {
          res.resume(); // drain
          return resolve(null);
        }
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(null);
          }
        });
      }).on('error', () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

// GET handler
async function handleGet(event) {
  try {
    // Try to load merged data first (combines live + seed)
    // Try multiple locations that can work in Netlify function runtime
    let mergedData =
      readJsonIfExists(__dirname, '../../public/merged-robots.json') ||
      readJsonIfExists(process.cwd(), 'public/merged-robots.json');

    // If not found on filesystem, try fetching from the deployed site URL
    if (!mergedData) {
      // Prefer Netlify-provided URLs; fallback to request Host header
      const reqProtocol = (event && event.headers && (event.headers['x-forwarded-proto'] || event.headers['x-forwarded-protocol'])) || 'https';
      const reqHost = (event && event.headers && (event.headers['x-forwarded-host'] || event.headers['host'])) || '';
      const derivedUrl = reqHost ? `${reqProtocol}://${reqHost}` : '';
      const baseUrl =
        process.env.DEPLOY_URL || process.env.URL || process.env.SITE_URL || process.env.DEPLOY_PRIME_URL || derivedUrl || '';
      if (baseUrl) {
        mergedData =
          (await fetchJson(`${baseUrl.replace(/\/$/, '')}/merged-robots.json`)) || null;
      }
    }
    
    if (mergedData && mergedData.robots) {
      console.log(`Serving merged data: ${mergedData.robots.length} robots (${mergedData.stats.live} live, ${mergedData.stats.seed} backup)`);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          sites: mergedData.sites,
          robots: mergedData.robots,
          scrapedAt: mergedData.scrapedAt,
          mergedAt: mergedData.mergedAt,
          stats: mergedData.stats
        })
      };
    }

    // Fallback to seed data if merged data doesn't exist
    console.log('No merged data found, falling back to seed data');
    // Attempt to read seed data from multiple locations or via URL
    let seedData =
      readJsonIfExists(__dirname, '../../public/data.json') ||
      readJsonIfExists(process.cwd(), 'public/data.json');

    if (!seedData) {
      const reqProtocol = (event && event.headers && (event.headers['x-forwarded-proto'] || event.headers['x-forwarded-protocol'])) || 'https';
      const reqHost = (event && event.headers && (event.headers['x-forwarded-host'] || event.headers['host'])) || '';
      const derivedUrl = reqHost ? `${reqProtocol}://${reqHost}` : '';
      const baseUrl =
        process.env.DEPLOY_URL || process.env.URL || process.env.SITE_URL || process.env.DEPLOY_PRIME_URL || derivedUrl || '';
      if (baseUrl) {
        seedData =
          (await fetchJson(`${baseUrl.replace(/\/$/, '')}/data.json`)) || null;
      }
    }
    
    if (seedData && Array.isArray(seedData.robots)) {
      console.log(`Serving seed data: ${seedData.robots.length} robots`);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          sites: seedData.sites,
          robots: seedData.robots,
          scrapedAt: null,
          mergedAt: null,
          stats: {
            total: seedData.robots.length,
            live: 0,
            seed: seedData.robots.length
          }
        })
      };
    }

    // No data available at all
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'No robot data available',
        message: 'Run npm run build:data and npm run scrape',
        hint: 'Ensure public/data.json exists in the published site and that build command generates it.',
        triedFiles: [
          path.join(__dirname, '../../public/merged-robots.json'),
          path.join(process.cwd(), 'public/merged-robots.json'),
          path.join(__dirname, '../../public/data.json'),
          path.join(process.cwd(), 'public/data.json')
        ]
      })
    };

  } catch (error) {
    console.error('Error fetching robots:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch robots', details: error.message })
    };
  }
}

// POST handler
async function handlePost(event) {
  try {
    // Rate limiting
    const ip = event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown';
    if (!checkRateLimit(ip)) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ error: 'Too many requests. Please try again later.' })
      };
    }

    // Parse request body
    const data = JSON.parse(event.body);
    
    // Honeypot check
    if (data.honeypot) {
      console.log('Honeypot triggered, rejecting submission');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid submission' })
      };
    }

    // Validate data
    const validation = validateRobotData(data);
    if (!validation.valid) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Validation failed', details: validation.errors })
      };
    }

    // Get existing robots from Blobs
    let existingRobots = [];
    let store = null;
    
    try {
      store = getStore('robots');
      const blob = await store.get('robots', { type: 'json' });
      if (blob) {
        existingRobots = blob;
      }
    } catch (error) {
      // Blobs not available (local dev) or blob doesn't exist yet
      console.log('Blobs not available or creating new robots blob:', error.message);
    }

    // Check for duplicate (same site + MAC)
    const { mac, rawMac } = validation.macResult;
    const duplicate = existingRobots.find(
      r => r.siteId === data.siteId && r.mac === mac
    );
    
    if (duplicate) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ 
          error: 'Robot with this MAC address already exists on this site',
          existing: duplicate
        })
      };
    }

    // Create new robot entry
    const newRobot = {
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      siteId: data.siteId.trim(),
      type: data.type.trim(),
      name: data.name.trim(),
      description: (data.description || '').trim(),
      mac,
      rawMac,
      source: 'user',
      createdAt: new Date().toISOString()
    };

    // Add to list and save
    existingRobots.push(newRobot);
    
    // Only try to save if Blobs is available
    if (store) {
      try {
        await store.set('robots', JSON.stringify(existingRobots), { 
          metadata: { updated: new Date().toISOString() }
        });
      } catch (error) {
        console.warn('Could not save to Blobs (local dev):', error.message);
        // In local dev, we can't persist but we'll still return success
      }
    } else {
      console.log('Blobs not available in local dev - robot added but not persisted');
    }

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({ 
        success: true, 
        robot: newRobot 
      })
    };

  } catch (error) {
    console.error('Error adding robot:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to add robot', details: error.message })
    };
  }
}

// Main handler
exports.handler = async (event, context) => {
  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Only GET is supported now (no user submissions)
  if (event.httpMethod === 'GET') {
    return handleGet(event);
  } else {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ 
        error: 'Method not allowed',
        message: 'Only GET requests are supported. User submissions have been removed - data is synced from live TCS sites.'
      })
    };
  }
};
