/**
 * World Bank Indicators API — production, land, and import-dependency series
 * for every CARICOM member state.
 *
 * Free and keyless, but it rate-limits: querying several indicators back to
 * back returns empty bodies rather than an error status. Requests are
 * therefore issued one at a time with a short gap, and the whole set is
 * cached for a day — these are annual series, so anything shorter is churn.
 */

import { CARICOM_STATES, byIso3 } from "./caricom";
import { fetchJson, withCache } from "./cache";
import { provenance, type Observation, type Snapshot } from "./types";

const ENDPOINT = "https://api.worldbank.org/v2/country";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const GAP_MS = 400;

/**
 * The API returns an empty body — not an error — when asked for too many
 * countries at once, so requests go out in small batches.
 */
const COUNTRY_BATCH = 5;

/** The series that speak to import dependency and domestic capacity. */
const INDICATORS: { id: string; label: string; unit: string }[] = [
  { id: "TM.VAL.FOOD.ZS.UN", label: "Food imports", unit: "% of merchandise imports" },
  { id: "AG.LND.ARBL.ZS", label: "Arable land", unit: "% of land area" },
  { id: "NV.AGR.TOTL.ZS", label: "Agriculture value added", unit: "% of GDP" },
  { id: "SP.POP.TOTL", label: "Population", unit: "people" },
  { id: "AG.PRD.FOOD.XD", label: "Food production index", unit: "2014-2016 = 100" },
  // Production capacity — what a state can actually grow, not just what it buys
  { id: "AG.YLD.CREL.KG", label: "Cereal yield", unit: "kg per hectare" },
  { id: "AG.LND.CREL.HA", label: "Land under cereal production", unit: "hectares" },
  { id: "AG.LND.AGRI.ZS", label: "Agricultural land", unit: "% of land area" },
];

const FROM_YEAR = 2015;
const TO_YEAR = new Date().getFullYear();

interface WorldBankRow {
  indicator: { id: string; value: string };
  country: { value: string };
  countryiso3code: string;
  date: string;
  value: number | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function countryBatches(): string[] {
  const batches: string[] = [];
  for (let i = 0; i < CARICOM_STATES.length; i += COUNTRY_BATCH) {
    batches.push(
      CARICOM_STATES.slice(i, i + COUNTRY_BATCH)
        .map((s) => s.iso3)
        .join(";")
    );
  }
  return batches;
}

async function fetchIndicator(id: string, label: string, unit: string): Promise<Observation[]> {
  const observations: Observation[] = [];

  for (const [index, batch] of countryBatches().entries()) {
    if (index > 0) await sleep(GAP_MS);

    const url =
      `${ENDPOINT}/${batch}/indicator/${id}` +
      `?format=json&date=${FROM_YEAR}:${TO_YEAR}&per_page=1000`;
    const payload = (await fetchJson(url)) as [unknown, WorldBankRow[] | null];
    const rows = Array.isArray(payload) ? (payload[1] ?? []) : [];

    for (const row of rows) {
      if (row.value === null || byIso3(row.countryiso3code) === null) continue;
      observations.push({
        country_iso3: row.countryiso3code,
        country: row.country.value,
        indicator: id,
        indicator_label: label,
        year: Number.parseInt(row.date, 10),
        value: row.value,
        unit,
      });
    }
  }
  return observations;
}

export function fetchWorldBank(force = false): Promise<Snapshot<Observation>> {
  return withCache<Observation>(
    "world-bank",
    CACHE_TTL_MS,
    async () => {
      const records: Observation[] = [];
      const missing: string[] = [];

      for (const [index, indicator] of INDICATORS.entries()) {
        if (index > 0) await sleep(GAP_MS);
        try {
          const observations = await fetchIndicator(
            indicator.id,
            indicator.label,
            indicator.unit
          );
          if (observations.length === 0) missing.push(indicator.id);
          records.push(...observations);
        } catch (error) {
          missing.push(indicator.id);
          console.warn(`World Bank indicator ${indicator.id} failed:`, error);
        }
      }

      const years = records.map((r) => r.year);
      return {
        records,
        provenance: provenance(
          "world-bank",
          "World Bank Open Data",
          `${ENDPOINT}/{CARICOM}/indicator/{indicator}`,
          records.length > 0 ? "live" : "empty",
          {
            covers:
              years.length > 0
                ? `${Math.min(...years)}–${Math.max(...years)}`
                : undefined,
            note:
              missing.length > 0
                ? `No data returned for ${missing.join(", ")} (discontinued series or rate limit).`
                : undefined,
          }
        ),
      };
    },
    { force }
  );
}

export { INDICATORS as WORLD_BANK_INDICATORS };
