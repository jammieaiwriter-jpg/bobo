const ALLOWED_ORIGINS = [
  "https://jammieaiwriter-jpg.github.io",
  "http://localhost:8787",
];

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== "POST") {
      return Response.json({ ok: false, error: "method_not_allowed" }, { status: 405, headers: cors });
    }

    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
      return Response.json({ ok: false, error: "missing_telegram_secret" }, { status: 500, headers: cors });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return Response.json({ ok: false, error: "invalid_json" }, { status: 400, headers: cors });
    }

    const text = String(payload.text || "").trim();
    if (!text || text.length > 3900) {
      return Response.json({ ok: false, error: "invalid_text" }, { status: 400, headers: cors });
    }

    const telegramUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(telegramUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return Response.json({ ok: false, error: "telegram_failed", detail }, { status: 502, headers: cors });
    }

    return Response.json({ ok: true }, { headers: cors });
  },
};
