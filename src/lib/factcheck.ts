// Deterministic fact-checker: every number the AI writes must match a number the app computed.
// Sentences containing a number that doesn't match are removed.

const NUM = /[-−+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?|[-−+]?\d+(?:\.\d+)?/g;

function parseNumbers(text: string): { raw: string; value: number; decimals: number }[] {
  // Remove names and units that contain digits so they aren't mistaken for data values.
  const cleaned = text.replace(/MERRA-2|CO2|m²|m2|²|³/g, " ");
  const out: { raw: string; value: number; decimals: number }[] = [];
  for (const m of cleaned.matchAll(NUM)) {
    const raw = m[0];
    const idx = m.index ?? 0;
    // Skip digits glued to a preceding letter, such as model or product names ("x3", "Gemini3").
    if (/[A-Za-z]/.test(cleaned[idx - 1] ?? " ")) continue;
    const norm = raw.replace(/,/g, "").replace("−", "-").replace("+", "");
    const value = Number(norm);
    if (!Number.isFinite(value)) continue;
    const decimals = norm.includes(".") ? norm.split(".")[1].length : 0;
    out.push({ raw, value, decimals });
  }
  return out;
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

export interface FactCheckResult {
  text: string;
  checked: number;
  verified: number;
  removed: { sentence: string; badNumbers: string[] }[];
}

export function factCheck(aiText: string, facts: string[], yearRange: [number, number]): FactCheckResult {
  const allowed = facts.flatMap((f) => parseNumbers(f).map((n) => Math.abs(n.value)));

  const ok = (n: { value: number; decimals: number }) => {
    const v = Math.abs(n.value);
    if (n.decimals === 0 && v >= yearRange[0] && v <= yearRange[1]) return true; // a year in the data period
    if (n.decimals === 0 && v <= 12) return true; // small counts like "three variables" or month numbers
    return allowed.some((a) => round(a, n.decimals) === round(v, n.decimals) || Math.abs(a - v) < 1e-9);
  };

  const paragraphs = aiText.split(/\n\s*\n/);
  let checked = 0;
  let verified = 0;
  const removed: FactCheckResult["removed"] = [];

  const keptParagraphs = paragraphs
    .map((p) => {
      const sentences = p.split(/(?<=[.!?])\s+(?=[A-Z"“(])/);
      const kept = sentences.filter((s) => {
        const nums = parseNumbers(s);
        const bad = nums.filter((n) => !ok(n));
        checked += nums.length;
        verified += nums.length - bad.length;
        if (bad.length) {
          removed.push({ sentence: s.trim(), badNumbers: bad.map((b) => b.raw) });
          return false;
        }
        return true;
      });
      return kept.join(" ").trim();
    })
    .filter(Boolean);

  return { text: keptParagraphs.join("\n\n"), checked, verified, removed };
}
