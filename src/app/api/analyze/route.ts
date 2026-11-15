import { NextRequest, NextResponse } from "next/server";
import { analyze } from "@/lib/analyze";
import { getPowerData } from "@/lib/saved";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lon = Number(sp.get("lon"));
  const name = (sp.get("name") ?? "Selected place").slice(0, 120);

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: "Enter a valid place." }, { status: 400 });
  }

  try {
    const { raw, endYear, source, savedAt } = await getPowerData(lat, lon, sp.get("source") === "saved");
    return NextResponse.json(analyze(raw, { name, lat, lon }, endYear, source, savedAt));
  } catch {
    return NextResponse.json(
      { error: "NASA's data service didn't respond. Try again in a moment." },
      { status: 502 },
    );
  }
}
