import { api, found, intParam, jsonBody } from "@/lib/server/http";
import type { CustomsStatus } from "@/lib/server/models";
import { getDocument, updateStatus } from "@/lib/server/services/customs";
import { requiredEnum } from "@/lib/server/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES: CustomsStatus[] = ["draft", "submitted", "approved", "rejected"];

export const PATCH = api<{ id: string }>(async ({ request, params }) => {

  const document = found(
    getDocument(intParam(params.id, "document_id")),
    "Customs document not found"
  );
  const body = await jsonBody(request);
  return updateStatus(document, requiredEnum(body, "status", STATUSES));
});
