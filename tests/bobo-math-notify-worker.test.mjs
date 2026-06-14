import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workerSource = await readFile(
  new URL("../workers/bobo-math-notify/worker.js", import.meta.url),
  "utf8"
);
const worker = (await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString("base64")}`)).default;

test("returns 204 for unallowed OPTIONS preflight without allowing the origin", async () => {
  const request = new Request("https://worker.example", {
    method: "OPTIONS",
    headers: { Origin: "https://evil.example" }
  });

  const response = await worker.fetch(request, {});

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
});

test("rejects requests from an unallowed origin", async () => {
  const request = new Request("https://worker.example", {
    method: "POST",
    headers: {
      Origin: "https://evil.example",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text: "ok" })
  });

  const response = await worker.fetch(request, {});

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { ok: false, error: "origin_not_allowed" });
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
});

test("rejects oversized JSON after parsing when Content-Length is absent", async () => {
  const request = new Request("https://worker.example", {
    method: "POST",
    headers: {
      Origin: "https://jammieaiwriter-jpg.github.io",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text: "ok", extra: "x".repeat(8_000) })
  });

  const response = await worker.fetch(request, {
    TELEGRAM_BOT_TOKEN: "test",
    TELEGRAM_CHAT_ID: "test"
  });

  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { ok: false, error: "payload_too_large" });
});

test("rejects a JSON payload that is not an object", async () => {
  const request = new Request("https://worker.example", {
    method: "POST",
    headers: {
      Origin: "https://jammieaiwriter-jpg.github.io",
      "Content-Type": "application/json"
    },
    body: "null"
  });

  const response = await worker.fetch(request, {
    TELEGRAM_BOT_TOKEN: "test",
    TELEGRAM_CHAT_ID: "test"
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { ok: false, error: "invalid_payload" });
});

test("rejects non-string text", async () => {
  const request = new Request("https://worker.example", {
    method: "POST",
    headers: {
      Origin: "https://jammieaiwriter-jpg.github.io",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text: true })
  });

  const response = await worker.fetch(request, {
    TELEGRAM_BOT_TOKEN: "test",
    TELEGRAM_CHAT_ID: "test"
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { ok: false, error: "invalid_text" });
});

test("uses Telegram link_preview_options", async () => {
  const originalFetch = globalThis.fetch;
  let telegramPayload;
  globalThis.fetch = async (_url, options) => {
    telegramPayload = JSON.parse(options.body);
    return Response.json({ ok: true });
  };
  try {
    const request = new Request("https://worker.example", {
      method: "POST",
      headers: {
        Origin: "https://jammieaiwriter-jpg.github.io",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text: "ok" })
    });
    const response = await worker.fetch(request, {
      TELEGRAM_BOT_TOKEN: "test",
      TELEGRAM_CHAT_ID: "test"
    });

    assert.equal(response.status, 200);
    assert.deepEqual(telegramPayload.link_preview_options, { is_disabled: true });
    assert.equal("disable_web_page_preview" in telegramPayload, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("returns a stable 502 when Telegram returns an HTTP error", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("Bad Request", { status: 400 });
  try {
    const request = new Request("https://worker.example", {
      method: "POST",
      headers: {
        Origin: "https://jammieaiwriter-jpg.github.io",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text: "ok" })
    });
    const response = await worker.fetch(request, {
      TELEGRAM_BOT_TOKEN: "test",
      TELEGRAM_CHAT_ID: "test"
    });

    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { ok: false, error: "telegram_failed" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("returns a stable 502 when Telegram fetch throws", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("network unavailable");
  };
  try {
    const request = new Request("https://worker.example", {
      method: "POST",
      headers: {
        Origin: "https://jammieaiwriter-jpg.github.io",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text: "ok" })
    });
    const response = await worker.fetch(request, {
      TELEGRAM_BOT_TOKEN: "test",
      TELEGRAM_CHAT_ID: "test"
    });

    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { ok: false, error: "telegram_failed" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
