/**
 * The contract every upstream source implements.
 *
 * This layer interprets data it does not own. Nothing here is a system of
 * record: a source is fetched, stamped with where it came from and when, and
 * cached. Every value the platform reasons over can be traced back to a
 * `Provenance` — which matters more than usual when the whole point is
 * coordinating systems that were never designed to work together.
 */

export type SourceId =
  | "world-bank"
  | "comtrade"
  | "faostat"
  | "climate"
  | "soil"
  | "agroclimate";

export type SourceStatus =
  /** Fetched successfully from the upstream API. */
  | "live"
  /** Served from cache because the upstream was unavailable or rate-limited. */
  | "cached"
  /** Upstream reachable but the query returned nothing usable. */
  | "empty"
  /** Upstream requires credentials this deployment does not have. */
  | "unauthorized"
  /** Upstream failed. */
  | "unavailable";

export interface Provenance {
  source: SourceId;
  /** Human-readable name of the publisher. */
  publisher: string;
  /** The endpoint the data came from, without any credentials. */
  endpoint: string;
  status: SourceStatus;
  /** When this snapshot was fetched. */
  fetched_at: string;
  /** How old the underlying data is, when the source reports it. */
  covers?: string;
  /** Why a non-live status happened, in plain language. */
  note?: string;
}

/** A fetched snapshot: the records plus where they came from. */
export interface Snapshot<T> {
  provenance: Provenance;
  records: T[];
}

/** An indicator observation for one country in one year. */
export interface Observation {
  country_iso3: string;
  country: string;
  indicator: string;
  indicator_label: string;
  year: number;
  value: number;
  unit?: string;
}

/** A trade flow between a reporter and a partner for one commodity group. */
export interface TradeFlow {
  reporter_iso3: string;
  reporter: string;
  partner: string;
  partner_is_caricom: boolean;
  commodity_code: string;
  commodity: string;
  /** "import" | "export" */
  direction: "import" | "export";
  year: number;
  value_usd: number;
}

/** Current climate outlook and growing conditions for one island. */
export interface ClimateSignal {
  island: string;
  country_iso3: string;
  risk: "low" | "medium" | "high";
  summary: string;
  max_windspeed_kmh?: number;
  max_precipitation_probability_pct?: number;
  /** Mean topsoil moisture over the next 24h, % by volume. */
  soil_moisture_pct?: number | null;
  /** Total forecast rainfall over the next 7 days, mm. */
  weekly_rainfall_mm?: number | null;
  /** What those two mean for getting a crop in the ground right now. */
  growing_conditions?: string;
}

/** An active named storm in the region. */
export interface StormSignal {
  name: string;
  classification: string;
  latitude: number | null;
  longitude: number | null;
  intensity_kt: number | null;
  movement: string | null;
}

export function provenance(
  source: SourceId,
  publisher: string,
  endpoint: string,
  status: SourceStatus,
  extra: Partial<Provenance> = {}
): Provenance {
  return {
    source,
    publisher,
    endpoint,
    status,
    fetched_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    ...extra,
  };
}

/** Soil properties under a member state's main growing area. */
export interface SoilProfile {
  country_iso3: string;
  country: string;
  latitude: number;
  longitude: number;
  /** Soil pH in water. Null where the grid has no coverage. */
  ph: number | null;
  organic_carbon_g_per_kg: number | null;
  clay_pct: number | null;
  sand_pct: number | null;
  has_coverage: boolean;
  suitability: string;
}

/** One month of the long-run climate normal at a growing area. */
export interface PlantingWindow {
  month: number;
  month_name: string;
  mean_temp_c: number;
  mean_rain_mm_day: number;
  solar_kwh_m2_day: number;
  /** Whether a season can be started on rainfall alone that month. */
  suitability: "rain_fed" | "irrigation_required" | "too_wet";
}

/** The planting calendar for one member state. */
export interface MonthlyClimate {
  country_iso3: string;
  country: string;
  months: PlantingWindow[];
  rain_fed_months: string[];
  wettest_month: string;
  driest_month: string;
}
