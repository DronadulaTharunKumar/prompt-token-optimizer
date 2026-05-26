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

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed." })
    };
  }

  if (!process.env.OPENAI_API_KEY) {
    return {
      statusCode: 503,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "OPENAI_API_KEY is not set. Add it to your Netlify environment variables."
      })
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

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const budget = Number(payload.budget || 650);
  const imageDataUrl = typeof payload.imageDataUrl === "string" ? payload.imageDataUrl : "";

  const userContent = [
    {
      type: "input_text",
      text: [
        `Task type: ${payload.taskType || "creative"}`,
        `Output style: ${payload.tone || "proCreative"}`,
        `Target prompt budget: about ${budget} tokens`,
        "",
        "User material:",
        String(payload.text || "").slice(0, 80_000) || "No text was provided."
      ].join("\n")
    }
  ];

  if (imageDataUrl.startsWith("data:image/")) {
    userContent.push({
      type: "input_image",
      image_url: imageDataUrl
    });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        instructions: [
          "You are an award-winning creative director and senior prompt engineer.",
          "Transform rough user material into a compact master prompt that gets premium creative output from an AI model.",
          "Preserve the user's core idea, remove filler, improve specificity, and add useful constraints.",
          "If an image is supplied, use only visible evidence and include image-aware instruction in the prompt.",
          "Return only the optimized prompt. Do not explain your process."
        ].join("\n"),
        input: [
          {
            role: "user",
            content: userContent
          }
        ],
        max_output_tokens: Math.min(Math.max(budget + 250, 350), 1800)
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: data.error?.message || "OpenAI request failed." })
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        optimized: extractResponseText(data),
        model,
        usage: data.usage || null
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Unable to reach OpenAI API." })
    };
  }
};
