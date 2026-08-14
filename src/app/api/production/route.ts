import { api } from "@/lib/server/http";
import { fetchAllSources } from "@/lib/server/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The World Bank series that describe what a member state actually grows. */
const SERIES = {
  food_production_index: "AG.PRD.FOOD.XD",
  cereal_yield_kg_ha: "AG.YLD.CREL.KG",
} as const;

/** A state needs this many years before a direction means anything. */
const MIN_POINTS = 4;

/**
 * Production over time, per member state.
 *
 * The World Bank indicators are fetched as a full series from 2015 and the
 * regional projection keeps only the latest value of each. This exposes the
 * series itself, which is the difference between "Guyana's food production
 * index is 111.7" and "Guyana has added output in four of the last six years".
 *
 * The direction is computed here rather than in a prompt, because it is
 * arithmetic and a model asked to eyeball a trend will sometimes assert one
 * that is not in the numbers.
 */
export const GET = api(async () => {
  const bundle = await fetchAllSources(false);
  const observations = bundle.indicators.records ?? [];

  interface StateSeries {
    iso3: string;
    country: string;
    series: Record<string, { year: number; value: number }[]>;
  }

  const states = new Map<string, StateSeries>();

  for (const row of observations) {
    const key = Object.entries(SERIES).find(([, id]) => id === row.indicator)?.[0];
    if (!key) continue;

    const entry: StateSeries =
      states.get(row.country_iso3) ??
      { iso3: row.country_iso3, country: row.country, series: {} };
    (entry.series[key] ??= []).push({ year: row.year, value: row.value });
    states.set(row.country_iso3, entry);
  }

  const production = [...states.values()]
    .map((state) => {
      for (const points of Object.values(state.series)) points.sort((a, b) => a.year - b.year);

      const index = state.series.food_production_index ?? [];
      const first = index[0];
      const last = index[index.length - 1];

      return {
        ...state,
        // Null rather than zero when there is too little to say. A flat line
        // drawn through two points is a claim the data does not support.
        change_pct:
          index.length >= MIN_POINTS && first && last && first.value !== 0
            ? Math.round(((last.value - first.value) / first.value) * 1000) / 10
            : null,
        covers:
          index.length > 0 ? `${index[0].year}–${index[index.length - 1].year}` : null,
        points: index.length,
      };
    })
    .filter((state) => state.points > 0)
    .sort((a, b) => (b.change_pct ?? -Infinity) - (a.change_pct ?? -Infinity));

  return {
    production,
    provenance: {
      publisher: "World Bank Open Data",
      documentation: "https://data.worldbank.org/indicator",
      indicators: Object.values(SERIES),
      note: "Observed annual series, not a projection.",
    },
  };
});
