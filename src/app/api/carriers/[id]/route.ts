import { api, found, intParam } from "@/lib/server/http";
import { getCarrier } from "@/lib/server/services/logistics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api<{ id: string }>(({ params }) => {
  return found(getCarrier(intParam(params.id, "carrier_id")), "Carrier not found");
});
