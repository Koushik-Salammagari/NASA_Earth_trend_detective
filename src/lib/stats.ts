// Trend statistics: Mann-Kendall test, Sen's slope and period comparison.

export interface YearValue {
  year: number;
  value: number;
}

export interface TrendResult {
  n: number;
  s: number;
  z: number;
  pValue: number;
  slopePerYear: number; // Sen's slope
  slopePerDecade: number;
  intercept: number; // value at year 0 of the fitted line: y = intercept + slope * year
  significance: "significant" | "suggestive" | "none";
  direction: "up" | "down" | "flat";
}

export interface PeriodComparison {
  baselineStart: number;
  baselineEnd: number;
  recentStart: number;
  recentEnd: number;
  baselineMean: number;
  recentMean: number;
  change: number;
  percentChange: number | null;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Standard normal CDF (Abramowitz and Stegun 7.1.26 approximation of erf).
export function normalCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

export function mannKendall(series: YearValue[]): TrendResult | null {
  const data = series.filter((d) => Number.isFinite(d.value));
  const n = data.length;
  if (n < 8) return null;

  let s = 0;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const diff = data[j].value - data[i].value;
      if (diff > 0) s += 1;
      else if (diff < 0) s -= 1;
      const dx = data[j].year - data[i].year;
      if (dx !== 0) slopes.push(diff / dx);
    }
  }

  // Variance with tie correction.
  const counts = new Map<number, number>();
  for (const d of data) counts.set(d.value, (counts.get(d.value) ?? 0) + 1);
  let tieTerm = 0;
  for (const t of counts.values()) if (t > 1) tieTerm += t * (t - 1) * (2 * t + 5);
  const varS = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18;

  let z = 0;
  if (s > 0) z = (s - 1) / Math.sqrt(varS);
  else if (s < 0) z = (s + 1) / Math.sqrt(varS);

  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  const slope = median(slopes);
  const intercept = median(data.map((d) => d.value - slope * d.year));

  const significance = pValue < 0.05 ? "significant" : pValue < 0.1 ? "suggestive" : "none";
  const direction = significance === "none" ? "flat" : slope > 0 ? "up" : "down";

  return {
    n,
    s,
    z,
    pValue,
    slopePerYear: slope,
    slopePerDecade: slope * 10,
    intercept,
    significance,
    direction,
  };
}

export function comparePeriods(
  series: YearValue[],
  baseline: [number, number],
  recent: [number, number],
): PeriodComparison | null {
  const inRange = (r: [number, number]) =>
    series.filter((d) => d.year >= r[0] && d.year <= r[1] && Number.isFinite(d.value)).map((d) => d.value);
  const b = inRange(baseline);
  const r = inRange(recent);
  if (b.length < 5 || r.length < 5) return null;
  const baselineMean = b.reduce((a, c) => a + c, 0) / b.length;
  const recentMean = r.reduce((a, c) => a + c, 0) / r.length;
  const change = recentMean - baselineMean;
  return {
    baselineStart: baseline[0],
    baselineEnd: baseline[1],
    recentStart: recent[0],
    recentEnd: recent[1],
    baselineMean,
    recentMean,
    change,
    percentChange: Math.abs(baselineMean) > 1e-9 ? (change / Math.abs(baselineMean)) * 100 : null,
  };
}

// Pearson correlation of two year-aligned series after removing each one's linear trend,
// so shared long-term drift does not inflate the year-to-year relationship.
export function detrendedCorrelation(a: YearValue[], b: YearValue[]): number | null {
  const bMap = new Map(b.map((d) => [d.year, d.value]));
  const pairs = a
    .filter((d) => Number.isFinite(d.value) && Number.isFinite(bMap.get(d.year) ?? NaN))
    .map((d) => ({ year: d.year, x: d.value, y: bMap.get(d.year) as number }));
  if (pairs.length < 10) return null;

  const detrend = (vals: { year: number; v: number }[]) => {
    const n = vals.length;
    const mx = vals.reduce((s, p) => s + p.year, 0) / n;
    const my = vals.reduce((s, p) => s + p.v, 0) / n;
    let num = 0;
    let den = 0;
    for (const p of vals) {
      num += (p.year - mx) * (p.v - my);
      den += (p.year - mx) ** 2;
    }
    const slope = den ? num / den : 0;
    return vals.map((p) => p.v - (my + slope * (p.year - mx)));
  };

  const rx = detrend(pairs.map((p) => ({ year: p.year, v: p.x })));
  const ry = detrend(pairs.map((p) => ({ year: p.year, v: p.y })));
  const n = rx.length;
  const mx = rx.reduce((s, v) => s + v, 0) / n;
  const my = ry.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (rx[i] - mx) * (ry[i] - my);
    sxx += (rx[i] - mx) ** 2;
    syy += (ry[i] - my) ** 2;
  }
  if (!sxx || !syy) return null;
  return sxy / Math.sqrt(sxx * syy);
}
