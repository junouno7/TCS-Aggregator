const fs = require('fs');
const path = require('path');
const https = require('https');

// CORS headers
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

// Attempt to read JSON from a local file
function readJsonIfExists(...parts) {
  try {
    const filePath = path.join(...parts);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

// Fetch JSON from URL (fallback when filesystem isn't available)
function fetchJson(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'TCS-Robot-Registry' } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
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
  });
}

// Get base URL from environment or request headers
function getBaseUrl(event) {
  const protocol = event?.headers?.['x-forwarded-proto'] || 'https';
  const host = event?.headers?.['x-forwarded-host'] || event?.headers?.host || '';
  const derivedUrl = host ? `${protocol}://${host}` : '';
  return process.env.DEPLOY_URL || process.env.URL || process.env.SITE_URL || derivedUrl || '';
}

// Load data from filesystem or URL fallback
async function loadData(event, filename) {
  // Try filesystem first
  const data = readJsonIfExists(__dirname, '../../public', filename) ||
               readJsonIfExists(process.cwd(), 'public', filename);
  if (data) return data;

  // Fallback to URL fetch
  const baseUrl = getBaseUrl(event);
  if (baseUrl) {
    return await fetchJson(`${baseUrl.replace(/\/$/, '')}/${filename}`);
  }
  return null;
}

exports.handler = async (event) => {
  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Only GET supported
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed', message: 'Only GET requests are supported.' })
    };
  }

  try {
    // Try merged data first
    const mergedData = await loadData(event, 'merged-robots.json');
    
    if (mergedData?.robots) {
      console.log(`Serving merged data: ${mergedData.robots.length} robots`);
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

    // Fallback to seed data
    console.log('No merged data, falling back to seed data');
    const seedData = await loadData(event, 'data.json');
    
    if (seedData?.robots) {
      console.log(`Serving seed data: ${seedData.robots.length} robots`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          sites: seedData.sites,
          robots: seedData.robots,
          scrapedAt: null,
          mergedAt: null,
          stats: { total: seedData.robots.length, live: 0, seed: seedData.robots.length }
        })
      };
    }

    // No data available
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'No robot data available', message: 'Run npm run build:data' })
    };

  } catch (error) {
    console.error('Error fetching robots:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch robots', details: error.message })
    };
  }
};
