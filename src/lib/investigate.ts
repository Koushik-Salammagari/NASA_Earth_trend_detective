// The Detective pipeline. AI is used for exactly two narrow jobs (reading the question into a
// fixed plan, and writing the report). Every step in between is deterministic code, and the
// report is fact-checked by code. Each step is recorded in a trace for the "How it worked" tab.
import { VARIABLES, VARIABLE_MAP, type VariableKey } from "./variables";
import { analyze, BASELINE, type CaseFile } from "./analyze";
import { comparePeriods, mannKendall, type YearValue } from "./stats";
import { findingSentence } from "./findings";
import { changeDecimals, changeUnit, fmt, pText, signed } from "./format";
import { getPowerData } from "./saved";
import { geminiGenerate } from "./gemini";
import { factCheck, type FactCheckResult } from "./factcheck";
import type { MonthlyRaw } from "./power";

export type Season = "year" | "winter" | "spring" | "summer" | "autumn";
export const SEASONS: Season[] = ["year", "winter", "spring", "summer", "autumn"];

export interface Plan {
  variables: VariableKey[];
  season: Season;
  comparePlace: string | null;
}

export interface TraceStep {
  id: number;
  name: string;
  kind: "ai" | "tool" | "check";
  detail: string;
  input?: unknown;
  output?: unknown;
  ms: number;
  status: "ok" | "fallback" | "skipped" | "error";
  model?: string | null;
}

export interface Investigation {
  question: string;
  place: { name: string; lat: number; lon: number };
  plan: Plan;
  planSource: "ai" | "keywords";
  facts: string[];
  report: string | null;
  check: Omit<FactCheckResult, "text"> | null;
  yearRange: [number, number];
  trace: TraceStep[];
  totals: { steps: number; aiCalls: number; tools: number; ms: number };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Months in each season, flipped for the southern hemisphere.
export function seasonMonths(season: Season, lat: number): number[] {
  const north: Record<Exclude<Season, "year">, number[]> = {
    winter: [12, 1, 2],
    spring: [3, 4, 5],
    summer: [6, 7, 8],
    autumn: [9, 10, 11],
  };
  if (season === "year") return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const flip: Record<Exclude<Season, "year">, Exclude<Season, "year">> = {
    winter: "summer",
    summer: "winter",
    spring: "autumn",
    autumn: "spring",
  };
  return north[lat < 0 ? flip[season] : season];
}

const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// One value per year for the given months (same conversions as the yearly view).
export function seasonalSeries(key: VariableKey, monthly: Record<string, number>, months: number[]): YearValue[] {
  const byYear = new Map<number, number[]>();
  for (const [stamp, v] of Object.entries(monthly)) {
    const year = Number(stamp.slice(0, 4));
    const month = Number(stamp.slice(4, 6));
    if (!months.includes(month) || v === null || v <= -999 || !Number.isFinite(v)) continue;
    let value = v;
    if (key === "PRECTOTCORR") value = v * DAYS[month - 1];
    if (key === "GWETROOT") value = v * 100;
    if (key === "ALLSKY_SFC_SW_DWN") value = v / 3.6;
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push(value);
  }
  return [...byYear.entries()]
    .filter(([, vals]) => vals.length === months.length)
    .sort((a, b) => a[0] - b[0])
    .map(([year, vals]) => ({
      year,
      value: key === "PRECTOTCORR" ? vals.reduce((s, x) => s + x, 0) : vals.reduce((s, x) => s + x, 0) / vals.length,
    }));
}

// Deterministic fallback planner: keywords in the question map to variables, season and comparison.
export function keywordPlan(question: string): Plan {
  const q = question.toLowerCase();
  const vars = new Set<VariableKey>();
  if (/hot|heat|warm|temperature|summer|cooler|cold|freez/.test(q)) {
    vars.add("T2M_MAX");
    vars.add("T2M");
  }
  if (/night|nights|low|coldest|freez|winter/.test(q)) vars.add("T2M_MIN");
  if (/rain|precip|drought|dry|drie|wet|monsoon|flood|water/.test(q)) vars.add("PRECTOTCORR");
  if (/drought|dry|drie|soil|farm|crop|garden|plant/.test(q)) vars.add("GWETROOT");
  if (/humid|muggy|moist|sticky/.test(q)) vars.add("RH2M");
  if (/sun|cloud|solar|haze|smog|clear sk/.test(q)) vars.add("ALLSKY_SFC_SW_DWN");
  if (/wind|breez|calm/.test(q)) vars.add("WS2M");
  if (/why|cause|driv|behind|reason/.test(q)) {
    // Asking "why" adds the usual physical suspects.
    if (vars.has("T2M_MAX") || vars.has("T2M")) {
      vars.add("ALLSKY_SFC_SW_DWN");
      vars.add("GWETROOT");
    }
    if (vars.has("PRECTOTCORR")) vars.add("RH2M");
  }
  if (!vars.size) ["T2M", "T2M_MAX", "PRECTOTCORR"].forEach((k) => vars.add(k as VariableKey));

  let season: Season = "year";
  if (/summer|monsoon/.test(q)) season = "summer";
  else if (/winter/.test(q)) season = "winter";
  else if (/spring/.test(q)) season = "spring";
  else if (/autumn|fall\b/.test(q)) season = "autumn";

  const m = question.match(/(?:compare[sd]?(?:\s+it)?\s+(?:with|to)|\bvs\.?|\bversus|\bthan(?:\s+in)?|\band)\s+([A-Z][A-Za-z .'-]{1,40})/);
  const comparePlace = m ? m[1].replace(/[?.!,]+$/, "").replace(/\s+(?:is|are|has|have|was|were|compare|compares|differ|differs|stack)\b.*$/i, "").trim() : null;

  return { variables: [...vars].slice(0, 4), season, comparePlace: comparePlace || null };
}

function validatePlan(obj: unknown): Plan | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const keys = VARIABLES.map((v) => v.key);
  const vars = Array.isArray(o.variables)
    ? [...new Set(o.variables.filter((v): v is VariableKey => typeof v === "string" && keys.includes(v as VariableKey)))]
    : [];
  if (!vars.length) return null;
  const season = SEASONS.includes(o.season as Season) ? (o.season as Season) : "year";
  const cp = typeof o.comparePlace === "string" ? o.comparePlace.trim().slice(0, 60) : "";
  return { variables: vars.slice(0, 4), season, comparePlace: cp && !/^(none|null|n\/a)$/i.test(cp) ? cp : null };
}

const PLAN_SCHEMA = {
  type: "OBJECT",
  properties: {
    variables: {
      type: "ARRAY",
      items: { type: "STRING", enum: VARIABLES.map((v) => v.key) },
      description: "1 to 4 variables that best answer the question, including likely physical drivers when the user asks why.",
    },
    season: { type: "STRING", enum: SEASONS },
    comparePlace: { type: "STRING", nullable: true, description: "A second place to compare with, only if the user names one." },
  },
  required: ["variables", "season"],
};

async function geocode(name: string): Promise<{ name: string; lat: number; lon: number } | null> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", name);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  const res = await fetch(url, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const r = (await res.json()).results?.[0];
  if (!r) return null;
  return { name: [r.name, r.admin1, r.country].filter(Boolean).join(", "), lat: r.latitude, lon: r.longitude };
}

const seasonLabel = (s: Season, lat: number) =>
  s === "year" ? "the whole year" : `${s} (${seasonMonths(s, lat).map((m) => MONTHS[m - 1].slice(0, 3)).join("–")})`;

function seasonalFact(key: VariableKey, raw: MonthlyRaw, season: Season, lat: number, recent: [number, number], endYear: number, prefix = ""): { fact: string; direction: number } | null {
  const monthly = raw[key];
  if (!monthly) return null;
  const series = seasonalSeries(key, monthly, seasonMonths(season, lat));
  const t = mannKendall(series);
  const c = comparePeriods(series, BASELINE, recent);
  if (!t || !c) return null;
  const info = VARIABLE_MAP[key];
  const unit = key === "PRECTOTCORR" ? "mm" : info.unit;
  const d = changeDecimals(key);
  const sig = t.significance === "significant" ? "statistically significant" : t.significance === "suggestive" ? "possible but not yet significant" : "not statistically significant";
  return {
    fact: `${prefix}${key === "PRECTOTCORR" ? `Rainfall in ${seasonLabel(season, lat)} totaled on average` : `${info.label} in ${seasonLabel(season, lat)} averaged`} ${fmt(c.recentMean, info.decimals)} ${unit} in ${c.recentStart}–${c.recentEnd}, ${signed(c.change, d)} ${changeUnit(key) === "mm/yr" ? "mm" : changeUnit(key)} versus ${c.baselineStart}–${c.baselineEnd}; the ${BASELINE[0]}–${endYear} trend is ${signed(t.slopePerDecade, d)} ${changeUnit(key) === "mm/yr" ? "mm" : changeUnit(key)} per decade (${sig}, ${pText(t.pValue)}).`,
    direction: t.significance === "none" ? 0 : Math.sign(t.slopePerYear),
  };
}

function biggestMonthFact(cf: CaseFile, key: VariableKey, prefix = ""): string | null {
  const r = cf.variables[key];
  if (!r) return null;
  let best = -1;
  let diff = 0;
  r.seasonalBaseline.forEach((b, i) => {
    const rec = r.seasonalRecent[i];
    if (b === null || rec === null) return;
    if (best === -1 || Math.abs(rec - b) > Math.abs(diff)) {
      best = i;
      diff = rec - b;
    }
  });
  if (best < 0) return null;
  const info = VARIABLE_MAP[key];
  const unit = key === "PRECTOTCORR" ? "mm" : changeUnit(key);
  return `${prefix}The month with the largest change in ${info.label.toLowerCase()} was ${MONTHS[best]}: ${signed(diff, changeDecimals(key))} ${unit} in ${cf.period.recent[0]}–${cf.period.recent[1]} compared with ${cf.period.baseline[0]}–${cf.period.baseline[1]}.`;
}

export async function investigate(input: { question: string; lat: number; lon: number; name: string; preferSaved?: boolean }): Promise<Investigation> {
  const started = Date.now();
  const trace: TraceStep[] = [];
  const step = async <T,>(
    name: string,
    kind: TraceStep["kind"],
    detail: string,
    fn: () => Promise<{ value: T; output?: unknown; status?: TraceStep["status"]; model?: string | null; input?: unknown }>,
  ): Promise<T> => {
    const t0 = Date.now();
    try {
      const r = await fn();
      trace.push({ id: trace.length + 1, name, kind, detail, input: r.input, output: r.output, ms: Date.now() - t0, status: r.status ?? "ok", model: r.model });
      return r.value;
    } catch (e) {
      trace.push({ id: trace.length + 1, name, kind, detail, output: String(e instanceof Error ? e.message : e), ms: Date.now() - t0, status: "error" });
      throw e;
    }
  };

  const place = { name: input.name, lat: input.lat, lon: input.lon };
  const question = input.question.trim().slice(0, 300);

  // 1. AI: read the question into a fixed plan (with deterministic fallback).
  const { plan, planSource } = await step<{ plan: Plan; planSource: "ai" | "keywords" }>("Understand the question", "ai", "AI fills in a strict form: which variables, which season, which place to compare. Invalid answers fall back to keyword matching.", async () => {
    const ai = await geminiGenerate({
      temperature: 0,
      schema: PLAN_SCHEMA,
      prompt: `You plan a climate data investigation. The user asked about ${place.name}: "${question}"
Choose 1 to 4 variables from this list that best answer the question. If they ask why something changed, include likely physical drivers (sunlight, soil wetness, humidity, wind).
${VARIABLES.map((v) => `- ${v.key}: ${v.label}. ${v.definition}`).join("\n")}
Choose the season the question is about, or "year" if none. Set comparePlace only if the user names another place to compare with; otherwise null.`,
    });
    let parsed: Plan | null = null;
    try {
      parsed = ai.text ? validatePlan(JSON.parse(ai.text)) : null;
    } catch {
      parsed = null;
    }
    if (parsed) return { value: { plan: parsed, planSource: "ai" as const }, input: { question }, output: parsed, model: ai.model };
    const kw = keywordPlan(question);
    return { value: { plan: kw, planSource: "keywords" as const }, input: { question }, output: kw, status: "fallback", model: ai.model };
  });

  // 2. Tool: NASA data for the place.
  const data = await step("Fetch NASA POWER data", "tool", `Monthly data since 1981 for ${place.name} (8 variables).`, async () => {
    const d = await getPowerData(place.lat, place.lon, input.preferSaved);
    return { value: d, input: { lat: place.lat, lon: place.lon }, output: { source: d.source, years: `1981–${d.endYear}` } };
  });
  const cf = analyze(data.raw, place, data.endYear, data.source);
  const recent = cf.period.recent;
  const facts: string[] = [];

  // 3. Tools: trend tests for each planned variable.
  for (const key of plan.variables) {
    await step(`Test trend: ${VARIABLE_MAP[key].label}`, "tool", `Mann-Kendall test and Sen's slope for ${seasonLabel(plan.season, place.lat)}; last decade versus ${BASELINE[0]}–${BASELINE[1]}.`, async () => {
      const added: string[] = [];
      if (plan.season === "year") {
        const r = cf.variables[key];
        if (r) added.push(findingSentence(r, cf));
      } else {
        const s = seasonalFact(key, data.raw, plan.season, place.lat, recent, data.endYear);
        if (s) added.push(s.fact);
        const r = cf.variables[key];
        if (r) added.push(findingSentence(r, cf).replace(/^/, "Whole year: "));
      }
      facts.push(...added);
      return {
        value: null,
        input: { variable: key, season: plan.season, months: seasonMonths(plan.season, place.lat), baseline: BASELINE, recent },
        output: added.length ? added : "No data for this variable here.",
        status: added.length ? "ok" : "skipped",
      };
    });
  }

  // 4. Tool: which month changed most.
  await step("Find when in the year it changed", "tool", "Compares each calendar month's average, last decade versus baseline.", async () => {
    const f = biggestMonthFact(cf, plan.variables[0]);
    if (f) facts.push(f);
    return { value: null, output: f ?? "Not available.", status: f ? "ok" : "skipped" };
  });

  // 5. Tool: linked changes (possible drivers).
  await step("Check linked changes", "tool", "Matches variables that changed together to known physical links and measures their year-to-year correlation.", async () => {
    const relevant = cf.drivers.filter((d) => d.evidence.some((k) => plan.variables.includes(k)));
    const chosen = relevant.length ? relevant : cf.drivers;
    const added = chosen.slice(0, 3).map(
      (d) =>
        `Possible driver (${d.strength} clue): ${d.title}. ${d.explanation}${d.correlation !== null ? ` Year-to-year correlation r = ${fmt(d.correlation, 2)}.` : ""}`,
    );
    facts.push(...added);
    return { value: null, output: added.length ? added : "No linked changes stood out.", status: added.length ? "ok" : "skipped" };
  });

  // 6. Tools: optional comparison place.
  if (plan.comparePlace) {
    const other = await step("Find comparison place", "tool", `Looks up "${plan.comparePlace}" with the Open-Meteo geocoder.`, async () => {
      const g = await geocode(plan.comparePlace!);
      return { value: g, input: { name: plan.comparePlace }, output: g ?? "Place not found.", status: g ? "ok" : "skipped" };
    }).catch(() => null);

    if (other) {
      try {
        const od = await step("Fetch NASA POWER data", "tool", `Monthly data since 1981 for ${other.name}.`, async () => {
          const d = await getPowerData(other.lat, other.lon, input.preferSaved);
          return { value: d, input: { lat: other.lat, lon: other.lon }, output: { source: d.source } };
        });
        await step("Compare the two places", "tool", "Runs the same tests for the second place and flags opposite trends.", async () => {
          const ocf = analyze(od.raw, other, od.endYear, od.source);
          const added: string[] = [];
          for (const key of plan.variables) {
            let dirA = 0;
            let dirB = 0;
            if (plan.season === "year") {
              const a = cf.variables[key];
              const b = ocf.variables[key];
              if (b) added.push(`In ${other.name}: ${findingSentence(b, ocf)}`);
              dirA = a?.trend && a.trend.significance !== "none" ? Math.sign(a.trend.slopePerYear) : 0;
              dirB = b?.trend && b.trend.significance !== "none" ? Math.sign(b.trend.slopePerYear) : 0;
            } else {
              const a = seasonalFact(key, data.raw, plan.season, place.lat, recent, data.endYear);
              const b = seasonalFact(key, od.raw, plan.season, other.lat, ocf.period.recent, od.endYear, `In ${other.name}: `);
              if (b) added.push(b.fact);
              dirA = a?.direction ?? 0;
              dirB = b?.direction ?? 0;
            }
            if (dirA && dirB && dirA !== dirB) {
              added.push(
                `Opposite trends: ${VARIABLE_MAP[key].label.toLowerCase()} is ${dirA > 0 ? "rising" : "falling"} in ${place.name} but ${dirB > 0 ? "rising" : "falling"} in ${other.name}.`,
              );
            }
          }
          facts.push(...added);
          return { value: null, output: added };
        });
      } catch {
        /* comparison is optional; the trace records the failure */
      }
    }
  }

  const yearRange: [number, number] = [cf.period.start, cf.period.end];

  // 7. AI: write the report from the facts only.
  const draft = await step("Write the case report", "ai", "AI writes a short answer using only the computed facts.", async () => {
    const ai = await geminiGenerate({
      temperature: 0.2,
      prompt: `You are a careful climate detective writing for students and the public.
Question about ${place.name}: "${question}"

Facts computed from NASA POWER data (the only information you may use):
${facts.map((f) => `- ${f}`).join("\n")}

Write two or three short paragraphs in plain text (no markdown, no bullet points, no headings).
Start by answering the question directly in one sentence. Then give the evidence with numbers. If the facts include possible drivers, explain them with words like "may", "suggests" or "is consistent with"; never claim a proven cause. If a trend is not statistically significant, say so plainly.
Copy numbers exactly as they appear in the facts. Never invent numbers, events, studies or places. Keep it under 180 words.`,
    });
    return {
      value: ai.text,
      output: ai.text ? `${ai.text.split(/\s+/).length} words` : `No answer (tried: ${ai.tried.join(", ") || "none"})`,
      status: ai.text ? "ok" : "error",
      model: ai.model,
    };
  });

  // 8. Check: deterministic fact-check of every number.
  let report: string | null = null;
  let check: Investigation["check"] = null;
  if (draft) {
    const fc = await step("Fact-check every number", "check", "Code extracts every number in the report and matches it against the computed facts. Sentences with unmatched numbers are removed.", async () => {
      const r = factCheck(draft, facts, yearRange);
      return {
        value: r,
        output: { checked: r.checked, verified: r.verified, removed: r.removed },
        status: r.removed.length ? "fallback" : "ok",
      };
    });
    report = fc.text;
    check = { checked: fc.checked, verified: fc.verified, removed: fc.removed };
  }

  return {
    question,
    place,
    plan,
    planSource,
    facts,
    report,
    check,
    yearRange,
    trace,
    totals: {
      steps: trace.length,
      aiCalls: trace.filter((t) => t.kind === "ai").length,
      tools: trace.filter((t) => t.kind !== "ai").length,
      ms: Date.now() - started,
    },
  };
}
