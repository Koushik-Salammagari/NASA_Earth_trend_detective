"use client";

// "Seen from space": the same area in two years, side by side, plus a change map
// and a plain-English summary measured from NASA's own pixel values.
import { useEffect, useRef, useState } from "react";
import { Loader2, Satellite } from "lucide-react";
import {
  AFTER_YEAR,
  BEFORE_YEAR,
  LAYERS,
  MONTHS,
  basemapUrl,
  defaultMonth,
  pictureUrl,
  snapshot,
  type LayerId,
  type SatelliteCompareResult,
} from "@/lib/satellite";

const CHANGE_STOPS: Record<LayerId, string[]> = {
  ndvi: ["#8c510a", "#d8b365", "#f5f5f5", "#5ab4ac", "#01665e"],
  lst: ["#2166ac", "#92c5de", "#f7f7f7", "#f4a582", "#b2182b"],
};

function hex(h: string) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(stops: string[], t: number) {
  const x = ((Math.max(-1, Math.min(1, t)) + 1) / 2) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = hex(stops[i]);
  const b = hex(stops[i + 1]);
  return a.map((v, k) => Math.round(v + (b[k] - v) * f));
}

function fmtValue(layer: LayerId, v: number) {
  const info = LAYERS[layer];
  return `${v.toFixed(info.decimals)}${info.unit ? ` ${info.unit}` : ""}`;
}

function compareWords(layer: LayerId, before: number, after: number) {
  const info = LAYERS[layer];
  const d = after - before;
  if (Math.abs(d) <= info.sameBand) return { word: info.words.same, tone: "same" as const, amount: "" };
  const amount = layer === "lst" ? `${Math.abs(d).toFixed(1)} °C ` : "";
  return d > 0
    ? { word: `${amount}${info.words.more}`, tone: "more" as const, amount }
    : { word: `${amount}${info.words.less}`, tone: "less" as const, amount };
}

export default function SatelliteCompare({ place }: { place: { name: string; lat: number; lon: number } }) {
  const [layer, setLayer] = useState<LayerId>("ndvi");
  const [month, setMonth] = useState(defaultMonth(place.lat));
  const [result, setResult] = useState<SatelliteCompareResult | null>(null);
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  const [imgLoaded, setImgLoaded] = useState({ a: false, b: false });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const info = LAYERS[layer];
  const before = snapshot(layer, BEFORE_YEAR, month);
  const after = snapshot(layer, AFTER_YEAR, month);
  const short = place.name.split(",")[0];

  useEffect(() => {
    const ctrl = new AbortController();
    setStatus("loading");
    setResult(null);
    setImgLoaded({ a: false, b: false });
    fetch(`/api/satellite?layer=${layer}&lat=${place.lat}&lon=${place.lon}&month=${month}`, { signal: ctrl.signal })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setResult(j as SatelliteCompareResult);
        setStatus("done");
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setStatus("error");
      });
    return () => ctrl.abort();
  }, [layer, month, place.lat, place.lon]);

  // Draw the change map.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !result) return;
    const { w, h, data } = result.grid;
    const bytes = Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0));
    const vals = new Int8Array(bytes.buffer);
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(w, h);
    const stops = CHANGE_STOPS[result.layer];
    for (let i = 0; i < w * h; i++) {
      const v = vals[i];
      if (v === -128) continue;
      const t = v / 127;
      const [r, g, b] = mix(stops, t);
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = Math.round(255 * (0.55 + 0.45 * Math.min(1, Math.abs(t))));
    }
    ctx.putImageData(img, 0, 0);
  }, [result]);

  const near = result?.near;
  const view = result?.view;
  const share = result?.share;
  const nearWords = near ? compareWords(layer, near.before, near.after) : null;
  const radiusPctOfHeight = ((result?.radiusKm ?? 25) / 222.6) * 100;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex items-center gap-2">
        <Satellite className="h-4.5 w-4.5 text-accent" aria-hidden="true" />
        <h3 className="text-lg font-semibold tracking-tight">Seen from space</h3>
      </div>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        The same area around {short} (about 220 km across), photographed by NASA&rsquo;s Terra satellite in{" "}
        {BEFORE_YEAR} and {AFTER_YEAR}. Pick what to look at and the time of year.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Look at</span>
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs" role="group" aria-label="What to look at">
            {(Object.keys(LAYERS) as LayerId[]).map((id) => (
              <button
                key={id}
                onClick={() => setLayer(id)}
                aria-pressed={layer === id}
                className={`rounded-md px-3 py-1.5 ${layer === id ? "bg-white font-medium shadow-sm" : "text-slate-600"}`}
              >
                {LAYERS[id].name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Time of year</span>
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs" role="group" aria-label="Time of year">
            {MONTHS.map((x) => (
              <button
                key={x.m}
                onClick={() => setMonth(x.m)}
                aria-pressed={month === x.m}
                className={`rounded-md px-3 py-1.5 ${month === x.m ? "bg-white font-medium shadow-sm" : "text-slate-600"}`}
              >
                {x.short}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* The answer, in words */}
      <div className="mt-5 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
        {status === "loading" && (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Measuring the change from NASA&rsquo;s
            satellite data…
          </p>
        )}
        {status === "error" && (
          <p className="text-sm text-slate-600">
            NASA&rsquo;s satellite service didn&rsquo;t respond. The pictures below may still load; try again in a
            minute.
          </p>
        )}
        {status === "done" && result && (
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              {near && nearWords ? (
                <p className="text-[15px] font-medium leading-snug">
                  Within {result.radiusKm} km of {short}, {result.after.label} was{" "}
                  <span
                    className={
                      nearWords.tone === "same"
                        ? ""
                        : layer === "ndvi"
                          ? nearWords.tone === "more"
                            ? "text-teal-700"
                            : "text-amber-800"
                          : nearWords.tone === "more"
                            ? "text-red-700"
                            : "text-blue-700"
                    }
                  >
                    {nearWords.word}
                  </span>{" "}
                  {nearWords.tone === "same" ? "as" : "than"} {result.before.label}.
                </p>
              ) : (
                <p className="text-[15px] font-medium leading-snug">
                  Not enough clear land near {short} in these snapshots (water, cloud or missing data). Try another
                  time of year.
                </p>
              )}
              {share && (
                <p className="mt-1.5 text-sm text-slate-600">
                  Across the whole area: {Math.round(share.more)}% of the land got {info.words.more},{" "}
                  {Math.round(share.less)}% got {info.words.less}, and {Math.round(share.same)}% stayed about the same.
                </p>
              )}
            </div>
            {near && (
              <div className="flex items-center gap-3 tabular">
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">{result.before.year}</p>
                  <p className="text-xl font-semibold">{fmtValue(layer, near.before)}</p>
                </div>
                <span className="text-slate-400" aria-hidden="true">
                  →
                </span>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">{result.after.year}</p>
                  <p className="text-xl font-semibold">{fmtValue(layer, near.after)}</p>
                </div>
              </div>
            )}
          </div>
        )}
        {status === "done" && near && (
          <p className="mt-2 text-xs text-slate-500">
            {info.words.quantity}, averaged over the land within {result!.radiusKm} km.
          </p>
        )}
      </div>

      {/* Before and after pictures */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {[
          { key: "a" as const, snap: before },
          { key: "b" as const, snap: after },
        ].map(({ key, snap }) => (
          <figure key={key + snap.time + layer}>
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pictureUrl(layer, snap.time, place.lat, place.lon)}
                alt={`${info.name} around ${short}, ${snap.label}`}
                className="absolute inset-0 h-full w-full"
                onLoad={() => setImgLoaded((s) => ({ ...s, [key]: true }))}
              />
              <span
                className="pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_3px_rgba(37,82,216,0.8),0_0_0_7px_rgba(0,0,0,0.3)]"
                aria-hidden="true"
              />
              <span className="absolute left-3 top-3 rounded-md bg-black/65 px-2.5 py-1 text-sm font-semibold text-white">
                {snap.label}
              </span>
              {!imgLoaded[key] && (
                <div className="absolute inset-0 grid place-items-center text-sm text-white/70">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                </div>
              )}
            </div>
          </figure>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span className="flex items-center gap-2">
          {info.legend[0]}
          <span className="h-2 w-28 rounded-full" style={{ background: info.gradient }} aria-hidden="true" />
          {info.legend[1]}
        </span>
        <span>The dot marks {short}. Blue is sea.</span>
      </div>

      {/* Change map */}
      <div className="mt-6 grid gap-4 lg:grid-cols-[3fr_2fr] lg:items-center">
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={basemapUrl(place.lat, place.lon)}
            alt=""
            className="absolute inset-0 h-full w-full opacity-70 grayscale"
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full"
            aria-label={`Map of where ${info.name.toLowerCase()} changed between ${before.label} and ${after.label}`}
          />
          <span
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-white/90"
            style={{ height: `${radiusPctOfHeight * 2}%`, aspectRatio: "1 / 1" }}
            aria-hidden="true"
          />
          <span className="absolute left-3 top-3 rounded-md bg-black/65 px-2.5 py-1 text-sm font-semibold text-white">
            What changed
          </span>
          {status === "loading" && (
            <div className="absolute inset-0 grid place-items-center text-sm text-white/70">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="text-sm leading-relaxed text-slate-600">
          <p className="font-medium text-ink">How to read the change map</p>
          <p className="mt-1.5">
            Each colored dot is about 1 km of land. It compares {after.label} with {before.label} at that exact spot.
          </p>
          <div className="mt-3 flex items-center gap-2 text-xs">
            {info.changeLegend[0]}
            <span className="h-2 w-32 rounded-full" style={{ background: info.changeGradient }} aria-hidden="true" />
            {info.changeLegend[1]}
          </div>
          <p className="mt-3">
            Pale means little change. The dashed circle is the {result?.radiusKm ?? 25} km area used for the summary
            above.
          </p>
          <p className="mt-3 text-xs text-slate-500">
            A single snapshot can be unusual (a dry month, a heatwave, a wet spring), so treat this as a picture, not
            a trend. The 45-year statistics above are the evidence. {info.note}; imagery and values from NASA GIBS.
          </p>
        </div>
      </div>
    </section>
  );
}
