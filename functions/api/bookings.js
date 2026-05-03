// Cloudflare Pages function: GET /api/bookings
// Fetches the Side Routes Bookings Log sheet via the Google Sheets API
// using a service account credential. Runs server-side so credentials are
// never exposed to the browser. Cached briefly at the edge.
//
// Required environment variables (set in Cloudflare Pages → Settings → Environment variables):
//   GOOGLE_SHEET_ID      — the spreadsheet ID from the Sheet URL
//   GOOGLE_SHEET_RANGE   — e.g. "Sheet1!A:K" (defaults to "A:K")
//   GOOGLE_CLIENT_EMAIL  — from the service account JSON key
//   GOOGLE_PRIVATE_KEY   — from the service account JSON key (with \n preserved)

export async function onRequest(context) {
  try {
    const env = context.env || {};
    const sheetId = env.GOOGLE_SHEET_ID;
    const range = env.GOOGLE_SHEET_RANGE || "A:K";
    const clientEmail = env.GOOGLE_CLIENT_EMAIL;
    // Cloudflare often stores the private key with literal \n sequences;
    // restore real newlines.
    const privateKey = (env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

    if (!sheetId || !clientEmail || !privateKey) {
      return jsonResponse({
        error: "Missing config. Required env vars: GOOGLE_SHEET_ID, GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY"
      }, 500);
    }

    const accessToken = await getGoogleAccessToken(clientEmail, privateKey);
    const sheetsUrl =
      "https://sheets.googleapis.com/v4/spreadsheets/" +
      encodeURIComponent(sheetId) +
      "/values/" + encodeURIComponent(range) +
      "?valueRenderOption=UNFORMATTED_VALUE" +
      "&dateTimeRenderOption=FORMATTED_STRING";

    const res = await fetch(sheetsUrl, {
      headers: { "Authorization": "Bearer " + accessToken }
    });
    if (!res.ok) {
      const text = await res.text();
      return jsonResponse({ error: "Sheets API error " + res.status + ": " + text }, 502);
    }
    const data = await res.json();
    const values = data.values || [];
    const headers = values[0] || [];
    const rows = values.slice(1);

    return jsonResponse({
      headers,
      rows,
      rowCount: rows.length,
      fetchedAt: new Date().toISOString()
    }, 200, { "Cache-Control": "public, max-age=60, s-maxage=60" });
  } catch (e) {
    return jsonResponse({ error: (e && e.message) ? e.message : String(e) }, 500);
  }
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });
}

// ---------- Google service-account JWT auth via Web Crypto ----------

async function getGoogleAccessToken(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };

  const enc = new TextEncoder();
  const headerB64 = base64UrlEncodeBytes(enc.encode(JSON.stringify(header)));
  const claimB64 = base64UrlEncodeBytes(enc.encode(JSON.stringify(claim)));
  const unsigned = headerB64 + "." + claimB64;

  const key = await importPkcs8Pem(privateKey);
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    enc.encode(unsigned)
  );
  const signedJwt = unsigned + "." + base64UrlEncodeBytes(new Uint8Array(signature));

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signedJwt
    })
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error("Token exchange failed (" + tokenRes.status + "): " + text);
  }
  const tokenJson = await tokenRes.json();
  if (!tokenJson.access_token) throw new Error("No access_token in token response");
  return tokenJson.access_token;
}

async function importPkcs8Pem(pem) {
  const cleaned = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  if (!cleaned) throw new Error("Empty private key");
  const der = Uint8Array.from(atob(cleaned), c => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8",
    der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function base64UrlEncodeBytes(bytes) {
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
