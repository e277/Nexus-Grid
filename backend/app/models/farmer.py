from sqlalchemy import Column, Integer, String
from app.database import Base


class Farmer(Base):

    __tablename__="farmers"


    id = Column(Integer, primary_key=True)

    name = Column(String)

    island = Column(String)

    crops = Column(String)

    capacity = Column(Integer)