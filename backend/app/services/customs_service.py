"""Business logic for customs documents.

Approval publishes ``customs.approved`` so logistics can proceed with
pre-cleared shipments.
"""

from sqlalchemy.orm import Session

from app import models, schemas
from app.events import event_bus
from app.repositories import customs_documents as customs_repo
from app.repositories import shipments as shipment_repo


class ShipmentNotFoundError(Exception):
    """Raised when a document references a shipment that does not exist."""


class InvalidDocumentTransitionError(Exception):
    """Raised when a document status change is not allowed."""


_ALLOWED_TRANSITIONS: dict[str, set[schemas.CustomsDocumentStatus]] = {
    "draft": {schemas.CustomsDocumentStatus.submitted},
    "submitted": {
        schemas.CustomsDocumentStatus.approved,
        schemas.CustomsDocumentStatus.rejected,
    },
    "approved": set(),
    "rejected": {schemas.CustomsDocumentStatus.submitted},  # resubmission
}


def list_documents(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    shipment_id: int | None = None,
    status: str | None = None,
) -> list[models.CustomsDocument]:
    return customs_repo.get_customs_documents(
        db, skip=skip, limit=limit, shipment_id=shipment_id, status=status
    )


def get_document(db: Session, document_id: int) -> models.CustomsDocument | None:
    return customs_repo.get_customs_document(db, document_id)


def create_document(
    db: Session, document: schemas.CustomsDocumentCreate
) -> models.CustomsDocument:
    if shipment_repo.get_shipment(db, document.shipment_id) is None:
        raise ShipmentNotFoundError(f"Shipment {document.shipment_id} does not exist")
    return customs_repo.create_customs_document(db, document)


def update_status(
    db: Session,
    document: models.CustomsDocument,
    new_status: schemas.CustomsDocumentStatus,
) -> models.CustomsDocument:
    allowed = _ALLOWED_TRANSITIONS.get(document.status, set())
    if new_status not in allowed:
        raise InvalidDocumentTransitionError(
            f"Cannot move document {document.id} from {document.status} to {new_status.value}"
        )

    updated = customs_repo.update_document_status(db, document, new_status.value)

    if new_status == schemas.CustomsDocumentStatus.approved:
        event_bus.publish(
            "customs.approved",
            {
                "document_id": updated.id,
                "shipment_id": updated.shipment_id,
                "document_type": updated.document_type,
            },
        )
    return updated
