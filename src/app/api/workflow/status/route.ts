import { api } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api(() => {
  return { workflow: "nexus_grid", status: "ready" };
});
