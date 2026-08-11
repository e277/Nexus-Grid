/**
 * Agronomy Agent.
 *
 * Reads the soil under a state's main growing area and says what it will and
 * will not support, so a substitution opportunity that looks good on trade
 * value can be checked against whether the ground can actually carry the crop.
 *
 * Reports missing coverage as missing rather than guessing — a soil reading is
 * the kind of number someone commits a planting season to.
 */

import { currentPicture } from "./context";
import { BaseAgent, result, type AgentPayload, type AgentResult } from "./base";

/** Rough pH tolerances for the commodity groups the trade data covers. */
const PH_RANGE: Record<string, { min: number; max: number }> = {
  cereals: { min: 5.5, max: 7.5 },
  vegetables: { min: 6.0, max: 7.5 },
  "fruit and nuts": { min: 5.5, max: 7.0 },
};

export class AgronomyAgent extends BaseAgent {
  readonly name = "agronomy";

  protected async handle(payload: AgentPayload): Promise<AgentResult> {
    const picture = await currentPicture();
    const iso3 = payload.country_iso3 as string | undefined;
    const commodity = ((payload.commodity as string | undefined) ?? "").toLowerCase();

    const profiles = picture.states
      .map((s) => s.soil)
      .filter((s): s is NonNullable<typeof s> => s !== null && s.has_coverage)
      .filter((s) => !iso3 || s.country_iso3 === iso3);

    if (profiles.length === 0) {
      return result(
        this.name,
        "no_soil_coverage",
        0.9,
        iso3
          ? `No soil grid coverage sampled for ${iso3} yet`
          : "No soil coverage available for any state yet",
        { states_with_coverage: picture.agronomy.states_with_soil_coverage }
      );
    }

    const range = PH_RANGE[commodity];
    const assessed = profiles.map((soil) => {
      const suitable =
        range === undefined || soil.ph === null
          ? null
          : soil.ph >= range.min && soil.ph <= range.max;
      return {
        country: soil.country,
        country_iso3: soil.country_iso3,
        ph: soil.ph,
        clay_pct: soil.clay_pct,
        organic_carbon_g_per_kg: soil.organic_carbon_g_per_kg,
        suitable_for_commodity: suitable,
        note: soil.suitability,
      };
    });

    const suitable = assessed.filter((a) => a.suitable_for_commodity === true);
    const unsuitable = assessed.filter((a) => a.suitable_for_commodity === false);

    if (range === undefined) {
      return result(
        this.name,
        "soil_profile",
        0.7,
        `Soil profiled for ${assessed.length} state(s); no pH tolerance on file for ` +
          `'${commodity || "unspecified commodity"}', so this is a profile not a verdict`,
        { assessed }
      );
    }

    return result(
      this.name,
      suitable.length > 0 ? "soil_supports_crop" : "soil_constrains_crop",
      // A verdict from real readings across several states is firmer than one.
      Math.min(0.9, 0.5 + 0.08 * assessed.length),
      `${suitable.length} of ${assessed.length} sampled state(s) sit in the pH range for ` +
        `${commodity} (${range.min}–${range.max})` +
        (unsuitable.length > 0
          ? `; ${unsuitable.map((u) => u.country).join(", ")} would need amendment`
          : ""),
      { commodity, ph_range: range, assessed }
    );
  }
}
