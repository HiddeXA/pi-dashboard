/* Home Assistant-module: tegels voor lampen, schakelaars, scènes, klimaat,
 * rolluiken en sensoren. Pagina's komen uit [[homeassistant.pagina]] in
 * dashboard.toml. Zonder pagina's maakt de module er zelf een paar. */
Dashboard.module("homeassistant", (ctx) => {
  const { h, icon, call } = Dashboard;

  const AUTO_PAGES = [
    { naam: "Lampen", icoon: "bulb", domeinen: ["light"] },
    { naam: "Schakelaars", icoon: "power", domeinen: ["switch", "input_boolean", "fan"] },
    { naam: "Scènes", icoon: "scene", domeinen: ["scene", "script"] },
  ];

  const TOGGLE = new Set(["light", "switch", "input_boolean", "fan", "automation", "siren", "humidifier"]);
  const ACTIVATE = { scene: ["scene", "turn_on"], script: ["script", "turn_on"], button: ["button", "press"], input_button: ["input_button", "press"] };
  const ICON_FOR = { light: "bulb", switch: "power", input_boolean: "power", fan: "power", automation: "refresh", scene: "scene", script: "scene", button: "scene", climate: "thermo", cover: "blinds", media_player: "music", lock: "lock", sensor: "info", binary_sensor: "info" };
  const WORDS = {
    on: "Aan", off: "Uit", open: "Open", closed: "Dicht", opening: "Gaat open", closing: "Gaat dicht",
    unavailable: "Niet beschikbaar", unknown: "Onbekend", playing: "Speelt", paused: "Gepauzeerd",
    idle: "Inactief", standby: "Stand-by", locked: "Op slot", unlocked: "Niet op slot",
    home: "Thuis", not_home: "Weg", heat: "Verwarmen", cool: "Koelen", auto: "Automatisch", heat_cool: "Automatisch",
  };
  const say = (s) => WORDS[s] ?? s;
  const domainOf = (eid) => eid.split(".")[0];

  // [[homeassistant.pagina]] entiteiten mogen "light.x" of { entiteit = "light.x", naam = "Bank" } zijn
  const normalize = (e) => (typeof e === "string" ? { id: e } : { id: e.entiteit || e.id, naam: e.naam, icoon: e.icoon });

  const pages = (ctx.config.pagina || []).map((p) => ({
    naam: p.naam || "Pagina", icoon: p.icoon || "home", items: (p.entiteiten || []).map(normalize).filter((e) => e.id),
  }));

  const tiles = new Map(); // entity_id -> [update functions]
  const addTile = (eid, fn) => { if (!tiles.has(eid)) tiles.set(eid, []); tiles.get(eid).push(fn); };

  if (pages.length) {
    Dashboard.watch({ ids: pages.flatMap((p) => p.items.map((i) => i.id)) });
    for (const p of pages) {
      Dashboard.addPage({
        title: p.naam, icon: p.icoon,
        render(el) {
          const grid = h("div", { class: "grid" });
          p.items.forEach((item) => grid.append(makeTile(item)));
          el.append(grid);
        },
      });
    }
  } else {
    Dashboard.watch({ domains: AUTO_PAGES.flatMap((p) => p.domeinen) });
    for (const p of AUTO_PAGES) {
      let grid;
      Dashboard.addPage({
        title: p.naam, icon: p.icoon,
        render(el) {
          grid = h("div", { class: "grid" });
          el.append(grid, h("p", { class: "empty ha-hint" }, "Tip: kies zelf welke apparaten je ziet met [[homeassistant.pagina]] in dashboard.toml."));
        },
      });
      // Tegels aanmaken zodra we weten welke entiteiten er zijn
      const seen = new Set();
      Dashboard.onStates((states) => {
        const ids = Object.keys(states).filter((id) => p.domeinen.includes(domainOf(id)) && !seen.has(id)).sort();
        for (const id of ids) { seen.add(id); grid.append(makeTile({ id })); }
        if (ids.length) render(states);
      });
    }
  }

  Dashboard.onStates(render);

  function render(states) {
    for (const [eid, fns] of tiles) fns.forEach((fn) => fn(states[eid]));
  }

  // ------------------------------------------------------------------
  function makeTile(item) {
    const domain = domainOf(item.id);
    const nameEl = h("div", { class: "ha-name" }, item.naam || item.id);
    const stateEl = h("div", { class: "ha-state" }, "…");
    const iconEl = h("div", { class: "ha-icon" }, icon(item.icoon || ICON_FOR[domain] || "info"));
    const tile = h("div", { class: `ha-tile card ha-${domain}` }, h("div", { class: "ha-top" }, iconEl), nameEl, stateEl);
    let last = null;

    const setName = (st) => { if (!item.naam && st?.attributes?.friendly_name) nameEl.textContent = st.attributes.friendly_name; };
    const flash = () => { tile.classList.remove("ha-flash"); void tile.offsetWidth; tile.classList.add("ha-flash"); };

    // Lampen, schakelaars en andere aan/uit-apparaten
    if (TOGGLE.has(domain) || domain === "media_player") {
      let slider = null;
      tile.addEventListener("click", (ev) => {
        if (ev.target.closest(".ha-slider") || !last || last.state === "unavailable") return;
        if (domain === "media_player") return call("media_player", "media_play_pause", { entity_id: item.id });
        const on = last.state === "on";
        last = { ...last, state: on ? "off" : "on" }; // meteen tonen, HA bevestigt bij de volgende update
        update(last);
        call("homeassistant", on ? "turn_off" : "turn_on", { entity_id: item.id }).catch(() => {});
      });
      const update = (st) => {
        last = st || last;
        if (!st) return markMissing();
        setName(st);
        const on = st.state === "on" || st.state === "playing";
        tile.classList.toggle("on", on);
        tile.classList.toggle("unavailable", st.state === "unavailable");
        const bri = st.attributes.brightness;
        stateEl.textContent = on && bri != null ? `${Math.round((bri / 255) * 100)}%` : say(st.state);
        if (domain === "media_player" && st.attributes.media_title) stateEl.textContent = st.attributes.media_title;
        // Kleur van de lamp gebruiken als accent
        const rgb = st.attributes.rgb_color;
        tile.style.setProperty("--tile-accent", on && rgb ? `rgb(${rgb.join(",")})` : "");
        if (domain === "light" && dimmable(st)) {
          if (!slider) {
            slider = h("input", { class: "ha-slider", type: "range", min: 1, max: 100 });
            slider.addEventListener("change", () => call("light", "turn_on", { entity_id: item.id, brightness_pct: Number(slider.value) }).catch(() => {}));
            tile.append(slider);
          }
          if (document.activeElement !== slider) slider.value = bri ? Math.round((bri / 255) * 100) : 0;
        }
      };
      addTile(item.id, update);
      return tile;
    }

    // Scènes, scripts en knoppen: één tik = uitvoeren
    if (ACTIVATE[domain]) {
      tile.classList.add("ha-action");
      tile.addEventListener("click", () => { flash(); call(...ACTIVATE[domain], { entity_id: item.id }).catch(() => {}); });
      addTile(item.id, (st) => {
        if (!st) return markMissing();
        setName(st);
        stateEl.textContent = domain === "script" && st.state === "on" ? "Bezig…" : "Tik om te starten";
      });
      return tile;
    }

    // Thermostaat
    if (domain === "climate") {
      let target = null, timer = null;
      const targetEl = h("span", { class: "ha-target" }, "–");
      const step = (d) => {
        if (target == null) return;
        target = Math.round((target + d) * 10) / 10;
        targetEl.textContent = `${target}°`;
        clearTimeout(timer);
        timer = setTimeout(() => call("climate", "set_temperature", { entity_id: item.id, temperature: target }).catch(() => {}), 900);
      };
      tile.append(h("div", { class: "ha-climate-row" },
        h("button", { class: "ha-round", onclick: () => step(-(last?.attributes?.target_temp_step || 0.5)) }, icon("minus")),
        targetEl,
        h("button", { class: "ha-round", onclick: () => step(last?.attributes?.target_temp_step || 0.5) }, icon("plus"))));
      addTile(item.id, (st) => {
        last = st || last;
        if (!st) return markMissing();
        setName(st);
        const cur = st.attributes.current_temperature;
        stateEl.textContent = `${say(st.state)}${cur != null ? ` · nu ${cur}°` : ""}`;
        tile.classList.toggle("on", st.state !== "off");
        if (!timer && st.attributes.temperature != null) { target = st.attributes.temperature; targetEl.textContent = `${target}°`; }
        if (timer && st.attributes.temperature === target) timer = null;
      });
      return tile;
    }

    // Rolluiken, gordijnen, garagedeuren
    if (domain === "cover") {
      const btn = (name, svc) => h("button", { class: "ha-round", onclick: () => call("cover", svc, { entity_id: item.id }).catch(() => {}) }, icon(name));
      tile.append(h("div", { class: "ha-cover-row" }, btn("up", "open_cover"), btn("stop", "stop_cover"), btn("down", "close_cover")));
      addTile(item.id, (st) => {
        if (!st) return markMissing();
        setName(st);
        const pos = st.attributes.current_position;
        stateEl.textContent = say(st.state) + (pos != null ? ` · ${pos}%` : "");
        tile.classList.toggle("on", st.state === "open");
      });
      return tile;
    }

    // Al het andere (sensoren, sloten, personen): alleen tonen
    tile.classList.add("ha-readonly");
    addTile(item.id, (st) => {
      if (!st) return markMissing();
      setName(st);
      const unit = st.attributes.unit_of_measurement;
      stateEl.textContent = unit ? `${st.state} ${unit}` : say(st.state);
      if (domain === "sensor" && unit) tile.classList.add("ha-big");
    });
    return tile;

    function markMissing() {
      tile.classList.add("unavailable");
      stateEl.textContent = "Niet gevonden";
    }
  }

  function dimmable(st) {
    const modes = st.attributes.supported_color_modes;
    if (Array.isArray(modes)) return modes.some((m) => m !== "onoff");
    return st.attributes.brightness != null;
  }
});
