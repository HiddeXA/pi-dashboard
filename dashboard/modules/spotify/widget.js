/* Spotify-module. Bedient Spotify via de Spotify-integratie van Home Assistant
 * (een media_player-entiteit), dus er is geen aparte Spotify-login nodig.
 * Werkt ook met andere mediaspelers in HA (Sonos, Chromecast, ...). */
Dashboard.module("spotify", (ctx) => {
  const { h, icon, call } = Dashboard;
  const cfg = ctx.config;
  let entity = cfg.entiteit || null;
  let st = null;

  if (entity) Dashboard.watch({ ids: [entity] });
  else Dashboard.watch({ domains: ["media_player"] }); // eerste media_player.spotify_* zoeken

  const svc = (service, data = {}) => entity && call("media_player", service, { entity_id: entity, ...data }).catch(() => {});

  // ---------- onderbalk ----------
  const bar = {};
  Dashboard.addBar((el) => {
    el.classList.add("sp-bar");
    bar.art = h("div", { class: "sp-art sp-art-sm" });
    bar.title = h("div", { class: "sp-title" }, "Spotify");
    bar.artist = h("div", { class: "sp-artist" }, "");
    bar.play = h("button", { class: "sp-btn sp-play", onclick: () => svc("media_play_pause") }, icon("play"));
    el.append(
      h("button", { class: "sp-bar-info", onclick: () => Dashboard.show("spotify") }, bar.art, h("div", { class: "sp-text" }, bar.title, bar.artist)),
      h("div", { class: "sp-controls" },
        h("button", { class: "sp-btn", onclick: () => svc("media_previous_track") }, icon("prev")),
        bar.play,
        h("button", { class: "sp-btn", onclick: () => svc("media_next_track") }, icon("next"))));
  });

  // ---------- muziekpagina ----------
  const P = {};
  Dashboard.addPage({
    id: "spotify", title: cfg.titel || "Muziek", icon: "music",
    render(el) {
      P.art = h("div", { class: "sp-art sp-art-lg" });
      P.title = h("div", { class: "sp-big-title" }, "Niets aan het afspelen");
      P.artist = h("div", { class: "sp-artist" }, "");
      P.fill = h("div", { class: "sp-progress-fill" });
      P.pos = h("span", {}, "0:00");
      P.dur = h("span", {}, "0:00");
      P.play = h("button", { class: "sp-btn sp-play sp-play-lg", onclick: () => svc("media_play_pause") }, icon("play"));
      P.shuffle = h("button", { class: "sp-btn", onclick: () => svc("shuffle_set", { shuffle: !st?.attributes?.shuffle }) }, icon("shuffle"));
      P.volume = h("input", { class: "sp-volume", type: "range", min: 0, max: 100 });
      P.volume.addEventListener("change", () => svc("volume_set", { volume_level: Number(P.volume.value) / 100 }));
      P.sources = h("div", { class: "sp-chips" });
      P.favs = h("div", { class: "sp-favs" });

      el.append(h("div", { class: "sp-page" },
        h("div", { class: "sp-now" },
          P.art,
          h("div", { class: "sp-meta" },
            P.title, P.artist,
            h("div", { class: "sp-progress" }, P.fill),
            h("div", { class: "sp-times" }, P.pos, P.dur),
            h("div", { class: "sp-controls sp-controls-lg" },
              P.shuffle,
              h("button", { class: "sp-btn", onclick: () => svc("media_previous_track") }, icon("prev")),
              P.play,
              h("button", { class: "sp-btn", onclick: () => svc("media_next_track") }, icon("next"))),
            h("div", { class: "sp-vol-row" }, icon("volume"), P.volume))),
        h("h3", { class: "sp-h" }, "Afspelen op"), P.sources,
        (cfg.favoriet || []).length ? h("h3", { class: "sp-h" }, "Favorieten") : null, P.favs));

      for (const f of cfg.favoriet || []) {
        P.favs.append(h("button", { class: "sp-fav card", onclick: () => playFavorite(f) },
          h("span", { class: "sp-fav-icon" }, icon("music")), h("span", {}, f.naam || f.uri)));
      }
    },
  });

  async function playFavorite(f) {
    if (!entity) return Dashboard.toast("Geen Spotify-speler gevonden in Home Assistant");
    const idle = !st || ["off", "idle", "unavailable"].includes(st.state);
    const device = f.apparaat || cfg.standaard_apparaat;
    try {
      if (idle && device) await call("media_player", "select_source", { entity_id: entity, source: device });
      await call("media_player", "play_media", {
        entity_id: entity, media_content_id: f.uri,
        media_content_type: f.uri.includes(":track:") ? "music" : "playlist",
      });
      Dashboard.toast(`▶ ${f.naam || "Afspelen"}`);
    } catch { /* foutmelding is al getoond */ }
  }

  // ---------- updates ----------
  Dashboard.onStates((states) => {
    if (!entity) {
      entity = Object.keys(states).find((id) => id.startsWith("media_player.spotify")) || null;
      if (entity) Dashboard.watch({ ids: [entity] });
    }
    st = entity ? states[entity] : null;
    render();
  });
  setInterval(renderProgress, 1000);

  function render() {
    const a = st?.attributes || {};
    const playing = st?.state === "playing";
    const hasMedia = !!a.media_title;
    const title = hasMedia ? a.media_title : entity ? "Niets aan het afspelen" : "Spotify niet gevonden";
    const artist = hasMedia ? [a.media_artist, a.media_album_name].filter(Boolean).join(" · ") : entity ? "Kies een favoriet of start Spotify op een apparaat" : "Voeg de Spotify-integratie toe in Home Assistant";

    bar.title.textContent = hasMedia ? a.media_title : "Spotify";
    bar.artist.textContent = hasMedia ? a.media_artist || "" : say(st?.state);
    setArt(bar.art, a.entity_picture);
    bar.play.replaceChildren(icon(playing ? "pause" : "play"));

    if (!P.title) return;
    P.title.textContent = title;
    P.artist.textContent = artist;
    setArt(P.art, a.entity_picture);
    P.play.replaceChildren(icon(playing ? "pause" : "play"));
    P.shuffle.classList.toggle("active", !!a.shuffle);
    if (a.volume_level != null && document.activeElement !== P.volume) P.volume.value = Math.round(a.volume_level * 100);
    renderSources(a.source_list || [], a.source);
    renderProgress();
  }

  let sourceKey = "";
  function renderSources(list, current) {
    const key = list.join("|") + "#" + current;
    if (key === sourceKey) return;
    sourceKey = key;
    P.sources.replaceChildren(...(list.length ? list : ["Geen apparaten gevonden"]).map((name) =>
      list.length
        ? h("button", { class: `sp-chip${name === current ? " active" : ""}`, onclick: () => svc("select_source", { source: name }) }, icon("speaker"), name)
        : h("span", { class: "sp-muted" }, name)));
  }

  function renderProgress() {
    if (!P.fill) return;
    const a = st?.attributes || {};
    const dur = a.media_duration || 0;
    let pos = a.media_position || 0;
    if (st?.state === "playing" && a.media_position_updated_at) {
      pos += (Date.now() - Date.parse(a.media_position_updated_at)) / 1000;
    }
    pos = Math.min(pos, dur);
    P.fill.style.width = dur ? `${(pos / dur) * 100}%` : "0";
    P.pos.textContent = fmt(pos);
    P.dur.textContent = fmt(dur);
  }

  let artCache = new WeakMap();
  function setArt(el, picture) {
    const url = Dashboard.imageUrl(picture);
    if (artCache.get(el) === url) return;
    artCache.set(el, url);
    el.style.backgroundImage = url ? `url("${url}")` : "";
    el.replaceChildren(url ? "" : icon("music"));
  }

  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const say = (s) => ({ playing: "Speelt", paused: "Gepauzeerd", idle: "Inactief", off: "Uit", unavailable: "Niet beschikbaar" })[s] || "";
});
