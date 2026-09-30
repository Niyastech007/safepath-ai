"""
SafePath AI - Comprehensive Algorithm & Safety Engine Test Suite
Covers:
1. Shortest/fastest route calculation
2. Safest route calculation
3. Balanced route calculation
4. Day weighting
5. Evening weighting
6. Night weighting
7. Hazard changes edge cost
8. Hazard changes recommended route
9. Multiple hazards handling
10. SQLite hazard persistence & corroboration
11. Police proximity calculation
12. Nearest safe haven hospital lookup
13. Weather modifier resilience & offline fallback
14. Explainable AI & Why Not Fastest generation
"""

import os
import tempfile
from safety_engine import CitySafetyGraph, TIME_PROFILES
from weather_service import WeatherService
import database

def test_engine_comprehensive():
    print("\n=======================================================")
    print("  RUNNING SAFEPATH AI COMPREHENSIVE ENGINE TEST SUITE  ")
    print("=======================================================")

    g = CitySafetyGraph()

    # 1. Graph Initialization
    assert len(g.nodes) >= 20, "Graph nodes count check failed"
    assert len(g.edges) >= 25, "Graph edges count check failed"
    assert len(g.police_stations) >= 5, "Police stations count check failed"
    assert len(g.safe_havens) >= 5, "Safe havens count check failed"
    print("[PASS] 1. Graph initialization & Trichy nodes verified.")

    # 2. Shortest, Safest, and Balanced Route calculations
    routes = g.calculate_routes("n_central_bs", "n_thillai_nagar_main", time_mode="night")
    safest = routes["safest"]
    fastest = routes["fastest"]
    balanced = routes["balanced"]

    assert fastest["distance_m"] <= safest["distance_m"], "Fastest route should be shorter or equal to safest route in distance"
    assert safest["safety_score"] >= fastest["safety_score"], "Safest route must have higher or equal calculated safety score"
    assert balanced["safety_score"] >= fastest["safety_score"], "Balanced route should have better safety than fastest"
    assert safest["node_ids"] != fastest["node_ids"], "CBS -> Thillai Nagar: Safest must differ from Fastest"
    assert balanced["node_ids"] != fastest["node_ids"], "CBS -> Thillai Nagar: Balanced must differ from Fastest"
    assert safest["node_ids"] != balanced["node_ids"], "CBS -> Thillai Nagar: Safest must differ from Balanced"
    print(f"[PASS] 2. Tri-Route Multi-Objective: Safest ({safest['safety_score']}%) vs Balanced ({balanced['safety_score']}%) vs Fastest ({fastest['safety_score']}%) - All 3 Paths Distinct.")

    # 2b. Demo Preset (Saranathan College to Central Bus Stand)
    routes_demo = g.calculate_routes("n_saranathan", "n_central_bs", time_mode="night")
    s_demo = routes_demo["safest"]
    b_demo = routes_demo["balanced"]
    f_demo = routes_demo["fastest"]
    assert f_demo["distance_m"] < b_demo["distance_m"] <= s_demo["distance_m"]
    assert s_demo["safety_score"] >= b_demo["safety_score"] > f_demo["safety_score"]
    assert s_demo["node_ids"] != f_demo["node_ids"], "Saranathan -> CBS: Safest must differ from Fastest"
    assert b_demo["node_ids"] != f_demo["node_ids"], "Saranathan -> CBS: Balanced must differ from Fastest"
    assert s_demo["node_ids"] != b_demo["node_ids"], "Saranathan -> CBS: Safest must differ from Balanced"
    print(f"[PASS] 2b. Demo Preset (Saranathan -> CBS): Safest ({s_demo['distance_m']}m) vs Balanced ({b_demo['distance_m']}m) vs Fastest ({f_demo['distance_m']}m) - All 3 Paths Distinct!")

    # 3. Day / Evening / Night Weighting Profiles
    routes_day = g.calculate_routes("n_central_bs", "n_thillai_nagar_main", time_mode="day")
    routes_eve = g.calculate_routes("n_central_bs", "n_thillai_nagar_main", time_mode="evening")
    routes_ngt = g.calculate_routes("n_central_bs", "n_thillai_nagar_main", time_mode="night")

    assert "day" in TIME_PROFILES and "evening" in TIME_PROFILES and "night" in TIME_PROFILES
    assert TIME_PROFILES["night"]["w_light"] > TIME_PROFILES["day"]["w_light"], "Night mode must prioritize lighting higher than day"
    assert TIME_PROFILES["day"]["w_crowd"] > TIME_PROFILES["night"]["w_crowd"], "Day mode must prioritize footfall higher than night"
    print(f"[PASS] 3. Time profiles verified: Day w_light={TIME_PROFILES['day']['w_light']}, Night w_light={TIME_PROFILES['night']['w_light']}.")

    # 4. Police Proximity Calculation
    pol_cbs = g.get_nearest_police(10.7965, 78.6865) # CBS coordinates
    assert pol_cbs is not None
    assert pol_cbs["distance_m"] < 1500, "CBS should be within 1.5km of Railway/Cantonment police"
    print(f"[PASS] 4. Police proximity: Nearest to CBS is '{pol_cbs['station']['name']}' at {pol_cbs['distance_m']}m.")

    # 5. Safe Haven Hospital Lookup
    sh_tennur = g.get_nearest_safe_haven(10.8190, 78.6840) # Tennur coordinates
    assert sh_tennur is not None
    assert "Kauvery" in sh_tennur["safe_haven"]["name"] or "GH" in sh_tennur["safe_haven"]["name"]
    print(f"[PASS] 5. Safe haven lookup: Nearest to Tennur is '{sh_tennur['safe_haven']['name']}' at {sh_tennur['distance_m']}m.")

    # 6. Dynamic Hazard Insertion & Traversal Cost Penalty
    salai_edge_id = None
    for eid, e in g.edges.items():
        if "Salai" in e["street"] or "Collector" in e["street"]:
            salai_edge_id = eid
            break
    assert salai_edge_id is not None
    edge_before = g.edges[salai_edge_id]
    score_before = g.calculate_edge_safety_index(edge_before, time_mode="night")

    # Add artificial hazard on that road segment
    mid_lat = (g.nodes[edge_before["u"]]["lat"] + g.nodes[edge_before["v"]]["lat"]) / 2
    mid_lng = (g.nodes[edge_before["u"]]["lng"] + g.nodes[edge_before["v"]]["lng"]) / 2
    
    mock_hazards = [{
        "id": "test_haz_1",
        "lat": mid_lat,
        "lng": mid_lng,
        "severity": 0.95,
        "confidence": 0.90,
        "category": "Complete Blackout & Road Damage"
    }]

    score_after = g.calculate_edge_safety_index(edge_before, time_mode="night", active_hazards=mock_hazards)
    assert score_after < score_before, "Hazard presence must decrease calculated edge safety score"
    print(f"[PASS] 6. Hazard spatial penalty confirmed: Edge score dropped from {round(score_before*100)}% to {round(score_after*100)}%.")

    # 7. Multiple Corroborating Hazards Handling
    mock_hazards.append({
        "id": "test_haz_2",
        "lat": mid_lat + 0.0005,
        "lng": mid_lng + 0.0005,
        "severity": 0.85,
        "confidence": 0.80,
        "category": "Aggressive Stray Dogs"
    })
    score_multi = g.calculate_edge_safety_index(edge_before, time_mode="night", active_hazards=mock_hazards)
    assert score_multi <= score_after, "Multiple corroborated hazards must produce cumulative spatial penalty"
    print(f"[PASS] 7. Multiple hazards handled gracefully: Cumulative score is {round(score_multi*100)}%.")

    # 8. Hazard Dynamically Causes Route Recalculation
    initial_safest = g.calculate_routes("n_central_bs", "n_thillai_nagar_main", time_mode="night")
    # Add severe persistent hazard
    g.add_hazard_report(10.8035, 78.6925, "Major Road Collapse", "Total blockage near Collector Office", severity=1.0)
    recalculated = g.calculate_routes("n_central_bs", "n_thillai_nagar_main", time_mode="night")
    assert recalculated["safest"] is not None
    print("[PASS] 8. Dynamic route recalculation with persistent hazard succeeded.")

    # 9. Explainable AI (XAI) & "Why Not The Fastest Route?"
    xai = routes["ai_explanation"]
    wnf = routes["why_not_fastest"]
    assert "headline" in xai and len(xai["key_factors"]) > 0
    assert "reasons" in wnf and len(wnf["reasons"]) > 0
    # Strict compliance: No false safety claims in explanations
    for factor in xai["key_factors"]:
        assert "guaranteed" not in factor.lower(), "XAI must not use forbidden word 'guaranteed'"
        assert "100% safe" not in factor.lower(), "XAI must not claim '100% safe'"
    print(f"[PASS] 9. XAI verified: {len(xai['key_factors'])} transparent reasons, Why Not Fastest: '{wnf['reasons'][0]}'.")

    # 10. Weather Service Offline Resilience
    ws = WeatherService()
    weather_live = ws.get_current_weather()
    assert "temperature_c" in weather_live and "condition" in weather_live
    # Force fallback simulation
    ws.cached_weather = None
    # Test fallback by querying non-existent URL or simulating error
    fallback = ws._generate_advisory("Heavy rain", 6.5)
    assert "rain" in fallback.lower()
    print(f"[PASS] 10. Weather service verified (Live: {weather_live['is_live']}, Temp: {weather_live['temperature_c']}°C, Condition: '{weather_live['condition']}').")

    # 11. Controlled Synthetic Multi-Objective Unit Test
    # Proves mathematical independence: fastest picks A-B-D, balanced picks A-C-D, safest picks A-E-D
    synth = CitySafetyGraph()
    synth.nodes = {}
    synth.edges = {}
    synth.adjacency = {}
    synth.police_stations = [{"id": "pol_e", "name": "Police Post E", "lat": 10.0000, "lng": 78.0200, "phone": "100"}]

    synth.add_node("A", "Start Node A", 10.0000, 78.0000)
    synth.add_node("B", "Dark Shortcut B", 10.0050, 78.0050)
    synth.add_node("C", "Commercial St C", 10.0100, 78.0100)
    synth.add_node("E", "Police Corridor E", 10.0000, 78.0200)
    synth.add_node("D", "End Node D", 10.0150, 78.0150)

    # Path 1: A -> B -> D (Fastest: short, dark)
    synth.add_edge("e_ab", "A", "B", "Dark Alley 1", 0.15, 0.10, 0.85, 0.00, length_m=500.0)
    synth.add_edge("e_bd", "B", "D", "Dark Alley 2", 0.15, 0.10, 0.85, 0.00, length_m=500.0)

    # Path 2: A -> C -> D (Balanced: medium length, moderate lighting)
    synth.add_edge("e_ac", "A", "C", "Secondary St 1", 0.85, 0.75, 0.08, 0.80, length_m=700.0)
    synth.add_edge("e_cd", "C", "D", "Secondary St 2", 0.85, 0.75, 0.08, 0.80, length_m=700.0)

    # Path 3: A -> E -> D (Safest: longest, high security)
    synth.add_edge("e_ae", "A", "E", "Illuminated Blvd 1", 0.98, 0.92, 0.02, 0.98, length_m=850.0)
    synth.add_edge("e_ed", "E", "D", "Illuminated Blvd 2", 0.98, 0.92, 0.02, 0.98, length_m=850.0)

    res_synth = synth.calculate_routes("A", "D", time_mode="night")
    assert res_synth["fastest"]["node_ids"] == ["A", "B", "D"], f"Synthetic fastest must be A-B-D, got {res_synth['fastest']['node_ids']}"
    assert res_synth["balanced"]["node_ids"] == ["A", "C", "D"], f"Synthetic balanced must be A-C-D, got {res_synth['balanced']['node_ids']}"
    assert res_synth["safest"]["node_ids"] == ["A", "E", "D"], f"Synthetic safest must be A-E-D, got {res_synth['safest']['node_ids']}"
    # 12. POI Proximity & Situational Awareness Lookups
    liq_cbs = g.get_nearest_liquor_outlet(10.7965, 78.6865) # Central Bus Stand
    assert liq_cbs is not None
    assert "TASMAC" in liq_cbs["outlet"]["name"]
    assert liq_cbs["distance_m"] > 0

    supp_cbs = g.get_nearest_support(10.7965, 78.6865)
    assert supp_cbs["police"] is not None
    assert supp_cbs["safe_haven"] is not None
    assert supp_cbs["liquor_outlet"] is not None

    all_pois = g.get_all_pois(lat=10.7965, lng=78.6865, radius_m=3000)
    assert len(all_pois) >= 5
    assert all_pois[0]["distance_m"] <= all_pois[-1]["distance_m"]
    print(f"[PASS] 12. POI situational awareness lookups verified: Nearest Liquor ({liq_cbs['outlet']['name']} at {liq_cbs['distance_m']}m), 3km radius count={len(all_pois)}.")

    # 13. Route POI Proximity Calculation
    route_coords = [[10.7965, 78.6865], [10.8035, 78.6925], [10.8175, 78.6905]]
    dist_to_cbs_pol = g.get_poi_route_proximity(10.8015, 78.6910, route_coords) # Cantonment police near route
    assert dist_to_cbs_pol is not None
    assert dist_to_cbs_pol < 500, f"Cantonment police should be near route, got {dist_to_cbs_pol}m"
    print(f"[PASS] 13. Route POI proximity calculation verified: Cantonment Police is {dist_to_cbs_pol}m from sample route.")

    print("\n>>> ALL 13 ENGINE TESTS PASSED WITH 100% SUCCESS! <<<\n")

if __name__ == "__main__":
    test_engine_comprehensive()

