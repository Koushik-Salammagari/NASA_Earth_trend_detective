// Saves NASA POWER data for the demo places into data/saved/, so the app still works
// during the demo if NASA's service is slow. Run once with: npm run save-demo
import { mkdir, writeFile } from "node:fs/promises";

const PLACES = [
  { name: "Mountain View", lat: 37.3861, lon: -122.0839 },
  { name: "Phoenix", lat: 33.4484, lon: -112.074 },
  { name: "Chennai", lat: 13.0827, lon: 80.2707 },
  { name: "London", lat: 51.5072, lon: -0.1276 },
];
const PARAMS = "T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M,GWETROOT,ALLSKY_SFC_SW_DWN,WS2M";
const endYear = new Date().getUTCFullYear() - 1;

await mkdir("data/saved", { recursive: true });
for (const p of PLACES) {
  const url =
    `https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=${PARAMS}` +
    `&community=AG&latitude=${p.lat.toFixed(4)}&longitude=${p.lon.toFixed(4)}&start=1981&end=${endYear}&format=JSON`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`${p.name}: NASA POWER returned ${res.status}`);
    continue;
  }
  const json = await res.json();
  json.endYear = endYear;
  const file = `data/saved/${p.lat.toFixed(2)}_${p.lon.toFixed(2)}.json`;
  await writeFile(file, JSON.stringify(json));
  console.log(`${p.name}: saved ${file}`);
}
