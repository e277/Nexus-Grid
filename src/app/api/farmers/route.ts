import { api, jsonBody, pagination } from "@/lib/server/http";
import { createFarmer, listFarmers } from "@/lib/server/services/farmer";
import { optionalInt, optionalString, requiredString } from "@/lib/server/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api(({ query }) => {
  return listFarmers(pagination(query));
});

export const POST = api(
  async ({ request }) => {
    const body = await jsonBody(request);
    return createFarmer({
      name: requiredString(body, "name"),
      island: optionalString(body, "island"),
      crops: optionalString(body, "crops"),
      capacity: optionalInt(body, "capacity"),
    });
  },
  { status: 201 }
);
