/**
 * FAOSTAT — the canonical crop production series.
 *
 * As of writing this endpoint answers `401 Missing Authorization Header`: the
 * open API this project was designed around now requires credentials. The
 * connector is wired anyway and reports `unauthorized` rather than quietly
 * substituting something else, because a coordination layer that hides which
 * of its inputs are missing is worse than one that has fewer inputs.
 *
 * Set `FAOSTAT_API_KEY` to enable it; the World Bank production series covers
 * the same ground in the meantime.
 */

import { fetchJson, withCache } from "./cache";
import { provenance, type Observation, type Snapshot } from "./types";

const ENDPOINT = "https://faostatservices.fao.org/api/v1/en/data/QCL";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** FAO region code 91 is the Caribbean. */
const AREA = "91";
/** Element 5510 is production quantity. */
const ELEMENT = "5510";

interface FaostatRow {
  Area: string;
  Item: string;
  Year: string;
  Value: string;
  Unit: string;
}

export function fetchFaostat(force = false): Promise<Snapshot<Observation>> {
  return withCache<Observation>(
    "faostat",
    CACHE_TTL_MS,
    async () => {
      const apiKey = process.env.FAOSTAT_API_KEY ?? "";
      const url = `${ENDPOINT}?area=${AREA}&element=${ELEMENT}&year=2022&format=json`;

      if (!apiKey) {
        return {
          records: [],
          provenance: provenance("faostat", "FAO FAOSTAT", ENDPOINT, "unauthorized", {
            note: "FAOSTAT now requires an API key (returns 401 without one). Set FAOSTAT_API_KEY to enable this source; World Bank production series is used instead.",
          }),
        };
      }

      try {
        const payload = (await fetchJson(`${url}&api_key=${apiKey}`)) as {
          data?: FaostatRow[];
        };
        const records: Observation[] = (payload.data ?? [])
          .filter((row) => row.Value)
          .map((row) => ({
            country_iso3: "",
            country: row.Area,
            indicator: "QCL.5510",
            indicator_label: `${row.Item} production`,
            year: Number.parseInt(row.Year, 10),
            value: Number.parseFloat(row.Value),
            unit: row.Unit,
          }));

        return {
          records,
          provenance: provenance(
            "faostat",
            "FAO FAOSTAT",
            ENDPOINT,
            records.length > 0 ? "live" : "empty"
          ),
        };
      } catch (error) {
        return {
          records: [],
          provenance: provenance("faostat", "FAO FAOSTAT", ENDPOINT, "unavailable", {
            note: error instanceof Error ? error.message : String(error),
          }),
        };
      }
    },
    { force }
  );
}
