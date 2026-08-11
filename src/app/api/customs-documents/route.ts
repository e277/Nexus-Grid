import { api, enumQuery, jsonBody, pagination } from "@/lib/server/http";
import type { CustomsDocumentType, CustomsStatus } from "@/lib/server/models";
import { createDocument, listDocuments } from "@/lib/server/services/customs";
import { optionalString, requiredEnum, requiredInt } from "@/lib/server/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOCUMENT_TYPES: CustomsDocumentType[] = [
  "invoice",
  "certificate_of_origin",
  "phytosanitary",
  "export_license",
];
const STATUSES: CustomsStatus[] = ["draft", "submitted", "approved", "rejected"];

export const GET = api(({ query }) => {
  const shipmentId = query.get("shipment_id");
  return listDocuments({
    ...pagination(query),
    shipment_id: shipmentId === null ? null : Number.parseInt(shipmentId, 10),
    status: enumQuery(query, "status", STATUSES),
  });
});

export const POST = api(
  async ({ request }) => {
    const body = await jsonBody(request);
    return createDocument({
      shipment_id: requiredInt(body, "shipment_id"),
      document_type: requiredEnum(body, "document_type", DOCUMENT_TYPES),
      reference_number: optionalString(body, "reference_number"),
    });
  },
  { status: 201 }
);
