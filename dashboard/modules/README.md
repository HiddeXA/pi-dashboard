# Eigen modules maken

Elke map hier is een module. Zet de naam van de map in `modules = [...]` in
`dashboard.toml` en hij verschijnt in het menu.

```
modules/
  mijnmodule/
    widget.js     verplicht: de interface
    widget.css    optioneel: opmaak
    backend.py    optioneel: Python-code op de Pi (bestanden lezen, commando's, externe API's)
```

## widget.js

```js
Dashboard.module("mijnmodule", (ctx) => {
  const { h, icon, call } = Dashboard;

  // Instellingen uit [mijnmodule] in dashboard.toml (tokens worden weggefilterd)
  const cfg = ctx.config;

  // Home Assistant-entiteiten volgen
  Dashboard.watch({ ids: ["sensor.buiten_temperatuur"] });

  let waarde;
  Dashboard.addPage({
    title: "Mijn pagina",
    icon: "info",                 // ingebouwd icoon of een emoji
    render(el) {
      waarde = h("div", { class: "card" }, "…");
      el.append(waarde,
        h("button", { onclick: () => call("light", "toggle", { entity_id: "light.gang" }) }, "Gang"));
    },
  });

  Dashboard.onStates((states) => {
    waarde.textContent = states["sensor.buiten_temperatuur"]?.state;
  });
});
```

Handige functies: `Dashboard.addBar(el => ...)` voor een balk onderaan,
`Dashboard.show(pageId)`, `Dashboard.toast("tekst")` en `ctx.api("pad", body)`
om je eigen backend aan te roepen.

## backend.py

```python
def hallo(body, query):
    return {"bericht": "hallo vanaf de Pi"}

def setup(ctx):
    ctx.route("GET", "hallo", hallo)   # wordt /api/m/mijnmodule/hallo
```

`ctx.config` is je sectie uit `dashboard.toml`, `ctx.ha.call(domain, service, data)`
en `ctx.ha.states()` praten met Home Assistant. Alleen de standaardbibliotheek
van Python is beschikbaar, tenzij je zelf pakketten installeert.

De module **systeem** is een compleet werkend voorbeeld met een backend.

Na het toevoegen van een backend.py: `sudo systemctl restart pi-dashboard`.
