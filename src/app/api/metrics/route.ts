import { api } from "@/lib/server/http";
import { renderMetrics } from "@/lib/server/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Prometheus-format process metrics. Admin only: a scraper authenticates with
 * an admin-role API token (see AUTH_API_TOKENS).
 */
export const GET = api(
  () =>
    new Response(renderMetrics(), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    }),
  { access: "admin" }
);
