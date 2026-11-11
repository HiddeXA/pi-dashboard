#!/usr/bin/env python3
"""Pi Dashboard - lichte server voor een smarthome-touchscreen.

Serveert de webinterface en praat namens de browser met Home Assistant,
zodat je token nooit in de browser terechtkomt. Gebruikt alleen de
standaardbibliotheek van Python (3.11+), dus geen pip-installatie nodig.
"""

import importlib.util
import json
import mimetypes
import os
import re
import sys
import threading
import time
import tomllib
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
WEB_DIR = APP_DIR / "web"
MODULES_DIR = APP_DIR / "modules"
PORT = int(os.environ.get("DASHBOARD_PORT", "8080"))

# Eerste gevonden bestand wint. /boot/firmware is de partitie die je op je
# pc ziet als je de SD-kaart insteekt, zodat je daar alles kunt instellen.
CONFIG_PATHS = [
    os.environ.get("DASHBOARD_CONFIG", ""),
    "/boot/firmware/dashboard.toml",
    "/boot/dashboard.toml",
    str(APP_DIR / "dashboard.toml"),
]
PLACEHOLDER_TOKEN = "PLAK_HIER_JE_TOKEN"
SECRET_KEYS = {"token", "wachtwoord", "password", "secret", "client_secret"}
NAME_RE = re.compile(r"^[a-z0-9_]+$")
ENTITY_RE = re.compile(r"^[a-z0-9_]+\.[a-z0-9_]+$")
IMAGE_PREFIXES = ("/api/media_player_proxy/", "/api/image_proxy/", "/api/camera_proxy/")


def log(*args):
    print(time.strftime("%H:%M:%S"), *args, flush=True)


# --------------------------------------------------------------------------
# Instellingen (worden automatisch opnieuw geladen als het bestand wijzigt)
# --------------------------------------------------------------------------
class Config:
    def __init__(self):
        self._lock = threading.Lock()
        self._path = None
        self._mtime = None
        self.data = {}
        self.error = None
        self.reload(force=True)

    def _find(self):
        for p in CONFIG_PATHS:
            if p and os.path.isfile(p):
                return p
        return None

    def reload(self, force=False):
        with self._lock:
            path = self._find()
            mtime = os.path.getmtime(path) if path else None
            if not force and path == self._path and mtime == self._mtime:
                return
            self._path, self._mtime = path, mtime
            if not path:
                self.data, self.error = {}, "Geen dashboard.toml gevonden."
                return
            try:
                with open(path, "rb") as f:
                    self.data = tomllib.load(f)
                self.error = None
                log("Instellingen geladen uit", path)
            except (tomllib.TOMLDecodeError, OSError) as e:
                self.data, self.error = {}, f"Fout in {path}: {e}"
                log(self.error)

    @property
    def path(self):
        return self._path

    def section(self, name):
        value = self.data.get(name, {})
        return value if isinstance(value, dict) else {}

    def problem(self):
        """Geeft een uitleg terug als het dashboard nog niet klaar is voor gebruik."""
        if self.error:
            return self.error
        ha = self.section("homeassistant")
        if not ha.get("url"):
            return "Vul in dashboard.toml bij [homeassistant] de url in."
        if not ha.get("token") or ha.get("token") == PLACEHOLDER_TOKEN:
            return "Vul in dashboard.toml bij [homeassistant] je token in."
        return None


def strip_secrets(value):
    if isinstance(value, dict):
        return {k: strip_secrets(v) for k, v in value.items() if k.lower() not in SECRET_KEYS}
    if isinstance(value, list):
        return [strip_secrets(v) for v in value]
    return value


# --------------------------------------------------------------------------
# Home Assistant
# --------------------------------------------------------------------------
class HAError(Exception):
    pass


class HomeAssistant:
    def __init__(self, config):
        self.config = config
        self._lock = threading.Lock()
        self._cache = None
        self._cache_time = 0.0

    def _settings(self):
        ha = self.config.section("homeassistant")
        return str(ha.get("url", "")).rstrip("/"), str(ha.get("token", ""))

    def request(self, method, path, body=None, raw=False, timeout=8):
        base, token = self._settings()
        if not base:
            raise HAError("Geen Home Assistant-url ingesteld")
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(base + path, data=data, method=method)
        req.add_header("Authorization", f"Bearer {token}")
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                payload = resp.read()
                if raw:
                    return payload, resp.headers.get("Content-Type", "application/octet-stream")
                return json.loads(payload or b"null")
        except urllib.error.HTTPError as e:
            if e.code == 401:
                raise HAError("Home Assistant weigert de token (401). Controleer je token.") from e
            raise HAError(f"Home Assistant gaf fout {e.code} op {path}") from e
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            reason = getattr(e, "reason", e)
            raise HAError(f"Kan Home Assistant niet bereiken op {base} ({reason})") from e

    def states(self, max_age=1.5):
        with self._lock:
            if self._cache is not None and time.monotonic() - self._cache_time < max_age:
                return self._cache
        states = self.request("GET", "/api/states")
        with self._lock:
            self._cache = states
            self._cache_time = time.monotonic()
        return states

    def call(self, domain, service, data):
        result = self.request("POST", f"/api/services/{domain}/{service}", data or {})
        with self._lock:
            self._cache = None  # volgende poll haalt verse status op
        return result


# --------------------------------------------------------------------------
# Modules
# --------------------------------------------------------------------------
class Modules:
    """Een module is een map in modules/ met een widget.js (verplicht) en
    optioneel widget.css en backend.py. Zie modules/_voorbeeld."""

    def __init__(self, config, ha):
        self.config = config
        self.ha = ha
        self.routes = {}
        self._loaded_backends = set()

    def enabled(self):
        names = self.config.data.get("modules", ["homeassistant", "spotify"])
        result = []
        for name in names:
            if not isinstance(name, str) or not NAME_RE.match(name):
                continue
            folder = MODULES_DIR / name
            if not (folder / "widget.js").is_file():
                log(f"Module '{name}' niet gevonden, overgeslagen")
                continue
            result.append({
                "id": name,
                "script": f"/modules/{name}/widget.js",
                "style": f"/modules/{name}/widget.css" if (folder / "widget.css").is_file() else None,
                "config": strip_secrets(self.config.section(name)),
            })
            self._load_backend(name)
        return result

    def _load_backend(self, name):
        if name in self._loaded_backends:
            return
        self._loaded_backends.add(name)
        path = MODULES_DIR / name / "backend.py"
        if not path.is_file():
            return
        try:
            spec = importlib.util.spec_from_file_location(f"module_{name}", path)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            ctx = ModuleContext(self, name)
            mod.setup(ctx)
            log(f"Backend van module '{name}' geladen")
        except Exception as e:  # een kapotte module mag de rest niet slopen
            log(f"Backend van module '{name}' kon niet laden: {e}")


class ModuleContext:
    def __init__(self, modules, name):
        self._modules = modules
        self.name = name
        self.ha = modules.ha

    @property
    def config(self):
        return self._modules.config.section(self.name)

    def route(self, method, subpath, handler):
        """Registreer /api/m/<module>/<subpath>. handler(body, query) -> dict."""
        key = (method.upper(), f"/api/m/{self.name}/{subpath.strip('/')}")
        self._modules.routes[key] = handler


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------
CONFIG = Config()
HA = HomeAssistant(CONFIG)
MODULES = Modules(CONFIG, HA)


class Handler(BaseHTTPRequestHandler):
    server_version = "PiDashboard/1.0"

    def log_message(self, fmt, *args):
        if os.environ.get("DASHBOARD_DEBUG"):
            log(self.address_string(), fmt % args)

    # -- helpers --
    def send_json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_bytes(self, body, content_type, cache="no-cache"):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", cache)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length > 100_000:
            raise ValueError("Verzoek te groot")
        if not length:
            return {}
        return json.loads(self.rfile.read(length))

    def serve_static(self, root, relpath):
        target = (root / relpath).resolve()
        if root.resolve() not in target.parents or not target.is_file():
            return self.send_json({"fout": "Niet gevonden"}, 404)
        ctype = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript",):
            ctype += "; charset=utf-8"
        self.send_bytes(target.read_bytes(), ctype)

    # -- routes --
    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        query = urllib.parse.parse_qs(url.query)
        path = url.path
        try:
            if path == "/api/ping":
                return self.send_json({"ok": True})
            if path == "/api/config":
                CONFIG.reload()
                return self.send_json({
                    "titel": CONFIG.data.get("titel", "Thuis"),
                    "ververs_seconden": CONFIG.data.get("ververs_seconden", 2),
                    "verberg_cursor": CONFIG.data.get("verberg_cursor", True),
                    "probleem": CONFIG.problem(),
                    "config_pad": CONFIG.path or "/boot/firmware/dashboard.toml",
                    "modules": [] if CONFIG.error else MODULES.enabled(),
                })
            if path == "/api/states":
                return self.handle_states(query)
            if path == "/api/image":
                return self.handle_image(query)
            if (handler := MODULES.routes.get(("GET", path))):
                return self.send_json(handler({}, query))
            if path.startswith("/modules/"):
                return self.serve_static(MODULES_DIR, path[len("/modules/"):])
            if path in ("/", ""):
                path = "/index.html"
            return self.serve_static(WEB_DIR, path.lstrip("/"))
        except HAError as e:
            return self.send_json({"fout": str(e)}, 502)
        except Exception as e:
            log("Fout bij", path, repr(e))
            return self.send_json({"fout": "Interne fout"}, 500)

    def do_POST(self):
        path = urllib.parse.urlsplit(self.path).path
        try:
            body = self.read_body()
            m = re.fullmatch(r"/api/service/([a-z0-9_]+)/([a-z0-9_]+)", path)
            if m:
                if not isinstance(body, dict):
                    return self.send_json({"fout": "Ongeldige gegevens"}, 400)
                HA.call(m.group(1), m.group(2), body)
                return self.send_json({"ok": True})
            if (handler := MODULES.routes.get(("POST", path))):
                return self.send_json(handler(body, {}))
            return self.send_json({"fout": "Niet gevonden"}, 404)
        except HAError as e:
            return self.send_json({"fout": str(e)}, 502)
        except (ValueError, json.JSONDecodeError) as e:
            return self.send_json({"fout": str(e)}, 400)
        except Exception as e:
            log("Fout bij", path, repr(e))
            return self.send_json({"fout": "Interne fout"}, 500)

    def handle_states(self, query):
        ids = {i for i in ",".join(query.get("ids", [])).split(",") if ENTITY_RE.match(i)}
        domains = {d for d in ",".join(query.get("domains", [])).split(",") if NAME_RE.match(d)}
        result = {}
        for st in HA.states():
            eid = st.get("entity_id", "")
            if eid in ids or eid.split(".", 1)[0] in domains:
                result[eid] = {"state": st.get("state"), "attributes": st.get("attributes", {})}
        self.send_json(result)

    def handle_image(self, query):
        pad = (query.get("pad") or [""])[0]
        if not pad.startswith(IMAGE_PREFIXES) or ".." in pad:
            return self.send_json({"fout": "Pad niet toegestaan"}, 400)
        data, ctype = HA.request("GET", pad, raw=True)
        self.send_bytes(data, ctype, cache="max-age=300")


def main():
    host = str(CONFIG.data.get("luister", "127.0.0.1"))
    server = ThreadingHTTPServer((host, PORT), Handler)
    server.daemon_threads = True
    log(f"Pi Dashboard draait op http://{host}:{PORT}")
    if CONFIG.problem():
        log("Let op:", CONFIG.problem())
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    if sys.version_info < (3, 11):
        sys.exit("Pi Dashboard heeft Python 3.11 of nieuwer nodig.")
    main()
