import { api, found, intParam } from "@/lib/server/http";
import { getTradeRoute } from "@/lib/server/services/logistics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api<{ id: string }>(({ params }) => {
  return found(getTradeRoute(intParam(params.id, "route_id")), "Trade route not found");
});
