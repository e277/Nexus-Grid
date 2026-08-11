import { api, jsonBody } from "@/lib/server/http";
import { runOnce } from "@/lib/server/workflows/orchestrator";
import type { SupplyState } from "@/lib/server/workflows/supply-chain-graph";
import {
  optionalBool,
  optionalInt,
  optionalString,
} from "@/lib/server/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Run the control loop once against the supplied signal context. */
export const POST = api(async ({ request }) => {
  const body = await jsonBody(request);

  // Mirrors WorkflowRequest: every field optional, `None` values dropped so
  // the graph's own defaults apply.
  const context: SupplyState = {
    crop_id: optionalInt(body, "crop_id"),
    crop_name: optionalString(body, "crop_name") ?? undefined,
    farmer_id: optionalInt(body, "farmer_id"),
    farmer_name: optionalString(body, "farmer_name") ?? undefined,
    island: optionalString(body, "island") ?? undefined,
    quantity: optionalInt(body, "quantity") ?? undefined,
    event: optionalString(body, "event") ?? undefined,
    message: optionalString(body, "message"),
    market_context: optionalString(body, "market_context") ?? undefined,
    weather_risk: optionalString(body, "weather_risk") ?? undefined,
    logistics_status: optionalString(body, "logistics_status") ?? undefined,
    demand_signal: optionalString(body, "demand_signal") ?? undefined,
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
