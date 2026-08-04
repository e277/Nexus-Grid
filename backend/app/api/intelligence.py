"""Explainable prediction endpoints (Phase 8)."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import crop_service, intelligence_service

router = APIRouter()


@router.get("/overview")
def overview(db: Session = Depends(get_db)):
    """Supply-chain health and regional food security aggregates."""
    return intelligence_service.supply_chain_overview(db)


@router.get("/demand-forecast/{crop_name}")
def demand_forecast(crop_name: str, db: Session = Depends(get_db)):
    return intelligence_service.forecast_demand(db, crop_name)


@router.get("/spoilage/{crop_id}")
def spoilage(crop_id: int, db: Session = Depends(get_db)):
    crop = crop_service.get_crop(db, crop_id=crop_id)
    if not crop:
        raise HTTPException(status_code=404, detail="Crop not found")
    return intelligence_service.predict_spoilage(db, crop)


@router.get("/transport-delay")
def transport_delay(origin_island: str, destination_island: str):
    return intelligence_service.predict_transport_delay(origin_island, destination_island)


@router.get("/shortage/{crop_name}")
def shortage(crop_name: str, db: Session = Depends(get_db)):
    return intelligence_service.predict_regional_shortage(db, crop_name)
