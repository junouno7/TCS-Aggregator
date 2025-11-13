// Global state
let allRobots = [];
let allSites = [];
let filteredRobots = [];
let currentSort = { field: 'name', ascending: true };
let searchQuery = '';
let groupBySite = true;

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
    allSites = data.sites || [];
    allRobots = data.robots || [];
    filteredRobots = [...allRobots];
    
    populateSiteDropdown();
    updateStats();
    renderRobots();
  } catch (error) {
    console.error('Error loading robots:', error);
    showToast('Failed to load robots: ' + error.message, 'error');
    document.getElementById('robots-container').innerHTML = 
      '<div class="empty-state"><h3>Failed to load robots</h3><p>' + error.message + '</p></div>';
  }
}

// Populate site dropdown in add form
function populateSiteDropdown() {
  const select = document.getElementById('robot-site');
  select.innerHTML = '<option value="">Select a website...</option>';
  
  allSites.forEach(site => {
    const option = document.createElement('option');
    option.value = site.id;
    option.textContent = `${site.id} ${site.status === 'down' ? '(Currently Down)' : ''}`;
    if (site.status === 'down') {
      option.style.color = '#999';
    }
    select.appendChild(option);
  });
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
  statsText += ` across ${siteCount} active site${siteCount !== 1 ? 's' : ''}`;
  
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
  btn.textContent = currentSort.ascending ? '↑' : '↓';
  btn.title = currentSort.ascending ? 'Ascending' : 'Descending';
  renderRobots();
}

// Sort robots with Korean support
function sortRobots(robots) {
  const collator = new Intl.Collator('ko', { sensitivity: 'base' });
  
  return robots.sort((a, b) => {
    let aVal = a[currentSort.field] || '';
    let bVal = b[currentSort.field] || '';
    
    const comparison = collator.compare(aVal, bVal);
    return currentSort.ascending ? comparison : -comparison;
  });
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
  const robotsBySite = {};
  
  // Group robots by site
  filteredRobots.forEach(robot => {
    if (!robotsBySite[robot.siteId]) {
      robotsBySite[robot.siteId] = [];
    }
    robotsBySite[robot.siteId].push(robot);
  });
  
  let html = '';
  
  // Sort sites alphabetically
  const sortedSites = Object.keys(robotsBySite).sort((a, b) => 
    new Intl.Collator('ko').compare(a, b)
  );
  
  sortedSites.forEach(siteId => {
    const site = allSites.find(s => s.id === siteId) || { id: siteId, baseUrl: `http://${siteId}/`, status: 'active' };
    const robots = sortRobots([...robotsBySite[siteId]]);
    
    html += `
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
          ${renderRobotTable(robots, site)}
        </div>
      </div>
    `;
  });
  
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
function renderRobotTable(robots, site) {
  if (robots.length === 0) {
    return '<div style="padding: 20px; text-align: center; color: #999;">No robots in this site</div>';
  }
  
  let html = `
    <table class="robot-table">
      <thead>
        <tr>
          <th>Type</th>
          <th>Name</th>
          <th>MAC Address</th>
          <th>Description</th>
          <th>Source</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  robots.forEach(robot => {
    const siteInfo = site || allSites.find(s => s.id === robot.siteId);
    html += `
      <tr>
        <td class="robot-type">${highlightText(robot.type, searchQuery)}</td>
        <td class="robot-name">${highlightText(robot.name, searchQuery)}</td>
        <td class="mac-address" title="Raw: ${robot.rawMac}">${highlightText(robot.mac, searchQuery)}</td>
        <td>${highlightText(robot.description, searchQuery)}</td>
        <td><span class="source-badge ${robot.source}">${robot.source}</span></td>
        <td class="robot-actions">
          <button onclick="copyMac('${robot.mac}')" class="btn-icon" title="Copy MAC">📋</button>
          ${siteInfo ? `<button onclick="openSite('${siteInfo.baseUrl}')" class="btn-icon" title="Open ${robot.siteId}">🔗</button>` : ''}
        </td>
      </tr>
    `;
  });
  
  html += '</tbody></table>';
  return html;
}

// Toggle site group collapse
function toggleSiteGroup(siteId) {
  const group = document.getElementById(`site-${siteId.replace(/\./g, '-')}`);
  if (group) {
    group.classList.toggle('collapsed');
  }
}

// Copy MAC address
function copyMac(mac) {
  navigator.clipboard.writeText(mac).then(() => {
    showToast('MAC address copied: ' + mac, 'success');
  }).catch(err => {
    showToast('Failed to copy: ' + err.message, 'error');
  });
}

// Open site in new tab
function openSite(url) {
  window.open(url, '_blank');
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

// Toggle add robot form
function toggleAddForm() {
  const form = document.getElementById('add-robot-form');
  const btn = document.getElementById('add-robot-btn');
  
  if (form.classList.contains('hidden')) {
    form.classList.remove('hidden');
    btn.textContent = '✕ Cancel';
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    form.classList.add('hidden');
    btn.textContent = '➕ Add New Robot';
    clearAddForm();
  }
}

// Clear add robot form
function clearAddForm() {
  document.getElementById('robot-site').value = '';
  document.getElementById('robot-type').value = '';
  document.getElementById('robot-name').value = '';
  document.getElementById('robot-mac').value = '';
  document.getElementById('robot-description').value = '';
  document.getElementById('robot-honeypot').value = '';
  
  const message = document.getElementById('form-message');
  message.className = 'form-message';
  message.textContent = '';
}

// Submit new robot
async function submitRobot(event) {
  event.preventDefault();
  
  const message = document.getElementById('form-message');
  const submitBtn = document.getElementById('submit-robot-btn');
  
  // Get form data
  const robotData = {
    siteId: document.getElementById('robot-site').value,
    type: document.getElementById('robot-type').value,
    name: document.getElementById('robot-name').value,
    mac: document.getElementById('robot-mac').value,
    description: document.getElementById('robot-description').value,
    honeypot: document.getElementById('robot-honeypot').value
  };
  
  // Client-side validation
  if (!robotData.siteId || !robotData.type || !robotData.name || !robotData.mac) {
    message.className = 'form-message error';
    message.textContent = 'Please fill in all required fields.';
    return;
  }
  
  // Validate MAC format
  const macClean = robotData.mac.replace(/[^0-9a-fA-F]/g, '');
  if (macClean.length !== 12) {
    message.className = 'form-message error';
    message.textContent = 'Invalid MAC address format. Must be 12 hex characters.';
    return;
  }
  
  // Disable submit button
  submitBtn.disabled = true;
  submitBtn.textContent = 'Adding...';
  message.className = 'form-message';
  message.textContent = '';
  
  try {
    const response = await fetch('/api/robots', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(robotData)
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Failed to add robot');
    }
    
    // Success - add to local data and re-render
    allRobots.push(result.robot);
    filteredRobots = [...allRobots];
    updateStats();
    renderRobots();
    
    showToast('Robot added successfully!', 'success');
    toggleAddForm();
    clearAddForm();
    
  } catch (error) {
    message.className = 'form-message error';
    message.textContent = error.message;
    showToast('Failed to add robot: ' + error.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Add Robot';
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

