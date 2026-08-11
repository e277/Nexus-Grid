import { api, found, intParam } from "@/lib/server/http";
import { getBuyer } from "@/lib/server/services/buyer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api<{ id: string }>(({ params }) => {
  return found(getBuyer(intParam(params.id, "buyer_id")), "Buyer not found");
});
