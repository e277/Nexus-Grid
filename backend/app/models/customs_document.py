from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func

from app.database import Base


class CustomsDocument(Base):
    """An export/import document attached to a shipment."""

    __tablename__ = "customs_documents"

    id = Column(Integer, primary_key=True)
    shipment_id = Column(Integer, ForeignKey("shipments.id"), nullable=False)
    # invoice | certificate_of_origin | phytosanitary | export_license
    document_type = Column(String, nullable=False)
    status = Column(String, default="draft")  # draft | submitted | approved | rejected
    reference_number = Column(String)
    submitted_at = Column(DateTime(timezone=True))
    decided_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
