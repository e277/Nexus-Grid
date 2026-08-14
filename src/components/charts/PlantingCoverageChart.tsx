"use client";

import { api } from "../../api";
import { usePoll } from "../../hooks";
import { cn } from "../../lib/utils";
import { ChartFrame } from "./chart-kit";
import { Skeleton } from "../ui/skeleton";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const SHORT = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/**
 * Which months the region can start a rain-fed season, member state by member
 * state — and therefore which months it collectively cannot.
 *
 * This is the closest honest thing to the brief's "forecast shortages before
 * they occur". It is deliberately **not** a forecast: NASA POWER supplies a
 * thirty-year climatology, a long-run monthly normal, so what this shows is
 * structural — the months regional supply is thin every year, not a prediction
 * about this one.
 *
 * Forecasting yields would need a historical yield series per crop per state.
 * The only sources that carry one are credentialed or paid, and those were
 * deliberately excluded so every figure here is reproducible. Producing a
 * forecast without that series would mean inventing the numbers underneath it,
 * which is the one thing this console does not do.
 *
 * The thin months are the coordination signal: a month where two states can
 * plant and twelve cannot is a month the region imports through, and it is
 * visible here without anyone predicting anything.
 */
export function PlantingCoverageChart() {
  const { data } = usePoll(() => api.picture(), 60_000);

  if (!data) return <Skeleton className="h-64" />;

  const states = data.picture.states.filter((s) => (s.rain_fed_months ?? []).length > 0);
  if (states.length === 0) return null;

  const perMonth = MONTHS.map(
    (month) => states.filter((s) => (s.rain_fed_months ?? []).includes(month)).length
  );
  const peak = Math.max(1, ...perMonth);
  const thinnest = Math.min(...perMonth);
  const thinMonths = MONTHS.filter((_, i) => perMonth[i] === thinnest);

  return (
    <ChartFrame
      title="Regional planting coverage, month by month"
      subtitle={`How many of ${states.length} member states can start a rain-fed season in each month. Thinnest: ${thinMonths.join(", ")} at ${thinnest} — a long-run normal from NASA POWER, not a forecast. Coordination is between member states, not individual farms: no farm-level planting data is published for the region`}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-separate border-spacing-[2px]">
          <thead>
            <tr>
              <th className="w-40 text-left text-ng-2xs font-bold uppercase tracking-[.5px] text-ng-secondary">
                Member state
              </th>
              {MONTHS.map((month, i) => (
                <th
                  key={month}
                  scope="col"
                  className="px-0 text-center text-ng-2xs font-bold uppercase text-ng-secondary"
                  title={month}
                >
                  {SHORT[i]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {states.map((state) => (
              <tr key={state.iso3}>
                <th
                  scope="row"
                  className="truncate py-0.5 pr-2 text-left text-ng-xs font-medium text-ng-primary"
                  title={state.name}
                >
                  {state.name}
                </th>
                {MONTHS.map((month) => {
                  const can = (state.rain_fed_months ?? []).includes(month);
                  return (
                    <td key={month} className="p-0">
                      {/* Filled or empty, never a colour scale: a state either
                          can start a rain-fed season in a month or it cannot,
                          and shading a binary would invent a middle. */}
                      <span
                        className={cn(
                          "block h-4 w-full rounded-[2px]",
                          can ? "bg-ng-accent" : "border border-dashed border-ng-border"
                        )}
                        title={`${state.name} · ${month} · ${can ? "can plant rain-fed" : "not rain-fed"}`}
                      />
                      <span className="sr-only">
                        {state.name} {month}: {can ? "can plant rain-fed" : "not rain-fed"}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th
                scope="row"
                className="pt-1.5 pr-2 text-left text-ng-2xs font-bold uppercase tracking-[.5px] text-ng-secondary"
              >
                States able to plant
              </th>
              {perMonth.map((count, i) => (
                <td key={MONTHS[i]} className="pt-1.5 text-center align-bottom">
                  {/* One hue, light to dark, because this is a magnitude. The
                      count is printed as well as shaded, so the number is
                      never only a colour. */}
                  <span
                    className="mx-auto block h-5 rounded-[2px] text-center text-ng-2xs font-bold leading-5 tabular-nums text-ng-primary"
                    style={{
                      background: `color-mix(in oklab, var(--color-accent) ${Math.round(
                        18 + (count / peak) * 62
                      )}%, var(--color-surface))`,
                    }}
                    title={`${count} of ${states.length} member states in ${MONTHS[i]}`}
                  >
                    {count}
                  </span>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </ChartFrame>
  );
}
