from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict


class CustomsDocumentType(str, Enum):
    invoice = "invoice"
    certificate_of_origin = "certificate_of_origin"
    phytosanitary = "phytosanitary"
    export_license = "export_license"


class CustomsDocumentStatus(str, Enum):
    draft = "draft"
    submitted = "submitted"
    approved = "approved"
    rejected = "rejected"


class CustomsDocumentBase(BaseModel):
    shipment_id: int
    document_type: CustomsDocumentType
    reference_number: Optional[str] = None


class CustomsDocumentCreate(CustomsDocumentBase):
    pass


class CustomsDocumentStatusUpdate(BaseModel):
    status: CustomsDocumentStatus


class CustomsDocument(CustomsDocumentBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: CustomsDocumentStatus = CustomsDocumentStatus.draft
    submitted_at: Optional[datetime] = None
    decided_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
