// Shared Google Gemini client: picks a model the key can use, keeps "thinking" minimal for speed,
// and falls back across up to three models if one is unavailable or slow.
const API = "https://generativelanguage.googleapis.com/v1beta";

let cachedModel: string | null = null;
let cachedList: { at: number; models: string[] } | null = null;

async function candidateModels(key: string): Promise<string[]> {
  if (cachedList && Date.now() - cachedList.at < 60 * 60 * 1000) return cachedList.models;
  const res = await fetch(`${API}/models?pageSize=200`, {
    headers: { "x-goog-api-key": key },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const json = await res.json();
  const models: { name: string; supportedGenerationMethods?: string[] }[] = json.models ?? [];
  const usable = models
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((n) => n.startsWith("gemini") && !/(image|tts|audio|live|embedding|vision|robotics|computer|pro)/.test(n));
  const version = (n: string) => Number(n.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  const score = (n: string) =>
    (n.includes("flash-lite") ? 200 : n.includes("flash") ? 150 : 0) +
    (/(preview|exp)/.test(n) ? -100 : 0) +
    (/-latest$/.test(n) ? -5 : 0) +
    version(n);
  const sorted = usable.sort((a, b) => score(b) - score(a));
  cachedList = { at: Date.now(), models: sorted };
  return sorted;
}

function thinkingConfig(model: string) {
  const v = Number(model.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  if (v >= 3) return { thinkingLevel: "low" };
  if (v >= 2.5) return { thinkingBudget: 0 };
  return undefined;
}

export interface GeminiResult {
  text: string | null;
  model: string | null;
  tried: string[];
  ms: number;
}

export async function geminiGenerate(opts: {
  prompt: string;
  temperature?: number;
  schema?: object; // Gemini responseSchema; when set, the model must return JSON in this shape
  timeoutMs?: number;
}): Promise<GeminiResult> {
  const started = Date.now();
  const key = process.env.GEMINI_API_KEY;
  const tried: string[] = [];
  if (!key) return { text: null, model: null, tried, ms: 0 };

  const preferred = process.env.GEMINI_MODEL || cachedModel;
  const list = preferred ? [preferred] : [];
  if (!process.env.GEMINI_MODEL) {
    try {
      for (const m of await candidateModels(key)) if (!list.includes(m)) list.push(m);
    } catch {
      /* model listing failed; use what we have */
    }
  }

  for (const model of list.slice(0, 3)) {
    tried.push(model);
    const body = (withThinking: boolean) => {
      const tc = withThinking ? thinkingConfig(model) : undefined;
      return JSON.stringify({
        contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
        generationConfig: {
          temperature: opts.temperature ?? 0.3,
          maxOutputTokens: 2048,
          ...(opts.schema ? { responseMimeType: "application/json", responseSchema: opts.schema } : {}),
          ...(tc ? { thinkingConfig: tc } : {}),
        },
      });
    };
    try {
      const call = (withThinking: boolean) =>
        fetch(`${API}/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: body(withThinking),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
        });
      let res = await call(true);
      if (res.status === 400) res = await call(false);
      if (!res.ok) {
        tried[tried.length - 1] += ` (${res.status})`;
        continue;
      }
      const json = await res.json();
      const text: string =
        json?.candidates?.[0]?.content?.parts
          ?.filter((p: { thought?: boolean }) => !p.thought)
          .map((p: { text?: string }) => p.text ?? "")
          .join("")
          .trim() ?? "";
      if (!text) {
        tried[tried.length - 1] += " (empty)";
        continue;
      }
      cachedModel = model;
      return { text, model, tried, ms: Date.now() - started };
    } catch {
      tried[tried.length - 1] += " (timeout)";
    }
  }
  cachedModel = null;
  return { text: null, model: null, tried, ms: Date.now() - started };
}
