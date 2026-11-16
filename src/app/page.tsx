"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Database,
  Info,
  Loader2,
  MapPin,
  Minus,
  Search,
  Sparkles,
  Telescope,
} from "lucide-react";
import type { CaseFile, VariableResult } from "@/lib/analyze";
import { VARIABLES, VARIABLE_MAP, type VariableKey } from "@/lib/variables";
import { changeDecimals, changeUnit, fmt, pText, significanceLabel, signed } from "@/lib/format";
import { explainPayload, headlines } from "@/lib/findings";
import { FAMILY_COLOR, SeasonChart, Sparkline, TrendChart } from "@/components/charts";
import Detective, { VerifiedBadge } from "@/components/Detective";
import ClimateStripes from "@/components/ClimateStripes";
import SatelliteCompare from "@/components/SatelliteCompare";

interface Place {
  name: string;
  lat: number;
  lon: number;
}

const QUICK_PICKS: Place[] = [
  { name: "Mountain View, California, United States", lat: 37.3861, lon: -122.0839 },
  { name: "Phoenix, Arizona, United States", lat: 33.4484, lon: -112.074 },
  { name: "Chennai, Tamil Nadu, India", lat: 13.0827, lon: 80.2707 },
  { name: "London, England, United Kingdom", lat: 51.5072, lon: -0.1276 },
];

export default function Home() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [place, setPlace] = useState<Place>(QUICK_PICKS[0]);
  const [data, setData] = useState<CaseFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<VariableKey>("T2M_MAX");
  const [ai, setAi] = useState<{
    status: "idle" | "loading" | "done" | "off";
    text?: string;
    note?: string;
    check?: { checked: number; verified: number; removed: { sentence: string; badNumbers: string[] }[] };
  }>({
    status: "idle",
  });
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runAnalysis = useCallback(async (p: Place) => {
    setPlace(p);
    setLoading(true);
    setError(null);
    setAi({ status: "idle" });
    try {
      const savedMode = new URLSearchParams(window.location.search).get("saved") === "1";
      const res = await fetch(
        `/api/analyze?lat=${p.lat}&lon=${p.lon}&name=${encodeURIComponent(p.name)}${savedMode ? "&source=saved" : ""}`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Something went wrong.");
      setData(json as CaseFile);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    runAnalysis(QUICK_PICKS[0]);
  }, [runAnalysis]);

  // Ask the AI to explain once results arrive.
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    setAi({ status: "loading" });
    fetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...explainPayload(data), yearRange: [data.period.start, data.period.end] }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.text) setAi({ status: "done", text: j.text, check: j.check });
        else setAi({ status: "off", note: j.reason || "AI explanation is unavailable right now." });
      })
      .catch(() => !cancelled && setAi({ status: "off", note: "AI explanation is unavailable right now." }));
    return () => {
      cancelled = true;
    };
  }, [data]);

  function onQueryChange(v: string) {
    setQuery(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (v.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(v)}`);
        const json = await res.json();
        setSuggestions(json.results ?? []);
        setShowSuggestions(true);
      } catch {
        setSuggestions([]);
      }
    }, 250);
  }

  function choose(p: Place) {
    setQuery("");
    setSuggestions([]);
    setShowSuggestions(false);
    runAnalysis(p);
  }

  const heads = useMemo(() => (data ? headlines(data) : []), [data]);
  const selectedResult = data?.variables[selected];

  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="hero-grid text-white">
        <div className="mx-auto max-w-6xl px-5 pb-14 pt-6 sm:px-8">
          <nav className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
                <Telescope className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <span className="text-[15px] font-medium tracking-tight">Earth Trend Detective</span>
            </div>
            <span className="hidden items-center gap-1.5 text-xs text-white/60 sm:flex">
              <Database className="h-3.5 w-3.5" aria-hidden="true" /> NASA POWER data · {data ? `${data.period.start}–${data.period.end}` : "since 1981"}
            </span>
          </nav>

          <div className="mt-14 max-w-3xl">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-sky-300/90">NASA Space Apps 2026</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
              What has really changed where you live?
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/70 sm:text-lg">
              Pick any place on Earth. We pull 45 years of NASA climate data, compare the last decade with the
              past, test which changes are statistically real, and explain what may be driving them.
            </p>
          </div>

          <div className="relative mt-8 max-w-2xl">
            <label htmlFor="place" className="sr-only">
              Search for a place
            </label>
            <div className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 text-ink shadow-[0_8px_30px_rgba(0,0,0,0.25)]">
              <Search className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
              <input
                id="place"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onFocus={() => suggestions.length && setShowSuggestions(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && suggestions[0]) choose(suggestions[0]);
                }}
                placeholder="Search a city, town or region"
                className="w-full bg-transparent text-[15px] outline-none placeholder:text-slate-400"
                autoComplete="off"
              />
            </div>
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white text-ink shadow-xl">
                {suggestions.map((s) => (
                  <li key={`${s.lat},${s.lon}`}>
                    <button
                      onClick={() => choose(s)}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm hover:bg-slate-50"
                    >
                      <MapPin className="h-4 w-4 text-slate-400" aria-hidden="true" />
                      {s.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {QUICK_PICKS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => choose(p)}
                  className={`rounded-full px-3 py-1.5 text-xs ring-1 transition ${
                    place.name === p.name
                      ? "bg-white text-ink ring-white"
                      : "bg-white/5 text-white/80 ring-white/15 hover:bg-white/10"
                  }`}
                >
                  {p.name.split(",")[0]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        {loading && (
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin text-accent" aria-hidden="true" />
            Pulling 45 years of NASA data for {place.name.split(",")[0]} and running the trend tests…
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
            {error}{" "}
            <button className="font-medium underline" onClick={() => runAnalysis(place)}>
              Try again
            </button>
          </div>
        )}

        {data && !loading && (
          <div className="space-y-8">
            {/* Case header */}
            <section className="rise rounded-2xl border border-slate-200 bg-white p-6 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Case file</p>
                  <h2 className="mt-1.5 text-2xl font-semibold tracking-tight">{data.place.name}</h2>
                  <p className="mt-1 text-sm text-slate-500 tabular">
                    {fmt(data.place.lat, 2)}°, {fmt(data.place.lon, 2)}° · Last 10 years ({data.period.recent[0]}–
                    {data.period.recent[1]}) compared with {data.period.baseline[0]}–{data.period.baseline[1]}
                  </p>
                </div>
                {data.source === "saved" && (
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-800 ring-1 ring-amber-200">
                    Showing saved NASA data{data.savedAt ? ` from ${data.savedAt.slice(0, 10)}` : ""}
                  </span>
                )}
              </div>
              {heads.length > 0 ? (
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {heads.map((h) => {
                    const color = FAMILY_COLOR[VARIABLE_MAP[h.key].family];
                    return (
                      <button
                        key={h.key}
                        onClick={() => setSelected(h.key)}
                        className="rounded-xl border border-slate-200 p-4 text-left transition hover:border-slate-300"
                        style={{ borderLeft: `3px solid ${color}`, borderRadius: 0 }}
                      >
                        <p className="text-xs text-slate-500">Significant finding</p>
                        <p className="mt-1 text-[15px] font-medium leading-snug">{h.text}</p>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-6 text-sm text-slate-600">
                  No variable shows a statistically significant 45-year trend here. That&rsquo;s a result too: changes
                  may be real but too small to separate from natural year-to-year swings.
                </p>
              )}
            </section>

            <ClimateStripes key={`stripes-${data.place.name}`} data={data} />

            <Detective
              key={data.place.name}
              place={data.place}
              onFocusVariable={(k) => {
                setSelected(k);
                document.getElementById("detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            />

            {/* What changed */}
            <section>
              <div className="mb-4 flex items-end justify-between">
                <div>
                  <h3 className="text-lg font-semibold tracking-tight">What changed</h3>
                  <p className="text-sm text-slate-500">
                    Last decade versus the 1981–2010 average. Select a card to investigate.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {VARIABLES.map((v) => {
                  const r = data.variables[v.key];
                  if (!r) return null;
                  return (
                    <ChangeCard key={v.key} result={r} active={selected === v.key} onSelect={() => setSelected(v.key)} />
                  );
                })}
              </div>
            </section>

            {/* Detail */}
            {selectedResult && (
              <section id="detail" className="rise grid scroll-mt-6 gap-4 lg:grid-cols-3" key={selected}>
                <div className="rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-lg font-semibold tracking-tight">{VARIABLE_MAP[selected].label}, every year</h3>
                    <span className="text-xs text-slate-500">
                      Dots: yearly values · Dashed: 45-year trend · Dotted: 1981–2010 average · Shaded: last decade
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{VARIABLE_MAP[selected].definition}</p>
                  <div className="mt-4">
                    <TrendChart result={selectedResult} recent={data.period.recent} />
                  </div>
                </div>
                <StatsPanel result={selectedResult} />
                <div className="rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-3">
                  <h3 className="text-base font-semibold tracking-tight">Seasonal fingerprint</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Average for each month: where in the year did the change happen?
                  </p>
                  <div className="mt-4">
                    <SeasonChart
                      result={selectedResult}
                      recentLabel={`${data.period.recent[0]}–${data.period.recent[1]}`}
                    />
                  </div>
                </div>
              </section>
            )}

            <SatelliteCompare key={`sat-${data.place.name}`} place={data.place} />

            {/* Drivers + AI */}
            <section className="grid gap-4 lg:grid-cols-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-3">
                <h3 className="text-lg font-semibold tracking-tight">Possible drivers</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Changes that happened together. These are physical clues, not proof of cause.
                </p>
                {data.drivers.length === 0 ? (
                  <p className="mt-5 text-sm text-slate-600">
                    No linked changes stand out strongly enough here to suggest a driver.
                  </p>
                ) : (
                  <ul className="mt-5 space-y-3">
                    {data.drivers.map((d) => (
                      <li key={d.id} className="rounded-xl border border-slate-200 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[15px] font-medium">{d.title}</p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] ${
                              d.strength === "strong"
                                ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                                : "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
                            }`}
                          >
                            {d.strength === "strong" ? "Strong clue" : "Moderate clue"}
                          </span>
                        </div>
                        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{d.explanation}</p>
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {d.evidence.map((k) => (
                            <button
                              key={k}
                              onClick={() => setSelected(k)}
                              className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-200"
                            >
                              {VARIABLE_MAP[k].label}
                            </button>
                          ))}
                          {d.correlation !== null && (
                            <span className="px-1 text-xs text-slate-500 tabular">
                              year-to-year link r = {fmt(d.correlation, 2)}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4.5 w-4.5 text-accent" aria-hidden="true" />
                  <h3 className="text-lg font-semibold tracking-tight">The detective&rsquo;s summary</h3>
                </div>
                <p className="mt-1 text-xs text-slate-500">Written by AI (Google Gemini) from the numbers above.</p>
                <div className="mt-4 text-sm leading-relaxed text-slate-700">
                  {ai.status === "loading" && (
                    <span className="flex items-center gap-2 text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Writing the summary…
                    </span>
                  )}
                  {ai.status === "done" &&
                    ai.text!.split(/\n\s*\n/).map((p, i) => (
                      <p key={i} className="mb-3 last:mb-0">
                        {p}
                      </p>
                    ))}
                  {ai.status === "off" && <p className="text-slate-500">{ai.note}</p>}
                </div>
                {ai.status === "done" && (
                  <div className="mt-4">
                    <VerifiedBadge check={ai.check} />
                  </div>
                )}
              </div>
            </section>

            <MethodNote />
          </div>
        )}
      </div>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-slate-500 sm:px-8">
          <span>Data: NASA POWER (Prediction Of Worldwide Energy Resources), NASA Langley Research Center.</span>
          <span>Built for the 2026 NASA Space Apps Challenge. Code written with AI assistance.</span>
        </div>
      </footer>
    </main>
  );
}

function ChangeCard({ result, active, onSelect }: { result: VariableResult; active: boolean; onSelect: () => void }) {
  const info = VARIABLE_MAP[result.key];
  const color = FAMILY_COLOR[info.family];
  const c = result.comparison;
  const t = result.trend;
  const Arrow = !c || Math.abs(c.change) < 1e-9 ? Minus : c.change > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <button
      onClick={onSelect}
      aria-pressed={active}
      className={`rounded-2xl border bg-white p-4 text-left transition ${
        active ? "border-transparent ring-2" : "border-slate-200 hover:border-slate-300"
      }`}
      style={active ? ({ "--tw-ring-color": color } as React.CSSProperties) : undefined}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-600">{info.label}</span>
        <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" />
      </div>
      {c ? (
        <div className="mt-2 flex items-baseline gap-1.5">
          <Arrow className="h-4.5 w-4.5 self-center" style={{ color }} aria-hidden="true" />
          <span className="text-2xl font-semibold tracking-tight tabular">{signed(c.change, changeDecimals(result.key))}</span>
          <span className="text-sm text-slate-500">{changeUnit(result.key)}</span>
          {result.key === "PRECTOTCORR" && c.percentChange !== null && (
            <span className="text-sm text-slate-500 tabular">({signed(c.percentChange, 0)}%)</span>
          )}
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-500">Not enough data</p>
      )}
      <Sparkline result={result} color={color} />
      <span
        className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] ${
          t?.significance === "significant"
            ? "bg-slate-900 text-white"
            : t?.significance === "suggestive"
              ? "bg-slate-200 text-slate-800"
              : "bg-slate-100 text-slate-500"
        }`}
      >
        {significanceLabel(t)}
      </span>
    </button>
  );
}

function StatsPanel({ result }: { result: VariableResult }) {
  const info = VARIABLE_MAP[result.key];
  const t = result.trend;
  const c = result.comparison;
  const d = changeDecimals(result.key);
  const verdict =
    t?.significance === "significant"
      ? `Real change. A trend this strong would be very unlikely if nothing were changing.`
      : t?.significance === "suggestive"
        ? `Leaning one way, but not yet strong enough to rule out chance. A few more years of data may settle it.`
        : `No clear trend. Year-to-year swings are larger than any steady change.`;

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Verdict</p>
      <p className="mt-2 text-[15px] font-medium leading-snug">{verdict}</p>
      <dl className="mt-5 space-y-3 text-sm">
        {t && (
          <Row label="45-year trend" value={`${signed(t.slopePerDecade, d)} ${changeUnit(result.key)} / decade`} />
        )}
        {c && (
          <>
            <Row label={`${c.baselineStart}–${c.baselineEnd} average`} value={`${fmt(c.baselineMean, info.decimals)} ${info.unit}`} />
            <Row label={`${c.recentStart}–${c.recentEnd} average`} value={`${fmt(c.recentMean, info.decimals)} ${info.unit}`} />
          </>
        )}
        {t && <Row label="Mann-Kendall test" value={`${pText(t.pValue)}, ${t.n} years`} />}
      </dl>
      <p className="mt-auto flex gap-1.5 pt-5 text-xs leading-relaxed text-slate-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        p is the chance of seeing a trend this strong if there were no real trend. Below 0.05 counts as significant.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5 last:border-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium tabular">{value}</dd>
    </div>
  );
}

function MethodNote() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm leading-relaxed text-slate-600">
      <h3 className="text-base font-semibold tracking-tight text-ink">How the detective works</h3>
      <ol className="mt-3 grid gap-3 sm:grid-cols-3">
        <li>
          <span className="font-medium text-ink">1. Gather.</span> Monthly data for the chosen point from NASA POWER,
          whose weather values come from NASA&rsquo;s MERRA-2 model (about 50 km resolution), from 1981 to the latest full year.
        </li>
        <li>
          <span className="font-medium text-ink">2. Test.</span> Monthly values become yearly averages (rainfall becomes
          a yearly total), which removes the seasonal cycle. A Mann-Kendall test checks for a steady trend and Sen&rsquo;s
          slope measures its size.
        </li>
        <li>
          <span className="font-medium text-ink">3. Connect.</span> Variables that changed together are matched to known
          physical links, then AI explains the results in plain English. Clues are hypotheses, not proven causes.
        </li>
      </ol>
    </section>
  );
}
