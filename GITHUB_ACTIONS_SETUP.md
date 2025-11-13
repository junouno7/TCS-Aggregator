
#### Manual Test:
1. Go to your GitHub repository
2. Click **Actions** tab
3. Select **"Scrape Robot Data"** workflow
4. Click **"Run workflow"** → **"Run workflow"**
5. Wait 5-10 minutes (scraping takes time)
6. Check the workflow logs

#### Automatic Schedule:
- The workflow runs every 3 hours automatically
- Check the **Actions** tab to see past runs
- Logs show what was scraped and if it succeeded

### 5. Monitor & Maintain

#### View Workflow Status:
- Go to **Actions** tab in your repository
- Click on any workflow run to see logs
- Green checkmark = success
- Red X = failed (check logs)

#### Common Issues:

**Workflow fails with "Permission denied":**
- Make sure your GitHub token has write permissions
- Go to **Settings** → **Actions** → **General**
- Under **Workflow permissions**, select **"Read and write permissions"**

**Scraping fails for some sites:**
- Check the logs to see which sites failed
- Sites may be down or have changed their structure
- The workflow continues even if some sites fail

**No changes committed:**
- This is normal if robot data hasn't changed
- The workflow only commits when there are actual changes

## Workflow Configuration

### Change Schedule

Edit `.github/workflows/scrape-robots.yml`:

```yaml
schedule:
  # Every 12 hours at midnight and noon UTC (default)
  - cron: '0 0,12 * * *'
  
  # Every 3 hours:
  # - cron: '0 */3 * * *'
  
  # Every 6 hours:
  # - cron: '0 */6 * * *'
  
  # Daily at midnight:
  # - cron: '0 0 * * *'
```

Cron syntax: `minute hour day month dayofweek`

**Current Schedule**: Every 12 hours (2 times per day)

### Disable Automatic Scraping

Comment out the schedule section:

```yaml
on:
  # schedule:
  #   - cron: '0 */3 * * *'
  
  workflow_dispatch:  # Keep manual trigger
```

## Cost & Limits

### GitHub Actions (Free Tier):
- **Public repos**: Unlimited minutes
- **Private repos**: 2,000 minutes/month
- Each workflow run: ~5-10 minutes
- Running every 3 hours: ~240 runs/month = ~1,200-2,400 minutes

**Recommendation**: For private repos, consider running every 6 hours instead to stay within free tier.

### Netlify (Free Tier):
- 300 build minutes/month
- With GitHub Actions handling builds, you're not using Netlify build minutes
- Just deploying pre-built files = no build time charged

## Data Flow

```
┌─────────────────────────────────────────────┐
│         GitHub Actions (Every 3 Hours)      │
│                                             │
│  1. Checkout repo                           │
│  2. Install dependencies (Puppeteer)        │
│  3. Build seed data (robotlist.txt)         │
│  4. Scrape live data (9 TCS sites)          │
│  5. Merge live + seed data                  │
│  6. Commit changes (if any)                 │
│  7. Deploy to Netlify                       │
└─────────────────────────────────────────────┘
                      │
                      ▼
         ┌────────────────────────┐
         │   Netlify (Production)  │
         │                         │
         │  • Serves merged data   │
         │  • Always up-to-date    │
         │  • Fallback to seed     │
         └────────────────────────┘
```

## Troubleshooting

### Check Workflow Logs

1. Go to **Actions** tab
2. Click on the failed workflow run
3. Click on **"scrape-and-deploy"** job
4. Expand each step to see detailed logs

### Common Errors

**"NETLIFY_AUTH_TOKEN not found":**
- Secret not added or misnamed
- Check **Settings** → **Secrets and variables** → **Actions**

**"Puppeteer failed to launch Chrome":**
- This shouldn't happen on Ubuntu runners
- Check logs for specific error
- May need to add Chrome dependencies (rare)

**"Git push failed":**
- Workflow doesn't have write permissions
- Fix: **Settings** → **Actions** → **General** → Enable write permissions

**"Site not deploying":**
- Check Netlify Site ID is correct
- Verify auth token has deploy permissions
- Check Netlify dashboard for deployment logs

### Manual Triggers

There are two ways to manually trigger a scrape:

#### Option 1: From Website (User-Friendly)

Users can click the **"⚡ Refresh Live Data"** button on the website:
- Triggers GitHub Actions workflow automatically
- Rate limited to once every 5 minutes
- Shows progress and auto-reloads when complete
- Requires GITHUB_TOKEN and GITHUB_REPO secrets to be configured

#### Option 2: From GitHub UI (Admin)

If automatic schedule isn't working:

1. Go to **Actions** tab
2. Click **"Scrape Robot Data"**
3. Click **"Run workflow"**
4. Select branch (usually `main`)
5. Click **"Run workflow"**

## Local Testing

Before pushing to GitHub, test locally:

```bash
# Test the full workflow
npm run build:data    # Build seed data
npm run scrape        # Scrape live data
npm run merge:data    # Merge data
npm run dev           # Test locally
```

## Disable If Needed

To temporarily disable:

1. Go to **Actions** tab
2. Click **"Scrape Robot Data"** workflow
3. Click **"···"** (three dots) → **"Disable workflow"**

To re-enable: same steps, click **"Enable workflow"**

## Best Practices

1. **Monitor First Week**: Check Actions tab daily for the first week
2. **Review Logs**: Periodically check logs to ensure scraping is working
3. **Keep Backup**: Keep `robotlist.txt` updated as backup
4. **Test Changes**: Test workflow changes locally before pushing
5. **Notifications**: Enable email notifications for failed workflows

## Support

- **GitHub Actions Docs**: https://docs.github.com/en/actions
- **Workflow Syntax**: https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions
- **Cron Helper**: https://crontab.guru/

---

✅ Once set up, your robot data will automatically stay in sync with live TCS sites!

