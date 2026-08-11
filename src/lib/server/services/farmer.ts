/**
 * Business logic for farmer management.
 *
 * Sits between the route handlers and the repository so that validation and
 * domain rules live in one place, independent of HTTP concerns.
 */

import type { Farmer } from "../models";
import { farmers } from "../repositories";

export interface FarmerInput {
  name: string;
  island: string | null;
  crops: string | null;
  capacity: number | null;
}

export function listFarmers(options: { skip?: number; limit?: number }): Farmer[] {
  return farmers.list(options);
}

export function getFarmer(farmerId: number): Farmer | null {
  return farmers.get(farmerId);
}

export function createFarmer(input: FarmerInput): Farmer {
  return farmers.create(input);
}
