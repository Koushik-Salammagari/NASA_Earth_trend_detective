import { NextRequest, NextResponse } from "next/server";
import { geminiGenerate } from "@/lib/gemini";
import { factCheck } from "@/lib/factcheck";
import { PERSONAS } from "@/lib/personas";

export const maxDuration = 60;


export async function POST(req: NextRequest) {
  let body: { place?: string; persona?: string; facts?: string[]; yearRange?: [number, number] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const persona = PERSONAS.find((p) => p === body.persona);
  if (!persona) return NextResponse.json({ error: "Pick who you are." }, { status: 400 });
  const facts = (Array.isArray(body.facts) ? body.facts : []).slice(0, 20).map((f) => String(f).slice(0, 400));
  if (!facts.length) return NextResponse.json({ error: "Run an investigation first." }, { status: 400 });
  const place = String(body.place ?? "this place").slice(0, 120);
  const yearRange: [number, number] =
    Array.isArray(body.yearRange) && body.yearRange.length === 2 ? [Number(body.yearRange[0]), Number(body.yearRange[1])] : [1981, new Date().getUTCFullYear() - 1];

  const started = Date.now();
  const ai = await geminiGenerate({
    temperature: 0.3,
    prompt: `Translate these verified NASA climate findings for ${place} into practical meaning for a ${persona.toLowerCase()} who lives there.

Findings (the only information you may use):
${facts.map((f) => `- ${f}`).join("\n")}

Write exactly three short sentences, each on its own line, each about one concrete way these changes may affect a ${persona.toLowerCase()}. Then one final line starting with "Try this:" giving one practical, low-cost step.
Plain text only, no markdown or bullet symbols. Copy any numbers exactly from the findings; never invent numbers. Use "may" for impacts that aren't certain. Under 110 words.`,
  });
  if (!ai.text) return NextResponse.json({ text: null, reason: "AI service didn't respond.", tried: ai.tried }, { status: 502 });

  // Treat each line as its own paragraph so the fact-checker can remove a single bad line.
  const fc = factCheck(ai.text.split(/\n+/).join("\n\n"), facts, yearRange);
  return NextResponse.json({
    text: fc.text,
    model: ai.model,
    check: { checked: fc.checked, verified: fc.verified, removed: fc.removed },
    ms: Date.now() - started,
  });
}
