/**
 * Reference pricing provider — real benchmark prices and real crop
 * seasonality, not an arbitrary hash of the crop name.
 *
 * No free, reliable, keyless *live* commodity-price API covers these crops at
 * island granularity (FAOSTAT's API was unreachable — HTTP 521 — as of
 * writing, and is a poor fit for a synchronous request path even when up).
 * Instead:
 *
 * - `unit_price_usd` is a static reference table of approximate Caribbean
 *   wholesale prices (USD/kg), a representative order-of-magnitude snapshot —
 *   not live, and labeled accordingly via `price_as_of`.
 * - `trend` is derived from real Caribbean crop-harvest seasonality against
 *   the current calendar month, so it reflects an actual agronomic signal
 *   instead of a random pick.
 *
 * This is still an approximation, not a live market feed — see `source`.
 */

import type { CropPrice, PricingProvider } from "./interfaces";

/** Approximate Caribbean wholesale reference prices, USD/kg. */
const REFERENCE_PRICE_USD_PER_KG: Record<string, number> = {
  banana: 0.6,
  mango: 1.2,
  tomato: 1.5,
  yam: 1.0,
  pepper: 2.5,
  cassava: 0.7,
  plantain: 0.8,
  "sweet potato": 0.9,
  breadfruit: 1.1,
};
const DEFAULT_PRICE_USD_PER_KG = 1.5;
const PRICE_AS_OF = "2024 Caribbean wholesale reference (approximate)";

const allMonths = () => new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

// Real Caribbean peak-harvest windows: price falls when supply peaks, rises
// in the scarce months before the next harvest. Months not listed for a crop
// are "stable".
const FALLING_MONTHS: Record<string, Set<number>> = {
  banana: allMonths(), // harvested year-round
  plantain: allMonths(),
  mango: new Set([4, 5, 6, 7, 8]),
  tomato: new Set([12, 1, 2, 3, 4]),
  yam: new Set([8, 9, 10, 11, 12]),
  cassava: new Set([8, 9, 10, 11, 12]),
  "sweet potato": new Set([11, 12, 1, 2]),
  breadfruit: new Set([6, 7, 8, 9, 10]),
};
const RISING_MONTHS: Record<string, Set<number>> = {
  mango: new Set([11, 12, 1, 2]),
  tomato: new Set([6, 7, 8, 9]),
  yam: new Set([4, 5, 6, 7]),
  pepper: new Set([6, 7, 8, 9]),
};

function seasonalTrend(cropKey: string, month: number): CropPrice["trend"] {
  if (FALLING_MONTHS[cropKey]?.has(month)) return "falling";
  if (RISING_MONTHS[cropKey]?.has(month)) return "rising";
  return "stable";
}

export class ReferencePricingProvider implements PricingProvider {
  getPrice(cropName: string, island: string | null = null): CropPrice {
    const cropKey = cropName.trim().toLowerCase();
    const price = REFERENCE_PRICE_USD_PER_KG[cropKey] ?? DEFAULT_PRICE_USD_PER_KG;
    const trend = seasonalTrend(cropKey, new Date().getMonth() + 1);
    return {
      source: "reference",
      crop_name: cropName,
      island,
      unit_price_usd: price,
      trend,
      price_as_of: PRICE_AS_OF,
      trend_basis: "Caribbean peak-harvest seasonality for the current month",
    };
  }
}
