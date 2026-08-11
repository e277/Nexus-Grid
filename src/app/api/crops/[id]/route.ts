import { api, found, intParam } from "@/lib/server/http";
import { getCrop } from "@/lib/server/services/crop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api<{ id: string }>(({ params }) => {
  return found(getCrop(intParam(params.id, "crop_id")), "Crop not found");
});
