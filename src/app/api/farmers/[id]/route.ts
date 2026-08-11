import { api, found, intParam } from "@/lib/server/http";
import { getFarmer } from "@/lib/server/services/farmer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api<{ id: string }>(({ params }) => {
  return found(getFarmer(intParam(params.id, "farmer_id")), "Farmer not found");
});
