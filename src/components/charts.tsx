"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { VariableResult } from "@/lib/analyze";
import { VARIABLE_MAP, type Family } from "@/lib/variables";
import { fmt } from "@/lib/format";

export const FAMILY_COLOR: Record<Family, string> = {
  heat: "#e0532b",
  water: "#0b85a8",
  air: "#6d55e8",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function Sparkline({ result, color }: { result: VariableResult; color: string }) {
  return (
    <div className="h-10 w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={result.annual} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line type="linear" dataKey="value" stroke={color} strokeWidth={1.6} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendChart({
  result,
  recent,
}: {
  result: VariableResult;
  recent: [number, number];
}) {
  const info = VARIABLE_MAP[result.key];
  const color = FAMILY_COLOR[info.family];
  const t = result.trend;
  const data = result.annual.map((d) => ({
    year: d.year,
    value: Number(d.value.toFixed(info.decimals + 1)),
    trend: t ? Number((t.intercept + t.slopePerYear * d.year).toFixed(info.decimals + 1)) : undefined,
  }));
  const baselineMean = result.comparison?.baselineMean;

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="#e7e9ee" vertical={false} />
          <XAxis dataKey="year" tick={{ fontSize: 12, fill: "#5b6474" }} tickLine={false} axisLine={{ stroke: "#d5d9e0" }} minTickGap={24} />
          <YAxis
            tick={{ fontSize: 12, fill: "#5b6474" }}
            tickLine={false}
            axisLine={false}
            width={52}
            domain={["auto", "auto"]}
            tickFormatter={(v: number) => fmt(v, info.decimals > 1 ? 1 : info.decimals)}
          />
          <ReferenceArea x1={recent[0]} x2={recent[1]} fill={color} fillOpacity={0.07} ifOverflow="extendDomain" />
          {baselineMean !== undefined && (
            <ReferenceLine
              y={baselineMean}
              stroke="#8a93a3"
              strokeDasharray="3 4"
            />
          )}
          <Tooltip
            contentStyle={{ borderRadius: 10, border: "1px solid #e2e5eb", fontSize: 12 }}
            formatter={(v, n) => [`${fmt(Number(v), info.decimals)} ${info.unit}`, n === "trend" ? "Trend line" : info.label]}
            labelFormatter={(l) => `Year ${l}`}
          />
          <Line type="linear" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 2.2, fill: color, strokeWidth: 0 }} activeDot={{ r: 4 }} />
          {t && (
            <Line type="linear" dataKey="trend" stroke="#0b1220" strokeWidth={1.6} strokeDasharray="6 5" dot={false} activeDot={false} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SeasonChart({ result, recentLabel }: { result: VariableResult; recentLabel: string }) {
  const info = VARIABLE_MAP[result.key];
  const color = FAMILY_COLOR[info.family];
  const unit = result.key === "PRECTOTCORR" ? "mm/month" : info.unit;
  const data = MONTHS.map((m, i) => ({
    month: m,
    baseline: result.seasonalBaseline[i] ?? undefined,
    recent: result.seasonalRecent[i] ?? undefined,
  }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
          <CartesianGrid stroke="#e7e9ee" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#5b6474" }} tickLine={false} axisLine={{ stroke: "#d5d9e0" }} />
          <YAxis tick={{ fontSize: 11, fill: "#5b6474" }} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => fmt(v, info.decimals > 1 ? 1 : info.decimals)} />
          <Tooltip
            contentStyle={{ borderRadius: 10, border: "1px solid #e2e5eb", fontSize: 12 }}
            formatter={(v, n) => [`${fmt(Number(v), info.decimals)} ${unit}`, n === "baseline" ? "1981–2010" : recentLabel]}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12 }}
            formatter={(v: string) => (v === "baseline" ? "1981–2010" : recentLabel)}
          />
          <Bar dataKey="baseline" fill="#c5cbd6" radius={[3, 3, 0, 0]} />
          <Bar dataKey="recent" fill={color} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
