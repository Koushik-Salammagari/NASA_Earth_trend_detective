// Turns raw NASA POWER data into the full "case file" result.
import { VARIABLES, VariableKey } from "./variables";
import { comparePeriods, mannKendall, type PeriodComparison, type TrendResult, type YearValue } from "./stats";
import { monthlyClimatology, toAnnual, type MonthlyRaw, POWER_START_YEAR } from "./power";
import { findDrivers, type DriverClue } from "./drivers";

export const BASELINE: [number, number] = [1981, 2010];

export interface VariableResult {
  key: VariableKey;
  annual: YearValue[];
  trend: TrendResult | null;
  comparison: PeriodComparison | null;
  seasonalBaseline: (number | null)[];
  seasonalRecent: (number | null)[];
}

export interface CaseFile {
  place: { name: string; lat: number; lon: number };
  period: { start: number; end: number; baseline: [number, number]; recent: [number, number] };
  variables: Partial<Record<VariableKey, VariableResult>>;
  drivers: DriverClue[];
  source: "live" | "saved";
  generatedAt: string;
}

export function analyze(
  raw: MonthlyRaw,
  place: { name: string; lat: number; lon: number },
  endYear: number,
  source: "live" | "saved" = "live",
): CaseFile {
  const recent: [number, number] = [endYear - 9, endYear];
  const variables: Partial<Record<VariableKey, VariableResult>> = {};

  for (const v of VARIABLES) {
    const monthly = raw[v.key];
    if (!monthly) continue;
    const annual = toAnnual(v.key, monthly);
    if (annual.length < 10) continue;
    variables[v.key] = {
      key: v.key,
      annual,
      trend: mannKendall(annual),
      comparison: comparePeriods(annual, BASELINE, recent),
      seasonalBaseline: monthlyClimatology(monthly, v.key, BASELINE[0], BASELINE[1]),
      seasonalRecent: monthlyClimatology(monthly, v.key, recent[0], recent[1]),
    };
  }

  return {
    place,
    period: { start: POWER_START_YEAR, end: endYear, baseline: BASELINE, recent },
    variables,
    drivers: findDrivers(variables),
    source,
    generatedAt: new Date().toISOString(),
  };
}
