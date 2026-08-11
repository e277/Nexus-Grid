import { api, found, intParam } from "@/lib/server/http";
import { getDocument } from "@/lib/server/services/customs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api<{ id: string }>(({ params }) => {
  return found(
    getDocument(intParam(params.id, "document_id")),
    "Customs document not found"
  );
});
