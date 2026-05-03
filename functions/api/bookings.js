// Cloudflare Pages function: GET /api/bookings
// Fetches the Side Routes Bookings Log via Google Sheets' "Publish to web → CSV"
// public URL. No service account needed. The CSV URL is unguessable but technically
// public; Cloudflare Access in front of the dashboard provides the security gate.
//
// Required environment variable (set in Cloudflare Pages → Settings → Environment variables):
//   SHEET_CSV_URL  — the published-to-web CSV URL from Google Sheets
//                    (looks like: https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?output=csv)

export async function onRequest(context) {
  try {
    const csvUrl = context.env.SHEET_CSV_URL;
    if (!csvUrl) {
      return jsonResponse({ error: "SHEET_CSV_URL not configured" }, 500);
    }

    const res = await fetch(csvUrl, {
      // Bypass Cloudflare's edge cache so we always get fresh data;
      // we still cache our own response below for 60s at the edge.
      cf: { cacheEverything: false }
    });
    if (!res.ok) {
      const text = await res.text();
      return jsonResponse({
        error: "CSV fetch failed (" + res.status + "). First 200 chars: " + text.substring(0, 200)
      }, 502);
    }
    const csv = await res.text();
    if (!csv || csv.length < 10) {
      return jsonResponse({ error: "CSV response was empty. Check that the sheet is published to web." }, 502);
    }
    const { headers, rows } = parseCsv(csv);
    if (headers.length === 0) {
      return jsonResponse({ error: "Couldn't parse CSV (no headers found)." }, 502);
    }
    return jsonResponse({
      headers,
      rows,
      rowCount: rows.length,
      fetchedAt: new Date().toISOString()
    }, 200, {
      "Cache-Control": "public, max-age=60, s-maxage=60"
    });
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

// ---------- CSV parser ----------
// Handles quoted fields with embedded commas, escaped quotes ("" inside quotes),
// and CRLF / LF / CR line endings. Returns { headers: string[], rows: string[][] }.
function parseCsv(text) {
  const cells = [[]];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { inQuotes = false; }
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        cells[cells.length - 1].push(cell);
        cell = "";
      } else if (ch === "\r" || ch === "\n") {
        cells[cells.length - 1].push(cell);
        cell = "";
        if (ch === "\r" && text[i + 1] === "\n") i++;
        // Skip empty trailing lines
        if (i < text.length - 1) cells.push([]);
      } else {
        cell += ch;
      }
    }
  }
  // Final cell / row
  if (cell.length > 0 || cells[cells.length - 1].length > 0) {
    cells[cells.length - 1].push(cell);
  }
  // Filter out empty rows (single empty cell)
  const nonEmpty = cells.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ""));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  return {
    headers: nonEmpty[0],
    rows: nonEmpty.slice(1)
  };
}
