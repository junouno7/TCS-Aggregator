// Quick verification script to ensure everything is set up correctly
const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying TCS Robot Registry Setup...\n');

let errors = 0;
let warnings = 0;

// Check required files
const requiredFiles = [
  'package.json',
  'netlify.toml',
  'websitelist.txt',
  'robotlist.txt',
  'scripts/parse_data.js',
  'netlify/functions/robots.js',
  'public/index.html',
  'public/styles.css',
  'public/app.js',
  'public/data.json',
  'README.md',
  'DEPLOYMENT.md',
  'QUICKSTART.md'
];

console.log('📁 Checking required files...');
requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`  ✅ ${file}`);
  } else {
    console.log(`  ❌ ${file} - MISSING`);
    errors++;
  }
});

// Check data.json content
console.log('\n📊 Checking data.json...');
try {
  const data = JSON.parse(fs.readFileSync('public/data.json', 'utf8'));
  console.log(`  ✅ Valid JSON`);
  console.log(`  ✅ ${data.sites.length} sites found`);
  console.log(`  ✅ ${data.robots.length} robots found`);
  
  if (data.sites.length < 10) {
    console.log(`  ⚠️  Warning: Expected 10 sites, found ${data.sites.length}`);
    warnings++;
  }
  
  if (data.robots.length < 50) {
    console.log(`  ⚠️  Warning: Only ${data.robots.length} robots found`);
    warnings++;
  }
  
  // Check for active sites
  const activeSites = data.sites.filter(s => s.status === 'active').length;
  console.log(`  ✅ ${activeSites} active sites`);
  
  // Check robot structure
  if (data.robots.length > 0) {
    const robot = data.robots[0];
    const requiredFields = ['id', 'siteId', 'type', 'name', 'mac', 'source'];
    const hasAllFields = requiredFields.every(field => field in robot);
    if (hasAllFields) {
      console.log(`  ✅ Robot objects have correct structure`);
    } else {
      console.log(`  ❌ Robot objects missing required fields`);
      errors++;
    }
  }
} catch (error) {
  console.log(`  ❌ Error reading data.json: ${error.message}`);
  errors++;
}

// Check node_modules
console.log('\n📦 Checking dependencies...');
if (fs.existsSync('node_modules')) {
  console.log(`  ✅ node_modules exists`);
  
  // Check for key dependencies
  const deps = ['@netlify/blobs'];
  deps.forEach(dep => {
    if (fs.existsSync(`node_modules/${dep}`)) {
      console.log(`  ✅ ${dep} installed`);
    } else {
      console.log(`  ❌ ${dep} not installed`);
      errors++;
    }
  });
} else {
  console.log(`  ❌ node_modules missing - run 'npm install'`);
  errors++;
}

// Check file sizes
console.log('\n📏 Checking file sizes...');
const fileSizes = [
  { file: 'public/data.json', min: 10000, name: 'data.json' },
  { file: 'public/app.js', min: 10000, name: 'app.js' },
  { file: 'public/styles.css', min: 5000, name: 'styles.css' },
  { file: 'public/index.html', min: 2000, name: 'index.html' }
];

fileSizes.forEach(({ file, min, name }) => {
  if (fs.existsSync(file)) {
    const size = fs.statSync(file).size;
    if (size >= min) {
      console.log(`  ✅ ${name}: ${(size / 1024).toFixed(1)}KB`);
    } else {
      console.log(`  ⚠️  ${name}: ${(size / 1024).toFixed(1)}KB (expected >${(min / 1024).toFixed(1)}KB)`);
      warnings++;
    }
  }
});

// Summary
console.log('\n' + '='.repeat(50));
if (errors === 0 && warnings === 0) {
  console.log('✅ All checks passed! Your setup is ready.');
  console.log('\nNext steps:');
  console.log('  1. Run: npm run dev');
  console.log('  2. Open: http://localhost:8888');
  console.log('  3. Deploy: npm run deploy');
} else {
  console.log(`⚠️  Found ${errors} error(s) and ${warnings} warning(s)`);
  if (errors > 0) {
    console.log('\nPlease fix errors before proceeding.');
    process.exit(1);
  }
}
console.log('='.repeat(50));

