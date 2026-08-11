/**
 * Provider interfaces for external systems.
 *
 * Everything the platform needs from the outside world is expressed as an
 * interface here, so a stub, a sandbox, or a production adapter can be
 * swapped in without touching callers.
 */

export interface WeatherForecast {
  source: string;
  island: string;
  risk: "low" | "medium" | "high";
  summary: string;
  observed_at?: string;
  max_windspeed_kmh?: number;
  max_precipitation_probability_pct?: number;
}

export interface WeatherAlert {
  source: string;
  name?: string | null;
  classification?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  movement?: string | null;
  intensity_kt?: number | null;
}

export interface TransitEstimate {
  source: string;
  origin: string;
  destination: string;
  mode: "sea" | "air" | "land";
  transit_hours: number;
  distance_km?: number;
}

export interface CropPrice {
  source: string;
  crop_name: string;
  island: string | null;
  unit_price_usd: number;
  trend: "falling" | "stable" | "rising";
  price_as_of?: string;
  trend_basis?: string;
}

/** Climate & hazard signals (e.g. CIMH, NOAA). */
export interface WeatherProvider {
  /** Return the current risk outlook for an island. */
  getForecast(island: string): Promise<WeatherForecast>;
  /** Return active severe-weather alerts for the region. */
  getActiveAlerts(): Promise<WeatherAlert[]>;
}

/** Maps / routing (e.g. inter-island transit estimation). */
export interface RoutingProvider {
  /** Return a transit estimate: hours, mode, distance. */
  estimateTransit(originIsland: string, destinationIsland: string): TransitEstimate;
}

/** Regional market pricing feeds. */
export interface PricingProvider {
  /** Return the current unit price and trend for a crop. */
  getPrice(cropName: string, island?: string | null): CropPrice;
}
