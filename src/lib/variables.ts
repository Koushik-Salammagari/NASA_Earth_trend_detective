// NASA POWER variables used by the app, with plain-language definitions.
export type VariableKey =
  | "T2M"
  | "T2M_MAX"
  | "T2M_MIN"
  | "PRECTOTCORR"
  | "RH2M"
  | "GWETROOT"
  | "ALLSKY_SFC_SW_DWN"
  | "WS2M";

export type Family = "heat" | "water" | "air";

export interface VariableInfo {
  key: VariableKey;
  label: string;
  short: string;
  unit: string;
  family: Family;
  definition: string;
  decimals: number;
}

export const VARIABLES: VariableInfo[] = [
  {
    key: "T2M",
    label: "Average temperature",
    short: "Avg temp",
    unit: "°C",
    family: "heat",
    definition: "The average air temperature 2 meters above the ground.",
    decimals: 2,
  },
  {
    key: "T2M_MAX",
    label: "Hottest days",
    short: "Hottest",
    unit: "°C",
    family: "heat",
    definition: "The highest air temperature reached in each month, averaged over the year.",
    decimals: 2,
  },
  {
    key: "T2M_MIN",
    label: "Coldest nights",
    short: "Coldest",
    unit: "°C",
    family: "heat",
    definition: "The lowest air temperature reached in each month (usually at night), averaged over the year.",
    decimals: 2,
  },
  {
    key: "PRECTOTCORR",
    label: "Yearly rainfall",
    short: "Rainfall",
    unit: "mm/yr",
    family: "water",
    definition: "Total rain and snow (as water) that falls in a year.",
    decimals: 0,
  },
  {
    key: "RH2M",
    label: "Humidity",
    short: "Humidity",
    unit: "%",
    family: "water",
    definition: "How much moisture the air holds, compared with the most it could hold at that temperature.",
    decimals: 1,
  },
  {
    key: "GWETROOT",
    label: "Soil wetness",
    short: "Soil",
    unit: "%",
    family: "water",
    definition: "How wet the soil is in the root zone, from 0% (completely dry) to 100% (saturated).",
    decimals: 1,
  },
  {
    key: "ALLSKY_SFC_SW_DWN",
    label: "Sunlight at the ground",
    short: "Sunlight",
    unit: "kWh/m²/day",
    family: "air",
    definition: "Solar energy reaching the ground after passing through clouds and haze.",
    decimals: 2,
  },
  {
    key: "WS2M",
    label: "Wind speed",
    short: "Wind",
    unit: "m/s",
    family: "air",
    definition: "The average wind speed 2 meters above the ground.",
    decimals: 2,
  },
];

export const VARIABLE_MAP: Record<VariableKey, VariableInfo> = Object.fromEntries(
  VARIABLES.map((v) => [v.key, v]),
) as Record<VariableKey, VariableInfo>;

// Variables NASA POWER is most likely to reject on some endpoints; retried without them.
export const OPTIONAL_KEYS: VariableKey[] = ["GWETROOT"];
