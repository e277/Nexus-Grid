import { api, jsonBody, pagination } from "@/lib/server/http";
import { createWarehouse, listWarehouses } from "@/lib/server/services/logistics";
import { optionalBool, optionalInt, requiredString } from "@/lib/server/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api(({ query }) => {
  return listWarehouses({ ...pagination(query), island: query.get("island") });
});

export const POST = api(
  async ({ request }) => {
    const body = await jsonBody(request);
    return createWarehouse({
      name: requiredString(body, "name"),
      island: requiredString(body, "island"),
      capacity: optionalInt(body, "capacity"),
      cold_storage: optionalBool(body, "cold_storage", false),
    });
  },
  { status: 201 }
);
