import { api, found, intParam } from "@/lib/server/http";
import { getCrop } from "@/lib/server/services/crop";
import { predictSpoilage } from "@/lib/server/services/intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api<{ cropId: string }>(({ params }) => {
  const crop = found(getCrop(intParam(params.cropId, "crop_id")), "Crop not found");
  return predictSpoilage(crop);
});
