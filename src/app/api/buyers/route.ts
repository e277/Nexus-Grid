import { api, jsonBody, pagination } from "@/lib/server/http";
import type { BuyerType } from "@/lib/server/models";
import { createBuyer, listBuyers } from "@/lib/server/services/buyer";
import { enumField, optionalString, requiredString } from "@/lib/server/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUYER_TYPES: BuyerType[] = ["retailer", "wholesaler", "government"];

export const GET = api(({ query }) => {
  return listBuyers(pagination(query));
});

export const POST = api(
  async ({ request }) => {
    const body = await jsonBody(request);
    return createBuyer({
      name: requiredString(body, "name"),
      island: optionalString(body, "island"),
      buyer_type: enumField(body, "buyer_type", BUYER_TYPES, "retailer"),
      contact_email: optionalString(body, "contact_email"),
    });
  },
  { status: 201 }
);
