"""Seed a small but realistic demo dataset for the operator walkthrough UI."""

from datetime import date, timedelta

from sqlalchemy.orm import Session

from app import models


def seed_demo_data(db: Session) -> bool:
    """Create demo records once when the database is still empty."""
    if db.query(models.Farmer).count() > 0 or db.query(models.Buyer).count() > 0:
        return False

    try:
        farmers = [
            models.Farmer(name="Marlon Joseph", island="Saint Lucia", crops="banana,mango", capacity=480),
            models.Farmer(name="Tanya Peters", island="Dominica", crops="tomato,pepper", capacity=320),
            models.Farmer(name="Andre Lewis", island="Trinidad", crops="yam,banana", capacity=410),
        ]
        db.add_all(farmers)
        db.flush()

        crops = [
            models.Crop(farmer_id=farmers[0].id, crop_name="banana", quantity=240, harvest_date=date.today() - timedelta(days=3)),
            models.Crop(farmer_id=farmers[0].id, crop_name="mango", quantity=160, harvest_date=date.today() - timedelta(days=8)),
            models.Crop(farmer_id=farmers[1].id, crop_name="tomato", quantity=180, harvest_date=date.today() - timedelta(days=2)),
            models.Crop(farmer_id=farmers[2].id, crop_name="yam", quantity=220, harvest_date=date.today() - timedelta(days=10)),
        ]
        db.add_all(crops)
        db.flush()

        buyers = [
            models.Buyer(name="Caribbean Fresh Market", island="Saint Lucia", buyer_type="retailer", contact_email="ops@caribbeanfresh.example"),
            models.Buyer(name="Island Grocers", island="Dominica", buyer_type="wholesaler", contact_email="replenishment@islandgrocers.example"),
            models.Buyer(name="National Food Board", island="Trinidad", buyer_type="government", contact_email="supply@foodboard.example"),
        ]
        db.add_all(buyers)
        db.flush()

        demands = [
            models.Demand(buyer_id=buyers[0].id, crop_name="banana", quantity=120, needed_by=date.today() + timedelta(days=2), status="open"),
            models.Demand(buyer_id=buyers[1].id, crop_name="tomato", quantity=90, needed_by=date.today() + timedelta(days=3), status="open"),
            models.Demand(buyer_id=buyers[2].id, crop_name="yam", quantity=70, needed_by=date.today() + timedelta(days=5), status="matched"),
        ]
        db.add_all(demands)
        db.flush()

        shipments = [
            models.Shipment(
                crop_id=crops[0].id,
                demand_id=demands[0].id,
                carrier="SeaSpray Logistics",
                origin_island="Saint Lucia",
                destination_island="Dominica",
                quantity=80,
                status="planned",
            ),
            models.Shipment(
                crop_id=crops[2].id,
                demand_id=demands[1].id,
                carrier="Blue Harbor Air",
                origin_island="Dominica",
                destination_island="Trinidad",
                quantity=60,
                status="in_transit",
            ),
        ]
        db.add_all(shipments)

        weather_events = [
            models.WeatherEvent(event_type="storm", severity="high", affected_islands="Dominica,Martinique", source="CIMH"),
            models.WeatherEvent(event_type="flood", severity="severe", affected_islands="Saint Lucia", source="NOAA"),
        ]
        db.add_all(weather_events)

        ports = [
            models.Port(name="Castries Wharf", island="Saint Lucia", port_type="sea", status="open"),
            models.Port(name="Roseau Terminal", island="Dominica", port_type="sea", status="congested"),
            models.Port(name="Piarco Air Cargo", island="Trinidad", port_type="air", status="open"),
        ]
        db.add_all(ports)

        db.commit()
        return True
    except Exception:
        db.rollback()
        raise
