import { api, found, intParam } from "@/lib/server/http";
import { getShipment } from "@/lib/server/services/shipment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api<{ id: string }>(({ params }) => {
  return found(getShipment(intParam(params.id, "shipment_id")), "Shipment not found");
});
