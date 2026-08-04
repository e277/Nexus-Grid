from sqlalchemy import Column,Integer,String,Date
from app.database import Base


class Crop(Base):

    __tablename__="crops"


    id = Column(Integer,primary_key=True)

    farmer_id = Column(Integer)

    crop_name = Column(String)

    quantity = Column(Integer)

    harvest_date = Column(Date)