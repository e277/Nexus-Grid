/**
 * Business logic for customs documents.
 *
 * Approval publishes `customs.approved` so logistics can proceed with
 * pre-cleared shipments.
 */

import { publish } from "../events";
import type { CustomsDocument, CustomsDocumentType, CustomsStatus } from "../models";
import { customsDocuments, shipments, updateDocumentStatus } from "../repositories";
import { utcnowIso } from "../time";
import { ConflictError, NotFoundError } from "./errors";

export interface CustomsDocumentInput {
  shipment_id: number;
  document_type: CustomsDocumentType;
  reference_number: string | null;
}

const ALLOWED_TRANSITIONS: Record<CustomsStatus, CustomsStatus[]> = {
  draft: ["submitted"],
  submitted: ["approved", "rejected"],
  approved: [],
  rejected: ["submitted"], // resubmission
};

export function listDocuments(options: {
  skip?: number;
  limit?: number;
  shipment_id?: number | null;
  status?: CustomsStatus | null;
}): CustomsDocument[] {
  return customsDocuments.list(options);
}

export function getDocument(documentId: number): CustomsDocument | null {
  return customsDocuments.get(documentId);
}

export function createDocument(input: CustomsDocumentInput): CustomsDocument {
  if (shipments.get(input.shipment_id) === null) {
    throw new NotFoundError(`Shipment ${input.shipment_id} does not exist`);
  }
  return customsDocuments.create({
    ...input,
    status: "draft",
    submitted_at: null,
    decided_at: null,
    created_at: utcnowIso(),
  });
}

export async function updateStatus(
  document: CustomsDocument,
  newStatus: CustomsStatus
): Promise<CustomsDocument> {
  if (!ALLOWED_TRANSITIONS[document.status].includes(newStatus)) {
    throw new ConflictError(
      `Cannot move document ${document.id} from ${document.status} to ${newStatus}`
    );
  }

  const updated = updateDocumentStatus(document, newStatus);

  if (newStatus === "approved") {
    await publish("customs.approved", {
      document_id: updated.id,
      shipment_id: updated.shipment_id,
      document_type: updated.document_type,
    });
  }
  return updated;
}
