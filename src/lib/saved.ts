import { promises as fs } from "fs";
import path from "path";
import { fetchPowerMonthly, powerEndYear, type MonthlyRaw } from "./power";

const savedPath = (lat: number, lon: number) =>
  path.join(process.cwd(), "data", "saved", `${lat.toFixed(2)}_${lon.toFixed(2)}.json`);

export async function readSaved(lat: number, lon: number): Promise<{ raw: MonthlyRaw; endYear: number; savedAt?: string } | null> {
  try {
    const file = JSON.parse(await fs.readFile(savedPath(lat, lon), "utf8"));
    const raw = file?.properties?.parameter as MonthlyRaw | undefined;
    if (!raw) return null;
    return { raw, endYear: Number(file.endYear) || powerEndYear(), savedAt: typeof file.savedAt === "string" ? file.savedAt : undefined };
  } catch {
    return null;
  }
}

// Live NASA data, falling back to a saved copy for demo places if NASA is unavailable.
export async function getPowerData(
  lat: number,
  lon: number,
  preferSaved = false,
): Promise<{ raw: MonthlyRaw; endYear: number; source: "live" | "saved"; savedAt?: string }> {
  if (preferSaved) {
    const saved = await readSaved(lat, lon);
    if (saved) return { ...saved, source: "saved" };
  }
  try {
    const live = await fetchPowerMonthly(lat, lon);
    return { ...live, source: "live" };
  } catch (err) {
    const saved = await readSaved(lat, lon);
    if (saved) return { ...saved, source: "saved" };
    throw err;
  }
}
