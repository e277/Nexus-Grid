/**
 * Shared supply-domain rules and signal-context defaults.
 *
 * Single source of truth for the surplus/shortage thresholds and for the
 * default values of the signal context that flows from agents into the
 * workflow graph and the LLM recommendation step.
 */

export const SURPLUS_THRESHOLD = 1000;
export const SHORTAGE_THRESHOLD = 100;

export type SupplyClassification = "surplus" | "shortage" | "normal";

export interface SignalContext {
  event: string;
  quantity: number;
  crop_name: string;
  farmer_name: string;
  island: string;
  market_context: string;
  weather_risk: string;
  logistics_status: string;
  demand_signal: string;
}

/** Defaults for every field the workflow and LLM prompt consume. */
export const SIGNAL_DEFAULTS: SignalContext = {
  event: "inventory_checked",
  quantity: 0,
  crop_name: "unknown crop",
  farmer_name: "unknown farmer",
  island: "unknown island",
  market_context: "regional demand stable",
  weather_risk: "low",
  logistics_status: "available",
  demand_signal: "balanced",
};

/** Classify an inventory quantity as surplus, shortage, or normal. */
export function classifyQuantity(quantity: number): SupplyClassification {
  if (quantity > SURPLUS_THRESHOLD) return "surplus";
  if (quantity < SHORTAGE_THRESHOLD) return "shortage";
  return "normal";
}

/**
 * Return the signal fields from `context` with defaults filled in.
 *
 * Only keys in `SIGNAL_DEFAULTS` are returned; null/undefined values fall
 * back to their default so downstream consumers never see missing fields.
 */
export function withSignalDefaults(context: object): SignalContext {
  const source = context as Record<string, unknown>;
  const result = {} as Record<string, unknown>;
  for (const [key, fallback] of Object.entries(SIGNAL_DEFAULTS)) {
    const value = source[key];
    result[key] = value === undefined || value === null ? fallback : value;
  }
  return result as unknown as SignalContext;
}
