/* shell.js — the house layer: the section bar and the front page.

   The front page never reaches into a tool's state. Each tool exposes a
   summary() of its own numbers, and that is the only thing this file reads,
   so a tool can change how it stores anything without breaking this page. */

(function () {
  const el = Core.el;
  const MODULES = ["dashboard", "catering", "bar", "fleet", "agent"];

  function showModule(name) {
    MODULES.forEach((m) => {
      const node = document.getElementById("mod-" + m);
      if (node) node.classList.toggle("active", m === name);
    });
    document.querySelectorAll(".section-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.module === name);
    });
    if (name === "dashboard") renderDashboard();
    if (name === "agent") AgentApp.focusInput();
    window.scrollTo({ top: 0 });
  }

  function renderClock() {
    const now = new Date();
    const node = document.getElementById("house-clock");
    node.innerHTML = "";
    node.append(
      el("strong", {}, [now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })]),
      el("span", {}, [now.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })])
    );
  }

  function money(n) {
    return (Number(n) || 0).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  }
  function pct(n) { return (Number(n) || 0).toFixed(1) + "%"; }

  function statCard(label, value, sub) {
    return el("div", { class: "stat-card" }, [
      el("div", { class: "label" }, [label]),
      el("div", { class: "value" }, [String(value)]),
      sub ? el("div", { class: "muted small-note" }, [sub]) : null,
    ]);
  }

  // A tool card wears its tool's own colour. Reading it off that module's
  // wrapper rather than repeating a hex here keeps css/brand.css the only
  // place any colour in this app is stated.
  function moduleAccent(name) {
    const node = document.getElementById("mod-" + name);
    if (!node) return "var(--brand)";
    const v = getComputedStyle(node).getPropertyValue("--brand").trim();
    return v || "var(--brand)";
  }

  function toolCard(opts) {
    return el("button", { class: "tool-card", style: `--card-accent:${moduleAccent(opts.module)}`, onclick: () => showModule(opts.module) }, [
      el("div", { class: "tool-card-head" }, [
        el("span", { class: "mark" }, [opts.mark]),
        el("div", {}, [el("h3", {}, [opts.title]), el("div", { class: "sub" }, [opts.sub])]),
      ]),
      el("div", { class: "tool-metrics" }, opts.metrics.map((m) =>
        el("div", { class: "tool-metric" }, [
          el("div", { class: "label" }, [m[0]]),
          el("div", { class: "value" }, [String(m[1])]),
        ])
      )),
      el("div", { class: "open-link" }, ["Open " + opts.title + " →"]),
    ]);
  }

  // Everything worth flagging before the first boat leaves, from all three
  // tools, in one list. Ordered the way a morning actually goes: what has to
  // be thrown out, what has to be cooked, what has to be driven to a boat,
  // and only then what has to be ordered.
  function alertsCard(cat, bar, fleet) {
    const rows = [];

    if (cat.expiredBatches) {
      rows.push(["Kitchen", `${cat.expiredPortions} prepared portions are past date in ${cat.expiredBatches} batch(es) — pull them`, "bad"]);
    }
    cat.expiringSoon.slice(0, 4).forEach((b) => {
      rows.push(["Kitchen", `${b.name} — ${b.portions} portions, ${b.daysLeft <= 0 ? "use today" : "one day left"}`, "warn"]);
    });
    cat.toProduce.slice(0, 5).forEach((p) => {
      rows.push(["Kitchen", `Still to produce: ${p.portions} × ${p.name}`, "warn"]);
    });
    cat.eightySixed.slice(0, 4).forEach((n) => {
      rows.push(["Kitchen", `86 — ${n} can't be served anywhere in the fleet`, "bad"]);
    });
    bar.eightySixed.slice(0, 5).forEach((n) => {
      rows.push(["Bar", `86 — ${n}`, "bad"]);
    });
    if (fleet.inTransit) {
      rows.push(["Fleet", `${fleet.inTransit} transfer(s) in transit — still counted at the origin until received`, "warn"]);
    }
    if (fleet.drafts) {
      rows.push(["Fleet", `${fleet.drafts} draft transfer(s) not loaded yet`, "warn"]);
    }
    if (cat.belowPar.length) {
      rows.push(["Kitchen", `${cat.belowPar.length} below par: ${cat.belowPar.slice(0, 4).join(", ")}${cat.belowPar.length > 4 ? "…" : ""}`, "warn"]);
    }
    if (bar.belowPar.length) {
      rows.push(["Bar", `${bar.belowPar.length} below par: ${bar.belowPar.slice(0, 4).join(", ")}${bar.belowPar.length > 4 ? "…" : ""}`, "warn"]);
    }

    const card = el("div", { class: "card" }, [
      el("div", { class: "card-head-row" }, [
        el("h3", {}, ["Needs Attention"]),
        el("span", { class: "muted small-note" }, ["Pulled live from all three tools"]),
      ]),
    ]);
    if (!rows.length) {
      card.append(el("div", { class: "empty-state" }, [
        "Nothing flagged — every batch is in date, everything booked is made, nothing is in transit, and every location is at par.",
      ]));
      return card;
    }
    const list = el("ul", { class: "alert-list" });
    rows.forEach(([where, what, tone]) => {
      list.append(el("li", {}, [
        el("span", { class: "where" }, [where]),
        el("span", { class: "what" }, [what]),
        el("span", { class: "pill " + tone }, [tone === "bad" ? "Act now" : "Watch"]),
      ]));
    });
    card.append(list);
    return card;
  }

  function renderDashboard() {
    const panel = document.getElementById("mod-dashboard");
    const cat = CateringApp.summary();
    const bar = BarApp.summary();
    const fleet = FleetApp.summary();

    panel.innerHTML = "";
    panel.append(el("div", { class: "hero" }, [
      el("h2", {}, [Brand.heroTitle]),
      el("p", { class: "sub" }, [
        `Everything below is live from the three tools behind this page — what the kitchen has made, what every bar is carrying, and where all of it is sitting across ${fleet.vessels} boats and ${fleet.locations} locations.`,
      ]),
    ]));

    panel.append(el("div", { class: "grid grid-4" }, [
      statCard("Master Inventory", money(fleet.totalValue), `${money(fleet.ashoreValue)} ashore · ${money(fleet.afloatValue)} afloat`),
      statCard("Prepared On Hand", cat.preparedPortions + " portions", money(cat.preparedValue) + " of food made ahead"),
      statCard("In Motion", fleet.pendingTransfers, fleet.pendingTransfers ? `${fleet.inTransit} in transit · ${fleet.drafts} draft` : "Nothing moving"),
      statCard("Short Somewhere", cat.belowPar.length + bar.belowPar.length, `${cat.belowPar.length} kitchen · ${bar.belowPar.length} bar`),
    ]));

    panel.append(el("div", { class: "tool-grid" }, [
      toolCard({
        module: "catering", mark: Brand.marks.catering, title: "Catering",
        sub: "Costs, prepared food, orders",
        metrics: [
          ["Dishes", cat.dishes],
          ["Avg Food Cost", cat.avgFoodCostPct ? pct(cat.avgFoodCostPct) : "—"],
          ["Prepared", cat.preparedPortions],
          ["Orders", cat.orders],
        ],
      }),
      toolCard({
        module: "bar", mark: Brand.marks.bar, title: "Bar",
        sub: `Pour costs across ${bar.bars} bars`,
        metrics: [
          ["Drinks", bar.drinks],
          ["Avg Pour Cost", bar.avgPourCostPct ? pct(bar.avgPourCostPct) : "—"],
          ["86'd", bar.eightySixed.length],
          ["Inventory", money(bar.inventoryValue)],
        ],
      }),
      toolCard({
        module: "fleet", mark: Brand.marks.fleet, title: "Fleet",
        sub: "Locations, transfers, master roll-up",
        metrics: [
          ["Boats", fleet.vessels],
          ["Locations", fleet.locations],
          ["Afloat", money(fleet.afloatValue)],
          ["Transfers", fleet.pendingTransfers],
        ],
      }),
    ]));

    panel.append(alertsCard(cat, bar, fleet));

    // Where everything is, and what is coming out of the kitchen next — the
    // two reads a three-boat operation can't get from any single tab.
    const two = el("div", { class: "two-col" });

    const locCard = el("div", { class: "card" }, [
      el("div", { class: "card-head-row" }, [
        el("h3", {}, ["Stock By Location"]),
        el("button", { class: "btn btn-sm", onclick: () => { showModule("fleet"); FleetApp.switchTab("master"); } }, ["Master view"]),
      ]),
    ]);
    const locList = el("ul", { class: "breakdown-list" });
    fleet.byLocation
      .slice()
      .sort((a, b) => b.total - a.total)
      .forEach((l) => {
        locList.append(el("li", {}, [
          el("span", {}, [l.name, l.vessel ? el("span", { class: "muted small-note" }, [" · " + l.vessel]) : null]),
          el("span", {}, [money(l.total)]),
        ]));
      });
    locCard.append(locList);
    two.append(locCard);

    const nextCard = el("div", { class: "card" }, [
      el("div", { class: "card-head-row" }, [
        el("h3", {}, ["Next Out The Door"]),
        el("button", { class: "btn btn-sm", onclick: () => { showModule("catering"); CateringApp.switchTab("orders"); } }, ["All orders"]),
      ]),
    ]);
    if (!cat.upcomingOrders.length) {
      nextCard.append(el("div", { class: "empty-state" }, ["No orders on the books."]));
    } else {
      const ul = el("ul", { class: "breakdown-list" });
      cat.upcomingOrders.forEach((o) => {
        ul.append(el("li", {}, [
          el("span", {}, [
            o.name,
            el("span", { class: "muted small-note" }, [` · ${o.serviceType} · ${o.guests} guests`]),
          ]),
          el("span", { class: "pill " + (o.status === "confirmed" ? "good" : "") }, [o.status]),
        ]));
      });
      nextCard.append(ul);
    }
    two.append(nextCard);
    panel.append(two);
  }

  Core.ready(function () {
    Brand.apply();
    Core.init();

    document.getElementById("section-tabs").addEventListener("click", (e) => {
      const btn = e.target.closest(".section-btn");
      if (btn) showModule(btn.dataset.module);
    });

    CateringApp.init();
    BarApp.init();
    FleetApp.init();
    AgentApp.init();

    renderClock();
    setInterval(renderClock, 30000);

    renderDashboard();
  });
})();
