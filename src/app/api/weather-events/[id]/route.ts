import { api, found, intParam } from "@/lib/server/http";
import { getWeatherEvent } from "@/lib/server/services/climate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api<{ id: string }>(({ params }) => {
  return found(getWeatherEvent(intParam(params.id, "event_id")), "Weather event not found");
});
