/**
 * Demand Intelligence Agent.
 *
 * Answers the farm-to-market question for one commodity and one importing
 * state: how much of what it currently buys outside the region is already
 * being supplied inside it, and by whom.
 */

import { currentPicture } from "./context";
import { BaseAgent, result, type AgentPayload, type AgentResult } from "./base";

export class DemandIntelligenceAgent extends BaseAgent {
  readonly name = "demand_intelligence";

  protected async handle(payload: AgentPayload): Promise<AgentResult> {
    const picture = await currentPicture();
    const commodity = payload.commodity as string | undefined;
    const importerIso3 = payload.importer_iso3 as string | undefined;

    const matches = picture.substitution_opportunities.filter(
      (o) =>
        (!commodity || o.commodity.toLowerCase() === commodity.toLowerCase()) &&
        (!importerIso3 || o.importer_iso3 === importerIso3)
    );

    if (matches.length === 0) {
      return result(
        this.name,
        "no_gap_found",
        0.6,
        `No external sourcing gap in the trade data for ${commodity ?? "any commodity"}` +
          `${importerIso3 ? ` in ${importerIso3}` : ""}`,
        { commodity, importer_iso3: importerIso3 }
      );
    }

    const external = matches.reduce((sum, o) => sum + o.external_usd, 0);
    const suppliers = [...new Set(matches.flatMap((o) => o.regional_suppliers))];

    // Confidence tracks how lopsided the sourcing is: a state buying nearly all
    // of a commodity outside the region is an unambiguous gap; one already
    // buying half regionally is a marginal call.
    const averageExternalShare =
      matches.reduce((sum, o) => sum + o.external_share_pct, 0) / matches.length;

    return result(
      this.name,
      suppliers.length > 0 ? "match_regional_supply" : "no_regional_supplier",
      Math.min(0.95, averageExternalShare / 100),
      `$${external.toLocaleString()} sourced outside CARICOM across ${matches.length} lane(s); ` +
        `${suppliers.length} member state(s) already supply it regionally`,
      {
        external_usd: external,
        average_external_share_pct: Math.round(averageExternalShare * 10) / 10,
        regional_suppliers: suppliers,
        lanes: matches.map((o) => ({
          importer: o.importer,
          commodity: o.commodity,
          external_usd: o.external_usd,
          external_share_pct: o.external_share_pct,
        })),
      }
    );
  }
}
