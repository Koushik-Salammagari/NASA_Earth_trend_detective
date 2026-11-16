"use client";

// "Climate stripes" for any place: one stripe per year, colored by how far that
// year was from the 1981–2010 average. Can be downloaded as a share image.
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import type { CaseFile } from "@/lib/analyze";
import { fmt, signed } from "@/lib/format";

type Mode = "T2M" | "PRECTOTCORR";

// Diverging palettes, from below-average to above-average.
const PALETTES: Record<Mode, string[]> = {
  T2M: ["#08306b", "#08519c", "#2171b5", "#4292c6", "#6baed6", "#9ecae1", "#c6dbef", "#deebf7",
        "#fee0d2", "#fcbba1", "#fc9272", "#fb6a4a", "#ef3b2c", "#cb181d", "#a50f15", "#67000d"],
  PRECTOTCORR: ["#543005", "#8c510a", "#bf812d", "#dfc27d", "#f6e8c3", "#f5f5f5",
                "#c7eae5", "#80cdc1", "#35978f", "#01665e", "#003c30"],
};

const MODES: Record<Mode, { label: string; low: string; high: string; unit: string; decimals: number }> = {
  T2M: { label: "Temperature", low: "Cooler than average", high: "Warmer than average", unit: "°C", decimals: 2 },
  PRECTOTCORR: { label: "Rainfall", low: "Drier than average", high: "Wetter than average", unit: "mm", decimals: 0 },
};

function hexToRgb(h: string) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function colorFor(t: number, palette: string[]) {
  // t in [-1, 1] → interpolate across the palette.
  const x = ((Math.max(-1, Math.min(1, t)) + 1) / 2) * (palette.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = hexToRgb(palette[i]);
  const b = hexToRgb(palette[Math.min(palette.length - 1, i + 1)]);
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export default function ClimateStripes({ data }: { data: CaseFile }) {
  const [mode, setMode] = useState<Mode>("T2M");
  const [hover, setHover] = useState<number | null>(null);
  const info = MODES[mode];
  const result = data.variables[mode];

  const stripes = useMemo(() => {
    if (!result || !result.comparison) return [];
    const base = result.comparison.baselineMean;
    const devs = result.annual.map((d) => ({ year: d.year, value: d.value, dev: d.value - base }));
    // Scale so the most extreme year sits near the end of the palette.
    const scale = Math.max(...devs.map((d) => Math.abs(d.dev)), 1e-9);
    return devs.map((d) => ({ ...d, color: colorFor(d.dev / scale, PALETTES[mode]) }));
  }, [result, mode]);

  if (!result || stripes.length === 0) return null;

  const first = stripes[0].year;
  const last = stripes[stripes.length - 1].year;
  const short = data.place.name.split(",")[0];
  const base = result.comparison!;
  const h = hover !== null ? stripes[hover] : null;

  function download() {
    const W = 1200;
    const H = 630;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    const sw = W / stripes.length;
    stripes.forEach((s, i) => {
      ctx.fillStyle = s.color;
      ctx.fillRect(Math.floor(i * sw), 0, Math.ceil(sw) + 1, H);
    });
    // caption band
    ctx.fillStyle = "rgba(11,18,32,0.82)";
    ctx.fillRect(0, H - 150, W, 150);
    ctx.fillStyle = "#ffffff";
    ctx.font = "600 40px Inter, system-ui, sans-serif";
    ctx.fillText(`${short} · ${info.label.toLowerCase()} ${first}–${last}`, 48, H - 92);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "22px Inter, system-ui, sans-serif";
    ctx.fillText(
      `Each stripe is one year. ${mode === "T2M" ? "Blue is cooler, red is warmer" : "Brown is drier, teal is wetter"} than the ${base.baselineStart}–${base.baselineEnd} average.`,
      48,
      H - 56,
    );
    ctx.fillText("Data: NASA POWER (MERRA-2) · Earth Trend Detective", 48, H - 24);
    const a = document.createElement("a");
    a.download = `${short.replace(/[^\w-]+/g, "_")}_${mode === "T2M" ? "temperature" : "rainfall"}_stripes.png`;
    a.href = c.toDataURL("image/png");
    a.click();
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4 p-6 pb-4">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">
            {short}&rsquo;s climate stripes, {first}–{last}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Each stripe is one year, colored against the {base.baselineStart}–{base.baselineEnd} average.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs" role="group" aria-label="Stripes variable">
            {(Object.keys(MODES) as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                disabled={!data.variables[m]}
                className={`rounded-md px-2.5 py-1.5 ${mode === m ? "bg-white font-medium shadow-sm" : "text-slate-600"}`}
              >
                {MODES[m].label}
              </button>
            ))}
          </div>
          <button
            onClick={download}
            className="flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-ink/90"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" /> Share image
          </button>
        </div>
      </div>

      <div className="relative" onMouseLeave={() => setHover(null)}>
        <div className="flex h-40 w-full sm:h-48" role="img" aria-label={`${info.label} stripes for ${short}, ${first} to ${last}`}>
          {stripes.map((s, i) => (
            <div
              key={s.year}
              className="h-full flex-1 transition-opacity"
              style={{ background: s.color, opacity: hover === null || hover === i ? 1 : 0.55 }}
              onMouseEnter={() => setHover(i)}
            />
          ))}
        </div>
        {h && (
          <div
            className="pointer-events-none absolute top-3 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs text-white shadow-lg tabular"
            style={{ left: `${Math.min(92, Math.max(8, ((hover! + 0.5) / stripes.length) * 100))}%` }}
          >
            <span className="font-medium">{h.year}</span> · {fmt(h.value, info.decimals)} {info.unit} (
            {signed(h.dev, info.decimals)} vs average)
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-3 text-xs text-slate-500 tabular">
        <span>{first}</span>
        <span className="flex items-center gap-2">
          {info.low}
          <span
            className="h-2 w-24 rounded-full"
            style={{ background: `linear-gradient(90deg, ${PALETTES[mode].join(",")})` }}
            aria-hidden="true"
          />
          {info.high}
        </span>
        <span>{last}</span>
      </div>
    </section>
  );
}
