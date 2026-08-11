import { api } from "@/lib/server/http";
import { forecastDemand } from "@/lib/server/services/intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api<{ crop: string }>(({ params }) => {
  return forecastDemand(decodeURIComponent(params.crop));
});
