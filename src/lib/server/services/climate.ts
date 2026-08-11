/**
 * Business logic for climate hazards.
 *
 * Creating a weather event publishes `weather.alert` so the climate risk
 * agent can evaluate disruptions.
 */

import { publish } from "../events";
import type { WeatherEvent, WeatherEventType, WeatherSeverity } from "../models";
import { weatherEvents } from "../repositories";
import { utcnowIso } from "../time";

export interface WeatherEventInput {
  event_type: WeatherEventType;
  severity: WeatherSeverity;
  affected_islands: string | null;
  starts_at: string | null;
  ends_at: string | null;
  source: string | null;
}

export function listWeatherEvents(options: {
  skip?: number;
  limit?: number;
  severity?: WeatherSeverity | null;
}): WeatherEvent[] {
  return weatherEvents.list(options);
}

export function getWeatherEvent(eventId: number): WeatherEvent | null {
  return weatherEvents.get(eventId);
}

export async function createWeatherEvent(input: WeatherEventInput): Promise<WeatherEvent> {
  const event = weatherEvents.create({ ...input, created_at: utcnowIso() });

  await publish("weather.alert", {
    weather_event_id: event.id,
    event_type: event.event_type,
    severity: event.severity,
    affected_islands: event.affected_islands,
  });
  return event;
}
