/**
 * The projection is where the coordination claims are actually computed, so
 * these pin down the two findings the platform leads with: which commodities a
 * state buys outside the region that a member already supplies, and which
 * supplier/importer pairs could stagger planting rather than compete.
 */

import { describe, expect, it } from "vitest";

import { buildRegionalPicture } from "./projection";
import type { SourceBundle } from "./sources";
import { provenance, type MonthlyClimate, type TradeFlow } from "./sources/types";

function snapshot<T>(records: T[]) {
  return { records, provenance: provenance("comtrade", "test", "test", "live") };
}

function flow(overrides: Partial<TradeFlow>): TradeFlow {
  return {
    reporter_iso3: "TTO",
    reporter: "Trinidad and Tobago",
    partner: "United States",
    partner_is_caricom: false,
    commodity_code: "07",
    commodity: "Vegetables",
    direction: "import",
    year: 2023,
    value_usd: 1_000_000,
    ...overrides,
  };
}

function calendar(iso3: string, country: string, rainFed: string[]): MonthlyClimate {
  return {
    country_iso3: iso3,
    country,
    months: [],
    rain_fed_months: rainFed,
    wettest_month: rainFed[0] ?? "January",
    driest_month: "March",
  };
}

function bundle(overrides: Partial<SourceBundle> = {}): SourceBundle {
  return {
    indicators: snapshot([]),
    trade: snapshot<TradeFlow>([]),
    climate: snapshot([]),
    storms: snapshot([]),
    soil: snapshot([]),
    agroclimate: snapshot<MonthlyClimate>([]),
    ...overrides,
  } as SourceBundle;
}

describe("buildRegionalPicture", () => {
  it("totals imports and the share sourced inside the region", () => {
    const picture = buildRegionalPicture(
      bundle({
        trade: snapshot([
          flow({ value_usd: 750_000, partner_is_caricom: false }),
          flow({ value_usd: 250_000, partner_is_caricom: true, partner: "Guyana" }),
        ]),
      })
    );

    expect(picture.totals.food_imports_usd).toBe(1_000_000);
    expect(picture.totals.intra_caricom_usd).toBe(250_000);
    expect(picture.totals.intra_caricom_share_pct).toBe(25);
    expect(picture.totals.states_covered).toBe(1);
  });

  it("flags a commodity bought externally that a member already supplies", () => {
    const picture = buildRegionalPicture(
      bundle({
        trade: snapshot([
          // Trinidad buys vegetables from outside the region…
          flow({ value_usd: 900_000, partner_is_caricom: false }),
          flow({ value_usd: 100_000, partner_is_caricom: true, partner: "Dominica" }),
          // …and Dominica is already shipping vegetables to someone else.
          flow({
            reporter_iso3: "JAM",
            reporter: "Jamaica",
            partner: "Dominica",
            partner_is_caricom: true,
            value_usd: 50_000,
          }),
        ]),
      })
    );

    const opportunity = picture.substitution_opportunities.find(
      (o) => o.importer_iso3 === "TTO"
    );
    expect(opportunity).toBeDefined();
    expect(opportunity?.external_usd).toBe(900_000);
    expect(opportunity?.external_share_pct).toBe(90);
    expect(opportunity?.regional_suppliers).toContain("Dominica");
  });

  it("ignores a commodity with no regional supplier to switch to", () => {
    const picture = buildRegionalPicture(
      bundle({
        trade: snapshot([flow({ value_usd: 900_000, partner_is_caricom: false })]),
      })
    );

    // Entirely external, but nobody in the region sells it — not an opportunity.
    expect(picture.substitution_opportunities).toHaveLength(0);
  });

  it("pairs an importer with a supplier whose planting window differs", () => {
    const picture = buildRegionalPicture(
      bundle({
        trade: snapshot([
          flow({ value_usd: 900_000, partner_is_caricom: false }),
          flow({ value_usd: 100_000, partner_is_caricom: true, partner: "Guyana" }),
          flow({
            reporter_iso3: "JAM",
            reporter: "Jamaica",
            partner: "Guyana",
            partner_is_caricom: true,
            value_usd: 50_000,
          }),
        ]),
        agroclimate: snapshot([
          calendar("TTO", "Trinidad and Tobago", ["June", "July"]),
          calendar("GUY", "Guyana", ["January", "February", "June"]),
        ]),
      })
    );

    const pair = picture.planting_alignment[0];
    expect(pair.importer_iso3).toBe("TTO");
    expect(pair.supplier_iso3).toBe("GUY");
    // June overlaps and is excluded; the complementary months are what is left.
    expect(pair.complementary_months).toEqual(["January", "February"]);
  });

  it("reports no alignment when the windows fully overlap", () => {
    const picture = buildRegionalPicture(
      bundle({
        trade: snapshot([
          flow({ value_usd: 900_000, partner_is_caricom: false }),
          flow({ value_usd: 100_000, partner_is_caricom: true, partner: "Guyana" }),
          flow({
            reporter_iso3: "JAM",
            reporter: "Jamaica",
            partner: "Guyana",
            partner_is_caricom: true,
            value_usd: 50_000,
          }),
        ]),
        agroclimate: snapshot([
          calendar("TTO", "Trinidad and Tobago", ["June", "July"]),
          calendar("GUY", "Guyana", ["June", "July"]),
        ]),
      })
    );

    expect(picture.planting_alignment).toHaveLength(0);
  });

  it("surfaces a degraded source as a visible gap", () => {
    const degraded = {
      records: [],
      provenance: provenance("soil", "ISRIC SoilGrids", "test", "pending", {
        note: "First fetch in progress",
      }),
    };
    const picture = buildRegionalPicture(bundle({ soil: degraded } as Partial<SourceBundle>));

    expect(picture.gaps.join(" ")).toContain("ISRIC SoilGrids");
  });
});
