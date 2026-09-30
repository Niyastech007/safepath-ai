"""
SafePath AI - Persistent SQLite Hazard Database
Manages crowdsourced safety pins, verification status, and confidence scoring.
"""

import sqlite3
import os
import math
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "safepath.db")

def get_db_connection(db_path=None):
    path = db_path or DB_PATH
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def _haversine(lat1, lon1, lat2, lon2):
    R = 6371000 # meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def init_db(db_path=None):
    """Initializes tables and seeds baseline Trichy hazards if empty."""
    conn = get_db_connection(db_path)
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS hazards (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        category TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        description TEXT,
        severity REAL DEFAULT 0.8,
        status TEXT DEFAULT 'unverified',
        confidence REAL DEFAULT 0.65,
        source TEXT DEFAULT 'user',
        upvotes INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Check if empty, seed default Trichy hazards
    cursor.execute("SELECT COUNT(*) FROM hazards;")
    count = cursor.fetchone()[0]

    if count == 0:
        default_hazards = [
            (
                "rep_trichy_1", "broken_light", "Broken Streetlight",
                10.8080, 78.6855,
                "Uyyakondan Canal path completely pitch dark after 8:00 PM",
                0.85, "verified", 0.95, "admin", 34,
                datetime.now().isoformat(), datetime.now().isoformat()
            ),
            (
                "rep_trichy_2", "harassment", "Harassment / Isolated Underpass",
                10.8125, 78.7045,
                "Underpass dimly lit, anti-social gathering reported near railway line",
                0.92, "verified", 0.95, "admin", 47,
                datetime.now().isoformat(), datetime.now().isoformat()
            ),
            (
                "rep_trichy_3", "stray_animals", "Aggressive Stray Dogs",
                10.7950, 78.7500,
                "Pack of aggressive stray dogs near Kattur service road junction",
                0.60, "verified", 0.85, "user", 19,
                datetime.now().isoformat(), datetime.now().isoformat()
            )
        ]
        cursor.executemany("""
            INSERT INTO hazards (
                id, type, category, latitude, longitude, description,
                severity, status, confidence, source, upvotes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, default_hazards)

    conn.commit()
    conn.close()

def get_active_hazards(db_path=None):
    """Retrieves all non-resolved hazards for routing safety engine."""
    conn = get_db_connection(db_path)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, type, category, latitude, longitude, description,
               severity, status, confidence, source, upvotes, created_at, updated_at
        FROM hazards
        WHERE status != 'resolved' AND status != 'rejected'
        ORDER BY created_at DESC
    """)
    rows = cursor.fetchall()
    conn.close()

    hazards = []
    for r in rows:
        hazards.append({
            "id": r["id"],
            "type": r["type"],
            "category": r["category"],
            "lat": r["latitude"],
            "lng": r["longitude"],
            "description": r["description"],
            "severity": float(r["severity"]),
            "status": r["status"],
            "confidence": float(r["confidence"]),
            "source": r["source"],
            "upvotes": int(r["upvotes"]),
            "created_at": r["created_at"],
            "timestamp": "Verified Alert" if r["status"] == "verified" else "Recent Report"
        })
    return hazards

def add_hazard(hazard_data, db_path=None):
    """
    Inserts a new hazard or increases confidence if existing report within 150m.
    Prevents single malicious reports from dominating while corroborating clusters.
    """
    conn = get_db_connection(db_path)
    cursor = conn.cursor()

    lat = float(hazard_data["lat"])
    lng = float(hazard_data["lng"])
    category = hazard_data.get("category", "General Safety Hazard")
    h_type = hazard_data.get("type", "other")
    desc = hazard_data.get("description", "Reported by citizen")
    severity = float(hazard_data.get("severity", 0.75))
    source = hazard_data.get("source", "user")

    # Check for existing active hazards within 150m to corroborate
    cursor.execute("SELECT id, latitude, longitude, upvotes, confidence FROM hazards WHERE status != 'resolved'")
    existing = cursor.fetchall()
    
    corroborated_id = None
    for row in existing:
        dist = _haversine(lat, lng, row["latitude"], row["longitude"])
        if dist <= 150: # Close proximity cluster
            corroborated_id = row["id"]
            new_upvotes = row["upvotes"] + 1
            # Confidence grows with independent corroboration up to 0.92
            new_confidence = min(0.92, float(row["confidence"]) + 0.10)
            cursor.execute("""
                UPDATE hazards 
                SET upvotes = ?, confidence = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (new_upvotes, new_confidence, corroborated_id))
            break

    if corroborated_id:
        conn.commit()
        cursor.execute("SELECT * FROM hazards WHERE id = ?", (corroborated_id,))
        updated = cursor.fetchone()
        conn.close()
        return {
            "id": updated["id"],
            "type": updated["type"],
            "category": updated["category"],
            "lat": updated["latitude"],
            "lng": updated["longitude"],
            "description": updated["description"],
            "severity": float(updated["severity"]),
            "status": updated["status"],
            "confidence": float(updated["confidence"]),
            "source": updated["source"],
            "upvotes": int(updated["upvotes"]),
            "is_corroborated": True
        }

    # Brand new report
    hazard_id = f"rep_trichy_{int(datetime.now().timestamp() * 1000)}"
    initial_confidence = 0.90 if source == "admin" else 0.65
    initial_status = "verified" if source == "admin" else "unverified"

    cursor.execute("""
        INSERT INTO hazards (
            id, type, category, latitude, longitude, description,
            severity, status, confidence, source, upvotes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    """, (hazard_id, h_type, category, lat, lng, desc, severity, initial_status, initial_confidence, source))

    conn.commit()
    conn.close()

    return {
        "id": hazard_id,
        "type": h_type,
        "category": category,
        "lat": lat,
        "lng": lng,
        "description": desc,
        "severity": severity,
        "status": initial_status,
        "confidence": initial_confidence,
        "source": source,
        "upvotes": 1,
        "is_corroborated": False
    }

def update_hazard_status(hazard_id, status, db_path=None):
    """Update status to 'verified', 'resolved', or 'rejected'."""
    conn = get_db_connection(db_path)
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE hazards SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    """, (status, hazard_id))
    conn.commit()
    conn.close()

# Auto-initialize database schema on module load
init_db()
