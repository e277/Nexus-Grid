import { api } from "@/lib/server/http";
import { renderMetrics } from "@/lib/server/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Prometheus-format process metrics. */
export const GET = api(
  () =>
    new Response(renderMetrics(), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
);
