/* ui/shell.js — the rail, the KPI strip, and which page is showing.

   The strip across the top is the same on every page, and it is the four
   numbers this operation runs on: what the food menu costs as a % of what
   it sells for, the same for the bar, what's sitting in inventory, and how
   much of it is below par. Each one opens the page that explains it. */

const Shell = (function () {
  const el = Core.el;

  const PAGES = {
    inventory: { label: "Inventory", icon: "inventory", accent: "var(--brand)", page: () => InventoryPage },
    food: { label: "Food", icon: "food", accent: "var(--food)", page: () => MenuPages.food },
    bar: { label: "Bar", icon: "bar", accent: "var(--bar)", page: () => MenuPages.bar },
    catering: { label: "Catering", icon: "catering", accent: "var(--food)", page: () => CateringPage },
    locations: { label: "Locations", icon: "locations", accent: "var(--brand)", page: () => LocationsPage },
  };

  function currentPage() {
    const h = (location.hash || "").replace(/^#\/?/, "");
    return PAGES[h] ? h : "inventory";
  }

  function go(name) {
    if (location.hash !== "#" + name) location.hash = name;
    else render();
  }

  function drawNav() {
    const nav = document.getElementById("nav");
    const cur = currentPage();
    const low = Store.inventoryTotals("all").short;
    nav.innerHTML = "";
    Object.entries(PAGES).forEach(([id, p], i) => {
      if (id === "locations") nav.append(el("div", { class: "nav-sep" }));
      nav.append(el("button", {
        type: "button",
        class: "nav-btn" + (cur === id ? " active" : ""),
        style: `--nav-accent:${p.accent}`,
        "aria-current": cur === id ? "page" : null,
        onclick: () => go(id),
      }, [
        W.icon(p.icon),
        el("span", { class: "nav-label" }, [p.label]),
        id === "inventory" && low ? el("span", { class: "nav-dot", title: `${low} below par` }, [String(low)]) : null,
      ]));
    });
  }

  function refreshKpis() {
    const box = document.getElementById("kpis");
    const f = Store.foodCost();
    const b = Store.barCost();
    const inv = Store.inventoryTotals("all");
    const food = Store.inventoryTotals("food");
    const bar = Store.inventoryTotals("bar");
    box.innerHTML = "";

    const kpi = (cls, label, value, sub, extra, onclick) => el("button", { type: "button", class: "kpi " + cls, onclick }, [
      el("div", { class: "kpi-top" }, [el("span", { class: "label" }, [label]), extra || null]),
      el("div", { class: "kpi-value" }, [value]),
      el("div", { class: "kpi-sub" }, [sub]),
    ]);
    const vsTarget = (s) => {
      if (!s.priced) return "No priced items";
      const d = s.pct - s.target;
      return `target ${Store.pct(s.target)} · ${Math.abs(d) < 0.05 ? "on target" : d > 0 ? d.toFixed(1) + " over" : (-d).toFixed(1) + " under"}`;
    };
    const tonePill = (s) => {
      const t = Store.costTone(s.pct, s.target);
      return t ? el("span", { class: "pill plain " + t }, [t === "good" ? "On target" : t === "warn" ? "Watch" : "High"]) : null;
    };

    box.append(
      kpi("accent-food", "Food cost", f.priced ? Store.pct(f.pct) : "—", vsTarget(f), tonePill(f), () => go("food")),
      kpi("accent-bar", "Bar cost", b.priced ? Store.pct(b.pct) : "—", vsTarget(b), tonePill(b), () => go("bar")),
      kpi("accent-house", "Inventory", Store.money0(inv.value), `${Store.money0(food.value)} food · ${Store.money0(bar.value)} bar`, null, () => { InventoryPage.showMaster(); go("inventory"); }),
      kpi("accent-house", "Below par", String(inv.short), inv.short ? `${inv.out} out · ${inv.low} low` : "Everything at par",
        inv.short ? el("span", { class: "pill plain " + (inv.out ? "bad" : "warn") }, [inv.out ? "Reorder" : "Watch"]) : el("span", { class: "pill plain good" }, ["Stocked"]),
        () => { InventoryPage.showLow(); go("inventory"); })
    );
    drawNav();
  }

  function render() {
    const page = document.getElementById("page");
    PAGES[currentPage()].page().render(page);
    refreshKpis();
  }

  function drawClock() {
    const foot = document.getElementById("side-foot");
    const now = new Date();
    foot.innerHTML = "";
    foot.append(
      el("div", { class: "side-clock" }, [now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })]),
      el("div", { class: "side-date" }, [now.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })])
    );
  }

  Core.ready(function () {
    Brand.apply();
    Core.init();
    window.addEventListener("hashchange", () => { render(); window.scrollTo({ top: 0 }); });
    drawClock();
    setInterval(drawClock, 30000);
    render();
  });

  return { render, refreshKpis, go };
})();
