import { api, jsonBody } from "@/lib/server/http";
import { runOnce } from "@/lib/server/workflows/orchestrator";
import type { SupplyState } from "@/lib/server/workflows/supply-chain-graph";
import { optionalBool, optionalInt, optionalString } from "@/lib/server/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Run the coordination loop once against a supplied sourcing gap. */
export const POST = api(async ({ request }) => {
  const body = await jsonBody(request);

  const suppliers = body.regional_suppliers;
  const context: SupplyState = {
    event: optionalString(body, "event") ?? undefined,
    commodity: optionalString(body, "commodity"),
    importer: optionalString(body, "importer"),
    importer_iso3: optionalString(body, "importer_iso3"),
    external_usd: optionalInt(body, "external_usd") ?? undefined,
    external_share_pct: optionalInt(body, "external_share_pct") ?? undefined,
    regional_suppliers: Array.isArray(suppliers) ? suppliers.map(String) : undefined,
    climate_risk: optionalString(body, "climate_risk") ?? undefined,
    market_context: optionalString(body, "market_context") ?? undefined,
    require_approval:
      body.require_approval === undefined || body.require_approval === null
        ? undefined
        : optionalBool(body, "require_approval", false),
  };
  for (const key of Object.keys(context) as (keyof SupplyState)[]) {
    if (context[key] === undefined || context[key] === null) delete context[key];
  }

  return { status: "triggered", result: await runOnce(context) };
});
