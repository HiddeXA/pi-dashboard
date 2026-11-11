/* Systeem-module: toont temperatuur, geheugen en IP-adres van de Pi.
 * Gebruik dit bestand als startpunt voor je eigen modules. */
Dashboard.module("systeem", (ctx) => {
  const { h, icon } = Dashboard;
  const fields = {};

  const tile = (key, label) => {
    fields[key] = h("div", { class: "sys-value" }, "…");
    return h("div", { class: "card sys-tile" }, h("div", { class: "sys-label" }, label), fields[key]);
  };

  Dashboard.addPage({
    id: "systeem",
    title: "Systeem",
    icon: "chip",
    render(el) {
      el.append(
        h("div", { class: "grid" },
          tile("temperatuur", "Processor"),
          tile("geheugen", "Geheugen vrij"),
          tile("ip", "IP-adres"),
          tile("aan", "Aan sinds")),
        h("div", { class: "sys-actions" },
          h("button", { class: "sys-btn", onclick: () => location.reload() }, icon("refresh"), "Scherm vernieuwen"),
          h("button", { class: "sys-btn", onclick: () => ctx.api("browser-herstart", {}) }, icon("power"), "Browser herstarten")));
    },
  });

  async function refresh() {
    try {
      const d = await ctx.api("info");
      fields.temperatuur.textContent = d.temperatuur != null ? `${d.temperatuur} °C` : "–";
      fields.geheugen.textContent = `${d.geheugen_vrij_mb} / ${d.geheugen_totaal_mb} MB`;
      fields.ip.textContent = d.ip;
      fields.aan.textContent = d.aan_sinds_uur < 24 ? `${d.aan_sinds_uur} uur` : `${Math.round(d.aan_sinds_uur / 24)} dagen`;
    } catch { /* niet kritiek */ }
  }
  refresh();
  setInterval(refresh, (ctx.config.ververs_seconden || 10) * 1000);
});
