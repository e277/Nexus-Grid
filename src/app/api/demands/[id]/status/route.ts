import { api, found, intParam, jsonBody } from "@/lib/server/http";
import type { DemandStatus } from "@/lib/server/models";
import { getDemand, updateStatus } from "@/lib/server/services/demand";
import { requiredEnum } from "@/lib/server/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEMAND_STATUSES: DemandStatus[] = ["open", "matched", "fulfilled", "cancelled"];

export const PATCH = api<{ id: string }>(async ({ request, params }) => {

  const demand = found(getDemand(intParam(params.id, "demand_id")), "Demand not found");
  const body = await jsonBody(request);
  return updateStatus(demand, requiredEnum(body, "status", DEMAND_STATUSES));
});
