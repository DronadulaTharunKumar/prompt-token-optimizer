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

let imageInfo = null;

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
  compression.textContent = `${saved}%`;
  score.textContent = optimized ? String(Math.round(nextScore)) : "0";
  clarity.textContent = optimized ? (nextScore > 82 ? "Strong" : nextScore > 65 ? "Good" : "Basic") : "Waiting";
}

function generatePrompt() {
  optimizedPrompt.value = buildPrompt();
  updateMetrics();
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
  imageCard.hidden = true;
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
    preview.src = reader.result;
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
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

budget.addEventListener("input", () => {
  budgetLabel.textContent = `${budget.value} tokens`;
  if (optimizedPrompt.value) generatePrompt();
});

sourceText.addEventListener("input", updateMetrics);
taskType.addEventListener("change", generatePrompt);
tone.addEventListener("change", generatePrompt);
includeImage.addEventListener("change", generatePrompt);
imageInput.addEventListener("change", (event) => readImage(event.target.files[0]));
document.querySelector("#generateBtn").addEventListener("click", generatePrompt);
document.querySelector("#sampleBtn").addEventListener("click", useSample);
document.querySelector("#copyBtn").addEventListener("click", copyPrompt);
document.querySelector("#downloadBtn").addEventListener("click", downloadPrompt);
document.querySelector("#clearBtn").addEventListener("click", clearAll);

useSample();
