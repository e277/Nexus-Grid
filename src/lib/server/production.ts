/**
 * What each member state grows, measured across the observed series.
 *
 * The World Bank indicators arrive as one row per country per indicator per
 * year. This groups them into series and states a direction across each — the
 * difference between "Guyana's food production index is 111.7" and a change
 * over eight readings.
 *
 * Separate from the route because it is the only part with a decision in it,
 * and a decision worth testing: which window, how few points is too few, and
 * what to do when the baseline is zero.
 */

import type { Observation } from "./sources/types";

/** The World Bank series that describe what a member state actually grows. */
export const PRODUCTION_SERIES = {
  food_production_index: "AG.PRD.FOOD.XD",
  cereal_yield_kg_ha: "AG.YLD.CREL.KG",
} as const;

/** A state needs this many readings before a direction means anything. */
export const MIN_POINTS = 4;

export interface ProductionSummary {
  iso3: string;
  country: string;
  series: Record<string, { year: number; value: number }[]>;
  /** First to last, as a percentage. Null when the series cannot support one. */
  change_pct: number | null;
  covers: string | null;
  points: number;
}

export function summariseProduction(observations: Observation[]): ProductionSummary[] {
  interface StateSeries {
    iso3: string;
    country: string;
    series: Record<string, { year: number; value: number }[]>;
  }

  const states = new Map<string, StateSeries>();

  for (const row of observations) {
    const key = Object.entries(PRODUCTION_SERIES).find(([, id]) => id === row.indicator)?.[0];
    if (!key) continue;

    const entry: StateSeries =
      states.get(row.country_iso3) ??
      { iso3: row.country_iso3, country: row.country, series: {} };
    (entry.series[key] ??= []).push({ year: row.year, value: row.value });
    states.set(row.country_iso3, entry);
  }

  return [...states.values()]
    .map((state) => {
      // Sorted before measuring: the API returns most-recent-first, and a
      // change read off unsorted rows is a change between arbitrary years.
      for (const points of Object.values(state.series)) points.sort((a, b) => a.year - b.year);

      const index = state.series.food_production_index ?? [];
      const first = index[0];
      const last = index[index.length - 1];

      // First to last, never the final step. A one-year move is noise on a
      // series this short, and the last two readings can point opposite to
      // the window they sit in.
      const measurable = index.length >= MIN_POINTS && first && last && first.value !== 0;

      return {
        ...state,
        change_pct: measurable
          ? Math.round(((last.value - first.value) / first.value) * 1000) / 10
          : null,
        covers: index.length > 0 ? `${first.year}–${last.year}` : null,
        points: index.length,
      };
    })
    .filter((state) => state.points > 0)
    .sort((a, b) => (b.change_pct ?? -Infinity) - (a.change_pct ?? -Infinity));
}
