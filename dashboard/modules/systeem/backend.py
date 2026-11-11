"""Systeem-module (backend). Ook bedoeld als voorbeeld voor je eigen modules.

setup(ctx) wordt één keer aangeroepen. Met ctx.route(methode, pad, functie)
maak je /api/m/systeem/<pad> aan. De functie krijgt (body, query) en geeft
een dict terug die als JSON naar de browser gaat. ctx.config is jouw
[systeem]-sectie uit dashboard.toml, ctx.ha praat met Home Assistant.
"""

import os
import socket
import subprocess
import time


def _read(path, default=""):
    try:
        with open(path) as f:
            return f.read().strip()
    except OSError:
        return default


def _ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("192.0.2.1", 9))  # geen echt verkeer, alleen route opzoeken
            return s.getsockname()[0]
    except OSError:
        return "onbekend"


def info(body, query):
    temp = _read("/sys/class/thermal/thermal_zone0/temp")
    mem = {}
    for line in _read("/proc/meminfo").splitlines():
        key, _, value = line.partition(":")
        mem[key] = int(value.split()[0]) if value.split() else 0
    uptime = float(_read("/proc/uptime", "0").split()[0] or 0)
    return {
        "temperatuur": round(int(temp) / 1000, 1) if temp.isdigit() else None,
        "belasting": round(os.getloadavg()[0], 2),
        "geheugen_vrij_mb": round(mem.get("MemAvailable", 0) / 1024),
        "geheugen_totaal_mb": round(mem.get("MemTotal", 0) / 1024),
        "aan_sinds_uur": round(uptime / 3600, 1),
        "ip": _ip(),
        "hostnaam": socket.gethostname(),
        "tijd": time.strftime("%H:%M:%S"),
    }


def restart_browser(body, query):
    # De kiosk-service start de browser vanzelf opnieuw op.
    subprocess.Popen(["pkill", "-f", "chromium"])
    return {"ok": True}


def setup(ctx):
    ctx.route("GET", "info", info)
    ctx.route("POST", "browser-herstart", restart_browser)
