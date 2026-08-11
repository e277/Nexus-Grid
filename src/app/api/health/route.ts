import { getSettings } from "@/lib/server/config";
import { api } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness probe: the process is up and serving requests. */
export const GET = api(() => {
  const settings = getSettings();
  return {
    status: "ok",
    app: settings.appName,
    version: settings.appVersion,
    environment: settings.environment,
  };
});
