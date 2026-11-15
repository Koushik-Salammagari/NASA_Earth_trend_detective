// Finds variables that changed together and turns them into "possible driver" clues.
// These are hypotheses based on co-occurring changes, not proof of cause.
import type { VariableKey } from "./variables";
import { detrendedCorrelation, type YearValue } from "./stats";
import type { VariableResult } from "./analyze";

export interface DriverClue {
  id: string;
  title: string;
  explanation: string;
  evidence: VariableKey[];
  strength: "strong" | "moderate";
  correlation: number | null;
}

type Dir = "up" | "down";

interface Rule {
  id: string;
  when: [VariableKey, Dir][];
  title: string;
  explanation: string;
  // Pair whose year-to-year link is checked (expected sign of the detrended correlation).
  check?: [VariableKey, VariableKey, 1 | -1];
}

const RULES: Rule[] = [
  {
    id: "sun-heat",
    when: [["ALLSKY_SFC_SW_DWN", "up"], ["T2M_MAX", "up"]],
    title: "More sunshine is reaching the ground",
    explanation:
      "Sunlight at the surface rose alongside daytime highs. Fewer clouds or cleaner, less hazy air let more solar energy heat the ground.",
    check: ["ALLSKY_SFC_SW_DWN", "T2M_MAX", 1],
  },
  {
    id: "dry-soil-heat",
    when: [["GWETROOT", "down"], ["T2M_MAX", "up"]],
    title: "Drier soil can amplify the heat",
    explanation:
      "Wet soil cools the land as water evaporates. As the soil dried, less energy went into evaporation and more into heating the air: a feedback that can make hot periods hotter.",
    check: ["GWETROOT", "T2M_MAX", -1],
  },
  {
    id: "dry-air-heat",
    when: [["RH2M", "down"], ["T2M", "up"]],
    title: "Drier air warms up more easily",
    explanation:
      "Humidity fell while temperatures rose. Warmer air can hold more moisture, so the same amount of water vapor shows up as lower relative humidity, and dry air heats faster.",
    check: ["RH2M", "T2M", -1],
  },
  {
    id: "rain-soil",
    when: [["PRECTOTCORR", "down"], ["GWETROOT", "down"]],
    title: "Less rain is reaching the soil",
    explanation:
      "Rainfall and soil wetness both declined, so less water is soaking into the ground. That pattern is consistent with growing dry-season stress.",
    check: ["PRECTOTCORR", "GWETROOT", 1],
  },
  {
    id: "rain-humidity",
    when: [["PRECTOTCORR", "down"], ["RH2M", "down"]],
    title: "Less moisture in the air means less rain",
    explanation:
      "Both rainfall and humidity fell. With less moisture available in the atmosphere, there is less water to fall as rain.",
    check: ["PRECTOTCORR", "RH2M", 1],
  },
  {
    id: "rain-sun",
    when: [["PRECTOTCORR", "down"], ["ALLSKY_SFC_SW_DWN", "up"]],
    title: "Clearer skies, fewer rain clouds",
    explanation:
      "More sunlight at the ground alongside less rain suggests fewer cloudy, rainy days overall.",
    check: ["PRECTOTCORR", "ALLSKY_SFC_SW_DWN", -1],
  },
  {
    id: "wind-heat",
    when: [["WS2M", "down"], ["T2M", "up"]],
    title: "Calmer winds can trap heat",
    explanation:
      "Wind speeds dropped while temperatures rose. Lighter winds mix and carry away less warm air near the ground.",
  },
  {
    id: "wetter-cooler-days",
    when: [["PRECTOTCORR", "up"], ["ALLSKY_SFC_SW_DWN", "down"]],
    title: "More clouds and rain",
    explanation:
      "Rainfall rose while sunlight at the ground fell, consistent with more cloudy, rainy weather.",
    check: ["PRECTOTCORR", "ALLSKY_SFC_SW_DWN", -1],
  },
];

function direction(v: VariableResult | undefined): Dir | null {
  if (!v?.trend || v.trend.significance === "none") return null;
  return v.trend.slopePerYear > 0 ? "up" : "down";
}

export function findDrivers(results: Partial<Record<VariableKey, VariableResult>>): DriverClue[] {
  const clues: DriverClue[] = [];
  for (const rule of RULES) {
    const matched = rule.when.every(([key, dir]) => direction(results[key]) === dir);
    if (!matched) continue;

    let correlation: number | null = null;
    if (rule.check) {
      const [a, b] = rule.check;
      const sa = results[a]?.annual as YearValue[] | undefined;
      const sb = results[b]?.annual as YearValue[] | undefined;
      if (sa && sb) correlation = detrendedCorrelation(sa, sb);
    }

    const allSignificant = rule.when.every(([key]) => results[key]?.trend?.significance === "significant");
    const linked = rule.check && correlation !== null ? correlation * rule.check[2] >= 0.3 : false;

    clues.push({
      id: rule.id,
      title: rule.title,
      explanation: rule.explanation,
      evidence: rule.when.map(([k]) => k),
      strength: allSignificant && (linked || !rule.check) ? "strong" : "moderate",
      correlation,
    });
  }
  return clues.sort((a, b) => (a.strength === b.strength ? 0 : a.strength === "strong" ? -1 : 1));
}
