"""
SafePath AI - Real-Time Weather Service (Open-Meteo Integration)
Provides live environmental conditions for Tiruchirappalli (Trichy), Tamil Nadu
with backend caching (10-min TTL) and graceful offline fallback.
"""

import time
import json
import logging
from datetime import datetime
import urllib.request
import urllib.error

logger = logging.getLogger("safepath.weather")

TRICHY_LAT = 10.7905
TRICHY_LNG = 78.7047
CACHE_TTL_SECONDS = 600  # 10 minutes

# WMO Weather interpretation codes
WMO_CODES = {
    0: ("Clear sky", "☀️", 0.0),
    1: ("Mainly clear", "🌤️", 0.0),
    2: ("Partly cloudy", "⛅", 0.0),
    3: ("Overcast", "☁️", 0.01),
    45: ("Foggy conditions", "🌫️", 0.03),
    48: ("Depositing rime fog", "🌫️", 0.04),
    51: ("Light drizzle", "🌦️", 0.02),
    53: ("Moderate drizzle", "🌦️", 0.03),
    55: ("Dense drizzle", "🌧️", 0.04),
    61: ("Slight rain", "🌧️", 0.03),
    63: ("Moderate rain", "🌧️", 0.05),
    65: ("Heavy rain", "🌧️", 0.08),
    80: ("Slight rain showers", "🌦️", 0.03),
    81: ("Moderate rain showers", "🌧️", 0.05),
    82: ("Violent rain showers", "⛈️", 0.08),
    95: ("Thunderstorm", "⛈️", 0.09)
}

class WeatherService:
    def __init__(self):
        self.cached_weather = None
        self.last_fetch_time = 0

    def get_current_weather(self, force_refresh=False):
        """
        Returns live weather for Trichy. Uses cached values if within TTL.
        Falls back safely if network/API is unavailable.
        """
        now = time.time()
        if not force_refresh and self.cached_weather and (now - self.last_fetch_time < CACHE_TTL_SECONDS):
            return self.cached_weather

        try:
            url = (
                f"https://api.open-meteo.com/v1/forecast?"
                f"latitude={TRICHY_LAT}&longitude={TRICHY_LNG}&"
                f"current=temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m,is_day&"
                f"timezone=Asia%2FKolkata"
            )
            req = urllib.request.Request(
                url, 
                headers={'User-Agent': 'SafePathAI/2.0 (Smart Cities Hackathon Prototype)'}
            )
            with urllib.request.urlopen(req, timeout=3.5) as response:
                if response.status == 200:
                    payload = json.loads(response.read().decode('utf-8'))
                    current = payload.get("current", {})
                    
                    wmo_code = current.get("weather_code", 0)
                    condition_text, icon, penalty = WMO_CODES.get(wmo_code, ("Fair", "🌤️", 0.0))
                    
                    rain_mm = current.get("rain", 0.0)
                    if rain_mm > 5.0:
                        penalty = max(penalty, 0.07)
                    elif rain_mm > 1.0:
                        penalty = max(penalty, 0.04)

                    weather_data = {
                        "success": True,
                        "is_live": True,
                        "source": "Open-Meteo API",
                        "city": "Tiruchirappalli (Trichy), TN",
                        "temperature_c": round(current.get("temperature_2m", 29.5), 1),
                        "humidity_pct": round(current.get("relative_humidity_2m", 65)),
                        "rain_mm": rain_mm,
                        "precipitation_mm": current.get("precipitation", 0.0),
                        "wind_kmh": round(current.get("wind_speed_10m", 12.0), 1),
                        "is_day": bool(current.get("is_day", 1)),
                        "condition": condition_text,
                        "icon": icon,
                        "weather_penalty": penalty,
                        "advisory": self._generate_advisory(condition_text, rain_mm),
                        "last_updated": datetime.now().strftime("%I:%M %p"),
                        "timestamp": now
                    }

                    self.cached_weather = weather_data
                    self.last_fetch_time = now
                    return weather_data
        except Exception as e:
            logger.warning(f"Live weather fetch failed: {e}. Using resilient fallback.")

        # Fallback to existing cache if available
        if self.cached_weather:
            fallback = dict(self.cached_weather)
            fallback["is_live"] = False
            fallback["source"] = "Cached Weather (Offline Fallback)"
            return fallback

        # Default deterministic fallback for Trichy
        return {
            "success": True,
            "is_live": False,
            "source": "Trichy Climatological Baseline",
            "city": "Tiruchirappalli (Trichy), TN",
            "temperature_c": 30.2,
            "humidity_pct": 68,
            "rain_mm": 0.0,
            "precipitation_mm": 0.0,
            "wind_kmh": 11.5,
            "is_day": False,
            "condition": "Mainly clear",
            "icon": "🌤️",
            "weather_penalty": 0.0,
            "advisory": "Good walking conditions along illuminated arterial corridors.",
            "last_updated": datetime.now().strftime("%I:%M %p"),
            "timestamp": now
        }

    def _generate_advisory(self, condition, rain_mm):
        if rain_mm > 3.0:
            return "Active rain in Trichy. Visibility reduced; safe arterial roads strongly advised."
        if "rain" in condition.lower() or "drizzle" in condition.lower():
            return "Light precipitation. Caution on damp footpaths and underpasses."
        return "Favorable walking conditions across Trichy."

weather_service = WeatherService()
