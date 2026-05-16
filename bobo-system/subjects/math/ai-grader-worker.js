export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405, corsHeaders);
    }

    if (!env.OPENAI_API_KEY) {
      return json({ error: "missing_openai_api_key" }, 500, corsHeaders);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400, corsHeaders);
    }

    const required = ["title", "prompt", "expectedAnswer", "studentAnswer", "imageDataUrl"];
    const missing = required.filter(key => !payload[key]);
    if (missing.length) {
      return json({ error: "missing_fields", missing }, 400, corsHeaders);
    }

    const rubric = [
      "你是台灣國小六年級數學老師，請批改學生手寫算式照片。",
      "只根據題目、標準答案、學生填寫答案、照片中的計算過程判斷。",
      "若最後答案對但沒有合理算式、算式看不清楚、或過程是亂寫，workOk 必須是 false。",
      "若看過程可確定觀念錯誤，correct 應依最後答案與過程綜合判斷。",
      "feedback 請用繁體中文，一到兩句，給孩子可執行的下一步，不要直接洩漏完整解答。"
    ].join("\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || "gpt-4.1-mini",
        input: [{
          role: "user",
          content: [
            {
              type: "input_text",
              text: `${rubric}

單元：${payload.unit || ""}
題目：${payload.title}
題幹：${payload.prompt}
標準答案：${payload.expectedAnswer}
參考步驟：${(payload.expectedSteps || []).join(" / ")}
學生填寫答案：${payload.studentAnswer}`
            },
            {
              type: "input_image",
              image_url: payload.imageDataUrl,
              detail: "high"
            }
          ]
        }],
        text: {
          format: {
            type: "json_schema",
            name: "bobo_math_grading",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                correct: { type: "boolean" },
                workOk: { type: "boolean" },
                detectedAnswer: { type: "string" },
                feedback: { type: "string" }
              },
              required: ["correct", "workOk", "detectedAnswer", "feedback"]
            }
          }
        }
      })
    });

    const result = await response.json();
    if (!response.ok) {
      return json({ error: "openai_error", detail: result }, response.status, corsHeaders);
    }

    const text = result.output_text || extractOutputText(result);
    try {
      return json(JSON.parse(text), 200, corsHeaders);
    } catch {
      return json({ error: "invalid_model_json", raw: text }, 502, corsHeaders);
    }
  }
};

function extractOutputText(result) {
  return (result.output || [])
    .flatMap(item => item.content || [])
    .filter(content => content.type === "output_text")
    .map(content => content.text)
    .join("\n");
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}
