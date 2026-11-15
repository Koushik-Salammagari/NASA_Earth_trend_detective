import { VARIABLE_MAP, type VariableKey } from "./variables";
import type { TrendResult } from "./stats";

export function fmt(value: number, decimals: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function signed(value: number, decimals: number): string {
  const s = fmt(Math.abs(value), decimals);
  if (Number(s.replace(/,/g, "")) === 0) return fmt(0, decimals);
  return `${value > 0 ? "+" : "−"}${s}`;
}

// Units for changes: temperature differences are written in °C; percentages for % variables are "points".
export function changeUnit(key: VariableKey): string {
  const u = VARIABLE_MAP[key].unit;
  return u === "%" ? "pts" : u;
}

export function changeDecimals(key: VariableKey): number {
  const d = VARIABLE_MAP[key].decimals;
  return key === "PRECTOTCORR" ? 0 : Math.max(1, d - (key.startsWith("T2M") ? 1 : 0));
}

export function significanceLabel(t: TrendResult | null): string {
  if (!t) return "Not enough data";
  if (t.significance === "significant") return "Significant trend";
  if (t.significance === "suggestive") return "Possible trend";
  return "No clear trend";
}

export function pText(p: number): string {
  if (p < 0.001) return "p < 0.001";
  return `p = ${p.toFixed(3)}`;
}
