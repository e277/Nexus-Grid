import { api, found, intParam } from "@/lib/server/http";
import { getWarehouse } from "@/lib/server/services/logistics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api<{ id: string }>(({ params }) => {
  return found(getWarehouse(intParam(params.id, "warehouse_id")), "Warehouse not found");
});
