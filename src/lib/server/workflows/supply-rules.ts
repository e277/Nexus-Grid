/**
 * Shared coordination rules and signal-context defaults.
 *
 * Single source of truth for how a sourcing gap is classified, and for the
 * default values of the signal context that flows from agents into the
 * workflow graph and the LLM recommendation step.
 */

/** A gap this lopsided is a standing dependency, not a procurement quirk. */
export const CRITICAL_EXTERNAL_SHARE_PCT = 90;
export const MATERIAL_EXTERNAL_SHARE_PCT = 60;
/** Below this the coordination cost outweighs the volume at stake. */
export const MATERIAL_EXTERNAL_USD = 5_000_000;

export type GapSeverity = "critical" | "material" | "minor";

export interface SignalContext {
  event: string;
  commodity: string;
  importer: string;
  external_usd: number;
  external_share_pct: number;
  regional_suppliers: string;
  climate_risk: string;
  market_context: string;
}

/** Defaults for every field the workflow and LLM prompt consume. */
export const SIGNAL_DEFAULTS: SignalContext = {
  event: "substitution_gap",
  commodity: "unspecified commodity",
  importer: "unspecified state",
  external_usd: 0,
  external_share_pct: 0,
  regional_suppliers: "none identified",
  climate_risk: "low",
  market_context: "regional sourcing stable",
};

/**
 * How severe a sourcing gap is, from how lopsided it is and how much is at
 * stake. Both matter: a 100% external share on $50k is noise, and a 30% share
 * on $200M is normal trade.
 */
export function classifyGap(externalSharePct: number, externalUsd: number): GapSeverity {
  if (externalUsd < MATERIAL_EXTERNAL_USD) return "minor";
  if (externalSharePct >= CRITICAL_EXTERNAL_SHARE_PCT) return "critical";
  if (externalSharePct >= MATERIAL_EXTERNAL_SHARE_PCT) return "material";
  return "minor";
}

/**
 * Return the signal fields from `context` with defaults filled in.
 *
 * Only keys in `SIGNAL_DEFAULTS` are returned; null/undefined values fall back
 * to their default so downstream consumers never see missing fields.
 */
export function withSignalDefaults(context: object): SignalContext {
  const source = context as Record<string, unknown>;
  const result = {} as Record<string, unknown>;
  for (const [key, fallback] of Object.entries(SIGNAL_DEFAULTS)) {
    const value = source[key];
    result[key] = value === undefined || value === null ? fallback : value;
  }
  // Suppliers arrive as an array from the projection; the prompt wants prose.
  if (Array.isArray(source.regional_suppliers)) {
    result.regional_suppliers =
      source.regional_suppliers.length > 0
        ? source.regional_suppliers.join(", ")
        : SIGNAL_DEFAULTS.regional_suppliers;
  }
  return result as unknown as SignalContext;
}
