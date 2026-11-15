import { NextRequest, NextResponse } from "next/server";
import { geminiGenerate } from "@/lib/gemini";
import { factCheck } from "@/lib/factcheck";

// Asks Gemini to explain the already-computed results in plain English, then checks every number.
export const maxDuration = 60;

interface ExplainBody {
  place: string;
  period: string;
  findings: string[];
  drivers: string[];
  yearRange?: [number, number];
}

export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ text: null, reason: "AI explanation isn't configured." });

  let body: ExplainBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const clip = (s: unknown, n: number) => String(s ?? "").slice(0, n);
  const findings = (Array.isArray(body.findings) ? body.findings : []).slice(0, 12).map((f) => clip(f, 300));
  const drivers = (Array.isArray(body.drivers) ? body.drivers : []).slice(0, 8).map((d) => clip(d, 300));
  const yearRange: [number, number] =
    Array.isArray(body.yearRange) && body.yearRange.length === 2 ? [Number(body.yearRange[0]), Number(body.yearRange[1])] : [1981, new Date().getUTCFullYear() - 1];

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
Only use numbers that appear in the facts, copied exactly. Do not invent numbers, events, or places. Keep it under 170 words.`;

  const ai = await geminiGenerate({ prompt, temperature: 0.2 });
  if (!ai.text) {
    return NextResponse.json({ text: null, tried: ai.tried, reason: "AI service didn't respond." }, { status: 502 });
  }
  const check = factCheck(ai.text, findings, yearRange);
  return NextResponse.json({ text: check.text, model: ai.model, check: { checked: check.checked, verified: check.verified, removed: check.removed } });
}
