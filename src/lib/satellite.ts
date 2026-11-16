// Shared settings for the "Seen from space" comparison (NASA GIBS imagery).
// Pure functions only, so both the page and the API route can use them.

export type LayerId = "ndvi" | "lst";

export interface LayerInfo {
  name: string;
  gibs: string; // GIBS layer identifier
  colormap: string; // GIBS colormap file (maps each color to a value)
  period: "month" | "8day";
  unit: string;
  decimals: number;
  /** Converts a GIBS value to what we show (LST comes in kelvin). */
  toDisplay: (v: number) => number;
  /** Change smaller than this counts as "about the same". */
  sameBand: number;
  /** Change that gets the strongest color on the change map. */
  fullScale: number;
  words: { more: string; less: string; same: string; quantity: string };
  legend: [string, string];
  gradient: string;
  changeLegend: [string, string];
  changeGradient: string;
  note: string;
}

export const LAYERS: Record<LayerId, LayerInfo> = {
  ndvi: {
    name: "Vegetation",
    gibs: "MODIS_Terra_L3_NDVI_Monthly",
    colormap: "MODIS_L3_NDVI",
    period: "month",
    unit: "",
    decimals: 2,
    toDisplay: (v) => v,
    sameBand: 0.02,
    fullScale: 0.2,
    words: { more: "greener", less: "less green", same: "about as green", quantity: "Greenness (NDVI, 0 to 1)" },
    legend: ["Bare or dry", "Green and dense"],
    gradient: "linear-gradient(90deg,#a68a64,#d9cf8c,#9cc55a,#3e8e2f,#0f5a1c)",
    changeLegend: ["Less green", "Greener"],
    changeGradient: "linear-gradient(90deg,#8c510a,#d8b365,#f5f5f5,#5ab4ac,#01665e)",
    note: "NDVI (monthly average), from the MODIS instrument on NASA's Terra satellite",
  },
  lst: {
    name: "Land temperature",
    gibs: "MODIS_Terra_L3_Land_Surface_Temp_8Day_Day",
    colormap: "MODIS_Land_Surface_Temp",
    period: "8day",
    unit: "°C",
    decimals: 1,
    toDisplay: (v) => v - 273.15,
    sameBand: 1,
    fullScale: 8,
    words: { more: "hotter", less: "cooler", same: "about as hot", quantity: "Daytime ground temperature" },
    legend: ["Cooler ground", "Hotter ground"],
    gradient: "linear-gradient(90deg,#fff6a8,#ffd23f,#ff9a1f,#f0521c,#a5150e)",
    changeLegend: ["Cooler", "Hotter"],
    changeGradient: "linear-gradient(90deg,#2166ac,#92c5de,#f7f7f7,#f4a582,#b2182b)",
    note: "Daytime land surface temperature (8-day average, 1 km), from MODIS on NASA's Terra satellite",
  },
};

export const MONTHS = [
  { m: "01", label: "January", short: "Jan" },
  { m: "04", label: "April", short: "Apr" },
  { m: "07", label: "July", short: "Jul" },
  { m: "10", label: "October", short: "Oct" },
];

export const BEFORE_YEAR = 2001;
export const AFTER_YEAR = 2025;

// Monthly composites GIBS does not have, so we use the year before instead.
const MISSING_MONTHS: Partial<Record<LayerId, string[]>> = { ndvi: ["2025-04"] };
// 8-day composites start on day 1, 9, 17, ... of each year; pick the one nearest mid-month.
const MID_MONTH_DOY: Record<string, number> = { "01": 9, "04": 105, "07": 193, "10": 289 };
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface Snapshot {
  time: string; // GIBS TIME value
  label: string; // what the person sees
  year: number;
}

export function snapshot(layer: LayerId, year: number, month: string): Snapshot {
  if (LAYERS[layer].period === "8day") {
    const start = new Date(Date.UTC(year, 0, MID_MONTH_DOY[month]));
    const end = new Date(start.getTime() + 7 * 86400000);
    const label =
      start.getUTCMonth() === end.getUTCMonth()
        ? `${start.getUTCDate()}–${end.getUTCDate()} ${MONTH_SHORT[start.getUTCMonth()]} ${year}`
        : `${start.getUTCDate()} ${MONTH_SHORT[start.getUTCMonth()]}–${end.getUTCDate()} ${MONTH_SHORT[end.getUTCMonth()]} ${year}`;
    return { time: start.toISOString().slice(0, 10), label, year };
  }
  let y = year;
  if (MISSING_MONTHS[layer]?.includes(`${y}-${month}`)) y -= 1;
  const name = MONTHS.find((x) => x.m === month)?.label ?? month;
  return { time: `${y}-${month}-01`, label: `${name} ${y}`, year: y };
}

export function defaultMonth(lat: number) {
  return lat >= 0 ? "07" : "01";
}

/** View box around the place: about 220 km tall, 4:3 on screen. */
export function viewBox(lat: number, lon: number) {
  const halfLat = 1.0;
  const halfLon = Math.min(3, (halfLat * 4) / 3 / Math.max(0.35, Math.cos((lat * Math.PI) / 180)));
  return {
    south: Math.max(-90, lat - halfLat),
    north: Math.min(90, lat + halfLat),
    west: lon - halfLon,
    east: lon + halfLon,
  };
}

export function wmsUrl(layers: string, time: string | null, lat: number, lon: number, w: number, h: number, png: boolean) {
  const b = viewBox(lat, lon);
  const params = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.3.0",
    LAYERS: layers,
    STYLES: "",
    CRS: "EPSG:4326",
    BBOX: [b.south, b.west, b.north, b.east].map((v) => v.toFixed(4)).join(","),
    WIDTH: String(w),
    HEIGHT: String(h),
    FORMAT: png ? "image/png" : "image/jpeg",
  });
  if (png) params.set("TRANSPARENT", "TRUE");
  if (time) params.set("TIME", time);
  return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${params.toString()}`;
}

/** Picture for people to look at: relief basemap + data + coastlines and borders. */
export function pictureUrl(layer: LayerId, time: string, lat: number, lon: number) {
  return wmsUrl(`BlueMarble_ShadedRelief_Bathymetry,${LAYERS[layer].gibs},Reference_Features_15m`, time, lat, lon, 960, 720, false);
}

/** Basemap only, used under the change map. */
export function basemapUrl(lat: number, lon: number) {
  return wmsUrl("BlueMarble_ShadedRelief_Bathymetry,Reference_Features_15m", null, lat, lon, 960, 720, false);
}

/** Result of /api/satellite. */
export interface SatelliteCompareResult {
  layer: LayerId;
  before: Snapshot;
  after: Snapshot;
  radiusKm: number;
  near: { before: number; after: number; pixels: number } | null;
  view: { before: number; after: number; pixels: number } | null;
  share: { more: number; less: number; same: number } | null; // % of land pixels
  grid: { w: number; h: number; data: string }; // base64 Int8, change scaled to ±127, -128 = no data
}
