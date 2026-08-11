import { api, boolQuery, jsonBody, pagination } from "@/lib/server/http";
import type { TransportMode } from "@/lib/server/models";
import { createCarrier, listCarriers } from "@/lib/server/services/logistics";
import {
  enumField,
  optionalBool,
  optionalInt,
  optionalString,
  requiredString,
} from "@/lib/server/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODES: TransportMode[] = ["sea", "air", "land"];

export const GET = api(({ query }) => {
  return listCarriers({ ...pagination(query), active: boolQuery(query, "active") });
});

export const POST = api(
  async ({ request }) => {
    const body = await jsonBody(request);
    return createCarrier({
      name: requiredString(body, "name"),
      mode: enumField(body, "mode", MODES, "sea"),
      capacity: optionalInt(body, "capacity"),
      home_island: optionalString(body, "home_island"),
      contact_email: optionalString(body, "contact_email"),
      active: optionalBool(body, "active", true),
    });
  },
  { status: 201 }
);
