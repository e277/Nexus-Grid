/**
 * Supply Intelligence Agent.
 *
 * The scanning agent: sweeps the regional picture for import-substitution gaps
 * material enough to act on, and opens a workflow run for each one.
 *
 * Where this used to scan a local inventory table it wrote to itself, it now
 * scans published trade data across fifteen states, so what it flags is a real
 * regional gap rather than a number this system made up.
 */

import { publish } from "../events";
import { runOnce } from "../workflows/orchestrator";
import { currentPicture } from "./context";
import { BaseAgent, result, type AgentPayload, type AgentResult } from "./base";

/**
 * Only open a run for a gap worth a coordination conversation.
 *
 * Both thresholds must hold: enough money to matter, and a lopsided enough
 * split that regional supply is plausibly displacing something.
 */
const MIN_EXTERNAL_USD = 5_000_000;
const MIN_EXTERNAL_SHARE_PCT = 60;

interface DetectedGap {
  importer_iso3: string;
  commodity: string;
  external_usd: number;
}

export class SupplyAgent extends BaseAgent {
  readonly name = "supply_intelligence";

  protected async handle(_payload: AgentPayload): Promise<AgentResult> {
    const { gaps, scanned, confidence } = await this.scan();
    return result(
      this.name,
      gaps.length > 0 ? "substitution_scan" : "no_material_gap",
      confidence,
      `Scanned ${scanned} sourcing lane(s); ${gaps.length} exceed the coordination threshold`,
      { gaps, scanned }
    );
  }

  private async scan(): Promise<{
    gaps: DetectedGap[];
    scanned: number;
    confidence: number;
  }> {
    const picture = await currentPicture();
    const opportunities = picture.substitution_opportunities;

    if (opportunities.length === 0) {
      // Nothing observed is not the same as nothing happening — if the trade
      // source is degraded there is genuinely nothing to be confident about.
      return { gaps: [], scanned: 0, confidence: 0 };
    }

    const gaps: DetectedGap[] = [];

    for (const opportunity of opportunities) {
      if (
        opportunity.external_usd < MIN_EXTERNAL_USD ||
        opportunity.external_share_pct < MIN_EXTERNAL_SHARE_PCT ||
        opportunity.regional_suppliers.length === 0
      ) {
        continue;
      }

      gaps.push({
        importer_iso3: opportunity.importer_iso3,
        commodity: opportunity.commodity,
        external_usd: opportunity.external_usd,
      });

      // Hand the gap to the specialists as well as the workflow: the demand
      // agent scores it against regional supply, and its finding is recorded
      // alongside the run rather than only inside it.
      await publish("substitution.gap.detected", {
        commodity: opportunity.commodity,
        importer_iso3: opportunity.importer_iso3,
      });

      try {
        await runOnce({
          event: "substitution_gap",
          commodity: opportunity.commodity,
          importer: opportunity.importer,
          importer_iso3: opportunity.importer_iso3,
          external_usd: opportunity.external_usd,
          external_share_pct: opportunity.external_share_pct,
          regional_suppliers: opportunity.regional_suppliers,
          climate_risk:
            picture.states.find((s) => s.iso3 === opportunity.importer_iso3)?.climate_risk ??
            "low",
        });
      } catch (error) {
        console.error(
          `Orchestrator failed for ${opportunity.importer} / ${opportunity.commodity}`,
          error
        );
      }
    }

    // The rest of the specialists key off region-wide conditions rather than a
    // single lane, so they are raised once per scan instead of once per gap.
    if (picture.climate.islands_at_risk.some((island) => island.risk === "high")) {
      await publish("climate.risk.elevated", {});
    }
    if (picture.climate.active_storms.length > 0) {
      await publish("storm.alert", {});
    }
    if (picture.planting_alignment.length > 0) {
      await publish("planting.window.review", {});
    }
    if (picture.agronomy.states_with_soil_coverage > 0 && gaps.length > 0) {
      await publish("soil.assessment.requested", { commodity: gaps[0].commodity });
    }

    // Confidence is the share of scanned lanes that cleared the threshold —
    // a scan that flags most of what it saw is a clearer signal than one that
    // scraped a single borderline case out of many.
    const confidence = Math.min(1, gaps.length / opportunities.length + 0.2);
    return { gaps, scanned: opportunities.length, confidence: gaps.length > 0 ? confidence : 0.3 };
  }

  /** Run one scan cycle; returns the number of gaps detected. */
  async runCheck(): Promise<number> {
    const scan = await this.run({ trigger: "periodic_scan" });
    return (scan.outputs.gaps as DetectedGap[]).length;
  }
}
