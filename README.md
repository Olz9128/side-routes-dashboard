# Side Routes — Bookings Dashboard

Live dashboard pulling from the Side Routes Bookings Log Google Sheet.
Deployed as a static page + Cloudflare Pages functions. Auth handled by Cloudflare Access (Google SSO).

## What's in this repo

```
side-routes-dashboard/
├── public/index.html          The dashboard (HTML + Chart.js, all inline)
├── functions/api/bookings.js  Cloudflare Pages function — fetches the published CSV
├── functions/api/brief.js     Cloudflare Pages function — generates the AI Weekly Brief via Anthropic
├── wrangler.toml              Cloudflare config
├── package.json               Local dev scripts
├── .dev.vars.example          Template for local environment variables
├── .gitignore
└── README.md                  This file
```

The dashboard calls `/api/bookings` (returns sheet data parsed from CSV) and `/api/brief` (returns an AI-generated summary). Both endpoints run server-side on Cloudflare. Credentials live in Cloudflare's encrypted env vars, never in the browser.

---

## Deploy in 5 steps

You only do steps 1–4 once. Step 5 — pushing changes — is the day-to-day flow.

### Step 1 · Push to GitHub

1. Create a private repo at <https://github.com/new>. Name: `side-routes-dashboard`. Visibility: Private. Don't initialize with README.
2. From your terminal:

   ```bash
   cd path/to/side-routes-dashboard
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/side-routes-dashboard.git
   git push -u origin main
   ```

   If `git push` asks for a password, install GitHub CLI from <https://cli.github.com> and run `gh auth login` first — modern GitHub doesn't accept passwords for git over HTTPS.

### Step 2 · Publish the sheet as CSV

1. Open the Bookings Log sheet in Google Sheets.
2. **File → Share → Publish to web**.
3. In the dialog: leave "Entire document" selected (or pick the specific tab), set the format dropdown to **Comma-separated values (.csv)**.
4. Click **Publish**, then confirm "OK" on the warning popup.
5. Copy the URL Google gives you. It looks like:
   `https://docs.google.com/spreadsheets/d/e/2PACX-1vQ.../pub?output=csv`
6. Save that URL — you'll paste it into Cloudflare in step 4.

> **Security note on this approach:** the published CSV URL is reachable by anyone who knows it (it isn't gated by Google login), but Google generates a 30+ character random token in the URL so it's unguessable in practice. The dashboard URL itself stays gated behind Cloudflare Access (step 5), so the only way someone could reach the CSV is if a team member deliberately leaked the URL. For a small operator team this is an acceptable trade-off vs. setting up service accounts. If you ever want to invalidate the URL, go back to *File → Share → Publish to web → Stop publishing → re-Publish* — you'll get a new token.

### Step 3 · Connect to Cloudflare Pages

1. Sign up / log in at <https://dash.cloudflare.com>
2. Left menu → **Workers & Pages → Create → Pages → Connect to Git**
3. Authorize Cloudflare to read your GitHub. Select the `side-routes-dashboard` repo.
4. Build settings: framework preset = **None**. Build command = leave blank. Build output directory = `public`.
5. Click **Save and Deploy** — first build will fail because env vars aren't set. Expected.

### Step 4 · Add environment variables in Cloudflare

In your Pages project: **Settings → Environment variables → Production**. Add:

| Name | Required? | Value |
|------|-----------|-------|
| `SHEET_CSV_URL` | Yes | The published CSV URL from step 2 |
| `ANTHROPIC_API_KEY` | Optional | Enables the AI Weekly Brief card. Get from <https://console.anthropic.com> → Settings → API Keys. ~Cents per month at your scale. If you skip this, the AI brief card shows "not configured" and everything else works fine. |

Both should be marked **Encrypted** in Cloudflare's UI when saving.

After adding env vars: **Deployments → Retry deployment** on the failed build. It should now succeed and give you a `*.pages.dev` preview URL. Open it. You should see the dashboard with your real data.

### Step 5 · Lock it down with Cloudflare Access

This makes the dashboard private — only logged-in Side Routes team members can view it.

1. In Cloudflare dashboard: **Zero Trust → Settings → Authentication → Login methods**. Add **Google** as a login method (Cloudflare walks you through OAuth setup; takes 2 minutes).
2. Then **Zero Trust → Access → Applications → Add an application → Self-hosted**.
3. Application name: `Side Routes Dashboard`. Domain: paste your `*.pages.dev` URL (or your custom domain — see below).
4. Identity providers: tick **Google**.
5. Next page, create a policy:
   - Policy name: `Side Routes team`
   - Action: **Allow**
   - Configure rules → Include → **Emails ending in** → `@sideroutes.com`
   - (Or use **Emails** to whitelist specific addresses one by one if your team uses mixed domains.)
6. Save.

Now visiting the dashboard prompts a Google login. Only allowed emails get through. Free for up to 50 users.

### Step 6 · Custom domain (optional, recommended)

In Pages project: **Custom domains → Set up a custom domain**. Type `dashboard.sideroutes.com`. If your domain's DNS is on Cloudflare, the CNAME is added automatically. If not, copy the CNAME target Cloudflare gives you and add it in your DNS provider. Allow ~5 minutes for SSL to provision. Then update the Cloudflare Access application (step 5) to use the custom domain.

Done. Bookmark the URL.

---

## Iterating on the dashboard

Day-to-day workflow:

```bash
# Edit public/index.html or functions/api/*.js locally
git add .
git commit -m "Add lead-time chart"
git push
```

Cloudflare Pages auto-builds within ~90 seconds of the push and deploys to your URL. No manual deploy step.

### Local development

To preview locally with the API functions actually working:

```bash
# One time
npm install

# Copy the env template and fill in real values
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your real SHEET_CSV_URL (and optional ANTHROPIC_API_KEY)

# Run
npm run dev
```

Wrangler will serve the dashboard at <http://localhost:8788> with the functions live. `.dev.vars` is gitignored.

### Adding features

The dashboard is a single self-contained HTML file. Common extension points:

- **More charts**: add a new `<div class="chart-card">` inside `.chart-grid` in `buildShell()`, plus a new `renderXxx()` function and a corresponding aggregation in `render()`.
- **More KPIs**: add another `<div class="kpi" data-kind="...">` block; compute the value in `render()`.
- **Smarter city detection**: edit `getCity()` to handle new tour names.
- **Live FX rates**: replace the fixed `FX_TO_EUR` map with a `fetch()` call to an exchange-rate API at the top of `loadData()`.
- **More data sources**: add another publish-to-web URL as another env var (e.g. `SHEET_CSV_URL_ADS`), add a second function `/api/ads.js`, and call both from the dashboard.

---

## Troubleshooting

**"Couldn't load bookings. CSV fetch failed (403)"**
Your sheet's "Publish to web" got disabled or the URL changed. Re-publish via *File → Share → Publish to web*, copy the new URL, update the `SHEET_CSV_URL` env var in Cloudflare.

**"CSV response was empty"**
The publish-to-web setting was changed to a different format. Make sure the format dropdown in the Publish dialog is set to "Comma-separated values (.csv)", not "Web page".

**Dashboard loads, shows 0 bookings**
Open browser DevTools → Network tab → reload → click `/api/bookings` and check the response. If `headers` and `rows` look correct but bookings show 0, your filter dropdowns might be set to a city/channel that has no matches — click "Reset filters" on the dashboard.

**AI brief shows "not configured"**
Add an `ANTHROPIC_API_KEY` env var in Cloudflare. Or ignore — the rest of the dashboard works fine without it.

**Cloudflare Access prompts but rejects login**
The Access policy doesn't include your email. Edit the policy in Zero Trust and add it.

**`git push` asks for a password**
GitHub stopped accepting passwords for git over HTTPS in 2021. Install GitHub CLI from <https://cli.github.com>, run `gh auth login`, then retry `git push`.

---

## Files reference

- `functions/api/bookings.js` · Cloudflare Pages function. Fetches the published CSV URL, parses it, returns JSON.
- `functions/api/brief.js` · Cloudflare Pages function. Generates the AI Weekly Brief via Anthropic API.
- `public/index.html` · Self-contained dashboard. Loads Chart.js from CDN.
- `wrangler.toml` · Cloudflare Pages build config.
- `package.json` · Wrangler dev dependency.
- `.dev.vars.example` · Local env var template.
- `.gitignore` · Excludes secrets and build artifacts.
