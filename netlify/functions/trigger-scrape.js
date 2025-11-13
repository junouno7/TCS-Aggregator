/**
 * Trigger GitHub Actions workflow to scrape robot data
 * Called when user clicks "Refresh Data" button
 */

const https = require('https');

// CORS headers
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

// Simple in-memory rate limiting
const requestLog = new Map();
const RATE_LIMIT_WINDOW = 180000; // 3 minutes
const MAX_REQUESTS = 1; // 1 request per 3 minutes

function checkRateLimit(ip) {
  const now = Date.now();
  const lastRequest = requestLog.get(ip);
  
  if (lastRequest && (now - lastRequest) < RATE_LIMIT_WINDOW) {
    const waitTime = Math.ceil((RATE_LIMIT_WINDOW - (now - lastRequest)) / 1000 / 60);
    return { allowed: false, waitMinutes: waitTime };
  }
  
  requestLog.set(ip, now);
  return { allowed: true };
}

async function triggerGitHubWorkflow() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO; // format: "owner/repo"
  
  if (!token || !repo) {
    throw new Error('Missing GITHUB_TOKEN or GITHUB_REPO environment variables');
  }

  const [owner, repoName] = repo.split('/');
  
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      event_type: 'manual-scrape',
      client_payload: {
        triggered_by: 'website_button',
        timestamp: new Date().toISOString()
      }
    });

    const options = {
      hostname: 'api.github.com',
      port: 443,
      path: `/repos/${owner}/${repoName}/dispatches`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'TCS-Robot-Registry',
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 204 || res.statusCode === 200) {
          resolve({ success: true, statusCode: res.statusCode });
        } else {
          reject(new Error(`GitHub API returned ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

exports.handler = async (event, context) => {
  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Rate limiting
    const ip = event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown';
    const rateLimitCheck = checkRateLimit(ip);
    
    if (!rateLimitCheck.allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ 
          error: 'Rate limit exceeded',
          message: `Please wait ${rateLimitCheck.waitMinutes} minute(s) before triggering another refresh.`,
          waitMinutes: rateLimitCheck.waitMinutes
        })
      };
    }

    // Trigger GitHub Actions workflow
    console.log('Triggering GitHub Actions workflow...');
    await triggerGitHubWorkflow();
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true,
        message: 'Data refresh started! It will take 2-3 minutes to complete. The page will automatically reload when ready.',
        estimatedTime: '2-3 minutes'
      })
    };

  } catch (error) {
    console.error('Error triggering scrape:', error);
    
    // Check if it's a configuration error
    if (error.message.includes('Missing GITHUB_TOKEN')) {
      return {
        statusCode: 503,
        headers,
        body: JSON.stringify({ 
          error: 'Manual refresh not configured',
          message: 'Please contact the administrator to set up manual refresh feature.'
        })
      };
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to trigger refresh',
        message: error.message
      })
    };
  }
};

