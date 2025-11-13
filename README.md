# TCS Robot Registry Aggregator

A web application that aggregates robots from multiple TCS MASTER sites, providing a unified search interface and allowing users to add new robot entries.

## Features

- 🔍 **Search across all robots** by type, name, description, or MAC address
- 📊 **Grouped view by website** with collapsible sections
- 🔄 **Sorting** by robot type, name, MAC address, or description
- ➕ **User submissions** - anyone can add new robots
- 🔐 **Master credentials** display with reveal/copy functionality
- 📱 **Responsive design** for mobile and desktop
- 🌐 **10 active TCS MASTER sites** aggregated in one place

## Architecture

- **Frontend**: Static HTML/CSS/JavaScript (no framework dependencies)
- **Backend**: Netlify Functions (serverless)
- **Storage**: Netlify Blobs for user-submitted robots
- **Build**: Node.js script parses text files into JSON

## Project Structure

```
├── public/                 # Static frontend files
│   ├── index.html         # Main HTML
│   ├── styles.css         # Styles
│   ├── app.js             # Client-side JavaScript
│   └── data.json          # Generated seed data (build output)
├── scripts/
│   └── parse_data.js      # Build-time parser for text files
├── netlify/
│   └── functions/
│       ├── robots-get.js  # GET /api/robots endpoint
│       └── robots-post.js # POST /api/robots endpoint
├── websitelist.txt        # Source: list of TCS MASTER sites
├── robotlist.txt          # Source: robots per site
├── masterpassword.txt     # Source: master credentials
├── package.json           # Dependencies and scripts
└── netlify.toml           # Netlify configuration
```

## Setup & Development

### Prerequisites

- Node.js 14+ and npm
- Netlify account (for deployment)

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the seed data:**
   ```bash
   npm run build:data
   ```
   This parses `websitelist.txt` and `robotlist.txt` into `public/data.json`.

3. **Run locally:**
   ```bash
   npm run dev
   ```
   This starts Netlify Dev server at `http://localhost:8888`.

### Local Testing

- The dev server simulates Netlify Functions locally
- Netlify Blobs work in dev mode (stored in `.netlify/` folder)
- Add test robots via the UI to verify the POST endpoint

## Deployment to Netlify

### Option 1: Netlify CLI (Recommended)

1. **Login to Netlify:**
   ```bash
   npx netlify login
   ```

2. **Initialize site:**
   ```bash
   npx netlify init
   ```
   - Choose "Create & configure a new site"
   - Select your team
   - Enter a site name
   - Build command: `npm run build:data`
   - Publish directory: `public`
   - Functions directory: `netlify/functions`

3. **Enable Netlify Blobs:**
   - Go to your site dashboard at netlify.com
   - Navigate to Site settings → Environment variables
   - Netlify Blobs is enabled by default for sites on Pro/Enterprise plans
   - For free plans, Blobs has a generous free tier

4. **Deploy:**
   ```bash
   npm run deploy
   ```
   This builds the data and deploys to production.

### Option 2: GitHub Integration

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

2. **Connect to Netlify:**
   - Go to [netlify.com](https://netlify.com) and login
   - Click "Add new site" → "Import an existing project"
   - Connect to GitHub and select your repository
   - Build settings:
     - Build command: `npm run build:data`
     - Publish directory: `public`
     - Functions directory: `netlify/functions`
   - Click "Deploy site"

3. **Netlify Blobs** is automatically available once deployed

### Verifying Deployment

After deployment:
1. Visit your site URL (e.g., `https://your-site.netlify.app`)
2. Check that robots load correctly
3. Try searching for a robot
4. Test adding a new robot via the form
5. Verify the new robot appears immediately

## Updating Robot Data

### Method 1: Update source files and redeploy

1. Edit `websitelist.txt` or `robotlist.txt`
2. Run `npm run build:data` to regenerate `public/data.json`
3. Deploy: `npm run deploy`

### Method 2: Users add via UI

- Any user can add new robots through the web interface
- User-added robots are stored in Netlify Blobs
- They persist across deployments and are merged with seed data

## Security Features

- **Rate limiting**: 5 requests per minute per IP (in-memory, per function instance)
- **Honeypot field**: Hidden form field to catch bots
- **Input validation**: Client and server-side validation of all fields
- **MAC format enforcement**: Must be exactly 12 hex characters
- **Duplicate prevention**: Same MAC on same site is blocked
- **CORS**: Restricted to site origin (can be tightened further)

## Data Model

### Site
```json
{
  "id": "support.twinnyservice.com",
  "baseUrl": "http://support.twinnyservice.com/",
  "status": "active" | "down" | "unused"
}
```

### Robot
```json
{
  "id": "seed-0 | user-<timestamp>-<random>",
  "siteId": "support.twinnyservice.com",
  "type": "Nargo60-3rd",
  "name": "전시회나갈로봇",
  "description": "2025.02.14",
  "mac": "EC:2E:98:A1:8B:F7",
  "rawMac": "ec2e98a18bf7",
  "source": "seed | user",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

## Troubleshooting

### Robots not loading
- Check browser console for errors
- Verify `/api/robots` endpoint returns data
- Run `npm run build:data` to regenerate seed data

### Can't add robots
- Check rate limit (5/min per IP)
- Verify MAC address format (12 hex chars)
- Check for duplicates on same site
- Look at function logs in Netlify dashboard

### Build fails
- Ensure `websitelist.txt` and `robotlist.txt` exist
- Check for syntax errors in text files
- Verify Node.js version (14+)

## Future Enhancements

- [ ] Add authentication for admin-only features
- [ ] Export to CSV/Excel
- [ ] Edit/delete user-added robots
- [ ] Bulk import from CSV
- [ ] API for external integrations
- [ ] Audit log for changes
- [ ] Email notifications for new robots
- [ ] Advanced filtering (by date, multiple sites)

## License

This is an internal tool. All rights reserved.

## Support

For issues or questions, contact the development team.

