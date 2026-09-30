"""
SafePath AI - Direct Road & Detour Sanity Regression Test Suite
Validates:
1. Direct road available
2. Direct road slightly less safe
3. Direct road extremely unsafe
4. Longer safe alternative
5. No direct road available
6. One-way road
7. Junction
8. Roundabout
9. Hazard on direct road
10. Direct road after hazard removal
"""

import sys
from safety_engine import CitySafetyGraph

def run_direct_routing_tests():
    print("\n=======================================================")
    print("   RUNNING SAFEPATH AI DIRECT ROUTING TEST SUITE       ")
    print("=======================================================")

    g = CitySafetyGraph()

    # -----------------------------------------------------------------
    # Test 1: Direct Road Available
    # When a direct road exists between two nodes and is safe,
    # the algorithm MUST select it without intermediate zig-zags.
    # -----------------------------------------------------------------
    r1 = g.calculate_routes("n_gandhi_market", "n_east_boulevard", time_mode="night")
    assert r1["safest"]["node_ids"] == ["n_gandhi_market", "n_east_boulevard"], (
        f"Expected direct path ['n_gandhi_market', 'n_east_boulevard'], got {r1['safest']['node_ids']}"
    )
    assert r1["fastest"]["node_ids"] == ["n_gandhi_market", "n_east_boulevard"], (
        f"Expected direct path ['n_gandhi_market', 'n_east_boulevard'], got {r1['fastest']['node_ids']}"
    )
    assert r1["safest"]["distance_m"] <= 650, f"Distance should be ~615m, got {r1['safest']['distance_m']}"

    r1_pal = g.calculate_routes("n_gandhi_market", "n_palpannai_junction", time_mode="night")
    assert r1_pal["safest"]["node_ids"] == ["n_gandhi_market", "n_palpannai_junction"]
    print("[PASS] 1. Direct road available: Direct edges selected without intermediate zig-zags.")

    # -----------------------------------------------------------------
    # Test 2: Direct Road Slightly Less Safe (Detour Sanity Check)
    # Direct road: 4.0 km, Safety 0.85
    # Detour: 7.0 km, Safety 0.86
    # A huge detour (+75%) MUST NOT be selected for an insignificant (+1%) gain.
    # -----------------------------------------------------------------
    g_test2 = CitySafetyGraph()
    g_test2.nodes.clear()
    g_test2.edges.clear()
    g_test2.adjacency.clear()

    g_test2.add_node("n_test_start", "Start Point", 10.8000, 78.7000)
    g_test2.add_node("n_test_end", "End Point", 10.8360, 78.7000)
    g_test2.add_node("n_test_detour", "Detour Waypoint", 10.8180, 78.7300)

    # Direct edge: 4000m, safety 0.85
    g_test2.add_edge("e_direct", "n_test_start", "n_test_end", "Direct Avenue",
                     lighting=0.88, crowd=0.85, crime=0.08, cctv=0.85, length_m=4000.0)
    # Detour edge 1: 3500m, safety 0.88
    g_test2.add_edge("e_detour_1", "n_test_start", "n_test_detour", "Detour Leg 1",
                     lighting=0.92, crowd=0.88, crime=0.04, cctv=0.90, length_m=3500.0)
    # Detour edge 2: 3500m, safety 0.88
    g_test2.add_edge("e_detour_2", "n_test_detour", "n_test_end", "Detour Leg 2",
                     lighting=0.92, crowd=0.88, crime=0.04, cctv=0.90, length_m=3500.0)

    r2 = g_test2.calculate_routes("n_test_start", "n_test_end", time_mode="night", active_hazards=[])
    # The direct road should be selected or chosen by candidate review rather than the 7km detour
    assert r2["safest"]["node_ids"] == ["n_test_start", "n_test_end"], (
        f"Safest route should not take a 7km detour for +1% safety gain! Got {r2['safest']['node_ids']}"
    )
    assert r2["safest"]["distance_m"] == 4000
    print("[PASS] 2. Direct road slightly less safe: Detour sanity check prevented 7km detour for +1% safety gain.")

    # -----------------------------------------------------------------
    # Test 3: Direct Road Extremely Unsafe (Safe Detour Justified)
    # Direct road is pitch-black (15% safety, dark canal).
    # Safe detour has high illumination (88% safety, +73% gain).
    # -----------------------------------------------------------------
    g_test3 = CitySafetyGraph()
    g_test3.nodes.clear()
    g_test3.edges.clear()
    g_test3.adjacency.clear()

    g_test3.add_node("n_a", "Point A", 10.8000, 78.7000)
    g_test3.add_node("n_b", "Point B", 10.8100, 78.7000)
    g_test3.add_node("n_safe_via", "Safe Well-lit Bypass", 10.8050, 78.7080)

    # Direct edge: 1100m, extremely unsafe (unlit, high crime)
    g_test3.add_edge("e_dark_direct", "n_a", "n_b", "Dark Slum Culvert",
                     lighting=0.10, crowd=0.05, crime=0.90, cctv=0.00, length_m=1100.0)
    # Detour edges: 1800m total, brightly lit
    g_test3.add_edge("e_safe_1", "n_a", "n_safe_via", "Safe Boulevard Part 1",
                     lighting=0.95, crowd=0.90, crime=0.03, cctv=0.95, length_m=900.0)
    g_test3.add_edge("e_safe_2", "n_safe_via", "n_b", "Safe Boulevard Part 2",
                     lighting=0.95, crowd=0.90, crime=0.03, cctv=0.95, length_m=900.0)

    r3 = g_test3.calculate_routes("n_a", "n_b", time_mode="night", active_hazards=[])
    assert r3["fastest"]["node_ids"] == ["n_a", "n_b"], "Fastest must take direct shortest path"
    assert r3["safest"]["node_ids"] == ["n_a", "n_safe_via", "n_b"], "Safest must detour around pitch-black culvert"
    assert r3["safest"]["safety_score"] > r3["fastest"]["safety_score"] + 50
    print(f"[PASS] 3. Direct road extremely unsafe: Safest correctly detoured ({r3['safest']['safety_score']}% vs {r3['fastest']['safety_score']}%, +{r3['safest']['safety_score'] - r3['fastest']['safety_score']}%).")

    # -----------------------------------------------------------------
    # Test 4: Longer Safe Alternative
    # Verified on Trichy network (Saranathan -> CBS)
    # -----------------------------------------------------------------
    r4 = g.calculate_routes("n_saranathan", "n_central_bs", time_mode="night")
    assert r4["fastest"]["distance_m"] < r4["safest"]["distance_m"]
    assert r4["safest"]["safety_score"] > r4["fastest"]["safety_score"]
    assert r4["safest"]["is_detour_justified"] is True
    print(f"[PASS] 4. Longer safe alternative: Saranathan->CBS verified (Safe {r4['safest']['distance_m']}m at {r4['safest']['safety_score']}% vs Fast {r4['fastest']['distance_m']}m at {r4['fastest']['safety_score']}%).")

    # -----------------------------------------------------------------
    # Test 5: No Direct Road Available
    # Distant endpoints with multi-hop navigation (Panjappur to No.1 Tollgate)
    # -----------------------------------------------------------------
    r5 = g.calculate_routes("n_panjappur", "n_tollgate_north", time_mode="night")
    assert len(r5["safest"]["node_ids"]) >= 5
    assert r5["safest"]["node_ids"][0] == "n_panjappur"
    assert r5["safest"]["node_ids"][-1] == "n_tollgate_north"
    assert len(r5["safest"]["node_ids"]) == len(set(r5["safest"]["node_ids"])), "No loops or backtracking"
    print(f"[PASS] 5. No direct road available: Clean multi-hop route generated ({len(r5['safest']['node_ids'])} nodes, {r5['safest']['distance_m']}m).")

    # -----------------------------------------------------------------
    # Test 6: One-Way Road Enforcement
    # Test directional routing constraint
    # -----------------------------------------------------------------
    g_test6 = CitySafetyGraph()
    g_test6.nodes.clear()
    g_test6.edges.clear()
    g_test6.adjacency.clear()

    g_test6.add_node("n_1", "Node 1", 10.8000, 78.7000)
    g_test6.add_node("n_2", "Node 2", 10.8100, 78.7000)
    g_test6.add_node("n_return", "Return Loop", 10.8050, 78.7050)

    # One-way edge: 1 -> 2 only (manually set in adjacency)
    g_test6.add_node("n_1", "Node 1", 10.8000, 78.7000)
    g_test6.add_node("n_2", "Node 2", 10.8100, 78.7000)
    g_test6.edges["e_oneway"] = {
        "id": "e_oneway", "u": "n_1", "v": "n_2", "street": "One Way Northbound",
        "length_m": 1000.0, "lighting": 0.90, "crowd": 0.80, "crime": 0.05, "cctv": 0.85,
        "geometry": [[10.8000, 78.7000], [10.8100, 78.7000]]
    }
    g_test6.adjacency["n_1"].append(("n_2", "e_oneway")) # forward only

    # Return loop: 2 -> return -> 1
    g_test6.add_edge("e_ret_1", "n_2", "n_return", "Return Leg 1", 0.90, 0.80, 0.05, 0.85, 700.0)
    g_test6.add_edge("e_ret_2", "n_return", "n_1", "Return Leg 2", 0.90, 0.80, 0.05, 0.85, 700.0)

    r6_fwd = g_test6.calculate_routes("n_1", "n_2", time_mode="night", active_hazards=[])
    assert r6_fwd["fastest"]["node_ids"] == ["n_1", "n_2"]

    r6_rev = g_test6.calculate_routes("n_2", "n_1", time_mode="night", active_hazards=[])
    assert r6_rev["fastest"]["node_ids"] == ["n_2", "n_return", "n_1"]
    print("[PASS] 6. One-way road: Forward uses direct edge; reverse correctly routes via return loop.")

    # -----------------------------------------------------------------
    # Test 7: Junction Node (Palpannai NH-83 Interchange)
    # Connects 4 arterial directions without disconnection or loops
    # -----------------------------------------------------------------
    assert "n_palpannai_junction" in g.nodes
    conns = [v for v, eid in g.adjacency["n_palpannai_junction"]]
    assert "n_mannarpuram" in conns
    assert "n_kattur" in conns
    assert "n_gandhi_market" in conns
    assert "n_east_boulevard" in conns

    # Route passing straight through junction: Gandhi Market to Kattur
    r7 = g.calculate_routes("n_gandhi_market", "n_kattur", time_mode="night")
    assert "n_palpannai_junction" in r7["safest"]["node_ids"], (
        f"Route from Gandhi Market to Kattur must pass through Palpannai Junction! Got {r7['safest']['node_ids']}"
    )
    assert len(r7["safest"]["node_ids"]) == len(set(r7["safest"]["node_ids"])), "No node repetitions"
    print(f"[PASS] 7. Junction: Palpannai 4-way interchange connects all corridors smoothly ({r7['safest']['distance_m']}m).")

    # -----------------------------------------------------------------
    # Test 8: Roundabout / Ring Junction Geometry
    # -----------------------------------------------------------------
    woraiyur_geom = g.edges.get("e_trichy_18", {}).get("geometry", []) # Shastri Rd to Chathiram / Woraiyur
    assert len(g.adjacency["n_woraiyur"]) >= 3
    r8 = g.calculate_routes("n_tennur_high_rd", "n_chathiram_bs", time_mode="night")
    assert r8["safest"]["node_ids"] is not None
    assert len(r8["safest"]["node_ids"]) == len(set(r8["safest"]["node_ids"]))
    print("[PASS] 8. Roundabout / Ring: Woraiyur & Shastri commercial rings route without self-intersecting loops.")

    # -----------------------------------------------------------------
    # Test 9: Hazard on Direct Road
    # Adding a severe hazard to a direct road forces a safe detour
    # -----------------------------------------------------------------
    # Direct road: Gandhi Market -> Kattur
    r9_before = g.calculate_routes("n_gandhi_market", "n_kattur", time_mode="night", active_hazards=[])
    assert r9_before["safest"]["node_ids"] == ["n_gandhi_market", "n_palpannai_junction", "n_kattur"]

    # Place severe hazard right on Thanjavur Road (midpoint of Gandhi Market and Palpannai)
    hazard_point = {
        "id": "haz_thanjavur_block",
        "lat": (10.8215 + 10.8131) / 2.0,
        "lng": (78.7010 + 78.7127) / 2.0,
        "severity": 1.0,
        "confidence": 1.0,
        "category": "Violent Incident & Road Blockade"
    }

    r9_hazard = g.calculate_routes("n_gandhi_market", "n_kattur", time_mode="night", active_hazards=[hazard_point])
    # Safest must detour via East Boulevard or Big Bazaar to bypass the hazard
    assert r9_hazard["safest"]["node_ids"] != ["n_gandhi_market", "n_palpannai_junction", "n_kattur"], (
        "Safest route should detour away from direct road when blocked by severe hazard"
    )
    print(f"[PASS] 9. Hazard on direct road: Safest rerouted from {r9_before['safest']['node_ids']} to {r9_hazard['safest']['node_ids']}.")

    # -----------------------------------------------------------------
    # Test 10: Direct Road After Hazard Removal
    # Once the hazard is cleared, direct route becomes preferred again
    # -----------------------------------------------------------------
    r10_cleared = g.calculate_routes("n_gandhi_market", "n_kattur", time_mode="night", active_hazards=[])
    assert r10_cleared["safest"]["node_ids"] == ["n_gandhi_market", "n_palpannai_junction", "n_kattur"]
    print(f"[PASS] 10. Direct road after hazard removal: Direct road restored as preferred route ({r10_cleared['safest']['distance_m']}m).")

    print("\n>>> ALL 10 DIRECT ROUTING & DETOUR SANITY TESTS PASSED WITH 100% SUCCESS! <<<\n")

if __name__ == "__main__":
    run_direct_routing_tests()
