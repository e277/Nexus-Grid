import { api, found, intParam, jsonBody } from "@/lib/server/http";
import type { ShipmentStatus } from "@/lib/server/models";
import { getShipment, updateStatus } from "@/lib/server/services/shipment";
import { requiredEnum } from "@/lib/server/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHIPMENT_STATUSES: ShipmentStatus[] = [
  "planned",
  "in_transit",
  "delayed",
  "delivered",
  "cancelled",
];

export const PATCH = api<{ id: string }>(async ({ request, params }) => {

  const shipment = found(
    getShipment(intParam(params.id, "shipment_id")),
    "Shipment not found"
  );
  const body = await jsonBody(request);
  return updateStatus(shipment, requiredEnum(body, "status", SHIPMENT_STATUSES));
});
