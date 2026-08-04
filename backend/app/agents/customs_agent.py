"""Customs Agent.

Generates the standard export document set for a shipment as drafts and
submits them for processing, so goods are pre-cleared before arrival.
"""

from typing import Any

from sqlalchemy.orm import Session

from app import schemas
from app.agents.base import AgentResult, BaseAgent
from app.services import customs_service

# Standard export set for perishable produce
REQUIRED_DOCUMENTS = [
    schemas.CustomsDocumentType.invoice,
    schemas.CustomsDocumentType.certificate_of_origin,
    schemas.CustomsDocumentType.phytosanitary,
]


class CustomsAgent(BaseAgent):
    name = "customs"

    def handle(self, db: Session, payload: dict[str, Any]) -> AgentResult:
        shipment_id = payload.get("shipment_id")
        if not shipment_id:
            return AgentResult(
                agent=self.name,
                action="skip",
                confidence=0.9,
                rationale="No shipment_id in payload; nothing to file",
            )

        existing = {
            doc.document_type
            for doc in customs_service.list_documents(db, shipment_id=shipment_id)
        }
        created = []
        for doc_type in REQUIRED_DOCUMENTS:
            if doc_type.value in existing:
                continue
            document = customs_service.create_document(
                db,
                schemas.CustomsDocumentCreate(
                    shipment_id=shipment_id, document_type=doc_type
                ),
            )
            document = customs_service.update_status(
                db, document, schemas.CustomsDocumentStatus.submitted
            )
            created.append({"document_id": document.id, "type": doc_type.value})

        return AgentResult(
            agent=self.name,
            action="file_documents" if created else "documents_complete",
            confidence=0.85,
            rationale=(
                f"Filed {len(created)} document(s) for shipment {shipment_id}"
                if created
                else f"All required documents already exist for shipment {shipment_id}"
            ),
            outputs={"shipment_id": shipment_id, "created": created},
        )
