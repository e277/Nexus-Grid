import { api } from "@/lib/server/http";
import { getDb } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Readiness probe: verifies the data store is initialized and usable. */
export const GET = api(() => {
  try {
    const db = getDb();
    return {
      status: "ok",
      database: "reachable",
      backend: "in-memory",
      seeded: db.seeded,
    };
  } catch (error) {
    return {
      status: "degraded",
      database: "unreachable",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
});
