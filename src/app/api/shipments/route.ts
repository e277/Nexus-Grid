import { api, enumQuery, jsonBody, pagination } from "@/lib/server/http";
import type { ShipmentStatus } from "@/lib/server/models";
import { createShipment, listShipments } from "@/lib/server/services/shipment";
import {
  optionalDateTime,
  optionalInt,
  optionalString,
  requiredInt,
  requiredString,
} from "@/lib/server/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHIPMENT_STATUSES: ShipmentStatus[] = [
  "planned",
  "in_transit",
  "delayed",
  "delivered",
  "cancelled",
];

export const GET = api(({ query }) => {
  return listShipments({
    ...pagination(query),
    status: enumQuery(query, "status", SHIPMENT_STATUSES),
  });
});

export const POST = api(
  async ({ request }) => {
    const body = await jsonBody(request);
    return createShipment({
      crop_id: requiredInt(body, "crop_id"),
      demand_id: optionalInt(body, "demand_id"),
      carrier: optionalString(body, "carrier"),
      origin_island: requiredString(body, "origin_island"),
      destination_island: requiredString(body, "destination_island"),
      quantity: requiredInt(body, "quantity", { gt: 0 }),
      eta: optionalDateTime(body, "eta"),
    });
  },
  { status: 201 }
);
