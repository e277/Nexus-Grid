import { api, boolQuery, jsonBody, pagination } from "@/lib/server/http";
import type { PortType } from "@/lib/server/models";
import { createTradeRoute, listTradeRoutes } from "@/lib/server/services/logistics";
import {
  enumField,
  optionalBool,
  optionalInt,
  requiredInt,
  requiredString,
} from "@/lib/server/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODES: PortType[] = ["sea", "air"];

export const GET = api(({ query }) => {
  return listTradeRoutes({ ...pagination(query), active: boolQuery(query, "active") });
});

export const POST = api(
  async ({ request }) => {
    const body = await jsonBody(request);
    return createTradeRoute({
      name: requiredString(body, "name"),
      origin_port_id: requiredInt(body, "origin_port_id"),
      destination_port_id: requiredInt(body, "destination_port_id"),
      mode: enumField(body, "mode", MODES, "sea"),
      transit_hours: optionalInt(body, "transit_hours", { gt: 0 }),
      active: optionalBool(body, "active", true),
    });
  },
  { status: 201 }
);
