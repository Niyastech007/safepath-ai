import safety_engine

g = safety_engine.CitySafetyGraph()
for pair in [('n_panjappur', 'n_central_bs'), ('n_saranathan', 'n_central_bs'), ('n_central_bs', 'n_thillai_nagar_main')]:
    res = g.calculate_routes(pair[0], pair[1], time_mode='night')
    print('=== Pair:', pair, '===')
    for k in ['safest', 'balanced', 'fastest']:
        r = res[k]
        badge_clean = r['badge'].encode('ascii', 'ignore').decode()
        print(f"  {k.upper()}: title='{r['title']}' badge='{badge_clean}' dist={r['distance_m']}m dur={r['duration_mins']}m safety={r['safety_score']}% nodes={r['node_ids']}")
