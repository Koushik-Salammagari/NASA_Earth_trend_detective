import { NextRequest, NextResponse } from "next/server";

// Asks Google Gemini to explain the already-computed results in plain English.
// The statistics are computed by the app; the AI only explains them.
export const maxDuration = 60;

const API = "https://generativelanguage.googleapis.com/v1beta";

interface ExplainBody {
  place: string;
  period: string;
  findings: string[];
  drivers: string[];
}

let cachedModel: string | null = null;

// Lists text models this key can use, best first: fast "lite" and "flash" models (they respond
// quickly and have the most generous free limits), stable before preview, newer before older.
async function candidateModels(key: string): Promise<string[]> {
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
  return usable.sort((a, b) => score(b) - score(a));
}

// Short summaries don't need extended reasoning; keep "thinking" minimal so answers come back fast.
function thinkingConfig(model: string) {
  const v = Number(model.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  if (v >= 3) return { thinkingLevel: "low" };
  if (v >= 2.5) return { thinkingBudget: 0 };
  return undefined;
}

async function generate(key: string, model: string, prompt: string) {
  const call = (withThinking: boolean) => {
    const tc = withThinking ? thinkingConfig(model) : undefined;
    return fetch(`${API}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048, ...(tc ? { thinkingConfig: tc } : {}) },
      }),
      signal: AbortSignal.timeout(15000),
    });
  };
  const res = await call(true);
  // Some models reject thinking settings; retry once without them.
  return res.status === 400 ? call(false) : res;
}

export async function POST(req: NextRequest) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ text: null, reason: "AI explanation isn't configured." });

  let body: ExplainBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const clip = (s: unknown, n: number) => String(s ?? "").slice(0, n);
  const findings = (Array.isArray(body.findings) ? body.findings : []).slice(0, 12).map((f) => clip(f, 300));
  const drivers = (Array.isArray(body.drivers) ? body.drivers : []).slice(0, 8).map((d) => clip(d, 300));

  const prompt = `You are a careful climate science communicator writing for high school and college students.
Explain what has changed in ${clip(body.place, 120)} using ONLY the facts below, computed from NASA POWER data (${clip(body.period, 80)}).

Facts:
${findings.map((f) => `- ${f}`).join("\n")}

Possible drivers the app detected (changes that happened together, not proven causes):
${drivers.length ? drivers.map((d) => `- ${d}`).join("\n") : "- None detected"}

Write exactly three short paragraphs in plain text, no markdown, no bullet points, no headings:
1. The headline: the two or three most important changes, with their numbers.
2. What might be behind them: connect the possible drivers using physical reasoning. Use words like "may", "suggests" or "is consistent with". Never claim a single proven cause.
3. Why it matters for people living there, and one honest limitation (for example, about 50 km resolution or that some trends aren't statistically significant).
Do not invent numbers, events, or places that aren't in the facts. Keep it under 170 words.`;

  const tried: string[] = [];
  try {
    const preferred = process.env.GEMINI_MODEL || cachedModel;
    const list = preferred ? [preferred] : [];
    if (!process.env.GEMINI_MODEL) {
      for (const m of await candidateModels(key)) if (!list.includes(m)) list.push(m);
    }
    if (!list.length) return NextResponse.json({ text: null, reason: "No usable AI model found for this key." }, { status: 502 });

    // Try up to three models, moving on if one is unavailable, rate-limited or too slow.
    for (const model of list.slice(0, 3)) {
      tried.push(model);
      try {
        const res = await generate(key, model, prompt);
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
        return NextResponse.json({ text, model });
      } catch {
        tried[tried.length - 1] += " (timeout)";
        continue;
      }
    }
    cachedModel = null;
    return NextResponse.json({ text: null, tried, reason: "AI service didn't respond." }, { status: 502 });
  } catch {
    return NextResponse.json({ text: null, tried, reason: "AI service didn't respond." }, { status: 502 });
  }
}
