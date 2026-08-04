from sqlalchemy import Column, Integer, String

from app.database import Base


class Buyer(Base):
    """A commercial buyer of produce: retailer, wholesaler, or government."""

    __tablename__ = "buyers"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    island = Column(String)
    buyer_type = Column(String, default="retailer")
    contact_email = Column(String)
