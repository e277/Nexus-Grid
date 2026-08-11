import { api, pagination } from "@/lib/server/http";
import { listAgentActivities } from "@/lib/server/services/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Read-only: records are created internally by agents, not via the API. */
export const GET = api(({ query }) => {
  return listAgentActivities({
    ...pagination(query),
    agent_name: query.get("agent_name"),
  });
});
