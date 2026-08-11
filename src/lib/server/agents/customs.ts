/**
 * Customs Agent.
 *
 * Generates the standard export document set for a shipment as drafts and
 * submits them for processing, so goods are pre-cleared before arrival.
 */

import type { CustomsDocumentType } from "../models";
import { createDocument, listDocuments, updateStatus } from "../services/customs";
import { BaseAgent, result, type AgentPayload, type AgentResult } from "./base";

/** Standard export set for perishable produce. */
const REQUIRED_DOCUMENTS: CustomsDocumentType[] = [
  "invoice",
  "certificate_of_origin",
  "phytosanitary",
];

export class CustomsAgent extends BaseAgent {
  readonly name = "customs";

  protected async handle(payload: AgentPayload): Promise<AgentResult> {
    const shipmentId = payload.shipment_id as number | undefined;
    if (!shipmentId) {
      return result(
        this.name,
        "skip",
        0.9,
        "No shipment_id in payload; nothing to file"
      );
    }

    const existing = new Set(
      listDocuments({ shipment_id: shipmentId }).map((doc) => doc.document_type)
    );
    const created: { document_id: number; type: CustomsDocumentType }[] = [];

    for (const documentType of REQUIRED_DOCUMENTS) {
      if (existing.has(documentType)) continue;
      const document = createDocument({
        shipment_id: shipmentId,
        document_type: documentType,
        reference_number: null,
      });
      await updateStatus(document, "submitted");
      created.push({ document_id: document.id, type: documentType });
    }

    return result(
      this.name,
      created.length ? "file_documents" : "documents_complete",
      0.85,
      created.length
        ? `Filed ${created.length} document(s) for shipment ${shipmentId}`
        : `All required documents already exist for shipment ${shipmentId}`,
      { shipment_id: shipmentId, created }
    );
  }
}
