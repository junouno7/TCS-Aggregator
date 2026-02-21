// Global state
let allRobots = [];
let allSites = [];
let filteredRobots = [];
let currentSort = { field: 'name', ascending: true };
let searchQuery = '';
let groupBySite = true;

// Sites intentionally hidden from UI (permanent decommission).
const hiddenSiteIds = new Set([
  'support.twinnyservice.com',
  'singlerobot.twinnyservice.com'
]);

// Master credentials - can be loaded from environment or config
// For security, set these as environment variables in Netlify dashboard
const masterCredentials = {
  username: window.MASTER_USERNAME || 'thkim',
  password: window.MASTER_PASSWORD || 'rtcl5435!!'
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  initializeCredentials();
  loadRobots();
  setupEventListeners();
  updateDataInfo();
});

// Initialize master credentials
function initializeCredentials() {
  document.getElementById('username').dataset.value = masterCredentials.username;
  document.getElementById('password').dataset.value = masterCredentials.password;
}

// Setup event listeners
function setupEventListeners() {
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', handleSearch);

  const groupCheckbox = document.getElementById('group-by-site');
  groupCheckbox.addEventListener('change', handleGroupToggle);

  const sortField = document.getElementById('sort-field');
  sortField.addEventListener('change', handleSortChange);
}

// Load robots from API
async function loadRobots() {
  try {
    const response = await fetch('/api/robots');
    if (!response.ok) throw new Error('Failed to fetch robots');
    
    const data = await response.json();
    allSites = (data.sites || []).filter(site => !hiddenSiteIds.has(site.id));
    allRobots = (data.robots || []).filter(robot => !hiddenSiteIds.has(robot.siteId));
    filteredRobots = [...allRobots];

    // Recompute displayed source counts after UI-level site filtering.
    const visibleLive = allRobots.filter(robot => robot.source === 'live').length;
    const visibleSeed = allRobots.filter(robot => robot.source === 'seed').length;
    const visibleData = {
      ...data,
      stats: {
        total: allRobots.length,
        live: visibleLive,
        seed: visibleSeed
      }
    };
    
    updateStats();
    updateDataInfo(visibleData);
    renderRobots();
  } catch (error) {
    console.error('Error loading robots:', error);
    showToast('Failed to load robots: ' + error.message, 'error');
    document.getElementById('robots-container').innerHTML = 
      '<div class="empty-state"><h3>Failed to load robots</h3><p>' + error.message + '</p></div>';
  }
}

// Update data freshness info
function updateDataInfo(data) {
  const dataSourceEl = document.getElementById('data-source');
  const lastUpdatedEl = document.getElementById('last-updated');
  
  if (!data) {
    dataSourceEl.textContent = 'Unknown';
    lastUpdatedEl.textContent = 'Unknown';
    return;
  }
  
  // Use stats from API response (already computed server-side)
  const { live = 0, seed = 0 } = data.stats || {};
  
  if (live > 0 && seed > 0) {
    dataSourceEl.textContent = `Mixed (${live} live, ${seed} backup)`;
  } else if (live > 0) {
    dataSourceEl.textContent = `Live Data (${live} robots)`;
  } else {
    dataSourceEl.textContent = `Backup Data (${seed} robots)`;
  }
  
  // Show last scrape time if available
  if (data.scrapedAt) {
    const diffMs = Date.now() - new Date(data.scrapedAt);
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    
    const timeAgo = diffHours > 0 
      ? `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
      : diffMins > 0 
        ? `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
        : 'Just now';
    
    lastUpdatedEl.textContent = timeAgo;
    lastUpdatedEl.title = new Date(data.scrapedAt).toLocaleString();
  } else {
    lastUpdatedEl.textContent = 'Unknown';
  }
}

// Update stats display
function updateStats() {
  const totalRobots = allRobots.length;
  const filteredCount = filteredRobots.length;
  const siteCount = allSites.filter(s => s.status === 'active').length;
  
  let statsText = `${filteredCount} robot${filteredCount !== 1 ? 's' : ''}`;
  if (filteredCount !== totalRobots) {
    statsText += ` of ${totalRobots} total`;
  }
  statsText += ` across ${siteCount} active server${siteCount !== 1 ? 's' : ''}`;
  
  document.getElementById('stats').textContent = statsText;
}

// Handle search
function handleSearch(event) {
  searchQuery = event.target.value.toLowerCase().trim();
  const clearBtn = document.getElementById('clear-search');
  
  if (searchQuery) {
    clearBtn.classList.add('visible');
    filteredRobots = allRobots.filter(robot => {
      return robot.name.toLowerCase().includes(searchQuery) ||
             robot.type.toLowerCase().includes(searchQuery) ||
             robot.description.toLowerCase().includes(searchQuery) ||
             robot.mac.toLowerCase().includes(searchQuery) ||
             robot.rawMac.toLowerCase().includes(searchQuery);
    });
  } else {
    clearBtn.classList.remove('visible');
    filteredRobots = [...allRobots];
  }
  
  updateStats();
  renderRobots();
}

// Clear search
function clearSearch() {
  document.getElementById('search-input').value = '';
  searchQuery = '';
  document.getElementById('clear-search').classList.remove('visible');
  filteredRobots = [...allRobots];
  updateStats();
  renderRobots();
}

// Handle group toggle
function handleGroupToggle(event) {
  groupBySite = event.target.checked;
  renderRobots();
}

// Handle sort change
function handleSortChange(event) {
  currentSort.field = event.target.value;
  renderRobots();
}

// Toggle sort order
function toggleSortOrder() {
  currentSort.ascending = !currentSort.ascending;
  const btn = document.getElementById('sort-order');
  btn.textContent = currentSort.ascending ? '▲' : '▼';
  btn.title = currentSort.ascending ? 'Ascending' : 'Descending';
  renderRobots();
}

// Cached collator for Korean text sorting
const koreanCollator = new Intl.Collator('ko', { sensitivity: 'base' });

// Sort robots with Korean support
function sortRobots(robots) {
  return robots.sort((a, b) => {
    let comparison = 0;
    
    if (currentSort.field === 'date') {
      const dateA = parseDate(a.createdAt || a.registeredDate);
      const dateB = parseDate(b.createdAt || b.registeredDate);
      
      // Handle invalid dates (put them at the end)
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      
      comparison = dateA.getTime() - dateB.getTime();
    } else {
      comparison = koreanCollator.compare(a[currentSort.field] || '', b[currentSort.field] || '');
    }
    
    return currentSort.ascending ? comparison : -comparison;
  });
}

// Parse date from various formats
function parseDate(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

// Format date for display
function formatDate(dateStr) {
  if (!dateStr) return 'Unknown';
  
  const date = parseDate(dateStr);
  if (!date) return 'Unknown';
  
  // Format as "Jan 15, 2025"
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

// Highlight search term in text
function highlightText(text, query) {
  if (!query || !text) return text;
  
  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
  return text.replace(regex, '<span class="highlight">$1</span>');
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Render robots
function renderRobots() {
  const container = document.getElementById('robots-container');
  
  if (filteredRobots.length === 0) {
    container.innerHTML = '<div class="empty-state"><h3>No robots found</h3><p>Try adjusting your search or add a new robot.</p></div>';
    return;
  }
  
  if (groupBySite) {
    renderGroupedView(container);
  } else {
    renderFlatView(container);
  }
}

// Render grouped by site
function renderGroupedView(container) {
  // Build site lookup map once
  const siteMap = new Map(allSites.map(s => [s.id, s]));
  
  // Group robots by site
  const robotsBySite = {};
  filteredRobots.forEach(robot => {
    (robotsBySite[robot.siteId] ??= []).push(robot);
  });
  
  // Sort sites alphabetically
  const sortedSites = Object.keys(robotsBySite).sort((a, b) => koreanCollator.compare(a, b));
  
  const html = sortedSites.map(siteId => {
    const site = siteMap.get(siteId) || { id: siteId, baseUrl: `http://${siteId}/`, status: 'active' };
    const robots = sortRobots([...robotsBySite[siteId]]);
    
    return `
      <div class="site-group" id="site-${siteId.replace(/\./g, '-')}">
        <div class="site-header" onclick="toggleSiteGroup('${siteId}')">
          <div class="site-info">
            <span class="site-name">${siteId}</span>
            <span class="site-badge ${site.status}">${site.status}</span>
            <span class="robot-count">${robots.length} robot${robots.length !== 1 ? 's' : ''}</span>
          </div>
          <span class="collapse-icon">▼</span>
        </div>
        <div class="site-robots">
          ${renderRobotTable(robots)}
        </div>
      </div>
    `;
  }).join('');
  
  container.innerHTML = html;
}

// Render flat view (no grouping)
function renderFlatView(container) {
  const sorted = sortRobots([...filteredRobots]);
  container.innerHTML = `
    <div class="site-group">
      <div class="site-robots">
        ${renderRobotTable(sorted)}
      </div>
    </div>
  `;
}

// Render robot table
function renderRobotTable(robots) {
  if (robots.length === 0) {
    return '<div style="padding: 20px; text-align: center; color: #999;">No robots in this site</div>';
  }
  
  const rows = robots.map(robot => {
    const dateStr = formatDate(robot.createdAt || robot.registeredDate);
    const sourceLabel = robot.source === 'seed' ? 'backup' : robot.source;
    
    // Wrap all text content in spans with cell-text class so we can detect clicks on text vs empty space
    return `
      <tr data-site-id="${robot.siteId}" onmousedown="handleRowMouseDown(event)" onclick="handleRowClick(event, '${robot.siteId}')" class="clickable-row">
        <td class="robot-type"><span class="cell-text">${highlightText(robot.type, searchQuery)}</span></td>
        <td class="robot-name"><span class="cell-text">${highlightText(robot.name, searchQuery)}</span></td>
        <td class="mac-address" title="Raw: ${robot.rawMac}"><span class="cell-text">${highlightText(robot.mac, searchQuery)}</span></td>
        <td><span class="cell-text">${highlightText(robot.description, searchQuery)}</span></td>
        <td class="robot-date" title="${robot.createdAt || robot.registeredDate || 'Unknown'}"><span class="cell-text">${dateStr}</span></td>
        <td><span class="source-badge ${robot.source}">${sourceLabel}</span></td>
      </tr>
    `;
  }).join('');

  return `
    <table class="robot-table">
      <thead>
        <tr>
          <th>Type</th>
          <th>Name</th>
          <th>MAC Address</th>
          <th>Description</th>
          <th>Date Registered</th>
          <th>Source</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// Track where mousedown started to prevent triggering on text selection release
let mouseDownOnEmptySpace = false;

// Handle mousedown on rows - track if it started on empty space
function handleRowMouseDown(event) {
  const target = event.target;
  mouseDownOnEmptySpace = (target.tagName === 'TD' || target.tagName === 'TR');
}

// Handle row click - only trigger if BOTH mousedown and mouseup are on empty space
function handleRowClick(event, siteId) {
  const target = event.target;
  const clickedOnEmptySpace = (target.tagName === 'TD' || target.tagName === 'TR');
  
  // Only open link if both mousedown AND click/mouseup are on empty space
  if (mouseDownOnEmptySpace && clickedOnEmptySpace) {
    const site = allSites.find(s => s.id === siteId);
    const url = site?.baseUrl || `http://${siteId}/`;
    window.open(url, '_blank');
  }
  
  // Reset the flag
  mouseDownOnEmptySpace = false;
}

// Toggle site group collapse
function toggleSiteGroup(siteId) {
  const group = document.getElementById(`site-${siteId.replace(/\./g, '-')}`);
  if (group) {
    group.classList.toggle('collapsed');
  }
}

// Toggle credentials visibility
function toggleCredentials() {
  const usernameEl = document.getElementById('username');
  const passwordEl = document.getElementById('password');
  const btn = document.getElementById('reveal-btn');
  
  if (usernameEl.classList.contains('masked')) {
    usernameEl.textContent = usernameEl.dataset.value;
    passwordEl.textContent = passwordEl.dataset.value;
    usernameEl.classList.remove('masked');
    passwordEl.classList.remove('masked');
    btn.textContent = '🙈 Hide';
  } else {
    usernameEl.textContent = '••••••';
    passwordEl.textContent = '••••••••••';
    usernameEl.classList.add('masked');
    passwordEl.classList.add('masked');
    btn.textContent = '👁️ Reveal';
  }
}

// Copy credential to clipboard
function copyToClipboard(field) {
  const el = document.getElementById(field);
  const value = el.dataset.value;
  
  navigator.clipboard.writeText(value).then(() => {
    showToast(`${field.charAt(0).toUpperCase() + field.slice(1)} copied to clipboard`, 'success');
  }).catch(err => {
    showToast('Failed to copy: ' + err.message, 'error');
  });
}

// Functions removed: toggleAddForm, clearAddForm, submitRobot
// User submissions removed - using live scraped data instead

// Trigger manual refresh from live TCS sites
async function triggerManualRefresh() {
  const btn = document.getElementById('manual-refresh-btn');
  const originalText = '🔄 Resync Live Data';
  
  // Disable button
  btn.disabled = true;
  btn.textContent = '⏳ Starting refresh...';
  
  try {
    const response = await fetch('/api/trigger-scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.message || result.error || 'Failed to trigger refresh');
    }
    
    // Success
    showToast('✅ ' + result.message, 'success');
    btn.textContent = '⏳ Refreshing (8-10 minutes)...';
    
    // Poll for updates every 30 seconds
    let pollCount = 0;
    const maxPolls = 22; // ~11 minutes max (30s interval)
    
    const pollInterval = setInterval(async () => {
      pollCount++;
      
      try {
        const checkResponse = await fetch('/api/robots');
        const data = await checkResponse.json();
        
        // Check if data was updated recently (within last 2 minutes)
        if (data.scrapedAt) {
          const scrapedDate = new Date(data.scrapedAt);
          const now = new Date();
          const diffMinutes = (now - scrapedDate) / 60000;
          
          if (diffMinutes < 2) {
            // Data was just updated!
            clearInterval(pollInterval);
            showToast('🎉 Live data refreshed successfully!', 'success');
            setTimeout(() => window.location.reload(), 2000);
            return;
          }
        }
      } catch (e) {
        console.log('Poll check failed:', e);
      }
      
      // Stop polling after max attempts
      if (pollCount >= maxPolls) {
        clearInterval(pollInterval);
        btn.disabled = false;
        btn.textContent = originalText;
        showToast('⏱️ Refresh is taking longer than expected. Please check back in a few minutes.', 'error');
      }
    }, 30000); // Poll every 30 seconds
    
  } catch (error) {
    console.error('Error triggering manual refresh:', error);
    showToast('❌ ' + error.message, 'error');
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// Show toast notification
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Toggle all sections (collapse/expand)
function toggleAllSections() {
  const iconSpan = document.querySelector('#collapse-expand-btn .collapse-icon-btn');
  const textSpan = document.querySelector('#collapse-expand-btn .collapse-text');
  const allTables = document.querySelectorAll('.robot-table');
  const allHeaders = document.querySelectorAll('.site-header');
  
  // Check if any table is currently visible
  const anyVisible = Array.from(allTables).some(table => 
    table.style.display !== 'none' && !table.closest('.site-group.collapsed')
  );
  
  // Toggle all sections
  allHeaders.forEach(header => {
    const siteGroup = header.closest('.site-group');
    if (anyVisible) {
      siteGroup.classList.add('collapsed');
    } else {
      siteGroup.classList.remove('collapsed');
    }
  });
  
  // Update button icon and text separately
  if (anyVisible) {
    iconSpan.textContent = '▶';
    textSpan.textContent = 'Expand All';
  } else {
    iconSpan.textContent = '▼';
    textSpan.textContent = 'Close All';
  }
}

