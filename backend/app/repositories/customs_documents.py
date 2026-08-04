from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app import models, schemas
from app.repositories.base import SQLAlchemyRepository

_repo = SQLAlchemyRepository(models.CustomsDocument)


def get_customs_document(db: Session, document_id: int):
    return _repo.get(db, document_id)


def get_customs_documents(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    shipment_id: int | None = None,
    status: str | None = None,
):
    return _repo.list(db, skip=skip, limit=limit, shipment_id=shipment_id, status=status)


def create_customs_document(db: Session, document: schemas.CustomsDocumentCreate):
    return _repo.create(
        db, {**document.model_dump(), "document_type": document.document_type.value}
    )


def update_document_status(db: Session, document: models.CustomsDocument, status: str):
    now = datetime.now(timezone.utc)
    document.status = status
    if status == "submitted":
        document.submitted_at = now
    elif status in {"approved", "rejected"}:
        document.decided_at = now
    db.commit()
    db.refresh(document)
    return document
