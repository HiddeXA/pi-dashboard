# Pi Dashboard

Een licht touchscreen-dashboard voor de Raspberry Pi. Je bedient er je
Home Assistant-apparaten en Spotify mee, en je breidt het uit met eigen modules.

- **Licht:** Python-server zonder extra pakketten en één Chromium-venster in
  kioskmodus. Draait op een Pi 3 en een Zero 2 W.
- **Veilig:** je Home Assistant-token blijft op de server en komt niet in de browser.
  Standaard kan alleen het scherm van de Pi het dashboard openen.
- **Makkelijk in te stellen:** alles staat in één bestand, `dashboard.toml`, op de
  SD-kaart. Dat bewerk je gewoon op je pc.

## Installeren: kies één van twee manieren

### A. Kant-en-klaar image (geen installatie op de Pi)

1. Elke wijziging aan de app op `main` bouwt automatisch een nieuw image. Je kunt
   ook zelf een build starten via **Actions → Image bouwen → Run workflow**.
2. Na ongeveer 30-60 minuten staat er onder de build een `pi-dashboard-image`
   klaar om te downloaden. Pusht je een tag als `v1.0`, dan komt het image ook
   bij **Releases**.
3. Open **Raspberry Pi Imager**, kies *Use custom* en selecteer het image. Stel
   onder *OS-aanpassingen* je gebruiker, wachtwoord en wifi in, en zet SSH aan.
4. Schrijf het image naar de SD-kaart. Laat de kaart er nog in zitten: open
   `dashboard.toml` op de partitie **bootfs** en vul je Home Assistant-url
   en -token in.
5. Stop de kaart in de Pi en zet hem aan. Na de eerste opstart verschijnt het dashboard.

Wil je je wifi en wachtwoord al in het image hebben? Zet dan de secrets
`PI_PASSWORD`, `WIFI_NAAM` en `WIFI_WACHTWOORD` in de repository. Deel zo'n
image dan niet met anderen.

### B. Eén commando op een bestaande Pi

Zet eerst **Raspberry Pi OS Lite** (Bookworm of nieuwer) op de kaart met
Raspberry Pi Imager. Zet daarbij wifi en SSH aan. Daarna, via SSH:

```bash
curl -fsSL https://raw.githubusercontent.com/HiddeXA/pi-dashboard/main/install.sh | sudo bash
```

Zonder internet kopieer je de map naar de Pi en voer je `sudo bash install.sh` uit.

Hetzelfde commando nog een keer uitvoeren werkt de app bij. Je instellingen en
eigen modules blijven staan.

## Instellen

Alle instellingen staan in `dashboard.toml`. Op je pc vind je dat bestand op de
partitie *bootfs*, op de Pi zelf in `/boot/firmware/dashboard.toml`. Het
voorbeeldbestand legt alles uit. In het kort:

- **Token:** maak die in Home Assistant aan via je profiel → Beveiliging →
  Langlevende toegangstokens.
- **Pagina's:** met `[[homeassistant.pagina]]` kies je welke apparaten je per
  pagina ziet. Laat je ze weg, dan maakt het dashboard zelf pagina's voor
  lampen, schakelaars en scènes.
- **Spotify:** voeg in Home Assistant de Spotify-integratie toe. Het dashboard
  vindt de speler dan vanzelf. Favoriete afspeellijsten zet je onder
  `[[spotify.favoriet]]`. Voor bediening via de Spotify-integratie heb je
  Spotify Premium nodig.

Wat het dashboard kan bedienen:

| Soort | Wat je ermee kunt |
|---|---|
| Lampen | Aan/uit, dimmen; de tegel neemt de kleur van de lamp over |
| Schakelaars, ventilatoren, input_boolean | Aan/uit |
| Scènes, scripts, knoppen | Tik om te starten |
| Thermostaat | Temperatuur hoger/lager |
| Rolluiken | Open, stop, dicht |
| Sensoren, sloten, personen | Alleen tonen |
| Spotify | Afspelen/pauzeren, volgende/vorige, volume, shuffle, apparaat kiezen, favorieten |

## Uitbreiden

Elke map in `dashboard/modules/` is een module. In
[`dashboard/modules/README.md`](dashboard/modules/README.md) staat hoe je er
zelf een maakt. De module `systeem` is een compleet werkend voorbeeld, inclusief
Python-backend.

## Testen op je pc

```bash
python3 tools/mock_ha.py &                                        # nep-Home Assistant
DASHBOARD_CONFIG=tools/test.toml python3 dashboard/server.py      # dashboard
```

Open daarna http://127.0.0.1:8080 in je browser. Zet het venster op 800×480
voor dezelfde weergave als op het officiële 7"-scherm.

## Handig om te weten

| Wat | Commando |
|---|---|
| Logboek bekijken | `journalctl -u pi-dashboard -f` |
| Server herstarten | `sudo systemctl restart pi-dashboard` |
| Scherm herstarten | `sudo systemctl restart pi-dashboard-kiosk` |
| Kiosk tijdelijk uit | `sudo systemctl stop pi-dashboard-kiosk` |

- **Scherm ondersteboven?** Voeg aan het einde van `cmdline.txt` op de
  bootpartitie dit toe: ` video=DSI-1:800x480@60,rotate=180`.
- **Ook bedienen via je telefoon?** Zet `luister = "0.0.0.0"` en open
  `http://<ip-van-de-pi>:8080`. Iedereen op je wifi kan dan je apparaten bedienen.
- Op een Zero 2 W duurt het na het opstarten zo'n 30-60 seconden voordat het
  dashboard zichtbaar is.

## Hoe het in elkaar zit

```
dashboard/server.py            Python-server: webpagina + doorgeefluik naar Home Assistant
dashboard/web/                 kern van de interface (menu, klok, module-API)
dashboard/modules/<naam>/      modules: widget.js, widget.css, backend.py
kiosk/                         systemd-services en het startscript voor Chromium
install.sh                     installeren/bijwerken op de Pi
image/stage-dashboard/         extra pi-gen-stap om het image te bouwen
.github/workflows/             bouwt het image op GitHub
```
