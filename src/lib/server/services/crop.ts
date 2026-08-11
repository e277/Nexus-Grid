/** Business logic for crop inventory management. */

import type { Crop } from "../models";
import { crops, farmers } from "../repositories";
import { NotFoundError } from "./errors";

export interface CropInput {
  farmer_id: number;
  crop_name: string;
  quantity: number;
  harvest_date: string | null;
}

export function listCrops(options: { skip?: number; limit?: number }): Crop[] {
  return crops.list(options);
}

export function getCrop(cropId: number): Crop | null {
  return crops.get(cropId);
}

export function createCrop(input: CropInput): Crop {
  if (farmers.get(input.farmer_id) === null) {
    throw new NotFoundError(`Farmer ${input.farmer_id} does not exist`);
  }
  return crops.create(input);
}
