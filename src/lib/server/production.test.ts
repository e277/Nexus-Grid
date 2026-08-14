import { describe, expect, it } from "vitest";

import { summariseProduction } from "./production";
import type { Observation } from "./sources/types";

function series(iso3: string, values: [number, number][]): Observation[] {
  return values.map(([year, value]) => ({
    country_iso3: iso3,
    country: iso3 === "GUY" ? "Guyana" : "Jamaica",
    indicator: "AG.PRD.FOOD.XD",
    indicator_label: "Food production index",
    year,
    value,
    unit: "2014-2016 = 100",
  }));
}

describe("production summary", () => {
  it("reports change across the observed window, not between adjacent years", () => {
    const [state] = summariseProduction(
      series("GUY", [
        [2015, 100],
        [2016, 400],
        [2017, 90],
        [2018, 110],
      ])
    );

    // First to last: 100 → 110. The spike in between is not the trend, and a
    // summary that reported the last step would have said -18%.
    expect(state.change_pct).toBe(10);
    expect(state.covers).toBe("2015–2018");
  });

  it("orders the series before measuring it, whatever order it arrived in", () => {
    const [state] = summariseProduction(
      series("GUY", [
        [2018, 110],
        [2015, 100],
        [2017, 90],
        [2016, 400],
      ])
    );

    expect(state.change_pct).toBe(10);
    expect(state.covers).toBe("2015–2018");
  });

  it("refuses to state a direction from too few readings", () => {
    const [state] = summariseProduction(
      series("JAM", [
        [2015, 100],
        [2016, 130],
      ])
    );

    // A line through two points is not a trend. Null says so; 30% would not.
    expect(state.change_pct).toBeNull();
    expect(state.points).toBe(2);
  });

  it("does not divide by a zero baseline", () => {
    const [state] = summariseProduction(
      series("JAM", [
        [2015, 0],
        [2016, 10],
        [2017, 20],
        [2018, 30],
      ])
    );

    expect(state.change_pct).toBeNull();
  });

  it("ignores indicators it was not asked about", () => {
    const rows: Observation[] = [
      ...series("GUY", [
        [2015, 100],
        [2016, 105],
        [2017, 108],
        [2018, 112],
      ]),
      {
        country_iso3: "GUY",
        country: "Guyana",
        indicator: "SP.POP.TOTL",
        indicator_label: "Population",
        year: 2018,
        value: 780_000,
        unit: "people",
      },
    ];

    const [state] = summariseProduction(rows);
    expect(state.points).toBe(4);
    expect(state.change_pct).toBe(12);
  });

  it("ranks the strongest gain first", () => {
    const summary = summariseProduction([
      ...series("JAM", [
        [2015, 100],
        [2016, 100],
        [2017, 100],
        [2018, 90],
      ]),
      ...series("GUY", [
        [2015, 100],
        [2016, 100],
        [2017, 100],
        [2018, 120],
      ]),
    ]);

    expect(summary.map((s) => s.iso3)).toEqual(["GUY", "JAM"]);
    expect(summary[0].change_pct).toBe(20);
    expect(summary[1].change_pct).toBe(-10);
  });
});
