/**
 * Business logic for shipments.
 *
 * Status transitions publish the corresponding lifecycle events
 * (`shipment.departed`, `shipment.delayed`, `shipment.arrived`) so
 * monitoring and recovery agents can react.
 */

import { publish } from "../events";
import type { Shipment, ShipmentStatus } from "../models";
import { crops, demands, shipments, updateShipmentStatus } from "../repositories";
import { utcnowIso } from "../time";
import { ConflictError, NotFoundError } from "./errors";

export interface ShipmentInput {
  crop_id: number;
  demand_id: number | null;
  carrier: string | null;
  origin_island: string;
  destination_island: string;
  quantity: number;
  eta: string | null;
}

/** Event name published for each status transition. */
const STATUS_EVENTS: Partial<Record<ShipmentStatus, string>> = {
  in_transit: "shipment.departed",
  delayed: "shipment.delayed",
  delivered: "shipment.arrived",
};

/** Allowed transitions from each status. */
const ALLOWED_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  planned: ["in_transit", "cancelled"],
  in_transit: ["delayed", "delivered", "cancelled"],
  delayed: ["in_transit", "delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function listShipments(options: {
  skip?: number;
  limit?: number;
  status?: ShipmentStatus | null;
}): Shipment[] {
  return shipments.list(options);
}

export function getShipment(shipmentId: number): Shipment | null {
  return shipments.get(shipmentId);
}

export function createShipment(input: ShipmentInput): Shipment {
  if (crops.get(input.crop_id) === null) {
    throw new NotFoundError(`Crop ${input.crop_id} does not exist`);
  }
  if (input.demand_id !== null && demands.get(input.demand_id) === null) {
    throw new NotFoundError(`Demand ${input.demand_id} does not exist`);
  }
  return shipments.create({
    ...input,
    status: "planned",
    departed_at: null,
    delivered_at: null,
    created_at: utcnowIso(),
  });
}

export async function updateStatus(
  shipment: Shipment,
  newStatus: ShipmentStatus
): Promise<Shipment> {
  if (!ALLOWED_TRANSITIONS[shipment.status].includes(newStatus)) {
    throw new ConflictError(
      `Cannot move shipment ${shipment.id} from ${shipment.status} to ${newStatus}`
    );
  }

  const updated = updateShipmentStatus(shipment, newStatus);

  const eventName = STATUS_EVENTS[newStatus];
  if (eventName) {
    await publish(eventName, {
      shipment_id: updated.id,
      crop_id: updated.crop_id,
      origin_island: updated.origin_island,
      destination_island: updated.destination_island,
      status: updated.status,
    });
  }
  return updated;
}
