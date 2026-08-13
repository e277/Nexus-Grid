import { actionLabel, agentTitle } from "@/lib/server/agents/labels";
import { api, pagination } from "@/lib/server/http";
import { listAgentActivities } from "@/lib/server/observability/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read-only: records are created internally by agents, not via the API.
 *
 * Each row carries a readable name alongside the identifier. The identifier
 * stays because it is the key rows are filed and filtered under; the label is
 * what anything downstream should show a person, and having the API supply it
 * keeps one vocabulary rather than a copy in every consumer.
 */
export const GET = api(({ query }) => {
  return listAgentActivities({
    ...pagination(query),
    agent_name: query.get("agent_name"),
  }).map((activity) => ({
    ...activity,
    agent_title: agentTitle(activity.agent_name),
    action_label: actionLabel(activity.action),
  }));
});
