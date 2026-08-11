import { HttpError, api } from "@/lib/server/http";
import { predictTransportDelay } from "@/lib/server/services/intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api(({ query }) => {

  const origin = query.get("origin_island");
  const destination = query.get("destination_island");
  if (!origin || !destination) {
    throw new HttpError(422, "origin_island and destination_island are required");
  }
  return predictTransportDelay(origin, destination);
});
