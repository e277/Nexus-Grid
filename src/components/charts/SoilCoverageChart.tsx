"use client";

import { api } from "../../api";
import { usePoll } from "../../hooks";
import { ChartFrame } from "./chart-kit";
import { ScrollFade } from "../ui/scroll-fade";
import { Skeleton } from "../ui/skeleton";

/** ISRIC's workable pH band for most field crops — see soil.ts's own suitability() note. */
function phBand(ph: number): { label: string; tone: string } {
  if (ph < 5.5) return { label: "acidic", tone: "text-ng-warning-tx" };
  if (ph > 7.5) return { label: "alkaline", tone: "text-ng-warning-tx" };
  return { label: "workable", tone: "text-ng-success-tx" };
}

/** One hue, light to dark — a magnitude, same technique as this table's own footer row elsewhere. */
function shade(value: number, max: number): string {
  return `color-mix(in oklab, var(--color-accent) ${Math.round(18 + (value / Math.max(1, max)) * 62)}%, var(--color-surface))`;
}

/**
 * Soil at each state's main growing area — pH, organic carbon, clay and sand
 * from ISRIC SoilGrids, one 250m reading per state, refreshed monthly.
 *
 * pH gets a plain number plus a workable/acidic/alkaline label rather than a
 * colour scale: the workable range is a band in the middle, not a magnitude,
 * so shading light-to-dark would read "darker is better" for a value where
 * both extremes are the problem. Organic carbon, clay and sand are genuine
 * magnitudes and are shaded accordingly.
 *
 * Sorted most acidic first — the domain's own brief is which states' physical
 * conditions constrain what they can supply, and low pH (needing lime before
 * cereals or legumes) is the most actionable constraint in this reading.
 */
export function SoilCoverageChart() {
  const { data } = usePoll(() => api.picture(), 60_000);

  if (!data) return <Skeleton className="h-64" />;

  const states = data.picture.states.filter((s) => s.soil?.has_coverage);
  if (states.length === 0) return null;

  const maxCarbon = Math.max(0, ...states.map((s) => s.soil?.organic_carbon_g_per_kg ?? 0));
  const maxClay = Math.max(0, ...states.map((s) => s.soil?.clay_pct ?? 0));
  const maxSand = Math.max(0, ...states.map((s) => s.soil?.sand_pct ?? 0));

  const sorted = [...states].sort((a, b) => (a.soil?.ph ?? 99) - (b.soil?.ph ?? 99));

  return (
    <ChartFrame
      title="Soil at each state's main growing area"
      subtitle={`${states.length} of ${data.picture.states.length} member states covered — pH, organic carbon and texture from ISRIC SoilGrids, most acidic first. A starting point for an agronomist, not a recommendation on its own.`}
      variant="supporting"
    >
      <ScrollFade className="overflow-x-auto" fadeFrom="ng-bg">
        <table className="w-full min-w-[540px] border-separate border-spacing-[2px]">
          <thead>
            <tr>
              <th className="w-40 text-left text-ng-2xs font-bold uppercase tracking-[.5px] text-ng-secondary">
                Member state
              </th>
              <th className="px-2 text-right text-ng-2xs font-bold uppercase tracking-[.5px] text-ng-secondary">
                pH
              </th>
              <th className="px-2 text-right text-ng-2xs font-bold uppercase tracking-[.5px] text-ng-secondary">
                Organic carbon
              </th>
              <th className="px-2 text-right text-ng-2xs font-bold uppercase tracking-[.5px] text-ng-secondary">
                Clay %
              </th>
              <th className="px-2 text-right text-ng-2xs font-bold uppercase tracking-[.5px] text-ng-secondary">
                Sand %
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((state) => {
              const soil = state.soil;
              const band = soil?.ph !== null && soil?.ph !== undefined ? phBand(soil.ph) : null;
              return (
                <tr key={state.iso3}>
                  <th
                    scope="row"
                    className="truncate py-0.5 pr-2 text-left text-ng-xs font-medium text-ng-primary"
                    title={soil?.suitability}
                  >
                    {state.name}
                  </th>
                  <td className="whitespace-nowrap px-2 py-0.5 text-right text-ng-xs tabular-nums" title={soil?.suitability}>
                    {soil?.ph !== null && soil?.ph !== undefined ? (
                      <>
                        <span className="text-ng-primary">{soil.ph.toFixed(1)}</span>{" "}
                        <span className={band?.tone}>{band?.label}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td
                    className="px-2 py-0.5 text-right text-ng-2xs font-semibold tabular-nums text-ng-primary"
                    style={
                      soil?.organic_carbon_g_per_kg !== null && soil?.organic_carbon_g_per_kg !== undefined
                        ? { background: shade(soil.organic_carbon_g_per_kg, maxCarbon) }
                        : undefined
                    }
                  >
                    {soil?.organic_carbon_g_per_kg ?? "—"}
                  </td>
                  <td
                    className="px-2 py-0.5 text-right text-ng-2xs font-semibold tabular-nums text-ng-primary"
                    style={
                      soil?.clay_pct !== null && soil?.clay_pct !== undefined
                        ? { background: shade(soil.clay_pct, maxClay) }
                        : undefined
                    }
                  >
                    {soil?.clay_pct ?? "—"}
                  </td>
                  <td
                    className="px-2 py-0.5 text-right text-ng-2xs font-semibold tabular-nums text-ng-primary"
                    style={
                      soil?.sand_pct !== null && soil?.sand_pct !== undefined
                        ? { background: shade(soil.sand_pct, maxSand) }
                        : undefined
                    }
                  >
                    {soil?.sand_pct ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollFade>
    </ChartFrame>
  );
}
