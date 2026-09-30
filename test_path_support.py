"""
Comprehensive test script for path-based police and safe haven support calculation.
Validates that nearest police station and hospital contacts reflect the active Origin-to-Destination path corridor.
"""
import requests
import json

BASE_URL = "http://localhost:5000"

def run_tests():
    print("=================================================================")
    print("  VERIFYING ORIGIN-TO-DESTINATION PATH-BASED EMERGENCY SUPPORT  ")
    print("=================================================================")

    # 1. Preset 0: Saranathan College (Panjappur) -> Central Bus Stand (CBS)
    r_routes = requests.post(f"{BASE_URL}/api/routes", json={
        "start_node": "n_saranathan",
        "end_node": "n_central_bs",
        "time_mode": "night"
    }).json()
    assert r_routes["success"] is True
    safest_coords = r_routes["routes"]["safest"]["coordinates"]
    assert len(safest_coords) > 5

    res_supp = requests.post(f"{BASE_URL}/api/nearby-support", json={
        "lat": 10.7580,
        "lng": 78.6475,
        "route_coords": safest_coords
    }).json()

    assert res_supp["success"] is True
    pol_name = res_supp["support"]["police"]["station"]["name"]
    sh_name = res_supp["support"]["safe_haven"]["safe_haven"]["name"]
    corridor_pol = [p["station"]["name"] for p in res_supp["support"]["corridor_police"]]
    
    print(f"\n[Test 1] Saranathan College -> Central Bus Stand (CBS):")
    print(f"  Nearest Police: {pol_name}")
    print(f"  Nearest Safe Haven: {sh_name}")
    print(f"  Corridor Police Stations: {corridor_pol}")

    assert "Thillai Nagar" not in pol_name, f"Expected non-Thillai Nagar police, got: {pol_name}"
    assert "Panjappur" in pol_name or "Railway" in pol_name or "Cantonment" in pol_name
    assert "Saranathan" in sh_name or "Central Bus Stand" in sh_name or "Junction" in sh_name or "Child Jesus" in sh_name

    # 2. Preset 2: Airport -> Central Bus Stand
    r_airport = requests.post(f"{BASE_URL}/api/routes", json={
        "start_node": "n_airport",
        "end_node": "n_central_bs",
        "time_mode": "night"
    }).json()
    airport_coords = r_airport["routes"]["safest"]["coordinates"]
    res_airport_supp = requests.post(f"{BASE_URL}/api/nearby-support", json={
        "lat": 10.7660,
        "lng": 78.7110,
        "route_coords": airport_coords
    }).json()
    air_pol = res_airport_supp["support"]["police"]["station"]["name"]
    print(f"\n[Test 2] Trichy Airport -> Central Bus Stand:")
    print(f"  Nearest Police: {air_pol}")
    assert "Thillai Nagar" not in air_pol
    assert "Airport" in air_pol or "K.K. Nagar" in air_pol or "Cantonment" in air_pol

    # 3. Preset 3: NIT Trichy -> Chathiram Bus Stand
    r_nit = requests.post(f"{BASE_URL}/api/routes", json={
        "start_node": "n_nit_trichy",
        "end_node": "n_chathiram_bs",
        "time_mode": "night"
    }).json()
    nit_coords = r_nit["routes"]["safest"]["coordinates"]
    res_nit_supp = requests.post(f"{BASE_URL}/api/nearby-support", json={
        "lat": 10.7610,
        "lng": 78.8140,
        "route_coords": nit_coords
    }).json()
    nit_pol = res_nit_supp["support"]["police"]["station"]["name"]
    print(f"\n[Test 3] NIT Trichy -> Chathiram Bus Stand:")
    print(f"  Nearest Police: {nit_pol}")
    assert "Thillai Nagar" not in nit_pol
    assert "NIT" in nit_pol or "BHEL" in nit_pol or "Fort" in nit_pol

    # 4. Preset 4: Srirangam -> Rockfort
    r_sri = requests.post(f"{BASE_URL}/api/routes", json={
        "start_node": "n_srirangam_rajagopuram",
        "end_node": "n_rockfort_base",
        "time_mode": "night"
    }).json()
    sri_coords = r_sri["routes"]["safest"]["coordinates"]
    res_sri_supp = requests.post(f"{BASE_URL}/api/nearby-support", json={
        "lat": 10.8600,
        "lng": 78.6890,
        "route_coords": sri_coords
    }).json()
    sri_pol = res_sri_supp["support"]["police"]["station"]["name"]
    print(f"\n[Test 4] Srirangam -> Rockfort:")
    print(f"  Nearest Police: {sri_pol}")
    assert "Thillai Nagar" not in sri_pol
    assert "Srirangam" in sri_pol or "Fort" in sri_pol

    # 5. Preset 1: Central Bus Stand -> Thillai Nagar (only here Thillai Nagar should appear!)
    r_thillai = requests.post(f"{BASE_URL}/api/routes", json={
        "start_node": "n_central_bs",
        "end_node": "n_thillai_nagar_main",
        "time_mode": "night"
    }).json()
    thillai_coords = r_thillai["routes"]["safest"]["coordinates"]
    res_thillai_supp = requests.post(f"{BASE_URL}/api/nearby-support", json={
        "lat": 10.7965,
        "lng": 78.6865,
        "route_coords": thillai_coords
    }).json()
    thillai_corridor = [p["station"]["name"] for p in res_thillai_supp["support"]["corridor_police"]]
    print(f"\n[Test 5] Central Bus Stand -> Thillai Nagar Corridor:")
    print(f"  Corridor Police: {thillai_corridor}")
    assert any("Thillai Nagar" in name for name in thillai_corridor)

    # 6. /api/sos with route_coords
    sos_res = requests.post(f"{BASE_URL}/api/sos", json={
        "lat": 10.7580,
        "lng": 78.6475,
        "user_name": "Saranathan Engineering Student",
        "route_coords": safest_coords,
        "origin_name": "Saranathan College",
        "dest_name": "Central Bus Stand (CBS)"
    }).json()
    print(f"\n[Test 6] 1-Tap Emergency SOS with Route Context:")
    print(f"  SMS Payload: {sos_res['sms_payload'].encode('ascii', 'replace').decode()}")
    print(f"  Nearest Police: {sos_res['nearest_police']['name']}")
    assert "Thillai Nagar" not in sos_res["nearest_police"]["name"]
    assert "Saranathan College" in sos_res["sms_payload"]

    print("\n>>> ALL PATH-BASED EMERGENCY SUPPORT TESTS PASSED WITH 100% SUCCESS! <<<\n")

if __name__ == "__main__":
    run_tests()
