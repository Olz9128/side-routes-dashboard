# Side Routes — Bookings Dashboard

Live dashboard pulling from the Side Routes Bookings Log Google Sheet.
Deployed as a static page + Cloudflare Pages function. Auth handled by Cloudflare Access (Google SSO).

## What's in this repo

```
side-routes-dashboard/
├── public/index.html          The dashboard (HTML + Chart.js, all inline)
├── functions/api/bookings.js  Cloudflare Pages function — fetches from Sheets API server-side
├── functions/api/brief.js     Cloudflare Pages function — generates the AI Weekly Brief via Anthropic
├── wrangler.toml              Cloudflare config
├── package.json               Local dev scripts
├── .dev.vars.example          Template for local environment variables
├── .gitignore
└── README.md                  This file
```

The dashboard calls `/api/bookings` which is implemented by the Pages function. The function authenticates with Google using a service account JWT signed via the Web Crypto API (no Node libs needed), reads the sheet, and returns JSON. Credentials never reach the browser.

---

## Deploy in 6 steps

You only do steps 1–5 once. Step 6 — pushing changes — is the day-to-day flow.

### Step 1 · Create a private GitHub repo

1. Go to <https://github.com/new>
2. Repo name: `side-routes-dashboard`
3. Visibility: **Private**
4. Don't initialize with README (we have one)
5. Create

Then locally:

```bash
cd path/to/side-routes-dashboard
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USER/side-routes-dashboard.git
git push -u origin main
```

### Step 2 · Set up Google Cloud (service account)

This is the fiddliest part. ~10 minutes the first time.

1. Open <https://console.cloud.google.com>
2. Top-left, click the project dropdown → **New Project**. Name it `side-routes-dashboard` → Create. Make sure that project is selected (top left should show its name).
3. Left menu → **APIs & Services → Library**. Search "Google Sheets API". Click it. Click **Enable**.
4. Left menu → **APIs & Services → Credentials**. Click **+ Create Credentials → Service account**.
5. Service account name: `dashboard-reader`. Click **Create and Continue**. Skip the "Grant access" step (just click **Continue** then **Done**).
6. On the Credentials page, click the new service account row. Go to the **Keys** tab. Click **Add Key → Create new key → JSON → Create**. A `.json` file downloads to your computer.
7. **Open the downloaded JSON in a text editor.** You'll need two values from it shortly:
   - `client_email` (looks like `dashboard-reader@your-project-12345.iam.gserviceaccount.com`)
   - `private_key` (a long block starting with `-----BEGIN PRIVATE KEY-----`)
8. **Share the sheet with the service account.** Open the bookings sheet in Google Sheets. Click **Share** (top right). Paste the service account's `client_email`. Set permission to **Viewer**. Untick "Notify people". Click **Share**. Confirm "share without notification".

> **Security note:** The downloaded JSON file is the service account credential. Treat it like a password. Don't commit it to git, don't email it, don't paste it anywhere public. The `.gitignore` in this repo already excludes `service-account.json` just in case.

### Step 3 · Connect to Cloudflare Pages

1. Sign up / log in at <https://dash.cloudflare.com>
2. Left menu → **Workers & Pages → Create → Pages → Connect to Git**
3. Authorize Cloudflare to read your GitHub. Select the `side-routes-dashboard` repo.
4. Build settings: framework preset = **None**. Build command = leave blank. Build output directory = `public`.
5. **Don't deploy yet** — click **Save and Deploy**, but the first build will fail because env vars aren't set. That's expected.

### Step 4 · Add environment variables in Cloudflare

In your Pages project: **Settings → Environment variables → Production**. Add these four (all encrypted, all required):

| Name | Value |
|------|-------|
| `GOOGLE_SHEET_ID` | `12ewHhRFOS6PSZpjk0cg8dzLj05KujL0Ei2udGu8He04` |
| `GOOGLE_SHEET_RANGE` | `Sheet1!A:K` (adjust if your tab is named differently) |
| `GOOGLE_CLIENT_EMAIL` | The `client_email` from your service account JSON |
| `GOOGLE_PRIVATE_KEY` | The full `private_key` from the JSON, including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines |
| `ANTHROPIC_API_KEY` | **Optional.** Enables the AI Weekly Brief card. Get from <https://console.anthropic.com> → Settings → API Keys. Costs cents per month at your scale. If you skip this, the brief card shows "not configured" and everything else works fine. |

> **Private key gotcha:** Cloudflare's UI usually preserves newlines, but if your function later returns a "DECODER routines" error, the issue is mangled newlines. Edit the env var and ensure each line break is preserved. If pasting one giant line, replace each newline with the literal characters `\n` and the function will reconstitute them at runtime (the code already handles both formats).

After adding env vars: **Deployments → Retry deployment** on the failed build. It should now succeed and give you a `*.pages.dev` preview URL. Open it. You should see the dashboard.

### Step 5 · Lock it down with Cloudflare Access

This makes the dashboard private — only logged-in Side Routes team members can view it.

1. In Cloudflare dashboard: **Zero Trust → Settings → Authentication → Login methods**. Add **Google** as a login method (Cloudflare walks you through OAuth setup; takes 2 minutes).
2. Then **Zero Trust → Access → Applications → Add an application → Self-hosted**.
3. Application name: `Side Routes Dashboard`. Domain: paste your `*.pages.dev` URL (or your custom domain — see step 6).
4. Identity providers: tick **Google**.
5. Next page, create a policy:
   - Policy name: `Side Routes team`
   - Action: **Allow**
   - Configure rules → Include → **Emails ending in** → `@sideroutes.com`
   - (Or use **Emails** to whitelist specific addresses one by one if your team uses mixed domains.)
6. Save.

Now visiting the dashboard prompts a Google login. Only allowed emails get through.

### Step 6 · Custom domain (optional, recommended)

In Pages project: **Custom domains → Set up a custom domain**. Type `dashboard.sideroutes.com`. If your domain's DNS is on Cloudflare, the CNAME is added automatically. If not, copy the CNAME target Cloudflare gives you and add it in your DNS provider. Allow ~5 minutes for SSL to provision.

Then update the Cloudflare Access application (step 5) to use the custom domain.

Done. Bookmark the URL.

---

## Iterating on the dashboard

Day-to-day workflow:

```bash
# Edit public/index.html or functions/api/bookings.js locally
git add .
git commit -m "Add lead-time chart"
git push
```

Cloudflare Pages auto-builds within ~90 seconds of the push and deploys to your URL. No manual deploy step.

### Local development

To preview locally with the API function actually working:

```bash
# One time
npm install

# Copy the env template and fill in real values
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your real GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY

# Run
npm run dev
```

Wrangler will serve the dashboard at <http://localhost:8788> with the function live. `.dev.vars` is gitignored.

### Adding features

The dashboard is a single self-contained HTML file. Common extension points:

- **More charts**: add a new `<div class="chart-card">…</div>` inside `.chart-grid` in `buildShell()`, plus a new `renderXxx()` function and a corresponding aggregation in `render()`.
- **More KPIs**: add another `<div class="kpi">` block; compute the value in `render()`.
- **Different sheet ranges**: change `GOOGLE_SHEET_RANGE` env var. To pull multiple ranges, modify the function to make multiple Sheets API calls and merge the results.
- **Smarter city detection**: edit `getCity()` to handle new tour names.
- **Live FX rates**: replace the fixed `FX_TO_EUR` map with a `fetch()` to <https://api.exchangerate.host/latest?base=EUR> at the top of the function and pass live rates to the dashboard.

---

## How it works (architecture)

```
Browser ──GET── /api/bookings ───┐
                                 │ runs in Cloudflare Pages function (Worker)
                                 ▼
                       1. Build JWT { iss, scope, aud }
                       2. Sign with service account private key (RS256)
                       3. POST to oauth2.googleapis.com/token
                       4. Receive access_token (1h TTL)
                       5. GET sheets.googleapis.com/v4/spreadsheets/.../values/...
                       6. Return JSON { headers, rows, fetchedAt }
                                 │
                                 ▼
                          Browser renders charts
```

Why this shape:
- **Service account auth** lets the server-side code read the sheet without a human ever logging in. Sharing the sheet with the service account email is the explicit grant.
- **JWT signed with Web Crypto** runs in Workers (no Node), so we don't need any server.
- **Cloudflare Access in front** means the dashboard URL itself is gated. Even if someone discovers the URL, they can't load it without Google SSO.

---

## Troubleshooting

**"Couldn't load bookings. Token exchange failed (401): invalid_grant"**
The service account's private key is mangled (likely missing newlines). Re-edit the `GOOGLE_PRIVATE_KEY` env var and make sure the BEGIN/END lines and the body's line breaks are preserved.

**"Sheets API error 403: The caller does not have permission"**
You haven't shared the sheet with the service account's `client_email`. Open the sheet, click Share, paste that email, set Viewer, send.

**"Sheets API error 400: Unable to parse range"**
Your `GOOGLE_SHEET_RANGE` env var is wrong. Open the sheet, find the tab name (bottom of the page), set it like `MyTabName!A:K`.

**Dashboard loads, shows 0 bookings**
Open browser DevTools → Network tab → reload → click `/api/bookings` and check the response shape. The `headers` and `rows` arrays should be populated. If they're empty, the sheet range is empty (wrong range).

**Cloudflare Access prompts but rejects login**
The Access policy doesn't include your email. Edit the policy and add it.

---

## Files reference

- `functions/api/bookings.js` · Cloudflare Pages function. Reads Google Sheets via service account.
- `public/index.html` · Self-contained dashboard. Loads Chart.js from CDN.
- `wrangler.toml` · Cloudflare Pages build config.
- `package.json` · Wrangler dev dependency.
- `.dev.vars.example` · Local env var template.
- `.gitignore` · Excludes secrets and build artifacts.
