import { NextRequest, NextResponse } from "next/server";

// Asks Google Gemini to explain the already-computed results in plain English.
// The statistics are computed by the app; the AI only explains them.
export const maxDuration = 30;

interface ExplainBody {
  place: string;
  period: string;
  findings: string[];
  drivers: string[];
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

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 600 },
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) {
      return NextResponse.json({ text: null, reason: `AI service returned ${res.status}.` }, { status: 502 });
    }
    const json = await res.json();
    const text: string =
      json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("").trim() ?? "";
    return NextResponse.json({ text: text || null });
  } catch {
    return NextResponse.json({ text: null, reason: "AI service didn't respond." }, { status: 502 });
  }
}
