/**
 * Planting Coordination Agent.
 *
 * Aligns planting decisions across islands. Two states whose rain-fed windows
 * overlap compete for the same weeks and glut the same market; two whose
 * windows differ can cover more of the calendar between them.
 *
 * The comparison is only possible because every state's calendar comes from
 * the same climatology model rather than fifteen separate ministry records —
 * which is the coordination gap this is meant to close.
 */

import { currentPicture } from "./context";
import { BaseAgent, result, type AgentPayload, type AgentResult } from "./base";

export class PlantingCoordinationAgent extends BaseAgent {
  readonly name = "planting_coordination";

  protected async handle(payload: AgentPayload): Promise<AgentResult> {
    const picture = await currentPicture();
    const commodity = payload.commodity as string | undefined;

    const alignment = commodity
      ? picture.planting_alignment.filter(
          (a) => a.commodity.toLowerCase() === commodity.toLowerCase()
        )
      : picture.planting_alignment;

    if (alignment.length === 0) {
      const withCalendars = picture.agronomy.states_with_planting_calendar;
      return result(
        this.name,
        withCalendars === 0 ? "no_calendar_data" : "no_complementary_window",
        withCalendars === 0 ? 0.2 : 0.6,
        withCalendars === 0
          ? "No planting calendars available to compare"
          : "Regional planting windows overlap; staggering would not widen coverage",
        { states_with_calendar: withCalendars }
      );
    }

    const covered = alignment.reduce((sum, a) => sum + a.external_usd, 0);

    return result(
      this.name,
      "stagger_planting",
      // More complementary months across more pairs is a stronger signal.
      Math.min(0.9, 0.4 + 0.1 * alignment.length),
      `${alignment.length} supplier/importer pair(s) have non-overlapping rain-fed windows, ` +
        `against $${covered.toLocaleString()} currently sourced outside the region`,
      {
        pairs: alignment.map((a) => ({
          commodity: a.commodity,
          supplier: a.supplier,
          importer: a.importer,
          complementary_months: a.complementary_months,
          external_usd: a.external_usd,
        })),
      }
    );
  }
}
