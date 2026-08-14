/**
 * Extract the CARICOM coastlines from Natural Earth, once, into a committed
 * asset.
 *
 * Run with `npm run build:geo`. The output is checked in, so the app has no
 * build-time dependency on the world atlas and no runtime one on topojson.
 *
 * Why 50m and not 110m: at 110m resolution Natural Earth carries 8 of the 15
 * member states. Antigua, Barbados, Grenada, Montserrat, St Kitts, St Lucia
 * and St Vincent are simply absent — the Eastern Caribbean is exactly where
 * the detail is needed and exactly what the coarser file drops.
 *
 * Why a subset: the 50m world file is 739KB. These fifteen states are 43KB,
 * and 19KB once coordinates are rounded to three decimals — about 110 metres,
 * which is far finer than a basin-scale map resolves.
 *
 * Matching is by ISO 3166-1 numeric code, not by name. Natural Earth writes
 * "Antigua and Barb." and "St. Kitts and Nevis", and has no feature whose name
 * contains "Vincent" at all; the codes are stable and the names are not.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { feature } from "topojson-client";
import world from "world-atlas/countries-50m.json" with { type: "json" };

/** ISO 3166-1 numeric → ISO3, for the 15 CARICOM member states. */
const MEMBER_STATES = {
  "028": "ATG",
  "044": "BHS",
  "052": "BRB",
  "084": "BLZ",
  "212": "DMA",
  "308": "GRD",
  "328": "GUY",
  "332": "HTI",
  "388": "JAM",
  "500": "MSR",
  "659": "KNA",
  "662": "LCA",
  "670": "VCT",
  "740": "SUR",
  "780": "TTO",
};

/** Three decimals ≈ 110m, well under what a regional map can show. */
const PRECISION = 1000;

function round(coordinates) {
  return Array.isArray(coordinates[0])
    ? coordinates.map(round)
    : [Math.round(coordinates[0] * PRECISION) / PRECISION, Math.round(coordinates[1] * PRECISION) / PRECISION];
}

const collection = feature(world, world.objects.countries);

const features = collection.features
  .filter((f) => MEMBER_STATES[String(f.id).padStart(3, "0")])
  .map((f) => ({
    type: "Feature",
    // Only what the map draws with: the ISO3 it joins on and the geometry.
    properties: { iso3: MEMBER_STATES[String(f.id).padStart(3, "0")], name: f.properties.name },
    geometry: { ...f.geometry, coordinates: round(f.geometry.coordinates) },
  }))
  .sort((a, b) => a.properties.iso3.localeCompare(b.properties.iso3));

const missing = Object.values(MEMBER_STATES).filter(
  (iso3) => !features.some((f) => f.properties.iso3 === iso3)
);
if (missing.length > 0) {
  throw new Error(`Natural Earth is missing member states: ${missing.join(", ")}`);
}

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../src/lib/geo/caricom-50m.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ type: "FeatureCollection", features }));

const kb = (JSON.stringify({ type: "FeatureCollection", features }).length / 1024).toFixed(0);
console.log(`Wrote ${features.length} member states to ${out} (${kb}KB)`);
