import { NextRequest, NextResponse } from "next/server";

// Place search via the free Open-Meteo geocoding API (no key needed).
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", q);
  url.searchParams.set("count", "6");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  try {
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    const results = (json.results ?? []).map(
      (r: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }) => ({
        name: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
        lat: r.latitude,
        lon: r.longitude,
      }),
    );
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [], error: "Place search is unavailable right now." }, { status: 502 });
  }
}
