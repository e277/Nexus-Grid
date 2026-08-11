import { api, found, intParam } from "@/lib/server/http";
import { getDemand } from "@/lib/server/services/demand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api<{ id: string }>(({ params }) => {
  return found(getDemand(intParam(params.id, "demand_id")), "Demand not found");
});
