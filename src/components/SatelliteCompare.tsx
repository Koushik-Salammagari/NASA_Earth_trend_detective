"use client";

// Before/after satellite view from NASA GIBS (Global Imagery Browse Services).
// Images are monthly MODIS Terra composites requested straight from GIBS WMS.
import { useEffect, useMemo, useState } from "react";
import { Loader2, Satellite } from "lucide-react";

type LayerId = "ndvi" | "lst";

const LAYERS: Record<LayerId, { name: string; gibs: string; legend: [string, string]; gradient: string; note: string }> = {
  ndvi: {
    name: "Vegetation",
    gibs: "MODIS_Terra_L3_NDVI_Monthly",
    legend: ["Bare or dry", "Green and dense"],
    gradient: "linear-gradient(90deg,#a68a64,#d9cf8c,#9cc55a,#3e8e2f,#0f5a1c)",
    note: "NDVI: how green the land is, from MODIS on NASA's Terra satellite",
  },
  lst: {
    name: "Daytime land temperature",
    gibs: "MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day",
    legend: ["Cooler surface", "Hotter surface"],
    gradient: "linear-gradient(90deg,#fff6a8,#ffd23f,#ff9a1f,#f0521c,#a5150e)",
    note: "Land surface temperature by day, from MODIS on NASA's Terra satellite",
  },
};

const MONTHS = [
  { m: "01", label: "January" },
  { m: "04", label: "April" },
  { m: "07", label: "July" },
  { m: "10", label: "October" },
];

const BEFORE_YEAR = 2001;
const AFTER_YEAR = 2025;
// Months GIBS does not have for a layer, so we use the year before instead.
const MISSING: Partial<Record<LayerId, string[]>> = { ndvi: ["2025-04"] };

function afterTime(layer: LayerId, month: string) {
  const ym = `${AFTER_YEAR}-${month}`;
  return MISSING[layer]?.includes(ym) ? `${AFTER_YEAR - 1}-${month}` : ym;
}

function gibsUrl(layer: LayerId, ym: string, lat: number, lon: number) {
  const halfLat = 1.0;
  const halfLon = Math.min(3, (halfLat * 4) / 3 / Math.max(0.35, Math.cos((lat * Math.PI) / 180)));
  const s = Math.max(-90, lat - halfLat);
  const n = Math.min(90, lat + halfLat);
  const params = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.3.0",
    LAYERS: `BlueMarble_ShadedRelief_Bathymetry,${LAYERS[layer].gibs},Reference_Features_15m`,
    STYLES: "",
    CRS: "EPSG:4326",
    BBOX: [s, lon - halfLon, n, lon + halfLon].map((v) => v.toFixed(4)).join(","),
    WIDTH: "960",
    HEIGHT: "720",
    FORMAT: "image/jpeg",
    TIME: `${ym}-01`,
  });
  return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${params.toString()}`;
}

function monthName(ym: string) {
  const [y, m] = ym.split("-");
  return `${MONTHS.find((x) => x.m === m)?.label ?? m} ${y}`;
}

export default function SatelliteCompare({ place }: { place: { name: string; lat: number; lon: number } }) {
  const [layer, setLayer] = useState<LayerId>("ndvi");
  const [month, setMonth] = useState(place.lat >= 0 ? "07" : "01");
  const [pos, setPos] = useState(50);
  const [loaded, setLoaded] = useState({ before: false, after: false });
  const [failed, setFailed] = useState(false);

  const beforeYm = `${BEFORE_YEAR}-${month}`;
  const afterYm = afterTime(layer, month);
  const beforeSrc = useMemo(() => gibsUrl(layer, beforeYm, place.lat, place.lon), [layer, beforeYm, place.lat, place.lon]);
  const afterSrc = useMemo(() => gibsUrl(layer, afterYm, place.lat, place.lon), [layer, afterYm, place.lat, place.lon]);

  useEffect(() => {
    setLoaded({ before: false, after: false });
    setFailed(false);
  }, [beforeSrc, afterSrc]);

  const ready = loaded.before && loaded.after;
  const info = LAYERS[layer];
  const short = place.name.split(",")[0];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Satellite className="h-4.5 w-4.5 text-accent" aria-hidden="true" />
            <h3 className="text-lg font-semibold tracking-tight">Seen from space</h3>
          </div>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Real NASA satellite images around {short}, {BEFORE_YEAR} against {AFTER_YEAR}. Drag the slider to compare.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs" role="group" aria-label="Satellite layer">
            {(Object.keys(LAYERS) as LayerId[]).map((id) => (
              <button
                key={id}
                onClick={() => setLayer(id)}
                aria-pressed={layer === id}
                className={`rounded-md px-2.5 py-1.5 ${layer === id ? "bg-white font-medium shadow-sm" : "text-slate-600"}`}
              >
                {LAYERS[id].name}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs" role="group" aria-label="Month">
            {MONTHS.map((x) => (
              <button
                key={x.m}
                onClick={() => setMonth(x.m)}
                aria-pressed={month === x.m}
                className={`rounded-md px-2.5 py-1.5 ${month === x.m ? "bg-white font-medium shadow-sm" : "text-slate-600"}`}
              >
                {x.label.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className="relative mt-5 aspect-[4/3] w-full select-none overflow-hidden rounded-xl bg-slate-900 sm:aspect-[16/10]"
        style={{ touchAction: "pan-y" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={beforeSrc}
          alt={`${info.name} around ${short}, ${monthName(beforeYm)}`}
          className="absolute inset-0 h-full w-full object-cover"
          onLoad={() => setLoaded((l) => ({ ...l, before: true }))}
          onError={() => setFailed(true)}
          draggable={false}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={afterSrc}
          alt={`${info.name} around ${short}, ${monthName(afterYm)}`}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
          onLoad={() => setLoaded((l) => ({ ...l, after: true }))}
          onError={() => setFailed(true)}
          draggable={false}
        />

        {/* place marker */}
        <span
          className="pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-4 ring-black/40"
          aria-hidden="true"
        />

        {/* divider */}
        <div className="pointer-events-none absolute inset-y-0" style={{ left: `${pos}%` }} aria-hidden="true">
          <div className="absolute inset-y-0 -left-px w-0.5 bg-white shadow-[0_0_8px_rgba(0,0,0,0.5)]" />
          <div className="absolute left-1/2 top-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-xs font-semibold text-slate-700 shadow-lg">
            ⇆
          </div>
        </div>

        <span className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white">
          {monthName(beforeYm)}
        </span>
        <span className="pointer-events-none absolute right-3 top-3 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white">
          {monthName(afterYm)}
        </span>

        {!ready && !failed && (
          <div className="absolute inset-0 grid place-items-center bg-slate-900/60 text-sm text-white/80">
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading NASA satellite images…
            </span>
          </div>
        )}
        {failed && (
          <div className="absolute inset-0 grid place-items-center bg-slate-900/80 p-6 text-center text-sm text-white/80">
            NASA&rsquo;s image service didn&rsquo;t respond. Try another month or come back in a minute.
          </div>
        )}

        <input
          type="range"
          min={0}
          max={100}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          aria-label={`Compare ${monthName(beforeYm)} with ${monthName(afterYm)}`}
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <span>{info.legend[0]}</span>
          <span className="h-2 w-28 rounded-full" style={{ background: info.gradient }} aria-hidden="true" />
          <span>{info.legend[1]}</span>
        </div>
        <span>{info.note}. Imagery: NASA GIBS. The view is about 220 km from top to bottom; the dot marks the place.</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        One month in one year can be unusual, so treat this as a picture, not a trend. The statistics above are the
        evidence.
      </p>
    </section>
  );
}
