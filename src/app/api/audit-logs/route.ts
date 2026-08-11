import { api, pagination } from "@/lib/server/http";
import { listAuditLogs } from "@/lib/server/services/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Read-only: records are written by services, not via the API. */
export const GET = api(({ query }) => {
  return listAuditLogs({
    ...pagination(query),
    actor: query.get("actor"),
    entity_type: query.get("entity_type"),
  });
});
