import type { CaseFile, VariableResult } from "./analyze";
import { VARIABLE_MAP, VARIABLES } from "./variables";
import { changeDecimals, changeUnit, fmt, pText, signed } from "./format";

// One plain-text sentence per variable, used for headlines and as facts for the AI.
export function findingSentence(r: VariableResult, cf: CaseFile): string {
  const info = VARIABLE_MAP[r.key];
  const parts: string[] = [];
  const c = r.comparison;
  if (c) {
    const pct = c.percentChange !== null && r.key === "PRECTOTCORR" ? ` (${signed(c.percentChange, 0)}%)` : "";
    parts.push(
      `${info.label} averaged ${fmt(c.recentMean, info.decimals)} ${info.unit} in ${c.recentStart}–${c.recentEnd}, ${signed(
        c.change,
        changeDecimals(r.key),
      )} ${changeUnit(r.key)}${pct} versus the ${c.baselineStart}–${c.baselineEnd} average`,
    );
  }
  const t = r.trend;
  if (t) {
    const sig =
      t.significance === "significant"
        ? "statistically significant"
        : t.significance === "suggestive"
          ? "a possible but not yet significant trend"
          : "no statistically significant trend";
    parts.push(
      `over ${cf.period.start}–${cf.period.end} the trend is ${signed(t.slopePerDecade, changeDecimals(r.key))} ${changeUnit(
        r.key,
      )} per decade (${sig}, ${pText(t.pValue)})`,
    );
  }
  return parts.join("; ") + ".";
}

export interface Headline {
  key: VariableResult["key"];
  text: string;
}

// Picks the strongest changes for the headline strip.
export function headlines(cf: CaseFile, limit = 3): Headline[] {
  const ranked = VARIABLES.map((v) => cf.variables[v.key])
    .filter((r): r is VariableResult => !!r?.trend && r.trend.significance !== "none")
    .sort((a, b) => Math.abs(b.trend!.z) - Math.abs(a.trend!.z))
    .slice(0, limit);

  return ranked.map((r) => {
    const info = VARIABLE_MAP[r.key];
    const t = r.trend!;
    const rising = t.slopePerYear > 0;
    const verb =
      r.key === "PRECTOTCORR"
        ? rising
          ? "Wetter years"
          : "Less rain"
        : `${info.label} ${rising ? "rising" : "falling"}`;
    return {
      key: r.key,
      text: `${verb}: ${signed(t.slopePerDecade, changeDecimals(r.key))} ${changeUnit(r.key)} per decade`,
    };
  });
}

export function explainPayload(cf: CaseFile) {
  return {
    place: cf.place.name,
    period: `${cf.period.start}–${cf.period.end}, comparing ${cf.period.recent[0]}–${cf.period.recent[1]} with ${cf.period.baseline[0]}–${cf.period.baseline[1]}`,
    findings: VARIABLES.map((v) => cf.variables[v.key])
      .filter((r): r is VariableResult => !!r)
      .map((r) => findingSentence(r, cf)),
    drivers: cf.drivers.map((d) => `${d.title}: ${d.explanation}`),
  };
}
