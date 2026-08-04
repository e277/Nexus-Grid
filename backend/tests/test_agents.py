from app.agents.supply_agent import SupplyAgent
from app.models.crop import Crop


def test_analyze_inventory():
    agent = SupplyAgent()
    low = Crop(id=1, farmer_id=1, crop_name="Tomato", quantity=50, harvest_date=None)
    normal = Crop(id=2, farmer_id=1, crop_name="Yam", quantity=500, harvest_date=None)
    high = Crop(id=3, farmer_id=1, crop_name="Banana", quantity=2000, harvest_date=None)
    missing = Crop(id=4, farmer_id=1, crop_name="Pepper", quantity=None, harvest_date=None)

    assert agent.analyze_inventory(low)["status"] == "shortage"
    assert agent.analyze_inventory(normal)["status"] == "normal"
    assert agent.analyze_inventory(high)["status"] == "surplus"
    assert agent.analyze_inventory(missing)["status"] == "unknown"
