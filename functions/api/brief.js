// Cloudflare Pages function: POST /api/brief
// Generates a 2–3 sentence operator-focused weekly brief using Claude Haiku.
// Receives { prompt, data } from the dashboard, calls Anthropic's API server-side,
// returns { text }.
//
// Required environment variable (optional — feature is gracefully disabled if absent):
//   ANTHROPIC_API_KEY    — from console.anthropic.com → Settings → API Keys

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return jsonResponse({ error: "ANTHROPIC_API_KEY not configured" }, 501);
  }

  let body;
  try { body = await request.json(); }
  catch (e) { return jsonResponse({ error: "Invalid JSON body" }, 400); }

  const userPrompt = body.prompt || "";
  if (!userPrompt) return jsonResponse({ error: "Missing prompt" }, 400);

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        temperature: 0.5,
        messages: [{ role: "user", content: userPrompt }]
      })
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return jsonResponse({
        error: "Anthropic API error " + anthropicRes.status + ": " + errText.substring(0, 300)
      }, 502);
    }

    const json = await anthropicRes.json();
    // Response shape: { content: [{ type: "text", text: "..." }], ... }
    const block = (json.content || []).find(b => b && b.type === "text");
    const text = block ? block.text : "";

    return jsonResponse({ text }, 200, {
      "Cache-Control": "no-store"
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
