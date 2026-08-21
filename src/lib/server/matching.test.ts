/**
 * Supplier matching turns a list of lanes into a decision, so what has to hold
 * is that the ranking follows the evidence and refuses to rank on anything it
 * did not observe.
 */

import { describe, expect, it } from "vitest";

import { matchAllGaps, matchSuppliers } from "./matching";
import type { RegionalPicture, StateProfile } from "./projection";

function state(overrides: Partial<StateProfile> & Pick<StateProfile, "iso3" | "name">): StateProfile {
  return {
    food_import_share_pct: null,
    arable_land_pct: null,
    agriculture_value_added_pct: null,
    population: null,
    food_imports_usd: 1_000_000,
    intra_caricom_share_pct: null,
    climate_risk: "low",
    year: 2023,
    cereal_yield_kg_ha: null,
    cereal_land_ha: null,
    cereal_production_mt: null,
    cereal_production_year: null,
    agricultural_land_pct: null,
    soil: null,
    rain_fed_months: [],
    ...overrides,
  };
}

const GAP = {
  commodity: "Cereals",
  commodity_code: "10",
  importer: "Guyana",
  importer_iso3: "GUY",
  external_usd: 190_000_000,
  intra_usd: 0,
  external_share_pct: 100,
  regional_suppliers: ["Jamaica", "Trinidad and Tobago"],
  top_external_partners: ["United States"],
};

function picture(overrides: Partial<RegionalPicture> = {}): RegionalPicture {
  return {
    states: [
      state({ iso3: "GUY", name: "Guyana" }),
      state({ iso3: "JAM", name: "Jamaica" }),
      state({ iso3: "TTO", name: "Trinidad and Tobago" }),
    ],
    totals: {
      food_imports_usd: 1_000_000_000,
      intra_caricom_usd: 90_000_000,
      intra_caricom_share_pct: 9,
      states_covered: 3,
      trade_year: 2023,
    },
    substitution_opportunities: [GAP],
    planting_alignment: [],
    climate: { islands_at_risk: [], active_storms: [] },
    agronomy: { states_with_soil_coverage: 0, states_with_planting_calendar: 0 },
    gaps: [],
    ...overrides,
  };
}

describe("supplier matching", () => {
  it("ranks every regional supplier of the gap's commodity, best first", () => {
    const result = matchSuppliers(picture(), GAP);

    expect(result.matches.map((m) => m.supplier).sort()).toEqual([
      "Jamaica",
      "Trinidad and Tobago",
    ]);
    expect(result.matches[0].rank).toBe(1);
    expect(result.matches[0].score).toBeGreaterThanOrEqual(result.matches[1].score);
  });

  it("prefers the closer supplier when nothing else separates them", () => {
    // Trinidad is far closer to Guyana than Jamaica is.
    const result = matchSuppliers(picture(), GAP);
    const trinidad = result.matches.find((m) => m.supplier === "Trinidad and Tobago")!;
    const jamaica = result.matches.find((m) => m.supplier === "Jamaica")!;

    expect(trinidad.transit_hours).toBeLessThan(jamaica.transit_hours);
    expect(trinidad.score).toBeGreaterThan(jamaica.score);
  });

  it("penalises a supplier whose weather is bad, however close it is", () => {
    const clear = matchSuppliers(picture(), GAP).matches.find(
      (m) => m.supplier === "Trinidad and Tobago"
    )!;

    const stormy = matchSuppliers(
      picture({
        states: [
          state({ iso3: "GUY", name: "Guyana" }),
          state({ iso3: "JAM", name: "Jamaica" }),
          state({ iso3: "TTO", name: "Trinidad and Tobago", climate_risk: "high" }),
        ],
      }),
      GAP
    ).matches.find((m) => m.supplier === "Trinidad and Tobago")!;

    expect(stormy.score).toBeLessThan(clear.score);
    expect(stormy.transit_hours).toBe(clear.transit_hours);
  });

  it("rewards a supplier that can plant when the importer cannot", () => {
    const withoutAlignment = matchSuppliers(picture(), GAP).matches.find(
      (m) => m.supplier === "Jamaica"
    )!;

    const withAlignment = matchSuppliers(
      picture({
        planting_alignment: [
          {
            commodity: "Cereals",
            importer: "Guyana",
            importer_iso3: "GUY",
            supplier: "Jamaica",
            supplier_iso3: "JAM",
            complementary_months: ["January", "February", "March", "April", "May", "June"],
            external_usd: 190_000_000,
            note: "",
          },
        ],
      }),
      GAP
    ).matches.find((m) => m.supplier === "Jamaica")!;

    expect(withAlignment.score).toBeGreaterThan(withoutAlignment.score);
    expect(withAlignment.complementary_months).toHaveLength(6);
  });

  it("treats an unknown weather reading as neither good nor bad", () => {
    // Scoring an unknown as clear would reward a state for being unobserved.
    const unknown = matchSuppliers(
      picture({
        states: [
          state({ iso3: "GUY", name: "Guyana" }),
          state({ iso3: "JAM", name: "Jamaica" }),
          state({ iso3: "TTO", name: "Trinidad and Tobago", climate_risk: null }),
        ],
      }),
      GAP
    ).matches.find((m) => m.supplier === "Trinidad and Tobago")!;

    const weather = unknown.factors.find((f) => f.label === "Weather at both ends")!;
    expect(weather.score).toBe(0.5);
    expect(weather.detail).toContain("unknown");
  });

  it("never describes an unread station as clear weather", () => {
    // The score treats unknown as neutral; the sentence has to agree rather
    // than round an absent reading up to good news.
    const noReadings = matchSuppliers(
      picture({
        states: [
          state({ iso3: "GUY", name: "Guyana", climate_risk: null }),
          state({ iso3: "TTO", name: "Trinidad and Tobago", climate_risk: null }),
        ],
      }),
      { ...GAP, regional_suppliers: ["Trinidad and Tobago"] }
    ).matches[0];

    expect(noReadings.rationale).not.toContain("clear weather");
    expect(noReadings.rationale).toContain("neither end has a current weather reading");
  });

  it("never scores the importer as its own supplier", () => {
    const result = matchSuppliers(picture(), {
      ...GAP,
      regional_suppliers: ["Guyana", "Jamaica"],
    });
    expect(result.matches.map((m) => m.supplier)).not.toContain("Guyana");
  });

  it("drops a supplier the routing layer cannot actually place", () => {
    // A state with no port coordinates falls back to a hashed stub distance,
    // and ranking on a hashed number is ranking on noise.
    const result = matchSuppliers(
      picture({
        states: [
          state({ iso3: "GUY", name: "Guyana" }),
          state({ iso3: "XXX", name: "Nowhere Land" }),
        ],
      }),
      { ...GAP, regional_suppliers: ["Nowhere Land"] }
    );
    expect(result.matches).toEqual([]);
  });

  it("states what it refused to score, rather than implying it weighed it", () => {
    const result = matchSuppliers(picture(), GAP);
    const text = result.not_scored.join(" ").toLowerCase();
    expect(text).toContain("price");
    expect(text).toContain("capacity");
    expect(result.matches[0].factors.map((f) => f.label)).not.toContain("Price");
  });

  it("keeps factor points summing to the reported score", () => {
    for (const match of matchSuppliers(picture(), GAP).matches) {
      const summed = match.factors.reduce((total, f) => total + f.points, 0);
      expect(Math.abs(summed - match.score)).toBeLessThan(0.11);
      expect(match.score).toBeGreaterThanOrEqual(0);
      expect(match.score).toBeLessThanOrEqual(100);
    }
  });

  it("ranks gaps by the money at stake, and skips gaps with no placeable supplier", () => {
    const small = { ...GAP, commodity: "Fruit", commodity_code: "08", external_usd: 1_000 };
    const all = matchAllGaps(
      picture({ substitution_opportunities: [small, GAP] })
    );
    expect(all[0].external_usd).toBe(GAP.external_usd);
    expect(all.every((m) => m.matches.length > 0)).toBe(true);
  });
});
