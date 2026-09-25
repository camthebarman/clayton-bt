/* ui/catering.js — the catering calculator.

   An event is a guest count and a menu. From those two things this page
   works out, live as you type:

     the numbers   portions per dish, what it costs, what it brings in, and
                   the food cost % of the whole event;
     the pull list which fridge to grab each ingredient from. It doesn't
                   matter which kitchen is "yours" — if the kitchen has the
                   chicken and the commissary doesn't, you're sent to the
                   kitchen, and only when no single place has enough is it
                   split;
     the shopping  whatever no fridge has, in whole packs, with the bill.

   "Deduct from inventory" takes exactly what the pull list says out of
   exactly those places, and remembers what it took so it can be put back.
   No transfers, no tickets to receive. */

const CateringPage = (function () {
  const el = Core.el;
  const C = Store.C;
  let host = null;

  const STATUSES = [
    { id: "quoted", label: "Quoted" },
    { id: "confirmed", label: "Confirmed" },
    { id: "completed", label: "Completed" },
    { id: "cancelled", label: "Cancelled" },
  ];

  // refreshers for the rows that have inputs in them, so typing a guest
  // count updates every derived number without rebuilding the input.
  let liveRows = [];

  function events() { return Store.food.orders; }

  function sortedEvents() {
    const today = C.todayISO();
    const upcoming = events().filter((e) => !e.date || e.date >= today)
      .sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999")));
    const past = events().filter((e) => e.date && e.date < today)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return upcoming.concat(past);
  }

  function active() {
    const id = Store.uiGet("cater.active", null);
    const ev = id && Store.event(id);
    if (ev) return ev;
    const first = sortedEvents()[0] || null;
    if (first) Store.uiSet("cater.active", first.id);
    return first;
  }

  // ---------- the math ----------
  function linePortions(ev, ln) { return C.orderPortions(ev.guestCount, ln.portionsPerGuest, ln.overagePct); }
  function supplyQty(ev, s) { return Math.ceil((Number(ev.guestCount) || 0) * (Number(s.qtyPerGuest) || 0)); }

  function requirements(ev) {
    const lists = (ev.lines || []).map((ln) => {
      const r = Store.dish(ln.recipeId);
      return r ? C.portionRequirements(r, linePortions(ev, ln), Store.foodIng) : [];
    });
    (ev.supplies || []).forEach((s) => {
      const ing = Store.foodIng(s.ingredientId);
      if (!ing) return;
      const qty = supplyQty(ev, s);
      lists.push([{ ingredient: ing, usableQty: qty, asPurchasedQty: qty / C.yieldFactor(ing), cost: C.componentCost(ing, qty) }]);
    });
    // You can't grab 26.1 eggs. Anything counted by the each rounds up.
    return C.aggregateRequirements(lists)
      .map((r) => (r.ingredient.baseUnit === "each" ? { ...r, asPurchasedQty: Math.ceil(r.asPurchasedQty - 1e-9) } : r))
      .filter((r) => r.asPurchasedQty > 0);
  }

  function totals(ev) {
    let foodCost = 0;
    let menuRevenue = 0;
    let portions = 0;
    (ev.lines || []).forEach((ln) => {
      const r = Store.dish(ln.recipeId);
      if (!r) return;
      const p = linePortions(ev, ln);
      portions += p;
      foodCost += Store.dishCost(r) * p;
      menuRevenue += (Number(r.menuPrice) || 0) * p;
    });
    let supplyCost = 0;
    (ev.supplies || []).forEach((s) => {
      const ing = Store.foodIng(s.ingredientId);
      if (ing) supplyCost += C.componentCost(ing, supplyQty(ev, s));
    });
    const guests = Number(ev.guestCount) || 0;
    const totalCost = foodCost + supplyCost;
    const revenue = ev.pricingMode === "perGuest" ? (Number(ev.pricePerGuest) || 0) * guests
      : ev.pricingMode === "menu" ? menuRevenue : 0;
    return {
      portions, foodCost, supplyCost, totalCost, revenue,
      profit: revenue - totalCost,
      costPct: revenue ? (totalCost / revenue) * 100 : 0,
      perGuest: guests ? totalCost / guests : 0,
    };
  }

  // Where an event may pull from: every food location ashore, plus the
  // place it's served and the rest of that boat. Another boat's galley is
  // never raided for this one. The serving location is tried first.
  function sourceLocations(ev) {
    const serve = FleetStorage.location(ev.locationId);
    const vesselId = serve ? serve.vesselId : null;
    return FleetStorage.foodLocations()
      .filter((l) => !l.vesselId || l.id === ev.locationId || (vesselId && l.vesselId === vesselId))
      .sort((a, b) => (b.id === ev.locationId) - (a.id === ev.locationId));
  }

  function livePlan(ev) {
    const locs = sourceLocations(ev);
    return requirements(ev).map((req) => {
      const ing = req.ingredient;
      const cands = locs.map((l) => ({ locId: l.id, have: C.onHandAt(ing, l.id), preferred: l.id === ev.locationId }));
      const p = C.planPull(req.asPurchasedQty, cands);
      const buy = C.packsFor(ing, p.short);
      return {
        ing, need: req.asPurchasedQty, cost: req.cost,
        have: cands.reduce((s, c) => s + c.have, 0),
        picks: p.picks, short: p.short, packs: buy.packs, buyCost: buy.cost,
      };
    }).sort((a, b) => a.ing.name.localeCompare(b.ing.name));
  }

  // After a pull, the list shown is what was actually taken — the counts
  // have moved, so recomputing would say "grab it from nowhere".
  function pulledPlan(ev) {
    const byId = new Map();
    const get = (id) => {
      if (!byId.has(id)) {
        const ing = Store.foodIng(id);
        if (!ing) return null;
        byId.set(id, { ing, need: 0, have: 0, picks: [], short: 0, packs: 0, buyCost: 0 });
      }
      return byId.get(id);
    };
    (ev.pull.moves || []).forEach((m) => {
      const row = get(m.itemId);
      if (!row) return;
      row.picks.push({ locId: m.locId, qty: m.qty });
      row.need += m.qty;
      row.have += m.qty;
    });
    (ev.pull.short || []).forEach((s) => {
      const row = get(s.itemId);
      if (!row) return;
      row.short += s.qty;
      row.need += s.qty;
      const buy = C.packsFor(row.ing, row.short);
      row.packs = buy.packs;
      row.buyCost = buy.cost;
    });
    return Array.from(byId.values()).sort((a, b) => a.ing.name.localeCompare(b.ing.name));
  }

  function plan(ev) { return ev.pull ? pulledPlan(ev) : livePlan(ev); }

  // What the event needs right now, rounded, so a pull can tell whether the
  // event was edited after it.
  function signature(ev) {
    return requirements(ev).map((r) => `${r.ingredient.id}:${Math.round(r.asPurchasedQty * 100)}`).sort().join("|");
  }

  // ---------- deduct / undo ----------
  function deduct(ev) {
    const p = livePlan(ev);
    const moves = [];
    p.forEach((row) => row.picks.forEach((pk) => { if (pk.qty > 0) moves.push({ itemId: row.ing.id, locId: pk.locId, qty: pk.qty }); }));
    if (!moves.length) { Core.toast("Nothing in stock to pull for this event."); return; }
    const places = new Set(moves.map((m) => m.locId)).size;
    if (!confirm(`Deduct ${p.filter((r) => r.picks.length).length} items from ${places} location${places === 1 ? "" : "s"}?\n\nYou can undo this.`)) return;
    moves.forEach((m) => {
      const ing = Store.foodIng(m.itemId);
      C.setQtyAt(ing.onHand, m.locId, Math.max(0, C.onHandAt(ing, m.locId) - m.qty));
    });
    ev.pull = {
      on: new Date().toISOString(),
      moves,
      short: p.filter((r) => r.short > 0).map((r) => ({ itemId: r.ing.id, qty: r.short })),
      signature: signature(ev),
    };
    if (ev.status === "quoted") ev.status = "confirmed";
    Store.saveFood();
    Core.toast("Deducted from inventory.");
    render();
    Shell.refreshKpis();
  }

  function undoPull(ev) {
    if (!ev.pull) return;
    if (!confirm("Put everything this event pulled back where it came from?")) return;
    (ev.pull.moves || []).forEach((m) => {
      const ing = Store.foodIng(m.itemId);
      if (ing && FleetStorage.location(m.locId)) C.setQtyAt(ing.onHand, m.locId, C.onHandAt(ing, m.locId) + m.qty);
    });
    ev.pull = null;
    Store.saveFood();
    Core.toast("Stock returned to inventory.");
    render();
    Shell.refreshKpis();
  }

  // ---------- page ----------
  function render(target) {
    if (target) host = target;
    if (!host) return;
    host.innerHTML = "";
    host.className = "page accent-food";
    liveRows = [];

    host.append(W.pageHead(
      "Catering",
      "Set the guests and the menu. You get the cost, which fridge to grab everything from, and a shopping list for what isn't in stock.",
      [W.btn("New event", { icon: "plus", kind: "primary", onclick: newEvent })],
      "Events"
    ));

    const ev = active();
    const wrap = el("div", { class: "cater" });
    wrap.append(el("div", { class: "event-list", id: "cater-list" }));
    const detail = el("div", { id: "cater-detail" });
    wrap.append(detail);
    host.append(wrap);
    drawList();

    if (!ev) {
      detail.append(el("div", { class: "card" }, [W.empty("No events yet.", "Start one with New event.")]));
      return;
    }

    detail.append(headerCard(ev));
    detail.append(el("div", { class: "calc-kpis", id: "cater-kpis" }));
    detail.append(el("div", { class: "section" }, [menuCard(ev)]));
    detail.append(el("div", { class: "section" }, [suppliesCard(ev)]));
    detail.append(el("div", { class: "section", id: "cater-pull" }));
    detail.append(el("div", { class: "section", id: "cater-shop" }));
    update(ev, true);
  }

  // Everything that has no inputs in it is simply redrawn.
  function update(ev, skipSave) {
    if (!skipSave) Store.saveFood();
    liveRows.forEach((fn) => fn());
    drawKpis(ev);
    drawPull(ev);
    drawShop(ev);
    drawList();
  }

  function drawList() {
    const box = host && host.querySelector("#cater-list");
    if (!box) return;
    box.innerHTML = "";
    const cur = active();
    const today = C.todayISO();
    sortedEvents().forEach((ev) => {
      const d = W.dateParts(ev.date);
      box.append(el("button", {
        type: "button",
        class: "event-item" + (cur && cur.id === ev.id ? " active" : "") + (ev.date && ev.date < today ? " past" : ""),
        onclick: () => { Store.uiSet("cater.active", ev.id); render(); window.scrollTo({ top: 0 }); },
      }, [
        el("div", { class: "event-date" }, [el("div", { class: "m" }, [d.m]), el("div", { class: "d" }, [d.d])]),
        el("div", { style: "min-width:0" }, [
          el("div", { class: "event-name" }, [ev.name || "Untitled event"]),
          el("div", { class: "event-meta" }, [
            el("span", { class: "dot " + ev.status }),
            `${ev.guestCount || 0} guests`,
            ev.pull ? el("span", { class: "pulled" }, ["· pulled"]) : null,
          ]),
        ]),
      ]));
    });
  }

  function headerCard(ev) {
    const card = el("div", { class: "card card-pad" });
    const title = el("input", { type: "text", class: "event-title-input", value: ev.name, placeholder: "Event name", "aria-label": "Event name" });
    title.addEventListener("input", () => { ev.name = title.value; Store.saveFood(); drawList(); });

    card.append(el("div", { style: "display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap" }, [
      el("div", { style: "flex:1;min-width:240px" }, [title]),
      el("div", { class: "head-actions" }, [
        W.btn("Download event sheet", { icon: "download", iconOnly: true, kind: "ghost", onclick: () => downloadSheet(ev) }),
        W.btn("Duplicate", { icon: "duplicate", iconOnly: true, kind: "ghost", onclick: () => duplicate(ev) }),
        W.btn("Delete", { icon: "trash", iconOnly: true, kind: "ghost", cls: "btn-danger", onclick: () => remove(ev) }),
      ]),
    ]));

    const date = el("input", { type: "date", value: ev.date || "" });
    date.addEventListener("change", () => { ev.date = date.value; update(ev); });

    const guests = W.numInput(ev.guestCount, (v) => { ev.guestCount = Math.max(0, Math.round(Number(v) || 0)); update(ev); }, { step: "1", "aria-label": "Guests" });
    const step = (d) => { ev.guestCount = Math.max(0, (Number(ev.guestCount) || 0) + d); guests.value = ev.guestCount; update(ev); };
    const stepper = el("div", { class: "stepper" }, [
      el("button", { type: "button", "aria-label": "One fewer guest", onclick: (e) => step(e.shiftKey ? -10 : -1) }, ["−"]),
      guests,
      el("button", { type: "button", "aria-label": "One more guest", onclick: (e) => step(e.shiftKey ? 10 : 1) }, ["+"]),
    ]);

    const locOptions = [{ id: "", label: "Anywhere — nearest stock" }, ...Store.locationGroups("food").map((g) => ({
      group: g.name, options: g.locations.map((l) => ({ id: l.id, label: l.name })),
    }))];
    const served = W.select(locOptions, ev.locationId || "", (v) => {
      ev.locationId = v || null;
      const l = FleetStorage.location(ev.locationId);
      ev.vesselId = l ? l.vesselId : null;
      update(ev);
    });

    const priceField = el("div");
    const price = W.numInput(ev.pricePerGuest || "", (v) => { ev.pricePerGuest = Number(v) || 0; update(ev); }, { step: "0.5" });
    const pricing = W.select([
      { id: "perGuest", label: "Per guest" },
      { id: "menu", label: "Menu prices" },
      { id: "included", label: "No charge" },
    ], ev.pricingMode, (v) => { ev.pricingMode = v; priceField.hidden = v !== "perGuest"; update(ev); });
    priceField.append(W.field("$ / guest", price));
    priceField.hidden = ev.pricingMode !== "perGuest";

    const status = W.select(STATUSES, ev.status, (v) => { ev.status = v; update(ev); });

    card.append(el("div", { class: "event-fields" }, [
      W.field("Date", date),
      W.field("Guests", stepper),
      W.field("Served at", served),
      W.field("Pricing", pricing),
      priceField,
      W.field("Status", status),
    ]));

    const notes = el("input", { type: "text", value: ev.notes || "", placeholder: "Notes — allergies, timing, anything the crew needs" });
    notes.addEventListener("input", () => { ev.notes = notes.value; Store.saveFood(); });
    card.append(el("div", { style: "margin-top:12px" }, [notes]));

    const serve = FleetStorage.location(ev.locationId);
    const v = serve && FleetStorage.vessel(serve.vesselId);
    if (v && Number(ev.guestCount) > Number(v.capacity)) {
      card.append(el("div", { class: "callout bad", style: "margin-top:12px" }, [W.icon("alert"), `${ev.guestCount} guests is over ${v.name}'s capacity of ${v.capacity}.`]));
    }
    return card;
  }

  function drawKpis(ev) {
    const box = host.querySelector("#cater-kpis");
    if (!box) return;
    const t = totals(ev);
    box.innerHTML = "";
    const target = Store.foodTarget();
    box.append(
      W.stat("Portions", String(t.portions), `${(ev.lines || []).length} dishes`),
      W.stat("Cost", Store.money0(t.totalCost), `${Store.money0(t.foodCost)} food · ${Store.money0(t.supplyCost)} supplies`),
      W.stat("Per guest", Store.money(t.perGuest), "food + supplies"),
      W.stat("Revenue", t.revenue ? Store.money0(t.revenue) : "—", ev.pricingMode === "menu" ? "at menu prices" : ev.pricingMode === "included" ? "no charge" : `${Store.money(ev.pricePerGuest)} × ${ev.guestCount || 0}`),
      W.stat("Food cost", t.revenue ? Store.pct(t.costPct) : "—", `target ${Store.pct(target)}`, { accent: true, meter: t.revenue ? W.meter(t.costPct, target) : null }),
      W.stat("Profit", t.revenue ? Store.money0(t.profit) : "—", t.revenue ? `${Store.pct(100 - t.costPct)} margin` : "")
    );
  }

  // ---------- menu ----------
  function menuCard(ev) {
    const card = el("div", { class: "card" });
    card.append(el("div", { class: "card-head" }, [
      el("div", {}, [el("h3", {}, ["Menu"]), el("div", { class: "sub" }, ["Per guest × guests, plus overage, rounded up."])]),
    ]));
    if ((ev.lines || []).length) {
      const body = el("tbody");
      ev.lines.forEach((ln, idx) => {
        const r = Store.dish(ln.recipeId);
        if (!r) return;
        const portions = el("td", { class: "num mono" });
        const cost = el("td", { class: "num mono" });
        liveRows.push(() => {
          const p = linePortions(ev, ln);
          portions.textContent = String(p);
          cost.textContent = Store.money(Store.dishCost(r) * p);
        });
        body.append(el("tr", {}, [
          el("td", {}, [el("div", { class: "item-name" }, [r.name]), el("div", { class: "item-sub" }, [`${r.menu} · ${Store.money(Store.dishCost(r))} / portion`])]),
          el("td", { class: "num" }, [W.numInput(ln.portionsPerGuest, (v) => { ln.portionsPerGuest = Number(v) || 0; update(ev); }, { class: "cell-input sm", step: "0.05", "data-col": "per", "aria-label": `${r.name} per guest` })]),
          el("td", { class: "num" }, [W.numInput(ln.overagePct, (v) => { ln.overagePct = Number(v) || 0; update(ev); }, { class: "cell-input sm", step: "1", "data-col": "over", "aria-label": `${r.name} overage %` })]),
          portions,
          cost,
          el("td", {}, [el("div", { class: "row-actions" }, [W.btn("Remove", { sm: true, kind: "ghost", icon: "x", iconOnly: true, onclick: () => { ev.lines.splice(idx, 1); Store.saveFood(); render(); } })])]),
        ]));
      });
      const table = el("table", { class: "data" }, [
        el("thead", {}, [el("tr", {}, [
          el("th", {}, ["Dish"]),
          el("th", { class: "num" }, ["Per guest"]),
          el("th", { class: "num" }, ["Overage %"]),
          el("th", { class: "num" }, ["Portions"]),
          el("th", { class: "num" }, ["Cost"]),
          el("th", {}, [""]),
        ])]),
        body,
      ]);
      W.enterMovesDown(table);
      card.append(el("div", { class: "table-wrap" }, [table]));
    } else {
      card.append(W.empty("No dishes yet.", "Pick one below to start costing."));
    }

    const byMenu = new Map();
    Store.food.recipes.forEach((r) => {
      const m = r.menu || "Other";
      if (!byMenu.has(m)) byMenu.set(m, []);
      byMenu.get(m).push({ id: r.id, label: `${r.name} — ${Store.money(Store.dishCost(r))}` });
    });
    const picker = W.select([{ id: "", label: "+ Add a dish…" }, ...Array.from(byMenu.entries()).map(([group, options]) => ({ group, options }))], "", (id) => {
      if (!id) return;
      ev.lines.push({ id: C.uid("ln"), recipeId: id, portionsPerGuest: 1, overagePct: Number(Store.food.settings.defaultOveragePct) || 0 });
      Store.saveFood();
      render();
    });
    card.append(el("div", { class: "add-row" }, [picker]));
    return card;
  }

  // ---------- supplies ----------
  function suppliesCard(ev) {
    const card = el("div", { class: "card" });
    card.append(el("div", { class: "card-head" }, [
      el("div", {}, [el("h3", {}, ["Supplies"]), el("div", { class: "sub" }, ["Boxes, cutlery, napkins, fuel — per guest."])]),
    ]));
    if ((ev.supplies || []).length) {
      const body = el("tbody");
      ev.supplies.forEach((s, idx) => {
        const ing = Store.foodIng(s.ingredientId);
        if (!ing) return;
        const total = el("td", { class: "num mono" });
        const cost = el("td", { class: "num mono" });
        liveRows.push(() => {
          const q = supplyQty(ev, s);
          total.textContent = C.fmtBaseQty(ing, q);
          cost.textContent = Store.money(C.componentCost(ing, q));
        });
        body.append(el("tr", {}, [
          el("td", {}, [el("div", { class: "item-name" }, [ing.name])]),
          el("td", { class: "num" }, [W.numInput(s.qtyPerGuest, (v) => { s.qtyPerGuest = Number(v) || 0; update(ev); }, { class: "cell-input sm", step: "0.05", "data-col": "sup", "aria-label": `${ing.name} per guest` })]),
          total,
          cost,
          el("td", {}, [el("div", { class: "row-actions" }, [W.btn("Remove", { sm: true, kind: "ghost", icon: "x", iconOnly: true, onclick: () => { ev.supplies.splice(idx, 1); Store.saveFood(); render(); } })])]),
        ]));
      });
      const table = el("table", { class: "data" }, [
        el("thead", {}, [el("tr", {}, [
          el("th", {}, ["Item"]),
          el("th", { class: "num" }, ["Per guest"]),
          el("th", { class: "num" }, ["Total"]),
          el("th", { class: "num" }, ["Cost"]),
          el("th", {}, [""]),
        ])]),
        body,
      ]);
      W.enterMovesDown(table);
      card.append(el("div", { class: "table-wrap" }, [table]));
    }

    const byCat = new Map();
    Store.food.ingredients.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((i) => {
      const cat = i.category || "Other";
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat).push({ id: i.id, label: i.name });
    });
    const groups = Array.from(byCat.entries())
      .sort((a, b) => (b[0] === "Packaging") - (a[0] === "Packaging") || a[0].localeCompare(b[0]))
      .map(([group, options]) => ({ group, options }));
    card.append(el("div", { class: "add-row" }, [W.select([{ id: "", label: "+ Add a supply…" }, ...groups], "", (id) => {
      if (!id) return;
      ev.supplies.push({ id: C.uid("sup"), ingredientId: id, qtyPerGuest: 1 });
      Store.saveFood();
      render();
    })]));
    return card;
  }

  // ---------- pull list ----------
  function drawPull(ev) {
    const box = host.querySelector("#cater-pull");
    if (!box) return;
    box.innerHTML = "";
    const rows = plan(ev);
    const card = el("div", { class: "card" });
    box.append(card);

    const pulled = !!ev.pull;
    const anything = rows.some((r) => r.picks.length);
    card.append(el("div", { class: "card-head" }, [
      el("div", {}, [
        el("h3", {}, [pulled ? "Pulled from inventory" : "Grab from"]),
        el("div", { class: "sub" }, [pulled
          ? `Deducted ${new Date(ev.pull.on).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`
          : ev.locationId ? `Tries ${FleetStorage.locationShort(ev.locationId)} first, then whichever fridge ashore can cover it in one trip.` : "Whichever fridge can cover each item in one trip. Split only when nobody has enough."]),
      ]),
      pulled
        ? W.btn("Undo pull", { icon: "undo", onclick: () => undoPull(ev) })
        : W.btn("Deduct from inventory", { icon: "check", kind: "primary", disabled: !anything, onclick: () => deduct(ev) }),
    ]));

    if (pulled && ev.pull.signature && ev.pull.signature !== signature(ev)) {
      card.append(el("div", { style: "padding:12px 18px 0" }, [el("div", { class: "callout warn" }, [
        W.icon("alert"),
        el("span", { class: "grow" }, ["The menu or guest count changed after this was pulled. Undo and deduct again to match."]),
      ])]));
    }

    if (!rows.length) {
      card.append(W.empty("Nothing to pull.", "Add dishes or supplies and the list builds itself."));
      return;
    }

    // Grouped by place, the way it's actually walked.
    const byLoc = new Map();
    rows.forEach((r) => r.picks.forEach((pk) => {
      if (!byLoc.has(pk.locId)) byLoc.set(pk.locId, []);
      byLoc.get(pk.locId).push({ r, qty: pk.qty, split: r.picks.length > 1 });
    }));

    if (!byLoc.size) {
      card.append(el("div", { style: "padding:16px 18px" }, [el("div", { class: "callout bad" }, [W.icon("alert"), "None of this is in stock anywhere it can be pulled from — it's all on the shopping list."])]));
      return;
    }

    const order = sourceLocations(ev).map((l) => l.id).filter((id) => byLoc.has(id));
    byLoc.forEach((_, id) => { if (!order.includes(id)) order.push(id); });
    const grid = el("div", { class: "pull-grid" });
    order.forEach((locId) => {
      const loc = FleetStorage.location(locId);
      const items = byLoc.get(locId).sort((a, b) => a.r.ing.name.localeCompare(b.r.ing.name));
      grid.append(el("div", { class: "pull-card" }, [
        el("div", { class: "pull-card-head" }, [
          W.icon(loc && loc.kind === "kitchen" ? "kitchen" : loc && loc.kind === "storage" ? "storage" : "fridge"),
          el("div", {}, [el("strong", {}, [loc ? loc.name : "Removed location"]), el("div", { class: "where" }, [loc ? Store.locationWhere(loc) : ""])]),
          el("span", { class: "n" }, [`${items.length} item${items.length === 1 ? "" : "s"}`]),
        ]),
        el("ul", {}, items.map((it) => el("li", {}, [
          el("span", {}, [it.r.ing.name, it.split ? el("span", { class: "split" }, ["split"]) : null]),
          el("span", { class: "q" }, [
            C.fmtBaseQty(it.r.ing, it.qty),
            !pulled && loc ? el("span", { class: "of" }, ["of " + C.fmtBaseQty(it.r.ing, C.onHandAt(it.r.ing, locId))]) : null,
          ]),
        ]))),
      ]));
    });
    card.append(grid);
  }

  // ---------- shopping list ----------
  function shoppingText(ev, rows) {
    const short = rows.filter((r) => r.short > 0);
    const total = short.reduce((s, r) => s + r.buyCost, 0);
    return [
      `SHOPPING — ${(ev.name || "Event").toUpperCase()}`,
      `${ev.date || ""} · ${ev.guestCount} guests`,
      "",
      ...short.map((r) => `[ ] ${r.ing.name} — ${r.packs} × ${packLabel(r.ing)} (short ${C.fmtBaseQty(r.ing, r.short)}) ${Store.money(r.buyCost)}`),
      "",
      `Total ${Store.money(total)}`,
    ].join("\n");
  }
  function packLabel(ing) { return Store.packLabel(C, ing); }

  function drawShop(ev) {
    const box = host.querySelector("#cater-shop");
    if (!box) return;
    box.innerHTML = "";
    const rows = plan(ev);
    const short = rows.filter((r) => r.short > 0);
    const total = short.reduce((s, r) => s + r.buyCost, 0);
    const card = el("div", { class: "card" });
    box.append(card);
    card.append(el("div", { class: "card-head" }, [
      el("div", {}, [
        el("h3", {}, ["Shopping list"]),
        el("div", { class: "sub" }, [short.length ? `${short.length} item${short.length === 1 ? "" : "s"} not in stock · ${Store.money(total)} in whole packs` : "Covered by what's on hand."]),
      ]),
      short.length ? el("div", { class: "head-actions" }, [
        W.btn("Copy", { sm: true, icon: "copy", onclick: () => Core.copyText(shoppingText(ev, rows)).then((ok) => Core.toast(ok ? "Copied." : "Couldn't reach the clipboard — use Download.")) }),
        W.btn("Download", { sm: true, icon: "download", onclick: () => Core.downloadText(shoppingText(ev, rows), slug(ev) + "-shopping.txt") }),
      ]) : null,
    ]));

    if (!short.length) {
      card.append(el("div", { style: "padding:16px 18px" }, [el("div", { class: "callout good" }, [W.icon("check"), rows.length ? "Everything this event needs is already in a fridge." : "Nothing on the menu yet."])]));
      return;
    }
    card.append(el("div", { class: "table-wrap" }, [el("table", { class: "data" }, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, ["Item"]),
        el("th", { class: "num" }, ["Need"]),
        el("th", { class: "num" }, [ev.pull ? "Pulled" : "In stock"]),
        el("th", { class: "num" }, ["Short"]),
        el("th", { class: "num" }, ["Buy"]),
        el("th", { class: "num" }, ["Cost"]),
      ])]),
      el("tbody", {}, short.map((r) => el("tr", { class: r.have <= 0 ? "row-bad" : "row-warn" }, [
        el("td", {}, [el("div", { class: "item-name" }, [r.ing.name]), el("div", { class: "item-sub" }, [r.ing.category])]),
        el("td", { class: "num mono" }, [C.fmtBaseQty(r.ing, r.need)]),
        el("td", { class: "num mono muted" }, [C.fmtBaseQty(r.ing, Math.min(r.have, r.need))]),
        el("td", { class: "num mono" }, [C.fmtBaseQty(r.ing, r.short)]),
        el("td", { class: "num mono" }, [r.packs ? `${r.packs} × ${packLabel(r.ing)}` : "—"]),
        el("td", { class: "num mono" }, [r.buyCost ? Store.money(r.buyCost) : "—"]),
      ]))),
      el("tfoot", {}, [el("tr", {}, [el("td", { colspan: 5 }, ["Total"]), el("td", { class: "num mono" }, [Store.money(total)])])]),
    ])]));
  }

  // ---------- event actions ----------
  function slug(ev) { return (ev.name || "event").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase(); }

  function newEvent() {
    const ev = {
      id: C.uid("cord"), name: "", date: C.todayISO(), serviceType: "Catering", recurring: "",
      status: "quoted", vesselId: null, locationId: null, guestCount: 20,
      pricingMode: "perGuest", pricePerGuest: 0, notes: "", lines: [], supplies: [], pull: null,
    };
    events().push(ev);
    Store.uiSet("cater.active", ev.id);
    Store.saveFood();
    render();
    const t = host.querySelector(".event-title-input");
    if (t) t.focus();
  }

  function duplicate(ev) {
    const copy = JSON.parse(JSON.stringify(ev));
    copy.id = C.uid("cord");
    copy.name = (ev.name || "Event") + " (copy)";
    copy.status = "quoted";
    copy.pull = null;
    delete copy.sinceVersion;
    copy.lines.forEach((l) => { l.id = C.uid("ln"); });
    copy.supplies.forEach((s) => { s.id = C.uid("sup"); });
    events().push(copy);
    Store.uiSet("cater.active", copy.id);
    Store.saveFood();
    render();
    Core.toast("Duplicated.");
  }

  function remove(ev) {
    const msg = ev.pull
      ? `Delete ${ev.name || "this event"}?\n\nIt has already been pulled from inventory; that stock stays deducted. Undo the pull first if you want it back.`
      : `Delete ${ev.name || "this event"}?`;
    if (!confirm(msg)) return;
    Store.food.orders = events().filter((e) => e.id !== ev.id);
    Store.uiSet("cater.active", null);
    Store.saveFood();
    render();
    Core.toast("Event deleted.");
  }

  function downloadSheet(ev) {
    const t = totals(ev);
    const rows = plan(ev);
    const lines = [];
    const name = ev.name || "Event";
    lines.push(name.toUpperCase(), "=".repeat(name.length));
    lines.push(`${ev.date || "no date"} · ${ev.guestCount} guests · ${STATUSES.find((s) => s.id === ev.status)?.label || ev.status}`);
    if (ev.locationId) lines.push(`Served at: ${FleetStorage.locationName(ev.locationId)}`);
    if (ev.notes) lines.push("", ev.notes);

    lines.push("", "MENU", "----");
    (ev.lines || []).forEach((ln) => {
      const r = Store.dish(ln.recipeId);
      if (r) lines.push(`[ ] ${r.name} — ${linePortions(ev, ln)} portions`);
    });
    if ((ev.supplies || []).length) {
      lines.push("", "SUPPLIES", "--------");
      ev.supplies.forEach((s) => {
        const ing = Store.foodIng(s.ingredientId);
        if (ing) lines.push(`[ ] ${ing.name} — ${C.fmtBaseQty(ing, supplyQty(ev, s))}`);
      });
    }

    lines.push("", ev.pull ? "PULLED FROM" : "GRAB FROM", "---------");
    const byLoc = new Map();
    rows.forEach((r) => r.picks.forEach((pk) => {
      if (!byLoc.has(pk.locId)) byLoc.set(pk.locId, []);
      byLoc.get(pk.locId).push(`[ ] ${r.ing.name} — ${C.fmtBaseQty(r.ing, pk.qty)}`);
    }));
    byLoc.forEach((items, locId) => { lines.push(FleetStorage.locationName(locId) + ":", ...items.map((i) => "  " + i)); });

    const short = rows.filter((r) => r.short > 0);
    if (short.length) {
      lines.push("", "SHOPPING", "--------");
      short.forEach((r) => lines.push(`[ ] ${r.ing.name} — ${r.packs} × ${packLabel(r.ing)} ${Store.money(r.buyCost)}`));
    }

    lines.push("", "COST", "----");
    lines.push(`Food        ${Store.money(t.foodCost)}`);
    lines.push(`Supplies    ${Store.money(t.supplyCost)}`);
    lines.push(`Total       ${Store.money(t.totalCost)}  (${Store.money(t.perGuest)} / guest)`);
    if (t.revenue) {
      lines.push(`Revenue     ${Store.money(t.revenue)}`);
      lines.push(`Food cost   ${Store.pct(t.costPct)}`);
      lines.push(`Profit      ${Store.money(t.profit)}`);
    }
    Core.downloadText(lines.join("\n"), slug(ev) + "-event-sheet.txt");
  }

  return { render };
})();
