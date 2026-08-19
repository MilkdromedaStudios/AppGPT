export const PROVIDERS = {
  openai: { name: "OpenAI", kind: "openai-compatible", baseUrl: "https://api.openai.com/v1", model: "gpt-5-mini", hint: "OpenAI Responses-compatible chat endpoint" },
  openrouter: { name: "OpenRouter", kind: "openai-compatible", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-5-mini", hint: "Many providers through one API" },
  groq: { name: "Groq", kind: "openai-compatible", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", hint: "Fast OpenAI-compatible inference" },
  deepseek: { name: "DeepSeek", kind: "openai-compatible", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", hint: "OpenAI-compatible API" },
  mistral: { name: "Mistral", kind: "openai-compatible", baseUrl: "https://api.mistral.ai/v1", model: "mistral-small-latest", hint: "Mistral chat completions" },
  together: { name: "Together AI", kind: "openai-compatible", baseUrl: "https://api.together.xyz/v1", model: "meta-llama/Llama-3.3-70B-Instruct-Turbo", hint: "Open-source model hosting" },
  xai: { name: "xAI", kind: "openai-compatible", baseUrl: "https://api.x.ai/v1", model: "grok-3-mini", hint: "OpenAI-style chat API" },
  gemini: { name: "Google Gemini", kind: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.5-flash", hint: "Google Generative Language API" },
  anthropic: { name: "Anthropic", kind: "anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4-0", hint: "Claude Messages API" },
  custom: { name: "Custom OpenAI-compatible", kind: "openai-compatible", baseUrl: "https://example.com/v1", model: "your-model", hint: "Any compatible /chat/completions endpoint" }
};

function trimSlash(url) { return String(url || "").replace(/\/+$/, ""); }

export async function callProvider(config, messages, { temperature = 0.4, maxTokens = 7000 } = {}) {
  if (!config?.apiKey) throw new Error("Add an API key first.");
  if (!config?.model) throw new Error("Choose a model first.");
  if (config.kind === "gemini") return callGemini(config, messages, temperature, maxTokens);
  if (config.kind === "anthropic") return callAnthropic(config, messages, temperature, maxTokens);
  return callOpenAICompatible(config, messages, temperature, maxTokens);
}

async function callOpenAICompatible(config, messages, temperature, maxTokens) {
  const response = await fetch(`${trimSlash(config.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`,
      ...(config.provider === "openrouter" ? { "HTTP-Referer": location.origin, "X-Title": "AppGPT" } : {})
    },
    body: JSON.stringify({ model: config.model, messages, temperature, max_tokens: maxTokens })
  });
  const data = await safeJson(response);
  if (!response.ok) throw new Error(extractError(data, response.status));
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Provider returned an empty response.");
  return text;
}

async function callGemini(config, messages, temperature, maxTokens) {
  const system = messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
  const contents = messages.filter(m => m.role !== "system").map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const response = await fetch(`${trimSlash(config.baseUrl)}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), contents, generationConfig: { temperature, maxOutputTokens: maxTokens } })
  });
  const data = await safeJson(response);
  if (!response.ok) throw new Error(extractError(data, response.status));
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("");
  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}

async function callAnthropic(config, messages, temperature, maxTokens) {
  const system = messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
  const claudeMessages = messages.filter(m => m.role !== "system").map(m => ({ role: m.role, content: m.content }));
  const response = await fetch(`${trimSlash(config.baseUrl)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": config.apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model: config.model, max_tokens: maxTokens, temperature, ...(system ? { system } : {}), messages: claudeMessages })
  });
  const data = await safeJson(response);
  if (!response.ok) throw new Error(extractError(data, response.status));
  const text = data?.content?.filter(x => x.type === "text").map(x => x.text).join("\n");
  if (!text) throw new Error("Anthropic returned an empty response.");
  return text;
}

async function safeJson(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { error: { message: text || response.statusText } }; }
}
function extractError(data, status) {
  return data?.error?.message || data?.message || `Request failed (${status}). This provider may block direct browser requests.`;
}
