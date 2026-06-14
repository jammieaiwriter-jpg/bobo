const ALLOWED_ORIGINS = [
  "https://jammieaiwriter-jpg.github.io",
  "http://localhost:8787",
];

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  return {
    ...(ALLOWED_ORIGINS.includes(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request);
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
      return Response.json({ ok: false, error: "origin_not_allowed" }, { status: 403, headers: cors });
    }

    if (request.method !== "POST") {
      return Response.json({ ok: false, error: "method_not_allowed" }, { status: 405, headers: cors });
    }

    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
      return Response.json({ ok: false, error: "missing_telegram_secret" }, { status: 500, headers: cors });
    }
    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength > 8_000) {
      return Response.json({ ok: false, error: "payload_too_large" }, { status: 413, headers: cors });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return Response.json({ ok: false, error: "invalid_json" }, { status: 400, headers: cors });
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return Response.json({ ok: false, error: "invalid_payload" }, { status: 400, headers: cors });
    }
    if (JSON.stringify(payload).length > 8_000) {
      return Response.json({ ok: false, error: "payload_too_large" }, { status: 413, headers: cors });
    }

    if (typeof payload.text !== "string") {
      return Response.json({ ok: false, error: "invalid_text" }, { status: 400, headers: cors });
    }
    const text = payload.text.trim();
    if (!text || text.length > 3900) {
      return Response.json({ ok: false, error: "invalid_text" }, { status: 400, headers: cors });
    }

    const telegramUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    let response;
    try {
      response = await fetch(telegramUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text,
          link_preview_options: { is_disabled: true },
        }),
      });
    } catch {
      return Response.json({ ok: false, error: "telegram_failed" }, { status: 502, headers: cors });
    }

    if (!response.ok) {
      return Response.json({ ok: false, error: "telegram_failed" }, { status: 502, headers: cors });
    }

    return Response.json({ ok: true }, { headers: cors });
  },
};
