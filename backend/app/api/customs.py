from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import schemas
from app.core.security import require_role
from app.database import get_db
from app.services import customs_service
from app.services.customs_service import (
    InvalidDocumentTransitionError,
    ShipmentNotFoundError,
)

router = APIRouter()


@router.get("/", response_model=list[schemas.CustomsDocument])
def list_documents(
    skip: int = 0,
    limit: int = 100,
    shipment_id: Optional[int] = None,
    status: Optional[schemas.CustomsDocumentStatus] = None,
    db: Session = Depends(get_db),
):
    return customs_service.list_documents(
        db,
        skip=skip,
        limit=limit,
        shipment_id=shipment_id,
        status=status.value if status else None,
    )


@router.post(
    "/",
    response_model=schemas.CustomsDocument,
    status_code=201,
    dependencies=[Depends(require_role("logistics"))],
)
def create_document(document: schemas.CustomsDocumentCreate, db: Session = Depends(get_db)):
    try:
        return customs_service.create_document(db, document)
    except ShipmentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/{document_id}", response_model=schemas.CustomsDocument)
def get_document(document_id: int, db: Session = Depends(get_db)):
    db_document = customs_service.get_document(db, document_id)
    if not db_document:
        raise HTTPException(status_code=404, detail="Customs document not found")
    return db_document


@router.patch(
    "/{document_id}/status",
    response_model=schemas.CustomsDocument,
    dependencies=[Depends(require_role("government"))],
)
def update_document_status(
    document_id: int,
    update: schemas.CustomsDocumentStatusUpdate,
    db: Session = Depends(get_db),
):
    db_document = customs_service.get_document(db, document_id)
    if not db_document:
        raise HTTPException(status_code=404, detail="Customs document not found")
    try:
        return customs_service.update_status(db, db_document, update.status)
    except InvalidDocumentTransitionError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
