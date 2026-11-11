#!/bin/bash
# Start Chromium schermvullend in cage (een minimale Wayland-omgeving).
# Wordt gestart door pi-dashboard-kiosk.service op het scherm van de Pi.

URL="http://127.0.0.1:${DASHBOARD_PORT:-8080}"

# Wacht tot de dashboard-server reageert (maximaal een minuut)
for _ in $(seq 1 60); do
  curl -fs -o /dev/null "$URL/api/ping" && break
  sleep 1
done

BROWSER="$(command -v chromium || command -v chromium-browser)"

exec cage -d -s -- "$BROWSER" \
  --kiosk --app="$URL" \
  --ozone-platform=wayland \
  --incognito \
  --noerrdialogs --disable-infobars --no-first-run \
  --disable-pinch --overscroll-history-navigation=0 \
  --disable-features=Translate,MediaRouter,HardwareMediaKeyHandling \
  --check-for-update-interval=31536000 \
  --password-store=basic \
  --disk-cache-dir=/tmp/pi-dashboard-cache \
  --renderer-process-limit=2 \
  --enable-low-end-device-mode
