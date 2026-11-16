// Compares two NASA GIBS satellite snapshots of the same area and measures the change.
// GIBS images are colored with a published colormap, so each pixel color maps back to a real value.
import { NextRequest, NextResponse } from "next/server";
import { PNG } from "pngjs";
import {
  AFTER_YEAR,
  BEFORE_YEAR,
  LAYERS,
  MONTHS,
  snapshot,
  viewBox,
  wmsUrl,
  type LayerId,
  type SatelliteCompareResult,
} from "@/lib/satellite";

export const runtime = "nodejs";

const W = 240;
const H = 180;
const RADIUS_KM = 25;

const colormapCache = new Map<string, Map<number, number>>();

async function loadColormap(name: string) {
  const cached = colormapCache.get(name);
  if (cached) return cached;
  const res = await fetch(`https://gibs.earthdata.nasa.gov/colormaps/v1.3/${name}.xml`, {
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`colormap ${res.status}`);
  const xml = await res.text();
  const map = new Map<number, number>();
  for (const m of xml.matchAll(/<ColorMapEntry\b([^>]*)\/?>/g)) {
    const attrs = m[1];
    if (/transparent="true"/.test(attrs) || /nodata="true"/.test(attrs)) continue;
    const rgb = attrs.match(/rgb="(\d+),(\d+),(\d+)"/);
    const value = attrs.match(/\svalue="([^"]+)"/);
    if (!rgb || !value) continue;
    const nums = value[1].replace(/[[\]()]/g, "").split(",").map(Number);
    const mid = nums.length > 1 && Number.isFinite(nums[1]) ? (nums[0] + nums[1]) / 2 : nums[0];
    if (!Number.isFinite(mid)) continue;
    map.set((Number(rgb[1]) << 16) | (Number(rgb[2]) << 8) | Number(rgb[3]), mid);
  }
  colormapCache.set(name, map);
  return map;
}

async function loadValues(layer: LayerId, time: string, lat: number, lon: number, cmap: Map<number, number>) {
  const res = await fetch(wmsUrl(LAYERS[layer].gibs, time, lat, lon, W, H, true), { next: { revalidate: 86400 } });
  if (!res.ok || !(res.headers.get("content-type") || "").includes("png")) throw new Error(`imagery ${res.status}`);
  const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
  const out = new Float64Array(W * H).fill(NaN);
  const conv = LAYERS[layer].toDisplay;
  for (let i = 0; i < W * H; i++) {
    const p = i * 4;
    if (png.data[p + 3] < 255) continue;
    const v = cmap.get((png.data[p] << 16) | (png.data[p + 1] << 8) | png.data[p + 2]);
    if (v !== undefined) out[i] = conv(v);
  }
  return out;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const layer = (sp.get("layer") || "ndvi") as LayerId;
  const lat = Number(sp.get("lat"));
  const lon = Number(sp.get("lon"));
  const month = sp.get("month") || "07";
  if (!(layer in LAYERS) || !Number.isFinite(lat) || !Number.isFinite(lon) || !MONTHS.some((m) => m.m === month)) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const info = LAYERS[layer];
  const before = snapshot(layer, BEFORE_YEAR, month);
  const after = snapshot(layer, AFTER_YEAR, month);

  try {
    const cmap = await loadColormap(info.colormap);
    const [a, b] = await Promise.all([
      loadValues(layer, before.time, lat, lon, cmap),
      loadValues(layer, after.time, lat, lon, cmap),
    ]);

    const box = viewBox(lat, lon);
    const kmPerPxY = ((box.north - box.south) / H) * 111.32;
    const kmPerPxX = ((box.east - box.west) / W) * 111.32 * Math.cos((lat * Math.PI) / 180);

    const grid = new Int8Array(W * H).fill(-128);
    let nAll = 0, sumA = 0, sumB = 0, more = 0, less = 0, same = 0;
    let nNear = 0, nearA = 0, nearB = 0;
    for (let i = 0; i < W * H; i++) {
      if (Number.isNaN(a[i]) || Number.isNaN(b[i])) continue;
      const d = b[i] - a[i];
      nAll++;
      sumA += a[i];
      sumB += b[i];
      if (d > info.sameBand) more++;
      else if (d < -info.sameBand) less++;
      else same++;
      grid[i] = Math.max(-127, Math.min(127, Math.round((d / info.fullScale) * 127)));
      const x = (i % W) - W / 2 + 0.5;
      const y = Math.floor(i / W) - H / 2 + 0.5;
      if (Math.hypot(x * kmPerPxX, y * kmPerPxY) <= RADIUS_KM) {
        nNear++;
        nearA += a[i];
        nearB += b[i];
      }
    }

    const body: SatelliteCompareResult = {
      layer,
      before,
      after,
      radiusKm: RADIUS_KM,
      near: nNear >= 10 ? { before: nearA / nNear, after: nearB / nNear, pixels: nNear } : null,
      view: nAll >= 30 ? { before: sumA / nAll, after: sumB / nAll, pixels: nAll } : null,
      share:
        nAll >= 30
          ? { more: (100 * more) / nAll, less: (100 * less) / nAll, same: (100 * same) / nAll }
          : null,
      grid: { w: W, h: H, data: Buffer.from(grid.buffer).toString("base64") },
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
  } catch (e) {
    return NextResponse.json(
      { error: "NASA's satellite service didn't respond. Try again in a minute.", detail: String(e) },
      { status: 502 },
    );
  }
}
