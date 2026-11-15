import { NextRequest, NextResponse } from "next/server";
import { investigate } from "@/lib/investigate";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { question?: string; lat?: number; lon?: number; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  const question = String(body.question ?? "").trim();
  if (!question || question.length < 4) return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: "Pick a place first." }, { status: 400 });
  }

  try {
    const result = await investigate({ question, lat, lon, name: String(body.name ?? "Selected place").slice(0, 120) });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "The investigation couldn't finish. NASA's service may be busy; try again." }, { status: 502 });
  }
}
