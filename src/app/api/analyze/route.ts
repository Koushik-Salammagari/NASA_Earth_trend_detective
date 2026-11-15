import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { fetchPowerMonthly, powerEndYear, type MonthlyRaw } from "@/lib/power";
import { analyze } from "@/lib/analyze";

export const maxDuration = 60;

const savedPath = (lat: number, lon: number) =>
  path.join(process.cwd(), "data", "saved", `${lat.toFixed(2)}_${lon.toFixed(2)}.json`);

async function readSaved(lat: number, lon: number): Promise<{ raw: MonthlyRaw; endYear: number } | null> {
  try {
    const file = JSON.parse(await fs.readFile(savedPath(lat, lon), "utf8"));
    const raw = file?.properties?.parameter as MonthlyRaw | undefined;
    if (!raw) return null;
    return { raw, endYear: Number(file.endYear) || powerEndYear() };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lon = Number(sp.get("lon"));
  const name = (sp.get("name") ?? "Selected place").slice(0, 120);

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: "Enter a valid place." }, { status: 400 });
  }

  try {
    const { raw, endYear } = await fetchPowerMonthly(lat, lon);
    return NextResponse.json(analyze(raw, { name, lat, lon }, endYear, "live"));
  } catch {
    // If NASA's server is slow or down, fall back to a saved copy for demo places.
    const saved = await readSaved(lat, lon);
    if (saved) return NextResponse.json(analyze(saved.raw, { name, lat, lon }, saved.endYear, "saved"));
    return NextResponse.json(
      { error: "NASA's data service didn't respond. Try again in a moment." },
      { status: 502 },
    );
  }
}
