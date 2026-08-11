/**
 * Business logic for demand signals.
 *
 * Creating a demand publishes `buyer.request.created` so intelligence agents
 * can react to new purchasing intent.
 */

import { publish } from "../events";
import type { Demand, DemandStatus } from "../models";
import { buyers, demands, updateDemandStatus } from "../repositories";
import { utcnowIso } from "../time";
import { ConflictError, NotFoundError } from "./errors";

export interface DemandInput {
  buyer_id: number;
  crop_name: string;
  quantity: number;
  needed_by: string | null;
}

const ALLOWED_TRANSITIONS: Record<DemandStatus, DemandStatus[]> = {
  open: ["matched", "cancelled"],
  matched: ["fulfilled", "cancelled"],
  fulfilled: [],
  cancelled: [],
};

export function listDemands(options: {
  skip?: number;
  limit?: number;
  status?: DemandStatus | null;
}): Demand[] {
  return demands.list(options);
}

export function getDemand(demandId: number): Demand | null {
  return demands.get(demandId);
}

export async function createDemand(input: DemandInput): Promise<Demand> {
  if (buyers.get(input.buyer_id) === null) {
    throw new NotFoundError(`Buyer ${input.buyer_id} does not exist`);
  }

  const demand = demands.create({
    ...input,
    status: "open",
    created_at: utcnowIso(),
  });

  await publish("buyer.request.created", {
    demand_id: demand.id,
    buyer_id: demand.buyer_id,
    crop_name: demand.crop_name,
    quantity: demand.quantity,
  });
  return demand;
}

export function updateStatus(demand: Demand, newStatus: DemandStatus): Demand {
  if (!ALLOWED_TRANSITIONS[demand.status].includes(newStatus)) {
    throw new ConflictError(
      `Cannot move demand ${demand.id} from ${demand.status} to ${newStatus}`
    );
  }
  return updateDemandStatus(demand, newStatus);
}
