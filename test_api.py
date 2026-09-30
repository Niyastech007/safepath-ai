"""
SafePath AI - Comprehensive API Integration & Validation Test Suite
Covers:
1. /api/health check
2. /api/city-data
3. /api/weather
4. /api/hazards
5. /api/safety-status
6. /api/police-hubs
7. /api/safe-havens
8. /api/routes (Valid Day, Evening, Night)
9. /api/routes validation: Identical start/destination (400)
10. /api/routes validation: Non-existent node (404)
11. /api/report-hazard: Valid insertion
12. /api/report-hazard validation: Missing coordinates (400)
13. /api/report-hazard validation: Out-of-bounds coordinates (400)
14. /api/sos: Nearest police & hospital dynamic payload
"""

from app import app

def test_api_comprehensive():
    print("\n=======================================================")
    print("    RUNNING SAFEPATH AI COMPREHENSIVE API TEST SUITE   ")
    print("=======================================================")

    client = app.test_client()

    # 1. Health check
    res = client.get('/api/health')
    assert res.status_code == 200
    d = res.get_json()
    assert d["status"] == "online"
    assert "weather" in d
    assert "database" in d
    print("[PASS] 1. GET /api/health returned 200 OK.")

    # 2. City data
    res = client.get('/api/city-data')
    assert res.status_code == 200
    d = res.get_json()
    assert d["success"] is True
    assert len(d["nodes"]) >= 20
    assert len(d["police_stations"]) >= 5
    assert len(d["presets"]) >= 5
    print("[PASS] 2. GET /api/city-data returned complete Trichy layer geometry.")

    # 3. Weather endpoint
    res = client.get('/api/weather')
    assert res.status_code == 200
    d = res.get_json()
    assert d["success"] is True
    assert "temperature_c" in d
    print(f"[PASS] 3. GET /api/weather returned: {d['condition']}, {d['temperature_c']}°C (Source: {d['source']}).")

    # 4. Hazards endpoint
    res = client.get('/api/hazards')
    assert res.status_code == 200
    d = res.get_json()
    assert d["success"] is True
    assert d["count"] >= 1
    print(f"[PASS] 4. GET /api/hazards returned {d['count']} active database pins.")

    # 5. Safety status dashboard endpoint
    res = client.get('/api/safety-status')
    assert res.status_code == 200
    d = res.get_json()
    assert d["success"] is True
    assert "data_confidence" in d
    print(f"[PASS] 5. GET /api/safety-status: Confidence {d['data_confidence']}, Hazards {d['active_hazards_count']}.")

    # 6. Police hubs & Safe Havens endpoints
    res_pol = client.get('/api/police-hubs')
    assert res_pol.status_code == 200 and len(res_pol.get_json()["police_stations"]) >= 5
    res_sh = client.get('/api/safe-havens')
    assert res_sh.status_code == 200 and len(res_sh.get_json()["safe_havens"]) >= 5
    print("[PASS] 6. GET /api/police-hubs & /api/safe-havens verified.")

    # 7. Routes endpoint: Night, Evening, Day
    for mode in ["night", "evening", "day"]:
        res = client.post('/api/routes', json={
            "start_node": "n_central_bs",
            "end_node": "n_thillai_nagar_main",
            "time_mode": mode
        })
        assert res.status_code == 200
        d = res.get_json()
        assert d["success"] is True
        assert "safest" in d["routes"]
        assert "fastest" in d["routes"]
        assert "why_not_fastest" in d["routes"]
    print("[PASS] 7. POST /api/routes verified across Night, Evening, and Day modes.")

    # 8. Routes validation: Identical start and end
    res = client.post('/api/routes', json={
        "start_node": "n_central_bs",
        "end_node": "n_central_bs",
        "time_mode": "night"
    })
    assert res.status_code == 400
    assert "identical" in res.get_json()["error"].lower()
    print("[PASS] 8. Validation: Identical origin/destination rejected with 400.")

    # 9. Routes validation: Non-existent node
    res = client.post('/api/routes', json={
        "start_node": "non_existent_node_xyz",
        "end_node": "n_thillai_nagar_main",
        "time_mode": "night"
    })
    assert res.status_code == 404
    print("[PASS] 9. Validation: Non-existent node rejected with 404.")

    # 10. Report Hazard: Valid insertion
    res = client.post('/api/report-hazard', json={
        "lat": 10.8200,
        "lng": 78.6920,
        "category": "Broken Streetlight",
        "description": "Flickering high-mast lamp near junction",
        "severity": 0.85
    })
    assert res.status_code == 200
    d = res.get_json()
    assert d["success"] is True
    assert "report" in d
    print(f"[PASS] 10. POST /api/report-hazard inserted successfully: ID {d['report']['id']}.")

    # 11. Report Hazard validation: Missing coordinates
    res = client.post('/api/report-hazard', json={
        "category": "Broken Streetlight"
    })
    assert res.status_code == 400
    print("[PASS] 11. Validation: Missing coordinates rejected with 400.")

    # 12. Report Hazard validation: Out-of-bounds coordinates (outside Trichy region)
    res = client.post('/api/report-hazard', json={
        "lat": 40.7128,  # New York City!
        "lng": -74.0060,
        "category": "Broken Streetlight"
    })
    assert res.status_code == 400
    assert "outside" in res.get_json()["error"].lower()
    print("[PASS] 12. Validation: Out-of-bounds coordinates rejected with 400.")

    # 13. Smart SOS trigger: Nearest police & hospital lookup
    res = client.post('/api/sos', json={
        "lat": 10.8190,
        "lng": 78.6840,
        "user_name": "Trichy Student"
    })
    assert res.status_code == 200
    d = res.get_json()
    assert d["success"] is True
    assert "nearest_police" in d and "phone" in d["nearest_police"]
    assert "nearest_safe_haven" in d and "phone" in d["nearest_safe_haven"]
    assert "sms_payload" in d
    assert "112" in d["sms_payload"] or "Police" in d["sms_payload"]
    # 14. Liquor Outlets endpoint
    res = client.get('/api/liquor-outlets')
    assert res.status_code == 200
    d = res.get_json()
    assert d["success"] is True
    assert d["count"] >= 10
    assert "situational awareness" in d["context_notice"].lower()
    print(f"[PASS] 14. GET /api/liquor-outlets returned {d['count']} verified outlets with contextual notice.")

    # 15. Comprehensive POI endpoint (/api/pois) with radius and type filters
    res = client.get('/api/pois?lat=10.8200&lng=78.6920&radius=2500&type=all')
    assert res.status_code == 200
    d = res.get_json()
    assert d["success"] is True
    assert len(d["pois"]) > 0
    assert "distance_m" in d["pois"][0]
    # Test type filter
    res_police = client.get('/api/pois?type=police')
    d_pol = res_police.get_json()
    assert all(p["type"] == "police_station" for p in d_pol["pois"])
    res_liquor = client.get('/api/pois?type=liquor')
    d_liq = res_liquor.get_json()
    assert all(p["type"] == "liquor_retail" for p in d_liq["pois"])
    print(f"[PASS] 15. GET /api/pois verified with radius ({len(d['pois'])} POIs) and type filters (Police={len(d_pol['pois'])}, Liquor={len(d_liq['pois'])}).")

    # 16. Nearby Support endpoint (/api/nearby-support)
    res = client.get('/api/nearby-support?lat=10.7965&lng=78.6865') # Central Bus Stand
    assert res.status_code == 200
    d = res.get_json()
    assert d["success"] is True
    assert d["support"]["police"] is not None
    assert d["support"]["safe_haven"] is not None
    assert d["support"]["liquor_outlet"] is not None
    print(f"[PASS] 16. GET /api/nearby-support verified: Nearest Police ({d['support']['police']['station']['name']}), Safe Haven ({d['support']['safe_haven']['safe_haven']['name']}), Liquor ({d['support']['liquor_outlet']['outlet']['name']}).")

    print("\n>>> ALL 16 API INTEGRATION TESTS PASSED WITH 100% SUCCESS! <<<\n")

if __name__ == "__main__":
    test_api_comprehensive()

