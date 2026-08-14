/**
 * In-process event bus, and the subscriptions that route every coordination
 * event to the supervisor agent.
 *
 * Handlers run to completion before the publishing request returns, so an
 * agent's reaction is visible in the same round trip that caused it.
 */

export type EventPayload = Record<string, unknown>;
export type Handler = (eventName: string, payload: EventPayload) => Promise<void> | void;

/** Events the supervisor knows how to route (see SupervisorAgent.routes). */
export const SUPERVISED_EVENTS = [
  "substitution.gap.detected",
  "demand.review.requested",
  "climate.risk.elevated",
  "storm.alert",
  "lane.assessment.requested",
  "planting.window.review",
  "soil.assessment.requested",
] as const;

/** Synchronous-in-order publish/subscribe dispatcher. */
export class EventBus {
  private handlers = new Map<string, Handler[]>();

  subscribe(eventName: string, handler: Handler): void {
    const existing = this.handlers.get(eventName) ?? [];
    existing.push(handler);
    this.handlers.set(eventName, existing);
  }

  /**
   * Invoke all handlers for the event; returns how many ran.
   *
   * A failing handler is logged and skipped so one subscriber cannot break
   * delivery to the others.
   */
  async publish(eventName: string, payload: EventPayload = {}): Promise<number> {
    let delivered = 0;
    for (const handler of this.handlers.get(eventName) ?? []) {
      try {
        await handler(eventName, payload);
        delivered += 1;
      } catch (error) {
        console.error(`Event handler failed for ${eventName}`, error);
      }
    }
    return delivered;
  }

  get subscriptionCount(): number {
    return this.handlers.size;
  }
}

const globalBus = globalThis as typeof globalThis & {
  __nexusGridEventBusV2?: EventBus;
  __nexusGridEventsRegisteredV2?: boolean;
};

export function getEventBus(): EventBus {
  if (!globalBus.__nexusGridEventBusV2) globalBus.__nexusGridEventBusV2 = new EventBus();
  return globalBus.__nexusGridEventBusV2;
}

/** Publish through the process-wide bus. */
export function publish(eventName: string, payload: EventPayload = {}): Promise<number> {
  return getEventBus().publish(eventName, payload);
}

/** Subscribe the supervisor to all supervised events (idempotent). */
export function registerEventHandlers(): void {
  if (globalBus.__nexusGridEventsRegisteredV2) return;
  globalBus.__nexusGridEventsRegisteredV2 = true;

  const bus = getEventBus();
  for (const eventName of SUPERVISED_EVENTS) {
    bus.subscribe(eventName, async (name, payload) => {
      // Imported lazily: agents import services, which import this module
      const { supervisor } = await import("./agents/supervisor");
      try {
        await supervisor.dispatch(name, payload);
      } catch (error) {
        console.error(`Supervisor dispatch failed for ${name}`, error);
      }
    });
  }
}
