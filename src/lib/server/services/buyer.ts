/** Business logic for buyer management. */

import type { Buyer, BuyerType } from "../models";
import { buyers } from "../repositories";

export interface BuyerInput {
  name: string;
  island: string | null;
  buyer_type: BuyerType;
  contact_email: string | null;
}

export function listBuyers(options: { skip?: number; limit?: number }): Buyer[] {
  return buyers.list(options);
}

export function getBuyer(buyerId: number): Buyer | null {
  return buyers.get(buyerId);
}

export function createBuyer(input: BuyerInput): Buyer {
  return buyers.create(input);
}
