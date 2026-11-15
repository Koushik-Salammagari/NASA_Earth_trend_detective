"use client";

import { useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  Code2,
  Loader2,
  MessageSquareText,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  UserRound,
  Workflow,
} from "lucide-react";
import type { Investigation, TraceStep } from "@/lib/investigate";
import { VARIABLE_MAP, type VariableKey } from "@/lib/variables";
import { PERSONAS, type Persona } from "@/lib/personas";

interface Check {
  checked: number;
  verified: number;
  removed: { sentence: string; badNumbers: string[] }[];
}

const PIPELINE = [
  "Understand the question",
  "Fetch NASA POWER data",
  "Test trends",
  "Find when in the year it changed",
  "Check linked changes",
  "Write the case report",
  "Fact-check every number",
];

export function VerifiedBadge({ check }: { check: Check | null | undefined }) {
  if (!check) return null;
  const clean = check.removed.length === 0;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ${
        clean ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-amber-50 text-amber-800 ring-amber-200"
      }`}
    >
      {clean ? <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> : <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />}
      {check.checked === 0
        ? "No numbers to check"
        : clean
          ? `All ${check.verified} numbers verified against NASA data`
          : `${check.verified} of ${check.checked} numbers verified · ${check.removed.length} sentence${check.removed.length > 1 ? "s" : ""} removed`}
    </span>
  );
}

export default function Detective({
  place,
  onFocusVariable,
}: {
  place: { name: string; lat: number; lon: number };
  onFocusVariable: (k: VariableKey) => void;
}) {
  const short = place.name.split(",")[0];
  const other = short === "Phoenix" ? "London" : "Phoenix";
  const examples = [
    `Are summers in ${short} getting hotter, and why?`,
    `Is ${short} getting drier?`,
    `How does ${short} compare with ${other}?`,
    `Are nights warming faster than days?`,
  ];

  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<Investigation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"report" | "trace">("report");

  async function ask(q: string) {
    const text = q.trim();
    if (text.length < 4) {
      setError("Type a question first.");
      return;
    }
    setQuestion(text);
    setStatus("loading");
    setError(null);
    setTab("report");
    try {
      const res = await fetch("/api/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, lat: place.lat, lon: place.lon, name: place.name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Something went wrong.");
      setResult(json as Investigation);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStatus("error");
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent/10 text-accent">
          <MessageSquareText className="h-4 w-4" aria-hidden="true" />
        </span>
        <h3 className="text-lg font-semibold tracking-tight">Ask the detective</h3>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Ask your own question about {short}. The detective plans an investigation, runs the tests on NASA data, and
        writes an answer where every number is checked.
      </p>

      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <label htmlFor="question" className="sr-only">
          Your question
        </label>
        <input
          id="question"
          value={question}
          onChange={(e) => {
            setQuestion(e.target.value);
            if (error) setError(null);
          }}
          placeholder={examples[0]}
          maxLength={300}
          className="h-11 flex-1 rounded-xl border border-slate-300 px-4 text-[15px] outline-none placeholder:text-slate-400 focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-ink px-5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-70"
        >
          {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
          Investigate
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {examples.map((ex) => (
          <button
            key={ex}
            onClick={() => ask(ex)}
            disabled={status === "loading"}
            className="rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-200 disabled:opacity-60"
          >
            {ex}
          </button>
        ))}
      </div>

      {status === "loading" && (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-5">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden="true" /> Investigating… usually 5–20 seconds
          </p>
          <ol className="mt-3 grid gap-1.5 text-sm text-slate-500 sm:grid-cols-2">
            {PIPELINE.map((p, i) => (
              <li key={p} className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-slate-100 text-[11px] text-slate-600 tabular">{i + 1}</span>
                {p}
              </li>
            ))}
          </ol>
        </div>
      )}

      {status === "done" && result && (
        <div className="rise mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
            <div className="flex gap-1" role="tablist">
              {(
                [
                  ["report", "Case report", Sparkles],
                  ["trace", "How it worked", Workflow],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition ${
                    tab === id ? "border-ink font-medium text-ink" : "border-transparent text-slate-500 hover:text-ink"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" /> {label}
                </button>
              ))}
            </div>
            <span className="pb-2 text-xs text-slate-500 tabular">
              {result.totals.steps} steps · {result.totals.aiCalls} AI calls · {(result.totals.ms / 1000).toFixed(1)} s
            </span>
          </div>

          {tab === "report" ? (
            <ReportView result={result} onFocusVariable={onFocusVariable} />
          ) : (
            <TraceView result={result} />
          )}
        </div>
      )}
    </section>
  );
}

function ReportView({ result, onFocusVariable }: { result: Investigation; onFocusVariable: (k: VariableKey) => void }) {
  return (
    <div className="pt-5">
      <p className="text-sm text-slate-500">&ldquo;{result.question}&rdquo;</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-slate-500">Investigated:</span>
        {result.plan.variables.map((k) => (
          <button
            key={k}
            onClick={() => onFocusVariable(k)}
            className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-700 hover:bg-slate-200"
          >
            {VARIABLE_MAP[k].label}
          </button>
        ))}
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-700">
          {result.plan.season === "year" ? "Whole year" : result.plan.season[0].toUpperCase() + result.plan.season.slice(1)}
        </span>
        {result.plan.comparePlace && (
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-700">vs {result.plan.comparePlace}</span>
        )}
      </div>

      <div className="mt-4 rounded-xl bg-slate-50 p-5">
        {result.report ? (
          <>
            <div className="space-y-3 text-[15px] leading-relaxed text-slate-800">
              {result.report.split(/\n\s*\n/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <VerifiedBadge check={result.check} />
              <span className="text-xs text-slate-500">Written by AI (Google Gemini) from computed facts.</span>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-600">
            The AI writer didn&rsquo;t respond, but the investigation ran. See &ldquo;How it worked&rdquo; for every
            computed fact.
          </p>
        )}
      </div>

      {result.report && <Impact result={result} />}
    </div>
  );
}

function Impact({ result }: { result: Investigation }) {
  const [persona, setPersona] = useState<Persona | null>(null);
  const [state, setState] = useState<{ loading: boolean; text?: string | null; check?: Check; error?: string }>({ loading: false });

  async function choose(p: Persona) {
    setPersona(p);
    setState({ loading: true });
    try {
      const res = await fetch("/api/impact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place: result.place.name, persona: p, facts: result.facts, yearRange: result.yearRange }),
      });
      const json = await res.json();
      if (!res.ok || !json.text) throw new Error(json.error || json.reason || "AI service didn't respond.");
      setState({ loading: false, text: json.text, check: json.check });
    } catch (e) {
      setState({ loading: false, error: e instanceof Error ? e.message : "Something went wrong." });
    }
  }

  return (
    <div className="mt-6">
      <p className="flex items-center gap-2 text-sm font-medium">
        <UserRound className="h-4 w-4 text-slate-500" aria-hidden="true" /> What does this mean for me?
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {PERSONAS.map((p) => (
          <button
            key={p}
            onClick={() => choose(p)}
            disabled={state.loading}
            aria-pressed={persona === p}
            className={`rounded-full px-3 py-1.5 text-xs ring-1 transition disabled:opacity-60 ${
              persona === p ? "bg-ink text-white ring-ink" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"
            }`}
          >
            {p}
          </button>
        ))}
      </div>
      {state.loading && (
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Translating for a {persona?.toLowerCase()}…
        </p>
      )}
      {state.error && <p className="mt-3 text-sm text-red-700">{state.error}</p>}
      {state.text && !state.loading && (
        <div className="rise mt-3 rounded-xl border border-slate-200 p-4">
          <ul className="space-y-2 text-sm leading-relaxed text-slate-700">
            {state.text.split(/\n+/).map((line, i) => (
              <li key={i} className={line.startsWith("Try this:") ? "font-medium text-ink" : ""}>
                {line}
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <VerifiedBadge check={state.check} />
          </div>
        </div>
      )}
    </div>
  );
}

function TraceView({ result }: { result: Investigation }) {
  const [open, setOpen] = useState<number | null>(null);
  const [showFacts, setShowFacts] = useState(false);
  const det = result.trace.filter((t) => t.kind !== "ai").length;

  return (
    <div className="pt-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Steps" value={String(result.totals.steps)} />
        <Metric label="AI calls" value={String(result.totals.aiCalls)} />
        <Metric label="Deterministic steps" value={String(det)} />
        <Metric label="Total time" value={`${(result.totals.ms / 1000).toFixed(1)} s`} />
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Plan made by {result.planSource === "ai" ? "AI (validated against a fixed schema)" : "keyword rules (AI answer was unavailable or invalid)"}.
        AI only reads the question and writes the report; every number comes from code.
      </p>

      <ol className="mt-4 space-y-2">
        {result.trace.map((s) => (
          <TraceRow key={s.id} step={s} open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)} />
        ))}
      </ol>

      <button
        onClick={() => setShowFacts(!showFacts)}
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent"
        aria-expanded={showFacts}
      >
        <ChevronDown className={`h-4 w-4 transition ${showFacts ? "rotate-180" : ""}`} aria-hidden="true" />
        {showFacts ? "Hide" : "Show"} the {result.facts.length} computed facts the AI was given
      </button>
      {showFacts && (
        <ul className="mt-2 space-y-1.5 rounded-xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-700">
          {result.facts.map((f, i) => (
            <li key={i} className="tabular">
              {i + 1}. {f}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold tabular">{value}</p>
    </div>
  );
}

function TraceRow({ step, open, onToggle }: { step: TraceStep; open: boolean; onToggle: () => void }) {
  const Icon = step.kind === "ai" ? Sparkles : step.kind === "check" ? ShieldCheck : Code2;
  const kindLabel = step.kind === "ai" ? `AI${step.model ? ` · ${step.model}` : ""}` : step.kind === "check" ? "Code check" : "Code";
  const statusStyle: Record<TraceStep["status"], string> = {
    ok: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    fallback: "bg-amber-50 text-amber-800 ring-amber-200",
    skipped: "bg-slate-100 text-slate-600 ring-slate-200",
    error: "bg-red-50 text-red-800 ring-red-200",
  };
  const statusLabel: Record<TraceStep["status"], string> = {
    ok: "Done",
    fallback: step.kind === "check" ? "Corrected" : "Fallback used",
    skipped: "Skipped",
    error: "Failed",
  };

  return (
    <li className="rounded-xl border border-slate-200">
      <button onClick={onToggle} className="flex w-full items-start gap-3 p-3 text-left" aria-expanded={open}>
        <span
          className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg ${
            step.kind === "ai" ? "bg-violet-50 text-violet-700" : step.kind === "check" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"
          }`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">
              {step.id}. {step.name}
            </span>
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{kindLabel}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${statusStyle[step.status]}`}>{statusLabel[step.status]}</span>
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{step.detail}</span>
        </span>
        <span className="shrink-0 text-xs text-slate-500 tabular">{step.ms} ms</span>
      </button>
      {open && (
        <div className="grid gap-2 border-t border-slate-200 p-3 sm:grid-cols-2">
          <DataBlock label="Input" value={step.input} />
          <DataBlock label="Output" value={step.output} />
        </div>
      )}
    </li>
  );
}

function DataBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
        {value === undefined ? "—" : typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
