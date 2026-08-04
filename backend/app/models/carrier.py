from sqlalchemy import Boolean, Column, Integer, String

from app.database import Base


class Carrier(Base):
    """A transport provider moving goods between islands."""

    __tablename__ = "carriers"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    mode = Column(String, default="sea")  # sea | air | land
    capacity = Column(Integer)
    home_island = Column(String)
    contact_email = Column(String)
    active = Column(Boolean, default=True)
