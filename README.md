# 🛡️ SafePath AI – AI Safe Route Planner (Trichy Edition)
> **Hackathon:** HACKWELL 2.0 – Saranathan College of Engineering, Tiruchirappalli, Tamil Nadu  
> **Track:** Human-Centered AI (HCA-05) – Smart Cities  
> **Theme:** Human Centered AI

SafePath AI is an intelligent navigation and personal security system that calculates and recommends the **safest possible travel routes** based on real-time environmental, lighting, crowd, and public safety data across **Tiruchirappalli (Trichy), Tamil Nadu**.

Unlike conventional navigation engines that optimize exclusively for speed and distance, SafePath AI prioritizes **human safety, peace of mind, and proactive situational awareness**, especially for women, students, night-shift workers, and senior citizens travelling during evening and night hours.

---

## 🌟 Key Features

1. **🛡️ Tri-Route Dynamic Engine**:
   - **Safest Route (Recommended)**: Strongly detours around unlit or hazardous paths to maximize calculated safety score ($\lambda=15.0$).
   - **Balanced Route**: A smart compromise between minimal detour and substantial safety gains ($\lambda=4.0$).
   - **Fastest Route (Standard GPS)**: The shortest physical distance, exposing risks such as unlit industrial and canal alleys ($\lambda=0.0$).

2. **❓ "Why Not The Fastest Route?" Comparative XAI**:
   - Dynamically generated comparative breakdown explaining exact trade-offs (e.g. $+8\text{ mins}$ detour avoiding an unlit $12\%$ illumination canal bund with active reported hazards).

3. **🧠 Explainable AI (XAI) Justifications**:
   - Transparent, human-centered natural language explanations detailing *why* a route was selected.
   - Real-time breakdowns for Streetlight Illumination, Pedestrian Footfall, CCTV Coverage, and Police Proximity.

4. **🌦️ Real-Time Weather Integration (Open-Meteo)**:
   - Live Trichy weather conditions ($10.7905^\circ\text{N}, 78.7047^\circ\text{E}$) with 10-minute caching and offline fallback.
   - Environmental modifier adjusts safety calculations during rainfall or storms.

5. **🗄️ Persistent SQLite Hazard Database (`safepath.db`)**:
   - Crowdsourced hazard pins (broken streetlights, harassment, aggressive stray animals) saved to SQLite.
   - Corroboration mechanism increases confidence with multiple reports, dynamically altering nearby road segment safety weights in real time.

6. **🚶 Live SafeWalk Guardian Companion & Route Deviation Watchdog**:
   - Simulated turn-by-turn navigation with real-time waypoint safety alerts.
   - Route adherence watchdog prompts instant 1-click recalculation if the traveler drifts from the recommended corridor.

7. **🚨 Smart 1-Tap SOS with Dynamic Emergency Lookup**:
   - Web Audio emergency siren.
   - Dynamically identifies the nearest police station (name, distance, helpline) and nearest 24/7 safe haven hospital.
   - Formats instant GPS broadcast payload ready for WhatsApp/SMS dispatch.

8. **📞 Simulated Anti-Stalker Fake Call**:
   - Realistic incoming phone call screen with Web Audio ringtone and Web SpeechSynthesis deterrent voice dialogue.

9. **📋 Data Source Transparency Matrix**:
   - Transparently distinguishes between Live, Verified, Curated, Corroborated, and Historical data.

---

## 🚀 How to Run

1. Open a terminal in the project directory:
   ```bash
   cd "d:\safepath-ai - Copy"
   ```
2. Start the application:
   ```bash
   python app.py
   ```
3. Open your browser and navigate to:
   ```
   http://localhost:5000
   ```

---

## 🧪 Running Automated Tests

Run the full automated test suite (23 comprehensive tests covering routing, SQLite persistence, weather fallback, time profiles, and API validation):

```bash
python test_safety_engine.py
python test_api.py
```

---

## 📂 Project Architecture

```
d:\safepath-ai - Copy\
├── app.py                     # Flask REST API Gateway & static server
├── safety_engine.py           # Multi-objective Dijkstra routing & dynamic safety scoring
├── database.py                # Persistent SQLite database layer for crowdsourced hazards
├── weather_service.py         # Open-Meteo live weather client with 10-min cache & fallback
├── safepath.db                # SQLite database storing active community hazard pins
├── .env.example               # Environment variables configuration template
├── test_safety_engine.py      # Algorithmic and safety engine unit tests
├── test_api.py                # REST endpoint integration and validation tests
└── static/
    ├── index.html             # Responsive dashboard & mobile frame UI
    ├── css/
    │   └── styles.css         # Cyber-safe dark theme, glow polylines, and UI polish
    └── js/
        ├── app.js             # UI state controller, live telemetry, and SafeWalk manager
        ├── map.js             # Leaflet map controller, POI markers, and walker simulation
        └── audio.js           # Web Audio API siren synthesizer & voice dialogue
```
