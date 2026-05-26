const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const port = Number(process.env.PORT || 3000);
const root = __dirname;
const envPath = path.join(root, ".env");

if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, "utf8");
  envText.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!match || process.env[match[1]]) return;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  });
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml"
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(body);
}

function sendJson(res, status, body) {
  send(res, status, JSON.stringify(body), "application/json; charset=utf-8");
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 8_000_000) {
        req.destroy();
        reject(new Error("Request too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

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

async function optimizePrompt(req, res) {
  if (!process.env.OPENAI_API_KEY) {
    sendJson(res, 503, {
      error: "OPENAI_API_KEY is not set. Add it to .env or your cloud environment variables."
    });
    return;
  }

  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    sendJson(res, 400, { error: "Invalid JSON request." });
    return;
  }

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const text = String(payload.text || "").slice(0, 80_000);
  const mode = String(payload.taskType || "creative");
  const tone = String(payload.tone || "proCreative");
  const budget = Number(payload.budget || 650);
  const imageDataUrl = typeof payload.imageDataUrl === "string" ? payload.imageDataUrl : "";

  const userContent = [
    {
      type: "input_text",
      text: [
        `Task type: ${mode}`,
        `Output style: ${tone}`,
        `Target prompt budget: about ${budget} tokens`,
        "",
        "User material:",
        text || "No text was provided. Build a reusable pro creative prompt from the available context."
      ].join("\n")
    }
  ];

  if (imageDataUrl.startsWith("data:image/")) {
    userContent.push({
      type: "input_image",
      image_url: imageDataUrl
    });
  }

  const openAiPayload = {
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
  };

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(openAiPayload)
    });

    const data = await response.json();
    if (!response.ok) {
      sendJson(res, response.status, {
        error: data.error?.message || "OpenAI request failed."
      });
      return;
    }

    const optimized = extractResponseText(data);
    sendJson(res, 200, {
      optimized,
      model,
      usage: data.usage || null
    });
  } catch (error) {
    sendJson(res, 500, { error: "Unable to reach OpenAI API." });
  }
}

function resolveFile(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split("?")[0]);
  const requested = cleanPath === "/" ? "/index.html" : cleanPath;
  const filePath = path.normalize(path.join(root, requested));

  if (!filePath.startsWith(root)) {
    return null;
  }

  return filePath;
}

function handler(req, res) {
  if (req.method === "POST" && req.url === "/api/optimize") {
    optimizePrompt(req, res);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "Method not allowed");
    return;
  }

  const filePath = resolveFile(req.url || "/");

  if (!filePath) {
    send(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      send(res, 404, "Not found");
      return;
    }

    const type = mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    send(res, 200, content, type);
  });
}

if (require.main === module) {
  const server = http.createServer(handler);
  server.listen(port, () => {
    console.log(`Prompt Token Optimizer running at http://localhost:${port}`);
  });
}

module.exports = handler;
