import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workerSource = await readFile(
  new URL("../bobo-system/subjects/math/ai-grader-worker.js", import.meta.url),
  "utf8"
);
const worker = (await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString("base64")}`)).default;

const origin = "https://jammieaiwriter-jpg.github.io";
const validPayload = {
  title: "題目",
  prompt: "1 + 1 = ?",
  expectedAnswer: "2",
  studentAnswer: "2",
  imageDataUrl: "data:image/png;base64,YQ=="
};

function request(payload, headers = {}) {
  return new Request("https://worker.example", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload)
  });
}

test("returns 204 for allowed OPTIONS preflight", async () => {
  const response = await worker.fetch(new Request("https://worker.example", {
    method: "OPTIONS",
    headers: { Origin: origin }
  }), {});
  assert.equal(response.status, 204);
});

test("returns 204 for unallowed OPTIONS preflight without allowing the origin", async () => {
  const response = await worker.fetch(new Request("https://worker.example", {
    method: "OPTIONS",
    headers: { Origin: "https://evil.example" }
  }), {});
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
});

test("rejects requests from an unallowed origin", async () => {
  const response = await worker.fetch(request(validPayload, { Origin: "https://evil.example" }), {});
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "origin_not_allowed" });
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
});

test("rejects a JSON payload that is not an object", async () => {
  const response = await worker.fetch(request(null), {});
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_payload" });
});

test("rejects payloads missing required fields", async () => {
  const { studentAnswer, ...payload } = validPayload;
  const response = await worker.fetch(request(payload), {});
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "missing_fields", missing: ["studentAnswer"] });
});

test("rejects invalid expected steps", async () => {
  const response = await worker.fetch(request({
    ...validPayload,
    expectedSteps: Array.from({ length: 51 }, () => "step")
  }), {});
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_expected_steps" });
});

test("returns 500 when no AI API key is configured", async () => {
  const response = await worker.fetch(request(validPayload), {});
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "missing_ai_api_key" });
});

test("Gemini path parses only the first response part", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    candidates: [{
      content: {
        parts: [
          { text: JSON.stringify({ correct: true, workOk: true, detectedAnswer: "2", feedback: "正確" }) },
          { text: "unexpected extra part" }
        ]
      }
    }]
  });
  try {
    const response = await worker.fetch(request(validPayload), { GEMINI_API_KEY: "test" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      correct: true,
      workOk: true,
      detectedAnswer: "2",
      feedback: "正確"
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenAI path rejects unsupported image data URLs before upstream fetch", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("upstream fetch should not run");
  };
  try {
    const response = await worker.fetch(
      request({ ...validPayload, imageDataUrl: "data:application/pdf;base64,YQ==" }),
      { OPENAI_API_KEY: "test" }
    );
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid_image_data_url" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenAI path parses only the first output_text part", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    output: [{
      content: [
        { type: "output_text", text: JSON.stringify({ correct: true, workOk: true, detectedAnswer: "2", feedback: "正確" }) },
        { type: "output_text", text: "unexpected extra part" }
      ]
    }]
  });
  try {
    const response = await worker.fetch(request(validPayload), { OPENAI_API_KEY: "test" });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).correct, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects an image data URL above the image-specific limit", async () => {
  const response = await worker.fetch(
    request({ ...validPayload, imageDataUrl: `data:image/png;base64,${"A".repeat(7_000_001)}` }),
    {}
  );
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: "image_too_large" });
});

test("rejects oversized JSON after parsing when Content-Length is absent", async () => {
  const response = await worker.fetch(
    request({ ...validPayload, extra: "x".repeat(8_100_000) }),
    {}
  );
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: "payload_too_large" });
});

test("returns 400 when a text field is too long", async () => {
  const response = await worker.fetch(
    request({ ...validPayload, title: "x".repeat(4_001) }),
    {}
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "text_too_long" });
});

for (const [provider, env, expectedError] of [
  ["Gemini", { GEMINI_API_KEY: "test" }, "gemini_error"],
  ["OpenAI", { OPENAI_API_KEY: "test" }, "openai_error"]
]) {
  test(`${provider} path returns a stable 502 when upstream error is not JSON`, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("<html>gateway error</html>", { status: 503 });
    try {
      const response = await worker.fetch(request(validPayload), env);
      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), { error: expectedError });
      assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test(`${provider} path returns a stable 502 when upstream fetch throws`, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("network unavailable");
    };
    try {
      const response = await worker.fetch(request(validPayload), env);
      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), { error: expectedError });
      assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}
