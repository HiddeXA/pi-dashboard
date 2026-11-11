/* Pi Dashboard - kern.
 *
 * Laadt de modules uit dashboard.toml en geeft ze een kleine API:
 *   Dashboard.addPage({ id, title, icon, render(el) })   eigen pagina in het menu
 *   Dashboard.addBar(render(el))                          balk onderaan (bijv. 'nu speelt')
 *   Dashboard.watch({ ids: [...], domains: [...] })       welke HA-entiteiten je wilt volgen
 *   Dashboard.onStates(fn(states))                        wordt aangeroepen bij elke update
 *   Dashboard.call(domain, service, data)                 Home Assistant-service aanroepen
 *   Dashboard.config(moduleId)                            instellingen van een module
 *
 * Een module begint met Dashboard.module("naam", (ctx) => { ... }).
 * ctx.config = de [naam]-sectie uit dashboard.toml (zonder tokens),
 * ctx.api(pad, body?) = eigen backend-route /api/m/<naam>/<pad>.
 *   Dashboard.h(tag, props, ...children)                  klein hulpje om HTML te maken
 *   Dashboard.icon(naam)                                  ingebouwde SVG-iconen
 *   Dashboard.show(pageId), Dashboard.toast(tekst), Dashboard.imageUrl(haPad)
 */
(() => {
  "use strict";

  const ICONS = {
    play: "M8 5v14l11-7z",
    pause: "M6 19h4V5H6v14zm8-14v14h4V5h-4z",
    next: "M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z",
    prev: "M6 6h2v12H6zm3.5 6l8.5 6V6z",
    shuffle: "M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z",
    volume: "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z",
    bulb: "M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z",
    power: "M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.58-5.42L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z",
    up: "M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z",
    down: "M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z",
    stop: "M6 6h12v12H6z",
    plus: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
    minus: "M19 13H5v-2h14v2z",
    thermo: "M15 13V5c0-1.66-1.34-3-3-3S9 3.34 9 5v8c-1.21.91-2 2.37-2 4 0 2.76 2.24 5 5 5s5-2.24 5-5c0-1.63-.79-3.09-2-4zm-4-8c0-.55.45-1 1-1s1 .45 1 1h-1v1h1v2h-1v1h1v2h-2V5z",
    scene: "M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z",
    music: "M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z",
    speaker: "M17 2H7c-1.1 0-2 .9-2 2v16c0 1.1.9 1.99 2 1.99L17 22c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-5 2c1.1 0 2 .9 2 2s-.9 2-2 2c-1.11 0-2-.9-2-2s.89-2 2-2zm0 16c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z",
    home: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
    info: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z",
    lock: "M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z",
    blinds: "M20 19V3H4v16H2v2h20v-2h-2zM16 9h2v2h-2V9zm-2 2H6V9h8v2zm4-4h-2V5h2v2zm-4-2v2H6V5h8zM6 19v-6h8v1.82c-.45.32-.75.84-.75 1.43 0 .97.78 1.75 1.75 1.75s1.75-.78 1.75-1.75c0-.59-.3-1.12-.75-1.43V13h2v6H6z",
    chip: "M15 9H9v6h6V9zm-2 4h-2v-2h2v2zm8-2V9h-2V7c0-1.1-.9-2-2-2h-2V3h-2v2h-2V3H9v2H7c-1.1 0-2 .9-2 2v2H3v2h2v2H3v2h2v2c0 1.1.9 2 2 2h2v2h2v-2h2v2h2v-2h2c1.1 0 2-.9 2-2v-2h2v-2h-2v-2h2zm-4 6H7V7h10v10z",
    refresh: "M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z",
  };

  const S = {
    config: null,
    states: {},
    ids: new Set(),
    domains: new Set(),
    pages: [],
    listeners: [],
    currentModule: null,
    timer: null,
    online: true,
  };

  const $ = (id) => document.getElementById(id);

  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  function icon(name) {
    const path = ICONS[name];
    if (!path) return document.createTextNode(name || "");
    const span = document.createElement("span");
    span.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
    return span.firstChild;
  }

  let toastTimer;
  function toast(text) {
    const t = $("toast");
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 3000);
  }

  async function request(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.fout || `Fout ${res.status}`);
    return data;
  }

  async function call(domain, service, data) {
    try {
      await request("POST", `/api/service/${domain}/${service}`, data || {});
      setTimeout(poll, 350);
    } catch (e) {
      toast(e.message);
      throw e;
    }
  }

  // ---- pagina's ----
  function addPage(page) {
    const id = page.id || `${S.currentModule}-${S.pages.length}`;
    const el = h("div", { class: "page", hidden: true, "data-page": id });
    $("pages").append(el);
    const btn = h("button", { class: "nav-btn", onclick: () => show(id) },
      h("span", { class: "nav-icon" }, icon(page.icon || "home")),
      h("span", {}, page.title || id));
    $("nav").append(btn);
    S.pages.push({ id, title: page.title || id, el, btn });
    try { page.render(el); } catch (e) { console.error(e); el.append(h("p", { class: "empty" }, "Deze pagina kon niet laden.")); }
    if (S.pages.length === 1) show(id);
    return id;
  }

  function show(id) {
    document.body.dataset.page = id;
    for (const p of S.pages) {
      const active = p.id === id;
      p.el.hidden = !active;
      p.btn.classList.toggle("active", active);
      if (active) $("page-title").textContent = p.title;
    }
  }

  function addBar(render) {
    const el = h("div", { class: "bar" });
    $("bars").append(el);
    render(el);
  }

  function watch({ ids = [], domains = [] } = {}) {
    ids.forEach((i) => S.ids.add(i));
    domains.forEach((d) => S.domains.add(d));
  }

  function onStates(fn) {
    S.listeners.push(fn);
    if (Object.keys(S.states).length) fn(S.states);
  }

  // ---- status ophalen ----
  async function poll() {
    if (!S.ids.size && !S.domains.size) return;
    const q = new URLSearchParams({ ids: [...S.ids].join(","), domains: [...S.domains].join(",") });
    try {
      S.states = await request("GET", `/api/states?${q}`);
      setOnline(true);
      for (const fn of S.listeners) {
        try { fn(S.states); } catch (e) { console.error(e); }
      }
    } catch (e) {
      setOnline(false, e.message);
    }
  }

  function setOnline(ok, message) {
    S.online = ok;
    $("status-dot").classList.toggle("offline", !ok);
    const b = $("banner");
    b.hidden = ok;
    if (!ok) b.textContent = message || "Geen verbinding";
  }

  // ---- klok ----
  function tick() {
    const now = new Date();
    $("clock-time").textContent = now.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
    $("clock-date").textContent = now.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
  }

  // ---- installatiescherm ----
  function showSetup(cfg) {
    $("page-title").textContent = "Bijna klaar";
    $("pages").replaceChildren(h("div", { class: "page" },
      h("div", { class: "setup card" },
        h("h2", {}, "Koppel je Home Assistant"),
        h("p", { class: "why" }, cfg.probleem),
        h("ol", {},
          h("li", {}, "Maak in Home Assistant een token: klik op je profiel → ", h("b", {}, "Beveiliging"), " → ", h("b", {}, "Langlevende toegangstokens"), " → Token aanmaken."),
          h("li", {}, "Open ", h("code", {}, cfg.config_pad), ". Op je pc is dat het bestand ", h("code", {}, "dashboard.toml"), " op de SD-kaart (partitie ", h("i", {}, "bootfs"), ")."),
          h("li", {}, "Vul de url van Home Assistant en je token in en sla op."),
          h("li", {}, "Zet de SD-kaart terug. Via SSH gewijzigd? Dan laadt dit scherm vanzelf opnieuw.")))));
    setTimeout(() => location.reload(), 10000);
  }

  function loadModule(mod) {
    return new Promise((resolve) => {
      if (mod.style) document.head.append(h("link", { rel: "stylesheet", href: mod.style }));
      const s = h("script", { src: mod.script });
      s.onload = resolve;
      s.onerror = () => { toast(`Module ${mod.id} kon niet laden`); resolve(); };
      S.currentModule = mod.id;
      document.body.append(s);
    });
  }

  // Modules registreren zich met Dashboard.module(id, setup). Zo weet de kern
  // welke instellingen bij welke module horen, ook als scripts async laden.
  const pendingSetups = [];
  function module(id, setup) { pendingSetups.push({ id, setup }); }

  async function start() {
    tick();
    setInterval(tick, 1000);
    let cfg;
    try {
      cfg = await request("GET", "/api/config");
    } catch (e) {
      setOnline(false, "Dashboard-server niet bereikbaar, opnieuw proberen…");
      return setTimeout(start, 3000);
    }
    S.config = cfg;
    document.title = cfg.titel;
    document.body.classList.toggle("no-cursor", cfg.verberg_cursor !== false);
    if (cfg.probleem) return showSetup(cfg);

    for (const mod of cfg.modules) await loadModule(mod);
    for (const { id, setup } of pendingSetups) {
      S.currentModule = id;
      const ctx = {
        id,
        config: (S.config.modules.find((m) => m.id === id) || {}).config || {},
        api: (path, body) => request(body ? "POST" : "GET", `/api/m/${id}/${path}`, body),
      };
      try { setup(ctx); } catch (e) { console.error(e); toast(`Module ${id}: ${e.message}`); }
    }
    if (!S.pages.length) $("pages").append(h("p", { class: "empty page" }, "Geen modules ingeschakeld in dashboard.toml."));
    await poll();
    S.timer = setInterval(poll, Math.max(1, Number(cfg.ververs_seconden) || 2) * 1000);
  }

  window.Dashboard = {
    h, icon, toast, call, addPage, addBar, watch, onStates, show, module,
    config:(id) => (S.config.modules.find((m) => m.id === id) || {}).config || {},
    imageUrl: (p) => (!p ? "" : /^https?:/.test(p) ? p : `/api/image?pad=${encodeURIComponent(p)}`),
    get states() { return S.states; },
  };

  start();
})();
