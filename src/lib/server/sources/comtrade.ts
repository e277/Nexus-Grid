/**
 * UN Comtrade — where CARICOM states actually buy their food from.
 *
 * Uses the public preview endpoint, which needs no key. It caps the rows it
 * returns, so this asks a deliberately narrow question: for the food HS
 * chapters that matter most to this region, who does each member state import
 * from, and how much of that comes from inside CARICOM rather than outside it.
 *
 * That ratio is the import-substitution story in one number, and it is the
 * kind of thing no single member state can see from its own systems.
 */

import { byM49, isCaricom, CARICOM_STATES } from "./caricom";
import { partnerNameFor } from "./partners";
import { fetchJson, withCache } from "./cache";
import { provenance, type Snapshot, type TradeFlow } from "./types";

const ENDPOINT = "https://comtradeapi.un.org/public/v1/preview/C/A/HS";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * The preview endpoint rate-limits aggressively — at 350ms spacing it dropped
 * two thirds of the member states. One pass with generous spacing plus a
 * single backed-off retry gets the full set, and the result is cached for
 * half a day, so the wait is paid once.
 */
const GAP_MS = 1200;
const RETRY_DELAY_MS = 4000;

/** Food chapters with the clearest regional-production story. */
const COMMODITIES: Record<string, string> = {
  "07": "Vegetables",
  "08": "Fruit and nuts",
  "10": "Cereals",
};

/** Comtrade lags by a year or two; ask for the most recent settled year. */
const YEAR = new Date().getFullYear() - 3;

interface ComtradeRow {
  refYear: number;
  reporterCode: number;
  partnerCode: number;
  cmdCode: string;
  flowCode: string;
  primaryValue: number | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function partnerName(code: number): string {
  // Member states first — that table is the one the rest of the platform
  // joins on — then the external partners, then a labelled fallback so an
  // unmapped code is visibly a code and not mistaken for a country.
  return byM49(code)?.name ?? partnerNameFor(code) ?? `Unmapped partner ${code}`;
}

async function fetchReporter(m49: number): Promise<TradeFlow[]> {
  const url =
    `${ENDPOINT}?reporterCode=${m49}&period=${YEAR}` +
    `&cmdCode=${Object.keys(COMMODITIES).join(",")}&flowCode=M`;

  const payload = (await fetchJson(url)) as { data?: ComtradeRow[] };
  const reporter = byM49(m49);
  if (!reporter) return [];

  return (payload.data ?? [])
    .filter((row) => row.primaryValue !== null && row.partnerCode !== 0)
    .map((row) => ({
      reporter_iso3: reporter.iso3,
      reporter: reporter.name,
      partner: partnerName(row.partnerCode),
      partner_is_caricom: isCaricom(row.partnerCode),
      commodity_code: row.cmdCode,
      commodity: COMMODITIES[row.cmdCode] ?? `HS ${row.cmdCode}`,
      direction: "import" as const,
      year: row.refYear,
      value_usd: row.primaryValue as number,
    }));
}

export function fetchComtrade(force = false): Promise<Snapshot<TradeFlow>> {
  return withCache<TradeFlow>(
    "comtrade",
    CACHE_TTL_MS,
    async () => {
      const records: TradeFlow[] = [];
      const retry: typeof CARICOM_STATES = [];
      const failed: string[] = [];

      for (const [index, state] of CARICOM_STATES.entries()) {
        if (index > 0) await sleep(GAP_MS);
        try {
          records.push(...(await fetchReporter(state.m49)));
        } catch {
          retry.push(state);
        }
      }

      for (const state of retry) {
        await sleep(RETRY_DELAY_MS);
        try {
          records.push(...(await fetchReporter(state.m49)));
        } catch (error) {
          failed.push(state.iso3);
          console.warn(`Comtrade fetch failed for ${state.iso3}:`, error);
        }
      }

      const allFailed = records.length === 0;
      return {
        records,
        provenance: provenance(
          "comtrade",
          "UN Comtrade (public preview)",
          ENDPOINT,
          allFailed ? "unavailable" : records.length > 0 ? "live" : "empty",
          {
            covers: String(YEAR),
            note:
              failed.length > 0
                ? `No response for ${failed.join(", ")} — the preview endpoint is rate-limited.`
                : undefined,
          }
        ),
      };
    },
    {
      force,
      pending: {
        source: "comtrade",
        publisher: "UN Comtrade (public preview)",
        endpoint: ENDPOINT,
      },
    }
  );
}

export { COMMODITIES as COMTRADE_COMMODITIES, YEAR as COMTRADE_YEAR };
