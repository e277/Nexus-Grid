/**
 * Supply Intelligence Agent.
 *
 * Scans crop inventory, classifies surplus/shortage conditions, and triggers
 * the orchestration workflow for each detected event.
 */

import type { Crop } from "../models";
import { crops, farmers } from "../repositories";
import {
  SHORTAGE_THRESHOLD,
  SURPLUS_THRESHOLD,
  classifyQuantity,
} from "../services/supply-rules";
import { runOnce } from "../workflows/orchestrator";
import { BaseAgent, result, type AgentPayload, type AgentResult } from "./base";

/**
 * How clearly `quantity` sits inside its band, as a 0..1 margin.
 *
 * Distance from the nearer threshold, normalized by that threshold's scale —
 * a quantity right at a boundary is ambiguous (near 0); one far inside a band
 * is unambiguous (near 1). Not a probability, just a legible measure of how
 * confidently the classification holds.
 */
function marginConfidence(quantity: number): number {
  if (quantity <= 0) return 0.0;
  if (quantity < SHORTAGE_THRESHOLD) {
    return Math.min(1.0, (SHORTAGE_THRESHOLD - quantity) / SHORTAGE_THRESHOLD);
  }
  if (quantity > SURPLUS_THRESHOLD) {
    return Math.min(1.0, (quantity - SURPLUS_THRESHOLD) / SURPLUS_THRESHOLD);
  }
  // Inside the normal band: confidence peaks at the midpoint, tapers at either edge.
  const span = SURPLUS_THRESHOLD - SHORTAGE_THRESHOLD;
  const midpoint = SHORTAGE_THRESHOLD + span / 2;
  return 1.0 - Math.abs(quantity - midpoint) / (span / 2);
}

interface InventoryEvent {
  crop_id: number;
  status: string;
}

/** Agent that inspects crops and triggers the workflow on conditions. */
export class SupplyAgent extends BaseAgent {
  readonly name = "supply_intelligence";

  analyzeInventory(crop: Crop): { status: string; message: string } {
    if (crop.quantity === null || crop.quantity === undefined) {
      return { status: "unknown", message: "quantity missing" };
    }

    const status = classifyQuantity(crop.quantity);
    if (status === "normal") {
      return { status, message: "inventory within expected range" };
    }
    return { status, message: `${crop.crop_name} ${status} detected` };
  }

  protected async handle(_payload: AgentPayload): Promise<AgentResult> {
    const { events, margins } = await this.scan();
    return result(
      this.name,
      "inventory_scan",
      this.confidence(events, margins),
      `Detected ${events.length} inventory event(s)`,
      { events }
    );
  }

  /**
   * Confidence from real scan signal, not a fixed constant.
   *
   * No crops scanned: nothing to be confident about. Otherwise it's the
   * average classification margin across scanned crops (see
   * `marginConfidence`), nudged up slightly per corroborating event (more
   * anomalies agreeing on a shortage/surplus condition is itself signal) —
   * bounded to 1.0.
   */
  private confidence(events: InventoryEvent[], margins: number[]): number {
    if (margins.length === 0) return 0.0;
    const base = margins.reduce((a, b) => a + b, 0) / margins.length;
    return Math.min(1.0, base + 0.05 * events.length);
  }

  /**
   * Analyze all crops and trigger the workflow for each anomaly.
   *
   * Returns the detected events plus the per-crop classification margin used
   * to compute scan confidence.
   */
  private async scan(): Promise<{ events: InventoryEvent[]; margins: number[] }> {
    const events: InventoryEvent[] = [];
    const margins: number[] = [];

    for (const crop of crops.all()) {
      try {
        const analysis = this.analyzeInventory(crop);
        const status = analysis.status;
        if (status === "unknown") continue;

        margins.push(marginConfidence(crop.quantity));
        if (status !== "surplus" && status !== "shortage") continue;

        console.info(`Inventory event detected: ${analysis.message}`);
        const farmer = crop.farmer_id !== null ? farmers.get(crop.farmer_id) : null;

        const context = {
          crop_id: crop.id,
          crop_name: crop.crop_name,
          quantity: crop.quantity,
          farmer_id: crop.farmer_id,
          farmer_name: farmer?.name ?? null,
          island: farmer?.island ?? null,
          event: status,
          message: analysis.message,
          logistics_status: (farmer?.capacity || 0) > 0 ? "available" : "constrained",
          harvest_date: crop.harvest_date,
        };
        events.push({ crop_id: crop.id, status });

        try {
          await runOnce(context);
        } catch (error) {
          console.error(`Orchestrator failed for crop ${crop.id}`, error);
        }
      } catch (error) {
        console.error(`Failed to analyze crop ${crop?.id}`, error);
      }
    }
    return { events, margins };
  }

  /**
   * Run one scan cycle; returns the number of events detected.
   *
   * Kept as the entry point for the periodic runner loop.
   */
  async runCheck(): Promise<number> {
    const scan = await this.run({ trigger: "periodic_scan" });
    return (scan.outputs.events as InventoryEvent[]).length;
  }
}
