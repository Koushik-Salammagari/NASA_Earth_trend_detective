// Fetches monthly data from the NASA POWER API and turns it into yearly series.
import { OPTIONAL_KEYS, VARIABLES, VariableKey } from "./variables";
import type { YearValue } from "./stats";

export const POWER_START_YEAR = 1981;
export const POWER_URL = "https://power.larc.nasa.gov/api/temporal/monthly/point";

export type MonthlyRaw = Partial<Record<VariableKey, Record<string, number>>>;

export function powerEndYear(now = new Date()): number {
  // The monthly endpoint covers complete years up to the previous calendar year.
  return now.getUTCFullYear() - 1;
}

export function buildPowerUrl(lat: number, lon: number, keys: VariableKey[], endYear: number): string {
  const params = new URLSearchParams({
    parameters: keys.join(","),
    community: "AG",
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    start: String(POWER_START_YEAR),
    end: String(endYear),
    format: "JSON",
  });
  return `${POWER_URL}?${params.toString()}`;
}

async function requestPower(lat: number, lon: number, keys: VariableKey[], endYear: number) {
  const res = await fetch(buildPowerUrl(lat, lon, keys, endYear), {
    next: { revalidate: 60 * 60 * 24 },
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`NASA POWER returned ${res.status}`);
  const json = await res.json();
  const parameter = json?.properties?.parameter;
  if (!parameter) throw new Error("NASA POWER response had no parameter data");
  return parameter as MonthlyRaw;
}

export async function fetchPowerMonthly(lat: number, lon: number): Promise<{ raw: MonthlyRaw; endYear: number }> {
  const endYear = powerEndYear();
  const all = VARIABLES.map((v) => v.key);
  try {
    return { raw: await requestPower(lat, lon, all, endYear), endYear };
  } catch (err) {
    // Retry once without variables that some locations or endpoints reject.
    const core = all.filter((k) => !OPTIONAL_KEYS.includes(k));
    try {
      return { raw: await requestPower(lat, lon, core, endYear), endYear };
    } catch {
      throw err;
    }
  }
}

// The AG community reports sunlight in MJ/m²/day; the app shows kWh/m²/day (1 kWh = 3.6 MJ).
const MJ_PER_KWH = 3.6;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

// Converts POWER's monthly values (keys like "198101"; "198113" is POWER's own annual value and is skipped)
// into one value per year. Rainfall becomes a yearly total in mm; soil wetness becomes a percentage.
export function toAnnual(key: VariableKey, monthly: Record<string, number>): YearValue[] {
  const byYear = new Map<number, { month: number; value: number }[]>();
  for (const [stamp, value] of Object.entries(monthly)) {
    const year = Number(stamp.slice(0, 4));
    const month = Number(stamp.slice(4, 6));
    if (month < 1 || month > 12) continue;
    if (value === null || value === undefined || value <= -999 || !Number.isFinite(value)) continue;
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push({ month, value });
  }

  const out: YearValue[] = [];
  for (const [year, months] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
    if (months.length < 12) continue; // only complete years, so seasons don't bias the average
    let value: number;
    if (key === "PRECTOTCORR") {
      // Monthly values are mm/day averages; multiply by days in each month for a yearly total.
      value = months.reduce((sum, m) => {
        const days = m.month === 2 && isLeap(year) ? 29 : DAYS_IN_MONTH[m.month - 1];
        return sum + m.value * days;
      }, 0);
    } else {
      value = months.reduce((sum, m) => sum + m.value, 0) / months.length;
      if (key === "GWETROOT") value *= 100;
      if (key === "ALLSKY_SFC_SW_DWN") value /= MJ_PER_KWH;
    }
    out.push({ year, value });
  }
  return out;
}

// Average value for each calendar month over a period, used for the seasonal "fingerprint" chart.
export function monthlyClimatology(
  monthly: Record<string, number>,
  key: VariableKey,
  from: number,
  to: number,
): (number | null)[] {
  const sums = Array(12).fill(0);
  const counts = Array(12).fill(0);
  for (const [stamp, value] of Object.entries(monthly)) {
    const year = Number(stamp.slice(0, 4));
    const month = Number(stamp.slice(4, 6));
    if (month < 1 || month > 12 || year < from || year > to) continue;
    if (value === null || value <= -999 || !Number.isFinite(value)) continue;
    let v = value;
    if (key === "PRECTOTCORR") v = value * DAYS_IN_MONTH[month - 1];
    if (key === "GWETROOT") v = value * 100;
    if (key === "ALLSKY_SFC_SW_DWN") v = value / MJ_PER_KWH;
    sums[month - 1] += v;
    counts[month - 1] += 1;
  }
  return sums.map((s, i) => (counts[i] ? s / counts[i] : null));
}
