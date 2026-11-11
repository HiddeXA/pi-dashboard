#!/usr/bin/env python3
"""Nep-Home Assistant om het dashboard op je pc te testen zonder echte apparaten.

    python3 tools/mock_ha.py            # draait op http://127.0.0.1:8123
    DASHBOARD_CONFIG=tools/test.toml python3 dashboard/server.py
"""
import json
import re
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

now = lambda: datetime.now(timezone.utc).isoformat()

STATES = {
    "light.woonkamer": ("on", {"friendly_name": "Woonkamer", "brightness": 180, "supported_color_modes": ["color_temp"]}),
    "light.eettafel": ("off", {"friendly_name": "Eettafel", "supported_color_modes": ["brightness"]}),
    "light.ledstrip": ("on", {"friendly_name": "Ledstrip", "brightness": 255, "rgb_color": [120, 140, 255], "supported_color_modes": ["rgb"]}),
    "switch.tv": ("off", {"friendly_name": "Tv"}),
    "switch.koffie": ("on", {"friendly_name": "Koffiezetapparaat"}),
    "scene.film_kijken": ("scening", {"friendly_name": "Film kijken"}),
    "climate.thermostaat": ("heat", {"friendly_name": "Thermostaat", "current_temperature": 19.8, "temperature": 20.5, "target_temp_step": 0.5}),
    "cover.rolluik_voor": ("open", {"friendly_name": "Rolluik voor", "current_position": 100}),
    "sensor.temperatuur_buiten": ("8.4", {"friendly_name": "Buiten", "unit_of_measurement": "°C"}),
    "media_player.spotify_hidde": ("playing", {
        "friendly_name": "Spotify", "media_title": "Een heel mooi liedje", "media_artist": "De Testband",
        "media_album_name": "Proefopnames", "media_duration": 214, "media_position": 63,
        "media_position_updated_at": now(), "volume_level": 0.45, "shuffle": False,
        "source": "Woonkamer", "source_list": ["Woonkamer", "Keuken", "Telefoon"],
        "entity_picture": "/api/media_player_proxy/media_player.spotify_hidde?token=abc",
    }),
}
STATES = {k: {"entity_id": k, "state": s, "attributes": a} for k, (s, a) in STATES.items()}
CALLS = []

COVER = b"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7a59"/><stop offset="1" stop-color="#6b3fd6"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><circle cx="50" cy="50" r="22" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="3"/></svg>"""


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def reply(self, data, ctype="application/json"):
        body = data if isinstance(data, bytes) else json.dumps(data).encode()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.headers.get("Authorization") != "Bearer test":
            self.send_response(401); self.end_headers(); return
        if self.path == "/api/states":
            return self.reply(list(STATES.values()))
        if self.path == "/api/_calls":
            return self.reply(CALLS)
        if self.path.startswith("/api/media_player_proxy/"):
            return self.reply(COVER, "image/svg+xml")
        self.send_response(404); self.end_headers()

    def do_POST(self):
        m = re.fullmatch(r"/api/services/(\w+)/(\w+)", self.path)
        data = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        CALLS.append([m.group(1), m.group(2), data])
        st = STATES.get(data.get("entity_id"))
        svc = m.group(2)
        if st:
            a = st["attributes"]
            if svc == "turn_on":
                st["state"] = "on"
                if "brightness_pct" in data:
                    a["brightness"] = round(data["brightness_pct"] * 2.55)
            elif svc == "turn_off":
                st["state"] = "off"
            elif svc == "media_play_pause":
                st["state"] = "paused" if st["state"] == "playing" else "playing"
                a["media_position_updated_at"] = now()
            elif svc == "set_temperature":
                a["temperature"] = data["temperature"]
            elif svc == "volume_set":
                a["volume_level"] = data["volume_level"]
            elif svc == "select_source":
                a["source"] = data["source"]
        self.reply([])


if __name__ == "__main__":
    print("Nep-Home Assistant op http://127.0.0.1:8123 (token: test)")
    ThreadingHTTPServer(("127.0.0.1", 8123), H).serve_forever()
