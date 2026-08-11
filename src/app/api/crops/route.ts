import { api, jsonBody, pagination } from "@/lib/server/http";
import { createCrop, listCrops } from "@/lib/server/services/crop";
import { optionalDate, requiredInt, requiredString } from "@/lib/server/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api(({ query }) => {
  return listCrops(pagination(query));
});

export const POST = api(
  async ({ request }) => {
    const body = await jsonBody(request);
    return createCrop({
      farmer_id: requiredInt(body, "farmer_id"),
      crop_name: requiredString(body, "crop_name"),
      quantity: requiredInt(body, "quantity", { ge: 0 }),
      harvest_date: optionalDate(body, "harvest_date"),
    });
  },
  { status: 201 }
);
