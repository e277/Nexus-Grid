import { api, enumQuery, jsonBody, pagination } from "@/lib/server/http";
import type { PortStatus, PortType } from "@/lib/server/models";
import { createPort, listPorts } from "@/lib/server/services/logistics";
import { enumField, requiredString } from "@/lib/server/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PORT_STATUSES: PortStatus[] = ["open", "congested", "closed"];
const PORT_TYPES: PortType[] = ["sea", "air"];

export const GET = api(({ query }) => {
  return listPorts({ ...pagination(query), status: enumQuery(query, "status", PORT_STATUSES) });
});

export const POST = api(
  async ({ request }) => {
    const body = await jsonBody(request);
    return createPort({
      name: requiredString(body, "name"),
      island: requiredString(body, "island"),
      port_type: enumField(body, "port_type", PORT_TYPES, "sea"),
    });
  },
  { status: 201 }
);
