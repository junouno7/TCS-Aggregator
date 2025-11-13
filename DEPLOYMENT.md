# Deployment Guide

This guide walks you through deploying the TCS Robot Registry to Netlify.

## Prerequisites

- A Netlify account (free tier works fine)
- Git installed on your computer
- The project files ready

## Method 1: Deploy via Netlify CLI (Fastest)

### Step 1: Install Netlify CLI

If you don't have it installed globally:

```bash
npm install -g netlify-cli
```

Or use it via npx (no installation needed):

```bash
npx netlify --version
```

### Step 2: Login to Netlify

```bash
npx netlify login
```

This will open your browser to authenticate.

### Step 3: Initialize the site

From the project directory:

```bash
npx netlify init
```

Follow the prompts:
- **Create & configure a new site** (or link to existing if you already created one)
- **Team**: Choose your team
- **Site name**: Enter a name (e.g., `tcs-robot-registry`) or leave blank for random
- **Build command**: `npm run build:data`
- **Directory to deploy**: `public`
- **Functions directory**: `netlify/functions`

### Step 4: Deploy

```bash
npm run deploy
```

Or manually:

```bash
npm run build:data
npx netlify deploy --prod
```

### Step 5: Verify

Your site will be live at: `https://[your-site-name].netlify.app`

Visit the URL and:
1. Check that robots load
2. Try searching
3. Add a test robot
4. Verify it appears immediately

## Method 2: Deploy via GitHub (Recommended for ongoing updates)

### Step 1: Create a GitHub repository

1. Go to [github.com](https://github.com) and create a new repository
2. Name it something like `tcs-robot-registry`
3. Don't initialize with README (we already have files)

### Step 2: Push your code to GitHub

From your project directory:

```bash
git init
git add .
git commit -m "Initial commit - TCS Robot Registry"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/tcs-robot-registry.git
git push -u origin main
```

### Step 3: Connect to Netlify

1. Go to [app.netlify.com](https://app.netlify.com)
2. Click **"Add new site"** → **"Import an existing project"**
3. Choose **GitHub** as your Git provider
4. Authorize Netlify to access your repositories
5. Select your `tcs-robot-registry` repository

### Step 4: Configure build settings

Netlify should auto-detect the settings from `netlify.toml`, but verify:

- **Branch to deploy**: `main`
- **Build command**: `npm run build:data`
- **Publish directory**: `public`
- **Functions directory**: `netlify/functions`

Click **"Deploy site"**

### Step 5: Wait for deployment

The first deployment takes 1-2 minutes. Watch the deploy log for any errors.

### Step 6: Configure custom domain (Optional)

1. Go to **Site settings** → **Domain management**
2. Click **"Add custom domain"**
3. Follow the instructions to point your DNS to Netlify

## Method 3: Manual Drag-and-Drop (Quick test only)

⚠️ **Warning**: This method won't work for the full app because Netlify Functions require a proper deployment. Use this only to test the static UI.

1. Run `npm run build:data` locally
2. Go to [app.netlify.com/drop](https://app.netlify.com/drop)
3. Drag the `public` folder to the upload area
4. Get an instant preview URL

**Note**: API endpoints won't work with this method.

## Post-Deployment Configuration

### Enable Netlify Blobs

Netlify Blobs should be enabled automatically. To verify:

1. Go to your site dashboard
2. Navigate to **Site settings** → **Environment variables**
3. Blobs are available on all plans (generous free tier)

No additional configuration needed!

### Set up environment variables (if needed in future)

If you add features that require secrets:

1. Go to **Site settings** → **Environment variables**
2. Click **"Add a variable"**
3. Add your key/value pairs

These are available in your Functions via `process.env.YOUR_VARIABLE`

## Updating the Site

### If using GitHub integration:

Just push to main:

```bash
# Edit your files
git add .
git commit -m "Updated robot list"
git push
```

Netlify auto-deploys on every push!

### If using CLI only:

```bash
npm run deploy
```

## Troubleshooting

### Build fails

**Error**: `Cannot find module 'fs'`
- **Fix**: This shouldn't happen with Node.js functions. Check your Node version in Netlify (should be 14+)

**Error**: `websitelist.txt not found`
- **Fix**: Ensure the text files are committed to git and pushed

### Functions not working

**Error**: 404 on `/api/robots`
- **Fix**: Check that `netlify/functions/` folder is deployed
- **Verify**: Go to **Functions** tab in Netlify dashboard to see if they're listed

**Error**: `getStore is not a function`
- **Fix**: Ensure `@netlify/blobs` is in dependencies (not devDependencies)
- **Verify**: Check build log to see if npm install ran

### Robots not persisting

**Error**: User-added robots disappear after redeploy
- **Fix**: This shouldn't happen - Blobs persist across deploys
- **Check**: Go to **Functions** → **Blobs** in Netlify dashboard to verify data exists

### Rate limit too strict

If legitimate users hit the rate limit:
1. Edit `netlify/functions/robots-post.js`
2. Increase `RATE_LIMIT_MAX` (currently 5) or `RATE_LIMIT_WINDOW` (currently 60000ms)
3. Redeploy

## Monitoring

### View logs

1. Go to your site dashboard
2. Click **Functions** tab
3. Click on a function name
4. View recent invocations and logs

### Check usage

1. Go to **Site settings** → **Usage and billing**
2. Monitor function invocations (free tier: 125k/month)
3. Monitor bandwidth (free tier: 100GB/month)

## Backups

### Backup user-added robots

User robots are stored in Netlify Blobs. To backup:

1. Create a backup function or script that:
   - Reads from Blobs
   - Exports to JSON
   - Downloads or emails

2. Or manually via the Netlify CLI:
   ```bash
   npx netlify blobs:get robots robots
   ```

### Backup seed data

Your seed data is in git (`websitelist.txt` and `robotlist.txt`), so it's automatically backed up!

## Security Hardening (Optional)

### Add authentication

For admin-only features, consider:
- Netlify Identity
- Auth0
- Simple HTTP Basic Auth via Netlify's _headers file

### Restrict CORS

Edit function headers to allow only your domain:

```javascript
'Access-Control-Allow-Origin': 'https://your-site.netlify.app'
```

### Add rate limiting by user

Instead of IP-based, use session/cookie-based rate limiting.

## Cost Estimation

**Free Tier limits** (more than enough for internal tools):
- Function invocations: 125,000/month
- Bandwidth: 100GB/month
- Build minutes: 300/month
- Blobs storage: 1GB

**Estimated usage for this app**:
- ~100 users/day = ~3,000/month
- ~10 searches per user = 30,000 function calls
- ~1-2 robot additions per day = ~60/month
- Well within free tier!

## Support

For Netlify-specific issues:
- [Netlify Support Forums](https://answers.netlify.com/)
- [Netlify Documentation](https://docs.netlify.com/)

For app-specific issues:
- Check the logs in Netlify dashboard
- Review the README.md troubleshooting section
- Contact your development team

