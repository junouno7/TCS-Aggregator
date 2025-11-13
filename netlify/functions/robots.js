const { getStore } = require('@netlify/blobs');
const fs = require('fs');
const path = require('path');

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

// GET handler
async function handleGet() {
  try {
    // Load seed data from public/data.json
    const seedDataPath = path.join(__dirname, '../../public/data.json');
    let seedData = { sites: [], robots: [] };
    
    if (fs.existsSync(seedDataPath)) {
      seedData = JSON.parse(fs.readFileSync(seedDataPath, 'utf8'));
    }

    // Load user-added robots from Netlify Blobs (if available)
    let userRobots = [];
    
    try {
      const store = getStore('robots');
      const blob = await store.get('robots', { type: 'json' });
      if (blob) {
        userRobots = blob;
      }
    } catch (error) {
      // Blobs not available (local dev) or blob doesn't exist yet - that's okay
      console.log('Blobs not available or no user robots yet:', error.message);
    }

    // Merge and return
    const allRobots = [...seedData.robots, ...userRobots];
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        sites: seedData.sites,
        robots: allRobots
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

  // Route to appropriate handler
  if (event.httpMethod === 'GET') {
    return handleGet();
  } else if (event.httpMethod === 'POST') {
    return handlePost(event);
  } else {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }
};
