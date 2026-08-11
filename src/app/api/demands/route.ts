import { api, enumQuery, jsonBody, pagination } from "@/lib/server/http";
import type { DemandStatus } from "@/lib/server/models";
import { createDemand, listDemands } from "@/lib/server/services/demand";
import { optionalDate, requiredInt, requiredString } from "@/lib/server/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DEMAND_STATUSES: DemandStatus[] = ["open", "matched", "fulfilled", "cancelled"];

export const GET = api(({ query }) => {
  return listDemands({
    ...pagination(query),
    status: enumQuery(query, "status", DEMAND_STATUSES),
  });
});

export const POST = api(
  async ({ request }) => {
    const body = await jsonBody(request);
    return createDemand({
      buyer_id: requiredInt(body, "buyer_id"),
      crop_name: requiredString(body, "crop_name"),
      quantity: requiredInt(body, "quantity", { gt: 0 }),
      needed_by: optionalDate(body, "needed_by"),
    });
  },
  { status: 201 }
);
