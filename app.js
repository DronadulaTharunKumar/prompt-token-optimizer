const sourceText = document.querySelector("#sourceText");
const optimizedPrompt = document.querySelector("#optimizedPrompt");
const taskType = document.querySelector("#taskType");
const tone = document.querySelector("#tone");
const budget = document.querySelector("#budget");
const budgetLabel = document.querySelector("#budgetLabel");
const includeImage = document.querySelector("#includeImage");
const imageInput = document.querySelector("#imageInput");
const imageCard = document.querySelector("#imageCard");
const imageName = document.querySelector("#imageName");
const imageMeta = document.querySelector("#imageMeta");
const preview = document.querySelector("#preview");
const inputTokens = document.querySelector("#inputTokens");
const outputTokens = document.querySelector("#outputTokens");
const savedTokens = document.querySelector("#savedTokens");
const score = document.querySelector("#score");
const clarity = document.querySelector("#clarity");
const compression = document.querySelector("#compression");
const generateBtn = document.querySelector("#generateBtn");
const statusLine = document.querySelector("#statusLine");
const memoryList = document.querySelector("#memoryList");
const memoryCount = document.querySelector("#memoryCount");
const safetyScale = document.querySelector("#safetyScale");
const safetyLabel = document.querySelector("#safetyLabel");
const bypassThreshold = document.querySelector("#bypassThreshold");
const anchorTerms = document.querySelector("#anchorTerms");
const freezeBlocks = document.querySelector("#freezeBlocks");
const taskBadge = document.querySelector("#taskBadge");
const detectedTask = document.querySelector("#detectedTask");
const pipelineStatus = document.querySelector("#pipelineStatus");
const riskScore = document.querySelector("#riskScore");
const costBefore = document.querySelector("#costBefore");
const costAfter = document.querySelector("#costAfter");
const cacheStatus = document.querySelector("#cacheStatus");
const diffView = document.querySelector("#diffView");
const diffSummary = document.querySelector("#diffSummary");

let imageInfo = null;
let imageDataUrl = "";
let promptMemory = [];
const memoryKey = "prompt-token-optimizer-memory";
let lastPipeline = null;

const taskFrames = {
  answer: {
    role: "You are a senior domain expert.",
    output: "Give the final answer first, then the minimum reasoning needed to make it trustworthy."
  },
  code: {
    role: "You are a senior software engineer.",
    output: "Return the fix, explain key changes, and call out edge cases or tests."
  },
  image: {
    role: "You are a precise visual analysis assistant.",
    output: "Describe visible evidence, infer carefully, and separate facts from assumptions."
  },
  research: {
    role: "You are a research analyst.",
    output: "Summarize findings, compare options, cite source needs, and flag uncertainty."
  },
  summary: {
    role: "You are an expert editor.",
    output: "Produce a compact rewrite that preserves meaning and removes repetition."
  },
  creative: {
    role: "You are an award-winning creative director and prompt engineer.",
    output: "Deliver a polished, original result with sharp concept, sensory detail, and a useful rationale."
  }
};

const toneRules = {
  proCreative: "Think like a top-tier creative lead: specific, fresh, visual, emotionally clear, and free of generic AI phrasing.",
  expert: "Use concise expert language. Avoid generic disclaimers.",
  stepwise: "Work in numbered steps only where steps add clarity.",
  executive: "Use short sections, business impact, risks, and next action.",
  teacher: "Explain clearly with one example if it helps.",
  builder: "Be implementation-ready: include inputs, outputs, constraints, and checks."
};

const proCreativeRules = [
  "- Convert vague intent into a tight creative brief: audience, objective, mood, medium, constraints, and success criteria.",
  "- Make the output feel premium: concrete nouns, active verbs, vivid but controlled detail, no cliches.",
  "- Preserve the user's core idea, but improve framing, specificity, and taste.",
  "- Prefer one excellent direction over many weak options unless options are requested.",
  "- Include negative constraints: avoid generic AI tone, filler, overexplaining, and obvious stock phrases.",
  "- If details are missing, make reasonable assumptions and label them briefly."
];

const sampleText = [
  "Create a social media ad prompt for a premium AI productivity app.",
  "It should feel modern, clever, and trustworthy.",
  "Need caption, visual direction, and CTA.",
  "Target audience is founders and creators who want to save time."
].join(" ");

const fillerPatterns = [
  /\bplease\b/gi,
  /\bkindly\b/gi,
  /\bi want you to\b/gi,
  /\bcan you\b/gi,
  /\bmaybe\b/gi,
  /\bsort of\b/gi,
  /\bjust\b/gi,
  /\breally\b/gi,
  /\bvery\b/gi
];

function estimateTokens(text) {
  if (!text.trim()) return 0;
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

function parseAnchorTerms() {
  return anchorTerms.value
    .split(",")
    .map((term) => term.trim())
    .filter(Boolean);
}

function classifyTask(text) {
  const lower = text.toLowerCase();
  const trimmed = text.trim();

  if (/```|function\s+\w+|const\s+\w+\s*=|class\s+\w+|import\s+.+from|def\s+\w+\(|public\s+class/.test(text)) {
    return "Code";
  }

  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    return "JSON";
  }

  if (/\b(solve|equation|proof|calculate|derivative|integral|matrix|probability)\b/.test(lower) || /[=+\-*/^]\s*\d/.test(text)) {
    return "Math";
  }

  if (/\b(summarize|rewrite|compress|shorten|extract)\b/.test(lower)) {
    return "Summary";
  }

  if (/\b(ad|brand|caption|creative|story|script|campaign|visual|design|copy)\b/.test(lower)) {
    return "Creative";
  }

  if (/\b(research|compare|sources|market|competitor|analysis)\b/.test(lower)) {
    return "Research";
  }

  return "General";
}

function getSafetyProfile() {
  const value = Number(safetyScale.value);
  if (value <= 20) return { label: "Ultra-conservative", value };
  if (value <= 45) return { label: "Balanced", value };
  if (value <= 70) return { label: "Assertive", value };
  return { label: "Aggressive", value };
}

function splitFreezeBlocks(text) {
  if (!freezeBlocks.checked) {
    return [{ type: "editable", text }];
  }

  const blocks = [];
  const pattern = /(\[FREEZE\][\s\S]*?\[\/FREEZE\]|```[\s\S]*?```)/gi;
  let cursor = 0;
  let match;

  while ((match = pattern.exec(text))) {
    if (match.index > cursor) {
      blocks.push({ type: "editable", text: text.slice(cursor, match.index) });
    }
    blocks.push({ type: "frozen", text: match[0] });
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    blocks.push({ type: "editable", text: text.slice(cursor) });
  }

  return blocks.length ? blocks : [{ type: "editable", text }];
}

function stripCodeSafely(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^\s*#(?!include|define|!|region).*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function protectAnchors(text, anchors) {
  const protectedMap = new Map();
  let protectedText = text;

  anchors.forEach((anchor, index) => {
    const token = `__ANCHOR_${index}__`;
    const escaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    protectedMap.set(token, anchor);
    protectedText = protectedText.replace(new RegExp(escaped, "g"), token);
  });

  return { protectedText, protectedMap };
}

function restoreAnchors(text, protectedMap) {
  let restored = text;
  protectedMap.forEach((anchor, token) => {
    restored = restored.replaceAll(token, anchor);
  });
  return restored;
}

function compressEditableText(text, task, safetyValue) {
  const anchors = parseAnchorTerms();
  const { protectedText, protectedMap } = protectAnchors(text, anchors);
  let compressed = protectedText.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

  if (task === "Code") {
    return restoreAnchors(stripCodeSafely(compressed), protectedMap);
  }

  if (task === "JSON" || task === "Math") {
    return restoreAnchors(compressed, protectedMap);
  }

  if (safetyValue > 25) {
    compressed = compressed
      .replace(/\b(please|kindly|really|very|just|maybe|sort of|I want you to|can you)\b/gi, "")
      .replace(/\s{2,}/g, " ");
  }

  if (safetyValue > 45) {
    compressed = compressed
      .split(/(?<=[.!?])\s+/)
      .filter((sentence, index, list) => {
        const key = sentence.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 70);
        return key && list.findIndex((other) => other.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 70) === key) === index;
      })
      .join(" ");
  }

  if (safetyValue > 70) {
    const sentences = compressed.split(/(?<=[.!?])\s+/).filter(Boolean);
    compressed = sentences.slice(0, Math.max(4, Math.ceil(sentences.length * 0.62))).join(" ");
  }

  return restoreAnchors(compressed.trim(), protectedMap);
}

function runOptimizationPipeline() {
  const original = sourceText.value.trim();
  const inputTokenCount = estimateTokens(original);
  const threshold = Number(bypassThreshold.value || 0);
  const task = classifyTask(original);
  const safety = getSafetyProfile();
  const strictTask = task === "JSON" || task === "Math";
  const route = inputTokenCount < threshold
    ? "Bypassed: under threshold"
    : strictTask
      ? "Protected: strict syntax"
      : "Heuristic-first compression";

  let optimizedInput = original;
  let frozenCount = 0;

  if (original && route === "Heuristic-first compression") {
    optimizedInput = splitFreezeBlocks(original)
      .map((block) => {
        if (block.type === "frozen") {
          frozenCount += 1;
          return block.text;
        }
        return compressEditableText(block.text, task, safety.value);
      })
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  if (!optimizedInput) {
    optimizedInput = original;
  }

  lastPipeline = {
    original,
    optimizedInput,
    task,
    route,
    safety,
    frozenCount,
    inputTokenCount,
    outputTokenCount: estimateTokens(optimizedInput),
    anchors: parseAnchorTerms()
  };

  updateMarketDashboard(lastPipeline);
  renderDiff(original, optimizedInput);
  return lastPipeline;
}

function cleanInput(text) {
  let cleaned = text.replace(/\s+/g, " ").trim();
  fillerPatterns.forEach((pattern) => {
    cleaned = cleaned.replace(pattern, "");
  });
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();

  const sentences = cleaned
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const unique = [];
  const seen = new Set();
  sentences.forEach((sentence) => {
    const key = sentence.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 90);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(sentence);
    }
  });

  return unique.join(" ");
}

function trimToBudget(text, maxTokens) {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  const trimmed = text.slice(0, maxChars);
  const lastStop = Math.max(trimmed.lastIndexOf("."), trimmed.lastIndexOf("\n"));
  return `${trimmed.slice(0, lastStop > 120 ? lastStop + 1 : maxChars).trim()}\n\n[Continue only if needed.]`;
}

function buildImageInstruction() {
  if (!includeImage.checked) return "";
  if (!imageInfo) {
    return "- If an image is provided, inspect it directly and mention only visible evidence.";
  }
  return `- Image context: ${imageInfo.name}, ${imageInfo.width}x${imageInfo.height}px, ${imageInfo.type}. Inspect it directly; do not guess hidden details.`;
}

function buildPrompt() {
  const cleaned = cleanInput(sourceText.value);
  const frame = taskFrames[taskType.value];
  const imageLine = buildImageInstruction();
  const isProCreative = tone.value === "proCreative" || taskType.value === "creative";
  const userGoal = cleaned || "Create a polished creative output from the provided text or image context.";
  const requirements = [
    `- ${toneRules[tone.value]}`,
    "- Prioritize accuracy, specificity, and useful structure.",
    "- Ask one clarifying question only if the task cannot be completed safely.",
    "- Remove filler, repetition, and vague phrasing."
  ];

  if (isProCreative) {
    requirements.push(...proCreativeRules);
  }

  if (imageLine) {
    requirements.push(imageLine);
  }

  const prompt = [
    frame.role,
    "",
    "Creative Task:",
    userGoal,
    "",
    "Requirements:",
    ...requirements,
    "",
    "Output:",
    `- ${frame.output}`,
    "- Format with clear headings.",
    "- Keep the response compact but high-signal."
  ].filter(Boolean).join("\n");

  return trimToBudget(prompt, Number(budget.value));
}

function updateMetrics() {
  const original = sourceText.value;
  const optimized = optimizedPrompt.value;
  const inTokens = estimateTokens(original);
  const outTokens = estimateTokens(optimized);
  const saved = inTokens > 0 ? Math.max(0, Math.round((1 - outTokens / inTokens) * 100)) : 0;
  const hasSpecifics = /\b(who|what|when|where|why|how|requirements|output|task)\b/i.test(optimized);
  const hasImage = includeImage.checked && (imageInfo || taskType.value === "image");
  const nextScore = Math.min(100, 42 + Math.min(35, optimized.length / 18) + (hasSpecifics ? 13 : 0) + (hasImage ? 10 : 0));

  inputTokens.textContent = String(inTokens);
  outputTokens.textContent = String(outTokens);
  savedTokens.textContent = `${saved}%`;
  if (!lastPipeline) {
    compression.textContent = `${saved}%`;
  }
  score.textContent = optimized ? String(Math.round(nextScore)) : "0";
  clarity.textContent = optimized ? (nextScore > 82 ? "Strong" : nextScore > 65 ? "Good" : "Basic") : "Waiting";
}

function estimateCost(tokens) {
  const costPerMillionTokens = 0.10;
  return (tokens * costPerMillionTokens) / 1_000_000;
}

function getRiskLabel(pipeline) {
  if (!pipeline.original) return "Low";
  if (pipeline.task === "Code" && pipeline.safety.value > 45) return "High";
  if ((pipeline.task === "JSON" || pipeline.task === "Math") && pipeline.route.includes("compression")) return "High";
  const reduction = pipeline.inputTokenCount
    ? 1 - pipeline.outputTokenCount / pipeline.inputTokenCount
    : 0;
  if (reduction > 0.45 || pipeline.safety.value > 75) return "High";
  if (reduction > 0.2 || pipeline.safety.value > 45) return "Medium";
  return "Low";
}

function updateMarketDashboard(pipeline) {
  const activePipeline = pipeline || lastPipeline || runOptimizationPipeline();
  const reduction = activePipeline.inputTokenCount
    ? Math.max(0, Math.round((1 - activePipeline.outputTokenCount / activePipeline.inputTokenCount) * 100))
    : 0;

  detectedTask.textContent = activePipeline.task;
  taskBadge.textContent = activePipeline.task;
  pipelineStatus.textContent = activePipeline.route;
  riskScore.textContent = getRiskLabel(activePipeline);
  costBefore.textContent = `$${estimateCost(activePipeline.inputTokenCount).toFixed(5)}`;
  costAfter.textContent = `$${estimateCost(activePipeline.outputTokenCount).toFixed(5)}`;
  cacheStatus.textContent = activePipeline.frozenCount
    ? `${activePipeline.frozenCount} frozen block${activePipeline.frozenCount === 1 ? "" : "s"}`
    : freezeBlocks.checked ? "Cache-ready" : "Dynamic";
  compression.textContent = `${reduction}%`;
}

function renderDiff(original, optimized) {
  diffView.innerHTML = "";
  const originalLines = original.split(/\r?\n/).filter((line) => line.trim());
  const optimizedLines = optimized.split(/\r?\n/).filter((line) => line.trim());
  const maxLines = Math.max(originalLines.length, optimizedLines.length);
  let changes = 0;

  if (!original && !optimized) {
    const line = document.createElement("p");
    line.className = "diff-line diff-same";
    line.textContent = "Run the optimizer to see changes.";
    diffView.appendChild(line);
    diffSummary.textContent = "No changes yet";
    return;
  }

  for (let index = 0; index < maxLines; index += 1) {
    const before = originalLines[index] || "";
    const after = optimizedLines[index] || "";

    if (before === after) {
      const same = document.createElement("p");
      same.className = "diff-line diff-same";
      same.textContent = `  ${before}`;
      diffView.appendChild(same);
      continue;
    }

    changes += 1;

    if (before) {
      const removed = document.createElement("p");
      removed.className = "diff-line diff-removed";
      removed.textContent = `- ${before}`;
      diffView.appendChild(removed);
    }

    if (after) {
      const added = document.createElement("p");
      added.className = "diff-line diff-added";
      added.textContent = `+ ${after}`;
      diffView.appendChild(added);
    }
  }

  diffSummary.textContent = `${changes} changed line${changes === 1 ? "" : "s"}`;
}

function loadMemory() {
  try {
    promptMemory = JSON.parse(localStorage.getItem(memoryKey) || "[]");
  } catch (error) {
    promptMemory = [];
  }
  renderMemory();
}

function persistMemory() {
  localStorage.setItem(memoryKey, JSON.stringify(promptMemory));
}

function summarize(text, length = 130) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > length ? `${compact.slice(0, length).trim()}...` : compact;
}

function getMemoryTitle(text) {
  const firstLine = text.split("\n").find((line) => line.trim()) || "Saved prompt";
  return summarize(firstLine.replace(/^#+\s*/, ""), 62);
}

function renderMemory() {
  memoryCount.textContent = `${promptMemory.length} saved prompt${promptMemory.length === 1 ? "" : "s"}`;
  memoryList.innerHTML = "";

  if (!promptMemory.length) {
    const empty = document.createElement("p");
    empty.className = "memory-empty";
    empty.textContent = "Saved prompts will appear here.";
    memoryList.appendChild(empty);
    return;
  }

  promptMemory.forEach((item) => {
    const card = document.createElement("article");
    card.className = "memory-item";

    const title = document.createElement("h3");
    title.textContent = item.title;

    const previewText = document.createElement("p");
    previewText.textContent = summarize(item.prompt);

    const meta = document.createElement("div");
    meta.className = "memory-meta";
    meta.innerHTML = `<small>${item.taskType}</small><small>${new Date(item.createdAt).toLocaleDateString()}</small>`;

    const actions = document.createElement("div");
    actions.className = "memory-actions";

    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.textContent = "Load";
    loadBtn.addEventListener("click", () => loadSavedPrompt(item.id));

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(item.prompt);
      setStatus("Saved prompt copied.", "success");
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => deleteSavedPrompt(item.id));

    actions.append(loadBtn, copyBtn, deleteBtn);
    card.append(title, previewText, meta, actions);
    memoryList.appendChild(card);
  });
}

function savePrompt() {
  if (!optimizedPrompt.value.trim()) {
    generatePrompt();
  }

  const prompt = optimizedPrompt.value.trim();
  const existingIndex = promptMemory.findIndex((item) => item.prompt === prompt);
  const saved = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    title: getMemoryTitle(prompt),
    prompt,
    source: sourceText.value,
    taskType: taskType.value,
    tone: tone.value,
    budget: Number(budget.value),
    pipeline: lastPipeline,
    createdAt: new Date().toISOString()
  };

  if (existingIndex >= 0) {
    promptMemory.splice(existingIndex, 1);
  }

  promptMemory.unshift(saved);
  promptMemory = promptMemory.slice(0, 30);
  persistMemory();
  renderMemory();
  setStatus("Prompt saved to memory.", "success");
}

function loadSavedPrompt(id) {
  const item = promptMemory.find((entry) => entry.id === id);
  if (!item) return;

  sourceText.value = item.source || "";
  optimizedPrompt.value = item.prompt;
  taskType.value = item.taskType || "creative";
  tone.value = item.tone || "proCreative";
  budget.value = item.budget || 650;
  budgetLabel.textContent = `${budget.value} tokens`;
  updateMetrics();
  setStatus("Saved prompt loaded.", "success");
  runOptimizationPipeline();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteSavedPrompt(id) {
  promptMemory = promptMemory.filter((item) => item.id !== id);
  persistMemory();
  renderMemory();
  setStatus("Saved prompt deleted.", "success");
}

function exportMemory() {
  const blob = new Blob([JSON.stringify(promptMemory, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "prompt-memory.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

function clearMemory() {
  promptMemory = [];
  persistMemory();
  renderMemory();
  setStatus("Prompt memory cleared.", "success");
}

function generatePrompt() {
  const pipeline = runOptimizationPipeline();
  const originalValue = sourceText.value;
  if (pipeline.optimizedInput) {
    sourceText.value = pipeline.optimizedInput;
  }
  optimizedPrompt.value = buildPrompt();
  sourceText.value = originalValue;
  setStatus("Local fallback prompt generated.", "success");
  updateMetrics();
  updateMarketDashboard(pipeline);
}

function setStatus(message, state = "") {
  statusLine.textContent = message;
  if (state) {
    statusLine.dataset.state = state;
  } else {
    delete statusLine.dataset.state;
  }
}

async function generateAiPrompt() {
  const pipeline = runOptimizationPipeline();
  const originalValue = sourceText.value;
  if (pipeline.optimizedInput) {
    sourceText.value = pipeline.optimizedInput;
  }
  const fallback = buildPrompt();
  sourceText.value = originalValue;
  optimizedPrompt.value = fallback;
  updateMetrics();

  generateBtn.disabled = true;
  generateBtn.textContent = "Optimizing...";
  setStatus("Calling AI optimizer securely from the local server...");

  try {
    const response = await fetch("/api/optimize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: pipeline.optimizedInput || sourceText.value,
        taskType: taskType.value,
        tone: tone.value,
        budget: Number(budget.value),
        imageDataUrl: includeImage.checked ? imageDataUrl : ""
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "AI optimization failed.");
    }

    optimizedPrompt.value = data.optimized || fallback;
    setStatus(`AI optimized with ${data.provider || "AI"}: ${data.model}.`, "success");
    updateMetrics();
    updateMarketDashboard(pipeline);
  } catch (error) {
    optimizedPrompt.value = fallback;
    setStatus(`${error.message} Using local fallback.`, "error");
    updateMetrics();
    updateMarketDashboard(pipeline);
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = "Create pro prompt";
  }
}

function copyPrompt() {
  if (!optimizedPrompt.value) generatePrompt();
  navigator.clipboard.writeText(optimizedPrompt.value);
}

function downloadPrompt() {
  if (!optimizedPrompt.value) generatePrompt();
  const blob = new Blob([optimizedPrompt.value], { type: "text/plain" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "optimized-prompt.txt";
  link.click();
  URL.revokeObjectURL(link.href);
}

function clearAll() {
  sourceText.value = "";
  optimizedPrompt.value = "";
  imageInput.value = "";
  imageInfo = null;
  imageDataUrl = "";
  imageCard.hidden = true;
  setStatus("Local fallback ready. Add free Groq API key for AI optimization.");
  updateMetrics();
}

function useSample() {
  sourceText.value = sampleText;
  taskType.value = "creative";
  tone.value = "proCreative";
  budget.value = 650;
  budgetLabel.textContent = "650 tokens";
  generatePrompt();
}

function readImage(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    imageDataUrl = String(reader.result);
    preview.src = imageDataUrl;
    const img = new Image();
    img.onload = () => {
      imageInfo = {
        name: file.name,
        type: file.type || "image",
        width: img.naturalWidth,
        height: img.naturalHeight
      };
      imageName.textContent = file.name;
      imageMeta.textContent = `${img.naturalWidth} x ${img.naturalHeight}px, ${Math.ceil(file.size / 1024)} KB`;
      imageCard.hidden = false;
      generatePrompt();
    };
    img.src = imageDataUrl;
  };
  reader.readAsDataURL(file);
}

budget.addEventListener("input", () => {
  budgetLabel.textContent = `${budget.value} tokens`;
  if (optimizedPrompt.value) generatePrompt();
});

function refreshPipelinePreview() {
  safetyLabel.textContent = getSafetyProfile().label;
  runOptimizationPipeline();
  updateMetrics();
}

sourceText.addEventListener("input", refreshPipelinePreview);
taskType.addEventListener("change", generatePrompt);
tone.addEventListener("change", generatePrompt);
includeImage.addEventListener("change", generatePrompt);
imageInput.addEventListener("change", (event) => readImage(event.target.files[0]));
safetyScale.addEventListener("input", refreshPipelinePreview);
bypassThreshold.addEventListener("input", refreshPipelinePreview);
anchorTerms.addEventListener("input", refreshPipelinePreview);
freezeBlocks.addEventListener("change", refreshPipelinePreview);
generateBtn.addEventListener("click", generateAiPrompt);
document.querySelector("#runLocalBtn").addEventListener("click", generatePrompt);
document.querySelector("#sampleBtn").addEventListener("click", useSample);
document.querySelector("#saveBtn").addEventListener("click", savePrompt);
document.querySelector("#copyBtn").addEventListener("click", copyPrompt);
document.querySelector("#downloadBtn").addEventListener("click", downloadPrompt);
document.querySelector("#clearBtn").addEventListener("click", clearAll);
document.querySelector("#exportMemoryBtn").addEventListener("click", exportMemory);
document.querySelector("#clearMemoryBtn").addEventListener("click", clearMemory);

loadMemory();
safetyLabel.textContent = getSafetyProfile().label;
useSample();
