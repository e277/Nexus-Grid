import { api } from "@/lib/server/http";
import { predictRegionalShortage } from "@/lib/server/services/intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api<{ crop: string }>(({ params }) => {
  return predictRegionalShortage(decodeURIComponent(params.crop));
});
