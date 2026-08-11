import { api, found, intParam, jsonBody } from "@/lib/server/http";
import type { PortStatus } from "@/lib/server/models";
import { getPort, updateStatus } from "@/lib/server/services/logistics";
import { requiredEnum } from "@/lib/server/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PORT_STATUSES: PortStatus[] = ["open", "congested", "closed"];

export const PATCH = api<{ id: string }>(async ({ request, params }) => {

  const port = found(getPort(intParam(params.id, "port_id")), "Port not found");
  const body = await jsonBody(request);
  return updateStatus(port, requiredEnum(body, "status", PORT_STATUSES));
});
