#!/bin/bash
# ==========================================================================
#  Pi Dashboard installeren of bijwerken
#
#  Op een Pi met Raspberry Pi OS Lite (Bookworm of Trixie):
#    curl -fsSL https://raw.githubusercontent.com/HiddeXA/pi-dashboard/main/install.sh | sudo bash
#  Of vanuit een uitgepakte map:
#    sudo bash install.sh
#
#  Nogmaals uitvoeren = bijwerken. Je dashboard.toml en eigen modules blijven staan.
# ==========================================================================
set -euo pipefail

REPO="${PI_DASHBOARD_REPO:-https://github.com/HiddeXA/pi-dashboard.git}"
APP=/opt/pi-dashboard
KIOSK_USER=kiosk
MODE=normaal
[[ "${1:-}" == "--image" ]] && MODE=image   # gebruikt tijdens het bouwen van een image

say() { echo -e "\e[1;33m==>\e[0m $*"; }
die() { echo -e "\e[1;31mFout:\e[0m $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "start dit script met sudo: sudo bash install.sh"

export DEBIAN_FRONTEND=noninteractive
apt_install() { apt-get install -y -q --no-install-recommends "$@"; }

# --- 1. Pakketten -----------------------------------------------------------
say "Pakketten installeren (dit duurt op een Pi Zero een paar minuten)"
apt-get update -q
apt_install python3 cage curl ca-certificates fonts-noto-color-emoji fonts-dejavu-core
# Chromium heet 'chromium' (Trixie) of 'chromium-browser' (oudere versies)
apt-get install -y -q chromium || apt-get install -y -q chromium-browser \
  || die "Chromium kon niet geïnstalleerd worden"
apt_install fonts-inter 2>/dev/null || true   # mooier lettertype, niet verplicht

python3 -c 'import sys; sys.exit(sys.version_info < (3, 11))' \
  || die "Python 3.11 of nieuwer nodig. Gebruik Raspberry Pi OS Bookworm of Trixie."

# --- 2. Bestanden -----------------------------------------------------------
SRC=""
if [[ -n "${BASH_SOURCE[0]:-}" && -f "$(dirname "${BASH_SOURCE[0]}")/dashboard/server.py" ]]; then
  SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi
if [[ -z "$SRC" ]]; then
  say "Dashboard downloaden van $REPO"
  apt_install git
  SRC="$(mktemp -d)"
  git clone -q --depth 1 "$REPO" "$SRC"
fi

if [[ "$SRC" != "$APP" ]]; then
  say "Bestanden kopiëren naar $APP"
  mkdir -p "$APP"
  rm -rf "$APP/dashboard.nieuw"
  cp -a "$SRC/dashboard" "$APP/dashboard.nieuw"
  # Eigen modules die niet in de nieuwe versie zitten bewaren
  if [[ -d "$APP/dashboard/modules" ]]; then
    for m in "$APP"/dashboard/modules/*/; do
      n="$(basename "$m")"
      [[ -e "$APP/dashboard.nieuw/modules/$n" ]] || cp -a "$m" "$APP/dashboard.nieuw/modules/"
    done
  fi
  rm -rf "$APP/dashboard"
  mv "$APP/dashboard.nieuw" "$APP/dashboard"
  rm -rf "$APP/kiosk"
  cp -a "$SRC/kiosk" "$APP/kiosk"
  cp "$SRC/install.sh" "$APP/install.sh"
fi
chmod +x "$APP/kiosk/start-kiosk.sh" "$APP/install.sh"

# --- 3. Gebruiker voor het scherm ------------------------------------------
if ! id "$KIOSK_USER" &>/dev/null; then
  say "Gebruiker '$KIOSK_USER' aanmaken"
  useradd --create-home --home-dir /var/lib/pi-dashboard --shell /bin/bash "$KIOSK_USER"
  passwd -l "$KIOSK_USER" >/dev/null
fi
for g in video render input audio; do
  getent group "$g" >/dev/null && usermod -aG "$g" "$KIOSK_USER"
done

# --- 4. Instellingen op de bootpartitie --------------------------------------
BOOT=/boot/firmware
[[ -d "$BOOT" ]] || BOOT=/boot
if [[ ! -f "$BOOT/dashboard.toml" ]]; then
  say "Voorbeeldinstellingen neerzetten in $BOOT/dashboard.toml"
  cp "$APP/dashboard/dashboard.example.toml" "$BOOT/dashboard.toml"
fi

# --- 5. Services ------------------------------------------------------------
say "Automatisch starten bij opstarten instellen"
install -m 644 "$APP"/kiosk/*.service /etc/systemd/system/
systemctl enable pi-dashboard.service pi-dashboard-kiosk.service
systemctl set-default graphical.target

if [[ $MODE == normaal ]]; then
  systemctl daemon-reload
  systemctl restart pi-dashboard.service
  systemctl restart pi-dashboard-kiosk.service || true
  IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  echo
  say "Klaar! Het dashboard verschijnt nu op het scherm."
  echo "    Instellingen:  sudo nano $BOOT/dashboard.toml"
  echo "    Logboek:       journalctl -u pi-dashboard -f"
  [[ -n "$IP" ]] && echo "    Deze Pi:       $IP"
fi
