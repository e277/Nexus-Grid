/**
 * Names that reach a person, or a prompt, must be words.
 *
 * Both of these started as leaks rather than style problems: partner countries
 * rendered as `Partner 842`, and agent decisions as `supply_intelligence:
 * no_material_gap`. Both strings were fed to an analyst model, which quoted
 * them back inside recommendations — so the console was presenting its own
 * internal identifiers to an operator as findings.
 */

import { describe, expect, it } from "vitest";

import { actionLabel, agentTitle } from "./agents/labels";
import { byM49 } from "./sources/caricom";
import { partnerNameFor } from "./sources/partners";

/** How comtrade.ts resolves a partner code, mirrored so the order is tested. */
function partnerName(code: number): string {
  return byM49(code)?.name ?? partnerNameFor(code) ?? `Unmapped partner ${code}`;
}

describe("partner names", () => {
  it("names the partners the region actually buys its food from", () => {
    // The eight codes observed in live Comtrade responses for CARICOM states.
    expect(
      [32, 124, 156, 214, 218, 320, 528, 842].map(partnerName)
    ).toEqual([
      "Argentina",
      "Canada",
      "China",
      "Dominican Republic",
      "Ecuador",
      "Guatemala",
      "Netherlands",
      "United States",
    ]);
  });

  it("resolves member states through the member table, not the partner table", () => {
    // Jamaica is in both; the member record is the one the rest of the
    // platform joins on, so it has to win.
    expect(partnerName(388)).toBe("Jamaica");
    expect(byM49(388)?.iso3).toBe("JAM");
  });

  it("reports Comtrade's United States aggregate under the same name", () => {
    expect(partnerName(840)).toBe(partnerName(842));
  });

  it("leaves an unmapped code visibly a code, never mistakable for a country", () => {
    const name = partnerName(999_999);
    expect(name).toContain("999999");
    expect(name.toLowerCase()).toContain("unmapped");
  });
});

describe("agent and action labels", () => {
  it("gives every agent a readable title", () => {
    expect(agentTitle("supply_intelligence")).toBe("Supply Intelligence");
    expect(agentTitle("climate_risk")).toBe("Climate Risk");
    expect(agentTitle("planting_coordination")).toBe("Planting Coordination");
  });

  it("phrases actions as what the agent concluded", () => {
    expect(actionLabel("no_material_gap")).toBe("Found no material sourcing gap");
    expect(actionLabel("lane_at_risk")).toBe("Judged the lane at risk");
    expect(actionLabel("stagger_planting")).toBe("Recommended staggered planting");
  });

  it("never returns a raw identifier, even for something unmapped", () => {
    expect(agentTitle("brand_new_agent")).toBe("Brand New Agent");
    expect(actionLabel("some_new_outcome")).toBe("Some new outcome");
    for (const label of [agentTitle("a_b_c"), actionLabel("a_b_c")]) {
      expect(label).not.toContain("_");
    }
  });
});
