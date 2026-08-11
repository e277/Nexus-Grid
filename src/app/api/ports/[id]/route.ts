import { api, found, intParam } from "@/lib/server/http";
import { getPort } from "@/lib/server/services/logistics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api<{ id: string }>(({ params }) => {
  return found(getPort(intParam(params.id, "port_id")), "Port not found");
});
