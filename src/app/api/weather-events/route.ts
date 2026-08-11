import { api, enumQuery, jsonBody, pagination } from "@/lib/server/http";
import type { WeatherEventType, WeatherSeverity } from "@/lib/server/models";
import { createWeatherEvent, listWeatherEvents } from "@/lib/server/services/climate";
import {
  enumField,
  optionalDateTime,
  optionalString,
  requiredEnum,
} from "@/lib/server/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENT_TYPES: WeatherEventType[] = ["storm", "hurricane", "flood", "drought"];
const SEVERITIES: WeatherSeverity[] = ["low", "medium", "high", "severe"];

export const GET = api(({ query }) => {
  return listWeatherEvents({
    ...pagination(query),
    severity: enumQuery(query, "severity", SEVERITIES),
  });
});

export const POST = api(
  async ({ request }) => {
    const body = await jsonBody(request);
    return createWeatherEvent({
      event_type: requiredEnum(body, "event_type", EVENT_TYPES),
      severity: enumField(body, "severity", SEVERITIES, "low"),
      affected_islands: optionalString(body, "affected_islands"),
      starts_at: optionalDateTime(body, "starts_at"),
      ends_at: optionalDateTime(body, "ends_at"),
      source: optionalString(body, "source"),
    });
  },
  { status: 201 }
);
