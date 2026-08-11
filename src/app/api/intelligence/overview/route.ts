import { api } from "@/lib/server/http";
import { supplyChainOverview } from "@/lib/server/services/intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Supply-chain health and regional food security aggregates. */
export const GET = api(() => {
  return supplyChainOverview();
});
