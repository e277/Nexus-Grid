import { getSettings } from "@/lib/server/config";
import { api } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api(() => ({
  system: getSettings().appName,
  status: "online",
}));
