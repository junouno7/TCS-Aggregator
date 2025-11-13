
## Data Sources & Sync

### Hybrid Data Approach

The site uses a **hybrid data strategy**:
1. **Live Data**: Scraped from 9 TCS MASTER sites every 3 hours
2. **Backup Data**: Static `robotlist.txt` as fallback
3. **Merged**: Combines both, preferring live data

### How It Works

```bash
# 1. Build seed data from robotlist.txt
npm run build:data

# 2. Scrape live data from all TCS sites
npm run scrape

# 3. Merge live + seed data (prefers live)
npm run merge:data

# 4. Or do all at once:
npm run build:all
```

### Automated Sync (GitHub Actions)

The repository includes a GitHub Actions workflow that:
- Runs automatically **every 12 hours** (midnight & noon UTC)
- Scrapes all TCS MASTER sites
- Merges with backup data
- Commits changes
- Deploys to Netlify
- Can be triggered manually from the website

**Setup Instructions**: See [GITHUB_ACTIONS_SETUP.md](GITHUB_ACTIONS_SETUP.md)

### Documentation

- **[SCRAPING.md](SCRAPING.md)** - How web scraping works
- **[GITHUB_ACTIONS_SETUP.md](GITHUB_ACTIONS_SETUP.md)** - Automated sync setup
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Netlify deployment guide

## Features

- ✅ **Live Data**: Real-time sync from 9 TCS MASTER sites
- ✅ **Backup Fallback**: Uses static data if scraping fails
- ✅ **Auto-sync**: GitHub Actions every 12 hours
- ✅ **Manual Refresh**: Trigger live scrape from website button
- ✅ **Search**: By type, name, description, or MAC address
- ✅ **Grouping**: View robots by website
- ✅ **Sorting**: Multiple sort options
- ✅ **Data Freshness**: Shows last update time
- ✅ **Master Credentials**: Quick access with copy

## Future Enhancements

- [x] Live data scraping from TCS MASTER sites
- [x] Automated scheduled scraping (GitHub Actions)
- [x] Merge strategy for live + backup data
- [ ] API for external integrations
- [ ] Advanced filtering (by date, status)
- [ ] Export to CSV/Excel


