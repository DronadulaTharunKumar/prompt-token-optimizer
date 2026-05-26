function extractResponseText(data) {
  if (typeof data.output_text === "string") return data.output_text;

  const parts = [];
  (data.output || []).forEach((item) => {
    (item.content || []).forEach((content) => {
      if (content.type === "output_text" && content.text) {
        parts.push(content.text);
      }
    });
  });

  return parts.join("\n").trim();
}

function extractChatText(data) {
  return data.choices?.[0]?.message?.content?.trim() || "";
}

function buildSystemPrompt() {
  return [
    "You are an award-winning creative director and senior prompt engineer.",
    "Transform rough user material into a compact master prompt that gets premium creative output from an AI model.",
    "Preserve the user's core idea, remove filler, improve specificity, and add useful constraints.",
    "If an image is supplied, use only visible evidence and include image-aware instruction in the prompt.",
    "Return only the optimized prompt. Do not explain your process."
  ].join("\n");
}

function buildUserPrompt(payload) {
  const text = String(payload.text || "").slice(0, 80_000);
  const budget = Number(payload.budget || 650);
  const imageDataUrl = typeof payload.imageDataUrl === "string" ? payload.imageDataUrl : "";
  const imageNote = imageDataUrl.startsWith("data:image/")
    ? "An image was attached. If the selected provider cannot inspect images, include a clear instruction for the final AI model to inspect the attached image directly and use visible evidence only."
    : "No image was attached.";

  return [
    `Task type: ${payload.taskType || "creative"}`,
    `Output style: ${payload.tone || "proCreative"}`,
    `Target prompt budget: about ${budget} tokens`,
    imageNote,
    "",
    "User material:",
    text || "No text was provided. Build a reusable pro creative prompt from the available context."
  ].join("\n");
}

async function callGroq(payload) {
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
  const budget = Number(payload.budget || 650);
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt()
        },
        {
          role: "user",
          content: buildUserPrompt(payload)
        }
      ],
      temperature: 0.75,
      max_completion_tokens: Math.min(Math.max(budget + 900, 1200), 2600)
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "Groq request failed.");
  }

  return {
    optimized: extractChatText(data),
    model,
    provider: "Groq free-tier model",
    usage: data.usage || null
  };
}

async function callOpenAi(payload) {
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const budget = Number(payload.budget || 650);
  const imageDataUrl = typeof payload.imageDataUrl === "string" ? payload.imageDataUrl : "";
  const userContent = [
    {
      type: "input_text",
      text: buildUserPrompt(payload)
    }
  ];

  if (imageDataUrl.startsWith("data:image/")) {
    userContent.push({
      type: "input_image",
      image_url: imageDataUrl
    });
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      instructions: buildSystemPrompt(),
      input: [
        {
          role: "user",
          content: userContent
        }
      ],
      max_output_tokens: Math.min(Math.max(budget + 450, 700), 2200)
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "OpenAI request failed.");
  }

  return {
    optimized: extractResponseText(data),
    model,
    provider: "OpenAI",
    usage: data.usage || null
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed." })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (error) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid JSON request." })
    };
  }

  if (!process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY) {
    return {
      statusCode: 503,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "No AI key is set. Add free GROQ_API_KEY to use the free-tier model, or OPENAI_API_KEY for OpenAI."
      })
    };
  }

  try {
    const result = process.env.GROQ_API_KEY ? await callGroq(payload) : await callOpenAi(payload);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result)
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error.message || "Unable to reach AI provider." })
    };
  }
};
