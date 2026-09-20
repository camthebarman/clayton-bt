/* bar/app.js — the beverage program, read one bar at a time or all at once.

   Structurally this is catering's twin: the same scope strip, the same master
   grid, the same stock interface for Fleet. What differs is what "can I serve
   this" means. In the kitchen the question is whether anyone cooked it. At a
   bar it is whether the bottle is there — and whether this bar was ever meant
   to pour the drink at all, which is what its par levels say. */

const BarApp = (function () {
  const ROOT = document.getElementById("mod-bar");
  const el = Core.el;
  const openModal = Core.openModal;
  const closeModal = Core.closeModal;
  const toast = Core.toast;
  const B = BarCalc;

  let state = BarStorage.load();
  let scope = { inventory: null, dashboard: null, recipes: null };

  function $(sel, root) { return (root || ROOT).querySelector(sel); }
  function $all(sel, root) { return Array.from((root || ROOT).querySelectorAll(sel)); }
  function persist() { BarStorage.save(state); }

  function getIngredient(id) { return state.ingredients.find((i) => i.id === id); }
  function getPrep(id) { return state.preps.find((p) => p.id === id); }
  function getGlass(id) { return state.glassware.find((g) => g.id === id); }
  function getRecipe(id) { return state.recipes.find((r) => r.id === id); }

  // Anything that holds stock: ingredients and finished preps alike. Most of
  // this file wants both, because a count sheet does not care which is which.
  function stockItems() {
    return [...state.ingredients, ...state.preps.map((p) => B.prepAsIngredient(p, getIngredient))];
  }
  function stockItem(id) {
    const ing = getIngredient(id);
    if (ing) return ing;
    const prep = getPrep(id);
    return prep ? B.prepAsIngredient(prep, getIngredient) : null;
  }
  // The object that actually owns the quantity maps, so writes land on state.
  function stockOwner(id) { return getIngredient(id) || getPrep(id); }

  function bevLocations() { return FleetStorage.bevLocations(); }
  function locName(id) { return FleetStorage.locationName(id); }
  function locShort(id) { return FleetStorage.locationShort(id); }
  function canBatchAt(locId) {
    const l = FleetStorage.location(locId);
    return !!(l && (l.hub || l.canCook));
  }
  function hubId() {
    const h = FleetStorage.hub();
    return h ? h.id : null;
  }
  function countUnit(item) { return item.countUnit || item.purchaseUnit; }

  function sortedIngredients() {
    return state.ingredients.slice().sort((a, b) =>
      a.category === b.category ? a.name.localeCompare(b.name) : a.category.localeCompare(b.category));
  }

  function statCard(label, value, sub) {
    return el("div", { class: "stat-card" }, [
      el("div", { class: "label" }, [label]),
      el("div", { class: "value" }, [String(value)]),
      sub ? el("div", { class: "muted small-note" }, [sub]) : null,
    ]);
  }
  function statMini(label, value) {
    return el("div", { class: "stat-mini" }, [
      el("div", { class: "label" }, [label]),
      el("div", { class: "value" }, [String(value)]),
    ]);
  }

  function scopeStrip(key, onChange) {
    const strip = el("div", { class: "scope-strip" });
    const mk = (id, label, sub) =>
      el("button", {
        class: "scope-chip" + (scope[key] === id ? " active" : "") + (id === null ? " master" : ""),
        onclick: () => { scope[key] = id; onChange(); },
      }, [
        el("span", { class: "scope-name" }, [label]),
        sub ? el("span", { class: "scope-sub" }, [sub]) : null,
      ]);
    strip.append(mk(null, "Master", "All bars"));
    bevLocations().forEach((l) => {
      const v = FleetStorage.vessel(l.vesselId);
      strip.append(mk(l.id, l.short || l.name, v ? v.name : l.hub ? "Central storage" : "Ashore"));
    });
    return strip;
  }

  function scopeLabel(key) {
    return scope[key] ? locName(scope[key]) : "every bar";
  }

  function switchTab(name) {
    $all(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    $all(".panel").forEach((p) => p.classList.toggle("active", p.id === "bar-panel-" + name));
  }

  function resetData() {
    if (!confirm("Reset the beverage program to its seeded starting data? Every ingredient, prep, drink and count you have changed here will be lost. Catering and the fleet are untouched.")) return;
    state = BarStorage.resetToDefaults();
    renderAll();
    toast("Bar data reset.");
  }

  // ================= OVERVIEW =================
  function renderDashboard() {
    const panel = $("#bar-panel-dashboard");
    panel.innerHTML = "";
    const sc = scope.dashboard;

    panel.append(el("div", { class: "panel-head" }, [
      el("div", {}, [
        el("h2", {}, ["Bar Overview"]),
        el("div", { class: "sub" }, ["Pour costs and counts, read for " + scopeLabel("dashboard") + "."]),
      ]),
    ]));
    panel.append(scopeStrip("dashboard", renderDashboard));

    const items = stockItems();
    const value = items.reduce((s, i) => s + B.inventoryValueIn(i, sc), 0);
    const low = items.filter((i) => (sc ? B.belowParAt(i, sc) : B.belowParAnywhere(i)));
    const priced = state.recipes.filter((r) => Number(r.menuPrice) > 0);
    const avg = priced.length
      ? priced.reduce((s, r) => s + B.pourCostPct(B.recipeCost(r, getIngredient, getPrep), r.menuPrice), 0) / priced.length
      : 0;
    const dry = state.recipes.filter((r) => {
      const a = B.servingsAt(r, getIngredient, getPrep, sc, { canBatch: sc ? canBatchAt(sc) : true });
      return a.offered && a.servings <= 0;
    });

    panel.append(el("div", { class: "grid grid-4" }, [
      statCard("Bar Inventory", B.fmtMoney0(value), sc ? locName(sc) : `Across ${bevLocations().length} locations`),
      statCard("Avg Pour Cost", priced.length ? B.fmtPct(avg) : "—", `${state.recipes.length} drinks costed`),
      statCard("Below Par", low.length, sc ? "At " + locShort(sc) : "Somewhere in the fleet"),
      statCard("86'd", dry.length, sc ? "On this bar's list" : "Nowhere in the fleet"),
    ]));

    if (!sc) {
      const card = el("div", { class: "card" }, [
        el("div", { class: "card-head-row" }, [
          el("h3", {}, ["Where The Bar Stock Is"]),
          el("span", { class: "muted small-note" }, ["Bottles, cans and finished prep, by location"]),
        ]),
      ]);
      const table = el("table", {}, [
        el("thead", {}, [el("tr", {}, [
          el("th", {}, ["Location"]),
          el("th", {}, ["Type"]),
          el("th", { class: "num" }, ["Items Stocked"]),
          el("th", { class: "num" }, ["Below Par"]),
          el("th", { class: "num" }, ["Drinks Offered"]),
          el("th", { class: "num" }, ["Value"]),
        ])]),
      ]);
      const tbody = el("tbody");
      let total = 0;
      bevLocations().forEach((l) => {
        const v = items.reduce((s, i) => s + B.inventoryValueAt(i, l.id), 0);
        total += v;
        const stocked = items.filter((i) => B.onHandAt(i, l.id) > 0).length;
        const short = items.filter((i) => B.belowParAt(i, l.id)).length;
        const offered = state.recipes.filter((r) => B.offeredAt(r, getIngredient, getPrep, l.id)).length;
        const ves = FleetStorage.vessel(l.vesselId);
        tbody.append(el("tr", {}, [
          el("td", {}, [el("strong", {}, [l.name])]),
          el("td", {}, [el("span", { class: "pill " + (ves ? "afloat" : "") }, [ves ? ves.name : l.hub ? "Central storage" : "Ashore"])]),
          el("td", { class: "num" }, [String(stocked)]),
          el("td", { class: "num" }, [short ? el("strong", {}, [String(short)]) : "—"]),
          el("td", { class: "num" }, [l.kind === "bar" ? String(offered) : el("span", { class: "muted" }, ["—"])]),
          el("td", { class: "num" }, [B.fmtMoney(v)]),
        ]));
      });
      tbody.append(el("tr", { class: "row-total" }, [
        el("td", {}, [el("strong", {}, ["Master"])]),
        el("td", {}, [""]), el("td", {}, [""]), el("td", {}, [""]), el("td", {}, [""]),
        el("td", { class: "num" }, [el("strong", {}, [B.fmtMoney(total)])]),
      ]));
      table.append(tbody);
      card.append(el("div", { class: "table-wrap" }, [table]));
      panel.append(card);
    }

    if (dry.length) {
      const card = el("div", { class: "card callout-card bad" }, [
        el("div", { class: "card-head-row" }, [
          el("h3", {}, ["86'd Right Now"]),
          el("span", { class: "muted small-note" }, [sc ? "On " + locName(sc) + "'s own list" : "Can't be poured anywhere"]),
        ]),
      ]);
      const ul = el("ul", { class: "breakdown-list" });
      dry.forEach((r) => {
        const a = B.servingsAt(r, getIngredient, getPrep, sc, { canBatch: sc ? canBatchAt(sc) : true });
        ul.append(el("li", {}, [
          el("span", {}, [r.name]),
          el("span", { class: "muted" }, [a.limitedBy ? "out of " + a.limitedBy.name : "no stock"]),
        ]));
      });
      card.append(ul);
      panel.append(card);
    }

    if (low.length) {
      const card = el("div", { class: "card" }, [
        el("div", { class: "card-head-row" }, [
          el("h3", {}, ["Below Par"]),
          el("button", { class: "btn btn-sm", onclick: () => switchTab("inventory") }, ["Count sheet"]),
        ]),
      ]);
      const ul = el("ul", { class: "breakdown-list" });
      low.slice(0, 12).forEach((i) => {
        const where = sc ? [sc] : B.shortLocations(i);
        ul.append(el("li", {}, [
          el("span", {}, [i.name]),
          el("span", { class: "muted" }, ["short at " + where.map(locShort).join(", ")]),
        ]));
      });
      card.append(ul);
      if (low.length > 12) card.append(el("div", { class: "muted small-note", style: "margin-top:8px" }, [`and ${low.length - 12} more`]));
      panel.append(card);
    }
  }

  // ================= INGREDIENTS =================
  function renderIngredients() {
    const panel = $("#bar-panel-ingredients");
    panel.innerHTML = "";
    panel.append(el("div", { class: "panel-head" }, [
      el("div", {}, [
        el("h2", {}, ["Bar Ingredients"]),
        el("div", { class: "sub" }, ["Spirits, wine, beer, mixers, juice, garnish and service items. Counts live per bar — set them on the Inventory tab or here."]),
      ]),
      el("button", { class: "btn btn-primary", onclick: () => openIngredientForm() }, ["Add Ingredient"]),
    ]));

    const table = el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, ["Item"]),
        el("th", {}, ["Category"]),
        el("th", {}, ["Purchase"]),
        el("th", { class: "num" }, ["Cost / Unit"]),
        el("th", { class: "num" }, ["Master On Hand"]),
        el("th", { class: "num" }, ["Value"]),
        el("th", {}, ["Carried At"]),
        el("th", {}, [""]),
      ])]),
    ]);
    const tbody = el("tbody");
    sortedIngredients().forEach((ing) => {
      const u = B.purchaseUnit(ing.baseUnit, ing.purchaseUnit);
      const carried = bevLocations().filter((l) => B.parAt(ing, l.id) > 0);
      tbody.append(el("tr", {}, [
        el("td", {}, [el("strong", {}, [ing.name])]),
        el("td", {}, [el("span", { class: "pill" }, [ing.category])]),
        el("td", { class: "muted" }, [`${B.fmtQty(ing.purchaseQty)} ${u.label} / ${B.fmtMoney(ing.purchaseCost)}`]),
        el("td", { class: "num" }, [B.fmtMoney(B.costPerBaseUnit(ing)) + " / " + B.unitLabel(ing, 1)]),
        el("td", { class: "num" }, [B.fmtBaseQty(ing, B.onHandTotal(ing))]),
        el("td", { class: "num" }, [B.fmtMoney(B.inventoryValueTotal(ing))]),
        el("td", { class: "muted small-note" }, [carried.length ? carried.map((l) => l.short).join(", ") : "no par set"]),
        el("td", {}, [el("div", { class: "row-actions" }, [
          el("button", { class: "btn btn-sm", onclick: () => openIngredientForm(ing.id) }, ["Edit"]),
          el("button", { class: "btn btn-sm danger", onclick: () => deleteIngredient(ing.id) }, ["Delete"]),
        ])]),
      ]));
    });
    table.append(tbody);
    panel.append(el("div", { class: "card" }, [el("div", { class: "table-wrap" }, [table])]));
  }

  function openIngredientForm(id) {
    const existing = id ? getIngredient(id) : null;
    const draft = existing
      ? JSON.parse(JSON.stringify(existing))
      : { id: B.uid("bing"), name: "", category: BarStorage.CATEGORIES[0], baseUnit: "floz",
          purchaseUnit: "ml750", purchaseQty: 1, purchaseCost: 0, unitNoun: "", onHand: {}, par: {} };

    openModal(existing ? "Edit Bar Ingredient" : "Add Bar Ingredient", (body, close) => {
      const form = el("form", { autocomplete: "off" });
      const nameInput = el("input", { type: "text", value: draft.name, required: "required" });
      const catSel = selectEl(BarStorage.CATEGORIES.map((c) => ({ id: c, label: c })), draft.category, (v) => { draft.category = v; });
      form.append(fieldRow([field("Name", nameInput), field("Category", catSel)]));

      const unitWrap = el("div");
      const qtyInput = el("input", { type: "number", step: "any", min: "0", value: draft.purchaseQty });
      const costInput = el("input", { type: "number", step: "0.01", min: "0", value: draft.purchaseCost });
      const nounInput = el("input", { type: "text", value: draft.unitNoun || "", placeholder: "can, lime, straw…" });
      function drawUnits() {
        unitWrap.innerHTML = "";
        const baseSel = selectEl(
          Object.entries(B.BASE_UNITS).map(([k, v]) => ({ id: k, label: v.long })),
          draft.baseUnit,
          (v) => { draft.baseUnit = v; draft.purchaseUnit = B.purchaseUnitsFor(v)[0].id; drawUnits(); }
        );
        const puSel = selectEl(
          B.purchaseUnitsFor(draft.baseUnit).map((u) => ({ id: u.id, label: u.label })),
          draft.purchaseUnit, (v) => { draft.purchaseUnit = v; }
        );
        unitWrap.append(
          fieldRow([field("Measured in", baseSel), field("Bought by", puSel)]),
          fieldRow([field("Pack size", qtyInput), field("Pack cost", costInput)]),
          draft.baseUnit === "each" ? field("Unit name (optional)", nounInput) : null
        );
      }
      drawUnits();
      form.append(unitWrap);

      form.append(el("div", { class: "section-title" }, ["Stock By Bar"]));
      form.append(el("div", { class: "hint", style: "margin-bottom:8px" }, [
        "A par here is this bar's statement that it carries the item. A drink is only counted as offered at a bar where every component it needs has a par.",
      ]));
      const unitId = countUnit(draft);
      const grid = el("div", { class: "loc-grid" });
      const inputs = [];
      bevLocations().forEach((l) => {
        const onIn = el("input", { class: "inline-input num", type: "number", step: "any", min: "0",
          value: B.onHandAt(draft, l.id) ? B.fmtQty(B.fromBaseQty(draft.baseUnit, unitId, B.onHandAt(draft, l.id)), 3) : "" });
        const parIn = el("input", { class: "inline-input num", type: "number", step: "any", min: "0",
          value: B.parAt(draft, l.id) ? B.fmtQty(B.fromBaseQty(draft.baseUnit, unitId, B.parAt(draft, l.id)), 3) : "" });
        inputs.push({ locId: l.id, onIn, parIn });
        grid.append(el("div", { class: "loc-grid-row" }, [
          el("div", { class: "loc-grid-name" }, [
            el("strong", {}, [l.short || l.name]),
            el("span", { class: "muted small-note" }, [FleetStorage.vessel(l.vesselId) ? FleetStorage.vessel(l.vesselId).name : "Ashore"]),
          ]),
          el("label", { class: "loc-grid-field" }, [el("span", {}, ["On hand"]), onIn]),
          el("label", { class: "loc-grid-field" }, [el("span", {}, ["Par"]), parIn]),
        ]));
      });
      form.append(grid);

      form.append(el("div", { class: "form-actions" }, [
        el("button", { type: "button", class: "btn", onclick: close }, ["Cancel"]),
        el("button", { type: "submit", class: "btn btn-primary" }, [existing ? "Save" : "Add"]),
      ]));

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!nameInput.value.trim()) { toast("Give it a name."); return; }
        draft.name = nameInput.value.trim();
        draft.purchaseQty = Number(qtyInput.value) || 0;
        draft.purchaseCost = Number(costInput.value) || 0;
        draft.unitNoun = draft.baseUnit === "each" ? nounInput.value.trim() : "";
        draft.onHand = {};
        draft.par = {};
        const u = countUnit(draft);
        inputs.forEach(({ locId, onIn, parIn }) => {
          B.setQtyAt(draft.onHand, locId, B.toBaseQty(draft.baseUnit, u, onIn.value));
          B.setQtyAt(draft.par, locId, B.toBaseQty(draft.baseUnit, u, parIn.value));
        });
        if (existing) Object.assign(existing, draft);
        else state.ingredients.push(draft);
        persist(); close(); renderAll();
        toast(existing ? "Saved." : "Added.");
      });
      body.append(form);
    });
  }

  function deleteIngredient(id) {
    const ing = getIngredient(id);
    if (!ing) return;
    const inDrinks = state.recipes.filter((r) => (r.components || []).some((c) => c.ingredientId === id));
    const inPreps = state.preps.filter((p) => (p.components || []).some((c) => c.ingredientId === id));
    let msg = `Delete ${ing.name}?`;
    if (inDrinks.length) msg += `\n\nUsed by ${inDrinks.length} drink(s); those components will be dropped.`;
    if (inPreps.length) msg += `\n\nUsed by ${inPreps.length} prep(s); those components will be dropped.`;
    if (!confirm(msg)) return;
    state.ingredients = state.ingredients.filter((i) => i.id !== id);
    state.recipes.forEach((r) => { r.components = (r.components || []).filter((c) => c.ingredientId !== id); });
    state.preps.forEach((p) => { p.components = (p.components || []).filter((c) => c.ingredientId !== id); });
    persist(); renderAll();
    toast(`${ing.name} deleted.`);
  }

  // ================= PREPS =================
  function renderPreps() {
    const panel = $("#bar-panel-preps");
    panel.innerHTML = "";
    panel.append(el("div", { class: "panel-head" }, [
      el("div", {}, [
        el("h2", {}, ["House Preps"]),
        el("div", { class: "sub" }, ["Syrups, shrubs and batched punch, costed live from the raw ingredients in the batch. Batching happens at the commissary; the bars carry finished bottles."]),
      ]),
      el("button", { class: "btn btn-primary", onclick: () => openPrepForm() }, ["Add Prep"]),
    ]));

    if (!state.preps.length) {
      panel.append(el("div", { class: "empty-state" }, ["No house preps yet."]));
      return;
    }

    state.preps.forEach((prep) => {
      const batchCost = B.prepBatchCost(prep, getIngredient);
      const perUnit = B.prepCostPerUnit(prep, getIngredient);
      const asIng = B.prepAsIngredient(prep, getIngredient);
      // How many more batches the commissary could make from raw stock.
      let canMake = Infinity;
      let limitedBy = null;
      (prep.components || []).forEach((c) => {
        const src = getIngredient(c.ingredientId) || (getPrep(c.ingredientId) ? B.prepAsIngredient(getPrep(c.ingredientId), getIngredient) : null);
        if (!src || !(Number(c.qty) > 0)) return;
        const possible = B.onHandAt(src, hubId()) / Number(c.qty);
        if (possible < canMake) { canMake = possible; limitedBy = src; }
      });
      if (canMake === Infinity) canMake = 0;

      const card = el("div", { class: "card recipe-card" });
      card.append(el("div", { class: "recipe-card-head" }, [
        el("div", {}, [
          el("h3", {}, [prep.name]),
          el("div", { class: "recipe-meta" }, [`Yields ${B.fmtQty(prep.yieldQty)} ${B.unitLabel(asIng, prep.yieldQty)} per batch`]),
        ]),
        el("div", { class: "row-actions" }, [
          el("button", { class: "btn btn-sm", onclick: () => batchPrep(prep.id) }, ["Batch One"]),
          el("button", { class: "btn btn-sm", onclick: () => openPrepForm(prep.id) }, ["Edit"]),
          el("button", { class: "btn btn-sm danger", onclick: () => deletePrep(prep.id) }, ["Delete"]),
        ]),
      ]));

      const body = el("div", { class: "recipe-card-body" });
      body.append(el("div", { class: "stat-mini-row" }, [
        statMini("Batch Cost", B.fmtMoney(batchCost)),
        statMini("Per " + B.unitLabel(asIng, 1), B.fmtMoney(perUnit)),
        statMini("On Hand (fleet)", B.fmtBaseQty(asIng, B.onHandTotal(prep))),
        statMini("Value", B.fmtMoney(B.inventoryValueTotal(asIng))),
        statMini("Batches Possible", Math.floor(canMake)),
      ]));

      const two = el("div", { class: "two-col", style: "margin-top:14px" });
      const buildCard = el("div", {}, [el("h4", {}, ["Batch"])]);
      const ul = el("ul", { class: "breakdown-list" });
      (prep.components || []).forEach((c) => {
        const src = getIngredient(c.ingredientId) || (getPrep(c.ingredientId) ? B.prepAsIngredient(getPrep(c.ingredientId), getIngredient) : null);
        if (!src) return;
        ul.append(el("li", {}, [
          el("span", {}, [src.name, el("span", { class: "muted small-note" }, [` · ${B.fmtBaseQty(src, c.qty)}`])]),
          el("span", { class: "muted" }, [B.fmtMoney(B.componentCost(src, c.qty))]),
        ]));
      });
      buildCard.append(ul);
      if (limitedBy && canMake < 2) {
        buildCard.append(el("div", { class: "callout warn", style: "margin-top:10px" }, [
          `The commissary runs out of ${limitedBy.name} first — ${Math.floor(canMake)} more batch(es) in it.`,
        ]));
      }
      two.append(buildCard);

      const whereCard = el("div", {}, [el("h4", {}, ["Bottles On Hand"])]);
      const ul2 = el("ul", { class: "breakdown-list" });
      bevLocations().forEach((l) => {
        const q = B.onHandAt(prep, l.id);
        const par = B.parAt(prep, l.id);
        if (!q && !par) return;
        ul2.append(el("li", {}, [
          el("span", { class: B.belowParAt(prep, l.id) ? "flag-ink" : "" }, [l.short || l.name]),
          el("span", {}, [
            B.fmtBaseQty(asIng, q),
            par ? el("span", { class: "muted small-note" }, [` / par ${B.fmtBaseQty(asIng, par)}`]) : null,
          ]),
        ]));
      });
      whereCard.append(ul2);
      two.append(whereCard);

      body.append(two);
      if (prep.batchNote) body.append(el("p", { class: "muted small-note", style: "margin-top:12px" }, [prep.batchNote]));
      card.append(body);
      panel.append(card);
    });
  }

  // Making a batch draws the raw goods out of the commissary and puts the
  // finished bottles there. It is the one place in the bar program where
  // stock is consumed rather than counted.
  function batchPrep(id) {
    const prep = getPrep(id);
    const hub = hubId();
    if (!prep || !hub) return;
    const short = [];
    (prep.components || []).forEach((c) => {
      const src = stockOwner(c.ingredientId);
      if (!src) return;
      if (B.onHandAt(src, hub) < Number(c.qty)) short.push(src.name);
    });
    if (short.length) {
      toast(`Not enough at the commissary: ${short.slice(0, 3).join(", ")}.`);
      return;
    }
    const asIng = B.prepAsIngredient(prep, getIngredient);
    if (!confirm(`Batch one ${prep.name}? That draws the components out of the commissary and adds ${B.fmtBaseQty(asIng, prep.yieldQty)} of finished prep there.`)) return;
    (prep.components || []).forEach((c) => {
      const src = stockOwner(c.ingredientId);
      if (!src) return;
      B.setQtyAt(src.onHand, hub, B.onHandAt(src, hub) - Number(c.qty));
    });
    B.setQtyAt(prep.onHand, hub, B.onHandAt(prep, hub) + Number(prep.yieldQty));
    persist();
    renderAll();
    toast(`${prep.name} batched.`);
  }

  function openPrepForm(id) {
    const existing = id ? getPrep(id) : null;
    const draft = existing
      ? JSON.parse(JSON.stringify(existing))
      : { id: B.uid("bprep"), name: "", category: "House Prep", baseUnit: "floz", yieldQty: 32,
          batchNote: "", unitNoun: "", onHand: {}, par: {}, components: [] };

    openModal(existing ? "Edit Prep" : "Add Prep", (body, close) => {
      const form = el("form", { autocomplete: "off" });
      const nameInput = el("input", { type: "text", value: draft.name, required: "required" });
      const yieldInput = el("input", { type: "number", step: "any", min: "0.01", value: draft.yieldQty });
      const baseSel = selectEl(
        Object.entries(B.BASE_UNITS).map(([k, v]) => ({ id: k, label: v.long })),
        draft.baseUnit, (v) => { draft.baseUnit = v; }
      );
      form.append(fieldRow([field("Name", nameInput), field("Batch yield", yieldInput), field("Measured in", baseSel)]));

      form.append(el("div", { class: "section-title" }, ["Batch Components"]));
      const compWrap = el("div");
      function drawComponents() {
        compWrap.innerHTML = "";
        if (!draft.components.length) compWrap.append(el("div", { class: "empty-state" }, ["No components yet."]));
        draft.components.forEach((c, idx) => {
          const src = stockItem(c.ingredientId);
          const options = [
            ...sortedIngredients().map((i) => ({ id: i.id, label: i.name })),
            ...state.preps.filter((p) => p.id !== draft.id).map((p) => ({ id: p.id, label: p.name + " (prep)" })),
          ];
          const sel = selectEl(options, c.ingredientId, (v) => { c.ingredientId = v; drawComponents(); });
          const qty = el("input", { class: "inline-input num", type: "number", step: "any", min: "0", value: c.qty,
            oninput: (e) => { c.qty = Number(e.target.value) || 0; } });
          compWrap.append(el("div", { class: "component-row" }, [
            el("div", { style: "flex:1" }, [sel]),
            el("div", { class: "comp-qty" }, [qty, el("span", { class: "muted small-note" }, [src ? B.unitLabel(src, 2) : ""])]),
            el("button", { type: "button", class: "btn btn-sm danger", onclick: () => { draft.components.splice(idx, 1); drawComponents(); } }, ["×"]),
          ]));
        });
        compWrap.append(el("button", {
          type: "button", class: "btn btn-sm", style: "margin-top:8px",
          onclick: () => {
            if (!state.ingredients.length) { toast("Add an ingredient first."); return; }
            draft.components.push({ id: B.uid("pc"), ingredientId: sortedIngredients()[0].id, qty: 1 });
            drawComponents();
          },
        }, ["Add Component"]));
      }
      drawComponents();
      form.append(compWrap);

      form.append(el("div", { class: "section-title" }, ["Bottles By Bar"]));
      const unitId = draft.baseUnit;
      const grid = el("div", { class: "loc-grid" });
      const inputs = [];
      bevLocations().forEach((l) => {
        const onIn = el("input", { class: "inline-input num", type: "number", step: "any", min: "0", value: B.onHandAt(draft, l.id) || "" });
        const parIn = el("input", { class: "inline-input num", type: "number", step: "any", min: "0", value: B.parAt(draft, l.id) || "" });
        inputs.push({ locId: l.id, onIn, parIn });
        grid.append(el("div", { class: "loc-grid-row" }, [
          el("div", { class: "loc-grid-name" }, [el("strong", {}, [l.short || l.name])]),
          el("label", { class: "loc-grid-field" }, [el("span", {}, ["On hand"]), onIn]),
          el("label", { class: "loc-grid-field" }, [el("span", {}, ["Par"]), parIn]),
        ]));
      });
      form.append(grid);

      const noteInput = el("input", { type: "text", value: draft.batchNote || "", placeholder: "How the batch is made and how long it keeps" });
      form.append(field("Batch note", noteInput));

      form.append(el("div", { class: "form-actions" }, [
        el("button", { type: "button", class: "btn", onclick: close }, ["Cancel"]),
        el("button", { type: "submit", class: "btn btn-primary" }, [existing ? "Save" : "Add Prep"]),
      ]));

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!nameInput.value.trim()) { toast("Give the prep a name."); return; }
        draft.name = nameInput.value.trim();
        draft.yieldQty = Math.max(Number(yieldInput.value) || 1, 0.01);
        draft.batchNote = noteInput.value.trim();
        draft.components = draft.components.filter((c) => c.ingredientId && Number(c.qty) > 0);
        draft.onHand = {};
        draft.par = {};
        inputs.forEach(({ locId, onIn, parIn }) => {
          B.setQtyAt(draft.onHand, locId, Number(onIn.value) || 0);
          B.setQtyAt(draft.par, locId, Number(parIn.value) || 0);
        });
        if (existing) Object.assign(existing, draft);
        else state.preps.push(draft);
        persist(); close(); renderAll();
        toast(existing ? "Prep saved." : "Prep added.");
      });
      body.append(form);
    });
  }

  function deletePrep(id) {
    const prep = getPrep(id);
    if (!prep) return;
    const used = state.recipes.filter((r) => (r.components || []).some((c) => c.ingredientId === id));
    if (!confirm(`Delete ${prep.name}?${used.length ? `\n\nUsed by ${used.length} drink(s); those components will be dropped.` : ""}`)) return;
    state.preps = state.preps.filter((p) => p.id !== id);
    state.recipes.forEach((r) => { r.components = (r.components || []).filter((c) => c.ingredientId !== id); });
    persist(); renderAll();
    toast(`${prep.name} deleted.`);
  }

  // ================= GLASSWARE =================
  function renderGlassware() {
    const panel = $("#bar-panel-glassware");
    panel.innerHTML = "";
    panel.append(el("div", { class: "panel-head" }, [
      el("div", {}, [
        el("h2", {}, ["Glassware"]),
        el("div", { class: "sub" }, ["Volumes and default ice. Nothing glass goes on an open deck, so the tumbler is doing most of the work out there."]),
      ]),
      el("button", { class: "btn btn-primary", onclick: () => openGlassForm() }, ["Add Glass"]),
    ]));

    const table = el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, ["Glass"]),
        el("th", { class: "num" }, ["Volume"]),
        el("th", { class: "num" }, ["Default Ice"]),
        el("th", {}, ["Straw"]),
        el("th", { class: "num" }, ["Drinks Using It"]),
        el("th", {}, ["Note"]),
        el("th", {}, [""]),
      ])]),
    ]);
    const tbody = el("tbody");
    state.glassware.forEach((g) => {
      const uses = state.recipes.filter((r) => r.glasswareId === g.id).length;
      tbody.append(el("tr", {}, [
        el("td", {}, [el("strong", {}, [g.name])]),
        el("td", { class: "num" }, [B.fmtQty(g.volumeOz) + " oz"]),
        el("td", { class: "num" }, [B.fmtQty(g.defaultIceOz) + " oz"]),
        el("td", {}, [g.straw ? "Yes" : "No"]),
        el("td", { class: "num" }, [String(uses)]),
        el("td", { class: "muted small-note" }, [g.note || ""]),
        el("td", {}, [el("div", { class: "row-actions" }, [
          el("button", { class: "btn btn-sm", onclick: () => openGlassForm(g.id) }, ["Edit"]),
          el("button", { class: "btn btn-sm danger", onclick: () => deleteGlass(g.id) }, ["Delete"]),
        ])]),
      ]));
    });
    table.append(tbody);
    panel.append(el("div", { class: "card" }, [el("div", { class: "table-wrap" }, [table])]));
  }

  function openGlassForm(id) {
    const existing = id ? getGlass(id) : null;
    const draft = existing ? { ...existing } : { id: B.uid("bglass"), name: "", volumeOz: 10, defaultIceOz: 6, straw: false, note: "" };
    openModal(existing ? "Edit Glass" : "Add Glass", (body, close) => {
      const form = el("form", { autocomplete: "off" });
      const nameInput = el("input", { type: "text", value: draft.name, required: "required" });
      const volInput = el("input", { type: "number", step: "any", min: "0", value: draft.volumeOz });
      const iceInput = el("input", { type: "number", step: "any", min: "0", value: draft.defaultIceOz });
      const strawInput = el("input", { type: "checkbox", checked: draft.straw ? "checked" : null });
      const noteInput = el("input", { type: "text", value: draft.note || "" });
      form.append(fieldRow([field("Name", nameInput), field("Volume (oz)", volInput), field("Default ice (oz)", iceInput)]));
      form.append(el("div", { class: "field checkbox-field" }, [strawInput, el("label", {}, ["Served with a straw"])]));
      form.append(field("Note", noteInput));
      form.append(el("div", { class: "form-actions" }, [
        el("button", { type: "button", class: "btn", onclick: close }, ["Cancel"]),
        el("button", { type: "submit", class: "btn btn-primary" }, [existing ? "Save" : "Add"]),
      ]));
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!nameInput.value.trim()) { toast("Give the glass a name."); return; }
        draft.name = nameInput.value.trim();
        draft.volumeOz = Number(volInput.value) || 0;
        draft.defaultIceOz = Number(iceInput.value) || 0;
        draft.straw = !!strawInput.checked;
        draft.note = noteInput.value.trim();
        if (existing) Object.assign(existing, draft);
        else state.glassware.push(draft);
        persist(); close(); renderAll();
        toast(existing ? "Saved." : "Added.");
      });
      body.append(form);
    });
  }

  function deleteGlass(id) {
    const g = getGlass(id);
    if (!g) return;
    const uses = state.recipes.filter((r) => r.glasswareId === id);
    if (!confirm(`Delete ${g.name}?${uses.length ? `\n\n${uses.length} drink(s) use it; they will be left without a glass.` : ""}`)) return;
    state.glassware = state.glassware.filter((x) => x.id !== id);
    state.recipes.forEach((r) => { if (r.glasswareId === id) r.glasswareId = null; });
    persist(); renderAll();
    toast(`${g.name} deleted.`);
  }

  // ================= DRINKS =================
  function renderRecipes() {
    const panel = $("#bar-panel-recipes");
    panel.innerHTML = "";
    panel.append(el("div", { class: "panel-head" }, [
      el("div", {}, [
        el("h2", {}, ["Drinks"]),
        el("div", { class: "sub" }, ["Build, glass, pour cost, and which bars can actually make it. A bar only counts as offering a drink when it carries a par on every component — so the single well on Miss Clayton isn't flagged for a spritz it never poured."]),
      ]),
      el("button", { class: "btn btn-primary", onclick: () => openRecipeForm() }, ["Add Drink"]),
    ]));

    if (!state.recipes.length) {
      panel.append(el("div", { class: "empty-state" }, ["No drinks yet."]));
      return;
    }

    const groups = new Map();
    state.recipes.forEach((r) => {
      const k = r.category || "Cocktail";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    });
    Array.from(groups.keys()).sort().forEach((cat) => {
      panel.append(el("div", { class: "menu-head" }, [
        el("h3", {}, [cat]),
        el("span", { class: "muted small-note" }, [`${groups.get(cat).length} item(s)`]),
      ]));
      groups.get(cat).slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((r) => panel.append(renderRecipeCard(r)));
    });
  }

  function renderRecipeCard(recipe) {
    const cost = B.recipeCost(recipe, getIngredient, getPrep);
    const price = Number(recipe.menuPrice) || 0;
    const pct = price ? B.pourCostPct(cost, price) : 0;
    const glass = getGlass(recipe.glasswareId);
    const master = B.servingsAt(recipe, getIngredient, getPrep, null, {});

    const card = el("div", { class: "card recipe-card" });
    card.append(el("div", { class: "recipe-card-head" }, [
      el("div", {}, [
        el("h3", {}, [recipe.name]),
        el("div", { class: "recipe-meta" }, [
          [glass ? glass.name : "no glass", recipe.category].filter(Boolean).join(" · "),
        ]),
      ]),
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn btn-sm", onclick: () => openRecipeForm(recipe.id) }, ["Edit"]),
        el("button", { class: "btn btn-sm danger", onclick: () => deleteRecipe(recipe.id) }, ["Delete"]),
      ]),
    ]));

    const body = el("div", { class: "recipe-card-body" });
    body.append(el("div", { class: "stat-mini-row" }, [
      statMini("Pour Cost", B.fmtMoney(cost)),
      statMini("Price", price ? B.fmtMoney(price) : "—"),
      statMini("Pour Cost %", price ? B.fmtPct(pct) : "—"),
      statMini("Profit", price ? B.fmtMoney(price - cost) : "—"),
      statMini("Suggested", B.fmtMoney(B.suggestedPrice(cost, recipe.targetPourCostPct))),
      statMini("Fleet Pours", String(master.servings)),
    ]));

    const two = el("div", { class: "two-col", style: "margin-top:14px" });
    const buildCard = el("div", {}, [el("h4", {}, ["Build"])]);
    const ul = el("ul", { class: "breakdown-list" });
    (recipe.components || []).forEach((c) => {
      const src = stockItem(c.ingredientId);
      if (!src) return;
      const unitCost = src.isPrep
        ? B.prepCostPerUnit(getPrep(c.ingredientId), getIngredient) * Number(c.qty)
        : B.componentCost(src, c.qty);
      ul.append(el("li", {}, [
        el("span", {}, [
          src.name,
          src.isPrep ? el("span", { class: "tag prep" }, ["house"]) : null,
          el("span", { class: "muted small-note" }, [` · ${B.fmtBaseQty(src, c.qty)}`]),
        ]),
        el("span", { class: "muted" }, [B.fmtMoney(unitCost)]),
      ]));
    });
    buildCard.append(ul);
    two.append(buildCard);

    // Bar by bar. This is the table a beverage manager actually reads.
    const barsCard = el("div", {}, [el("h4", {}, ["By Bar"])]);
    const ul2 = el("ul", { class: "breakdown-list" });
    FleetStorage.bars().forEach((l) => {
      const a = B.servingsAt(recipe, getIngredient, getPrep, l.id, { canBatch: canBatchAt(l.id) });
      let right;
      if (!a.offered) {
        const missing = B.missingFromMenu(recipe, getIngredient, getPrep, l.id);
        right = el("span", { class: "muted small-note", title: "Carries no par on: " + missing.map((m) => m.name).join(", ") }, ["not on this bar"]);
      } else if (a.servings <= 0) {
        right = el("span", { class: "pill bad" }, ["86 — " + (a.limitedBy ? a.limitedBy.name : "out")]);
      } else {
        right = el("span", {}, [String(a.servings), el("span", { class: "muted small-note" }, [" pours"])]);
      }
      ul2.append(el("li", {}, [el("span", { class: a.offered ? "" : "muted" }, [l.short || l.name]), right]));
    });
    barsCard.append(ul2);
    if (master.limitedBy) {
      barsCard.append(el("div", { class: "callout " + (master.servings <= 0 ? "bad" : "warn"), style: "margin-top:10px" }, [
        master.servings <= 0
          ? `Nothing in the fleet — out of ${master.limitedBy.name} everywhere.`
          : `Fleet-wide, ${master.limitedBy.name} runs out first.`,
      ]));
    }
    two.append(barsCard);

    body.append(two);
    if (recipe.notes) body.append(el("p", { class: "muted small-note", style: "margin-top:12px" }, [recipe.notes]));
    card.append(body);
    return card;
  }

  function openRecipeForm(id) {
    const existing = id ? getRecipe(id) : null;
    const draft = existing
      ? JSON.parse(JSON.stringify(existing))
      : { id: B.uid("brec"), name: "", category: "Cocktail", glasswareId: state.glassware[0] ? state.glassware[0].id : null,
          menuPrice: 0, targetPourCostPct: state.settings.defaultTargetPourCostPct, servingsPerWeek: 0, notes: "", components: [] };

    openModal(existing ? "Edit Drink" : "Add Drink", (body, close) => {
      const form = el("form", { autocomplete: "off" });
      const nameInput = el("input", { type: "text", value: draft.name, required: "required" });
      const catInput = el("input", { type: "text", value: draft.category, placeholder: "Cocktail, Beer, Wine…" });
      const glassSel = selectEl(
        [{ id: "", label: "No glass" }, ...state.glassware.map((g) => ({ id: g.id, label: g.name }))],
        draft.glasswareId || "", (v) => { draft.glasswareId = v || null; }
      );
      form.append(fieldRow([field("Name", nameInput), field("Category", catInput), field("Glass", glassSel)]));

      const priceInput = el("input", { type: "number", step: "0.01", min: "0", value: draft.menuPrice });
      const targetInput = el("input", { type: "number", step: "any", min: "1", max: "100", value: draft.targetPourCostPct });
      const weekInput = el("input", { type: "number", step: "any", min: "0", value: draft.servingsPerWeek });
      form.append(fieldRow([field("Menu price", priceInput), field("Target pour cost %", targetInput), field("Pours / week", weekInput)]));

      form.append(el("div", { class: "section-title" }, ["Build"]));
      const compWrap = el("div");
      function drawComponents() {
        compWrap.innerHTML = "";
        if (!draft.components.length) compWrap.append(el("div", { class: "empty-state" }, ["No components yet."]));
        const options = [
          ...sortedIngredients().map((i) => ({ id: i.id, label: i.name })),
          ...state.preps.map((p) => ({ id: p.id, label: p.name + " (house prep)" })),
        ];
        draft.components.forEach((c, idx) => {
          const src = stockItem(c.ingredientId);
          const sel = selectEl(options, c.ingredientId, (v) => { c.ingredientId = v; drawComponents(); });
          const qty = el("input", { class: "inline-input num", type: "number", step: "any", min: "0", value: c.qty,
            oninput: (e) => { c.qty = Number(e.target.value) || 0; } });
          compWrap.append(el("div", { class: "component-row" }, [
            el("div", { style: "flex:1" }, [sel]),
            el("div", { class: "comp-qty" }, [qty, el("span", { class: "muted small-note" }, [src ? B.unitLabel(src, 2) : ""])]),
            el("button", { type: "button", class: "btn btn-sm danger", onclick: () => { draft.components.splice(idx, 1); drawComponents(); } }, ["×"]),
          ]));
        });
        compWrap.append(el("button", {
          type: "button", class: "btn btn-sm", style: "margin-top:8px",
          onclick: () => {
            if (!state.ingredients.length) { toast("Add an ingredient first."); return; }
            draft.components.push({ id: B.uid("c"), ingredientId: sortedIngredients()[0].id, qty: 1 });
            drawComponents();
          },
        }, ["Add Component"]));
      }
      drawComponents();
      form.append(compWrap);

      const notesInput = el("textarea", {}, [draft.notes || ""]);
      form.append(field("Notes", notesInput));
      form.append(el("div", { class: "form-actions" }, [
        el("button", { type: "button", class: "btn", onclick: close }, ["Cancel"]),
        el("button", { type: "submit", class: "btn btn-primary" }, [existing ? "Save" : "Add Drink"]),
      ]));

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!nameInput.value.trim()) { toast("Give the drink a name."); return; }
        draft.name = nameInput.value.trim();
        draft.category = catInput.value.trim() || "Cocktail";
        draft.menuPrice = Number(priceInput.value) || 0;
        draft.targetPourCostPct = Number(targetInput.value) || state.settings.defaultTargetPourCostPct;
        draft.servingsPerWeek = Number(weekInput.value) || 0;
        draft.notes = notesInput.value.trim();
        draft.components = draft.components.filter((c) => c.ingredientId && Number(c.qty) > 0);
        if (existing) Object.assign(existing, draft);
        else state.recipes.push(draft);
        persist(); close(); renderAll();
        toast(existing ? "Drink saved." : "Drink added.");
      });
      body.append(form);
    });
  }

  function deleteRecipe(id) {
    const r = getRecipe(id);
    if (!r) return;
    if (!confirm(`Delete ${r.name}?`)) return;
    state.recipes = state.recipes.filter((x) => x.id !== id);
    persist(); renderAll();
    toast(`${r.name} deleted.`);
  }

  // ================= INVENTORY =================
  function renderInventory() {
    const panel = $("#bar-panel-inventory");
    panel.innerHTML = "";
    const sc = scope.inventory;

    panel.append(el("div", { class: "panel-head" }, [
      el("div", {}, [
        el("h2", {}, ["Bar Inventory"]),
        el("div", { class: "sub" }, ["Count each bar in the unit it counts in — bottles, cans, kegs, each. The master view puts every bar side by side."]),
      ]),
      el("div", { class: "head-controls" }, [
        sc ? el("button", { class: "btn", onclick: () => fillAllToPar(sc) }, ["Fill To Par"]) : null,
        sc && sc !== hubId() ? el("button", { class: "btn btn-primary", onclick: () => proposeRestock(sc) }, ["Restock From Commissary"]) : null,
      ]),
    ]));
    panel.append(scopeStrip("inventory", renderInventory));

    const items = stockItems();
    const value = items.reduce((s, i) => s + B.inventoryValueIn(i, sc), 0);
    const low = items.filter((i) => (sc ? B.belowParAt(i, sc) : B.belowParAnywhere(i)));
    const reorder = low.reduce((s, i) => {
      const gap = sc ? Math.max(0, B.parAt(i, sc) - B.onHandAt(i, sc)) : B.parGap(i);
      const pack = B.packBaseQty(i);
      return s + (pack > 0 ? Math.ceil(gap / pack) * (Number(i.purchaseCost) || 0) : 0);
    }, 0);

    panel.append(el("div", { class: "grid grid-4" }, [
      statCard("Stock Value", B.fmtMoney0(value), sc ? locName(sc) : "Master, all bars"),
      statCard("Items Stocked", items.filter((i) => B.onHandIn(i, sc) > 0).length, `of ${items.length} tracked`),
      statCard("Below Par", low.length, sc ? "At " + locShort(sc) : "Anywhere"),
      statCard(sc ? "Cost To Fill" : "Cost To Order", B.fmtMoney0(reorder), "Whole packs"),
    ]));

    panel.append(sc ? countSheetFor(sc) : masterGrid());
    if (sc && FleetStorage.location(sc) && FleetStorage.location(sc).kind === "bar") panel.append(poursCard(sc));
  }

  function masterGrid() {
    const locs = bevLocations();
    const card = el("div", { class: "card" }, [
      el("div", { class: "card-head-row" }, [
        el("h3", {}, ["Master Count"]),
        el("span", { class: "muted small-note" }, ["Every bar, side by side, in each item's own count unit"]),
      ]),
    ]);
    const table = el("table", { class: "master-grid" }, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, ["Item"]),
        ...locs.map((l) => el("th", { class: "num", title: l.name }, [l.short || l.name])),
        el("th", { class: "num" }, ["Master"]),
        el("th", { class: "num" }, ["Par"]),
        el("th", { class: "num" }, ["Value"]),
        el("th", {}, ["Status"]),
      ])]),
    ]);
    const tbody = el("tbody");
    let lastCat = null;
    const rows = stockItems().slice().sort((a, b) =>
      a.category === b.category ? a.name.localeCompare(b.name) : a.category.localeCompare(b.category));
    rows.forEach((item) => {
      if (item.category !== lastCat) {
        lastCat = item.category;
        tbody.append(el("tr", { class: "cat-row" }, [el("td", { colspan: String(locs.length + 5) }, [item.category])]));
      }
      const owner = stockOwner(item.id);
      const unit = countUnit(item);
      const short = B.shortLocations(item);
      tbody.append(el("tr", { class: short.length ? "row-warn" : "" }, [
        el("td", {}, [
          el("strong", {}, [item.name]),
          el("div", { class: "muted small-note" }, [B.purchaseUnit(item.baseUnit, unit).label]),
        ]),
        ...locs.map((l) => {
          const has = B.parAt(item, l.id) > 0 || B.onHandAt(item, l.id) > 0;
          return el("td", { class: "num" + (B.belowParAt(item, l.id) ? " cell-short" : "") }, [
            el("input", {
              class: "inline-input num" + (has ? "" : " ghost"),
              type: "number", step: "any", min: "0",
              title: `${item.name} at ${l.name}`,
              value: B.onHandAt(item, l.id) ? B.fmtQty(B.fromBaseQty(item.baseUnit, unit, B.onHandAt(item, l.id)), 3) : "",
              oninput: (e) => { B.setQtyAt(owner.onHand, l.id, B.toBaseQty(item.baseUnit, unit, e.target.value)); persist(); },
              onchange: () => { renderInventory(); renderDashboard(); },
            }),
          ]);
        }),
        el("td", { class: "num" }, [el("strong", {}, [B.fmtQty(B.fromBaseQty(item.baseUnit, unit, B.onHandTotal(item)), 2)])]),
        el("td", { class: "num muted" }, [B.parTotal(item) ? B.fmtQty(B.fromBaseQty(item.baseUnit, unit, B.parTotal(item)), 2) : "—"]),
        el("td", { class: "num" }, [B.fmtMoney(B.inventoryValueTotal(item))]),
        el("td", {}, [
          short.length
            ? el("span", { class: "pill warn", title: "Short at " + short.map(locName).join(", ") }, ["Short ×" + short.length])
            : B.parTotal(item) ? el("span", { class: "pill good" }, ["OK"]) : el("span", { class: "pill" }, ["No par"]),
        ]),
      ]));
    });
    table.append(tbody);
    card.append(el("div", { class: "table-wrap" }, [table]));
    return card;
  }

  function countSheetFor(locId) {
    const loc = FleetStorage.location(locId);
    const card = el("div", { class: "card" }, [
      el("div", { class: "card-head-row" }, [
        el("h3", {}, [(loc ? loc.name : "Bar") + " Count Sheet"]),
        el("span", { class: "muted small-note" }, [loc && loc.notes ? loc.notes : ""]),
      ]),
    ]);
    const all = stockItems();
    const carried = all.filter((i) => B.parAt(i, locId) > 0 || B.onHandAt(i, locId) > 0);
    const rest = all.filter((i) => !carried.includes(i));

    if (!carried.length) {
      card.append(el("div", { class: "empty-state" }, [`${loc ? loc.name : "This bar"} isn't carrying anything yet.`]));
    } else {
      card.append(el("div", { class: "table-wrap" }, [countTable(carried, locId)]));
    }
    if (rest.length) {
      const more = el("details", { class: "more-items" }, [el("summary", {}, [`Everything else the program tracks (${rest.length})`])]);
      more.append(el("div", { class: "table-wrap", style: "margin-top:10px" }, [countTable(rest, locId)]));
      card.append(more);
    }
    return card;
  }

  function countTable(items, locId) {
    const table = el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, ["Item"]),
        el("th", {}, ["Category"]),
        el("th", { class: "num" }, ["On Hand"]),
        el("th", { class: "num" }, ["Par"]),
        el("th", {}, ["Counted In"]),
        el("th", { class: "num" }, ["Value"]),
        el("th", { class: "num" }, ["Fleet Total"]),
        el("th", {}, ["Status"]),
        el("th", {}, [""]),
      ])]),
    ]);
    const tbody = el("tbody");
    items
      .slice()
      .sort((a, b) => (a.category === b.category ? a.name.localeCompare(b.name) : a.category.localeCompare(b.category)))
      .forEach((item) => {
        const owner = stockOwner(item.id);
        const unit = countUnit(item);
        const par = B.parAt(item, locId);
        const low = B.belowParAt(item, locId);
        const out = B.onHandAt(item, locId) <= 0;
        tbody.append(el("tr", { class: out && par > 0 ? "row-bad" : low ? "row-warn" : "" }, [
          el("td", {}, [el("strong", {}, [item.name]), item.isPrep ? el("span", { class: "tag prep" }, ["house"]) : null]),
          el("td", {}, [el("span", { class: "pill" }, [item.category])]),
          el("td", { class: "num" }, [
            el("input", {
              class: "inline-input num", type: "number", step: "any", min: "0",
              value: B.onHandAt(item, locId) ? B.fmtQty(B.fromBaseQty(item.baseUnit, unit, B.onHandAt(item, locId)), 3) : "",
              oninput: (e) => { B.setQtyAt(owner.onHand, locId, B.toBaseQty(item.baseUnit, unit, e.target.value)); persist(); },
              onchange: () => { renderInventory(); renderDashboard(); renderRecipes(); },
            }),
          ]),
          el("td", { class: "num" }, [
            el("input", {
              class: "inline-input num", type: "number", step: "any", min: "0",
              value: par ? B.fmtQty(B.fromBaseQty(item.baseUnit, unit, par), 3) : "",
              oninput: (e) => { B.setQtyAt(owner.par, locId, B.toBaseQty(item.baseUnit, unit, e.target.value)); persist(); },
              onchange: () => renderInventory(),
            }),
          ]),
          el("td", {}, [
            selectEl(
              B.purchaseUnitsFor(item.baseUnit).map((u) => ({ id: u.id, label: u.id === "each" ? B.unitLabel(item, 2) || u.label : u.label })),
              unit, (v) => { owner.countUnit = v; persist(); renderInventory(); }
            ),
          ]),
          el("td", { class: "num" }, [B.fmtMoney(B.inventoryValueAt(item, locId))]),
          el("td", { class: "num muted" }, [B.fmtBaseQty(item, B.onHandTotal(item))]),
          el("td", {}, [
            !par ? el("span", { class: "pill" }, ["Not carried"])
              : out ? el("span", { class: "pill bad" }, ["Out"])
              : low ? el("span", { class: "pill warn" }, ["Short"])
              : el("span", { class: "pill good" }, ["OK"]),
          ]),
          el("td", {}, [el("div", { class: "row-actions" }, [
            el("button", { class: "btn btn-sm", onclick: () => fillToPar(item.id, locId) }, ["To Par"]),
          ])]),
        ]));
      });
    table.append(tbody);
    return table;
  }

  // What this bar can pour right now, and what it simply doesn't carry.
  function poursCard(locId) {
    const card = el("div", { class: "card" }, [
      el("div", { class: "card-head-row" }, [
        el("h3", {}, ["Pours Available Here"]),
        el("span", { class: "muted small-note" }, [
          canBatchAt(locId) ? "This location can batch its own preps." : "Afloat — an empty prep bottle can't be re-batched until a runner reaches it.",
        ]),
      ]),
    ]);
    const offered = state.recipes
      .map((r) => ({ r, a: B.servingsAt(r, getIngredient, getPrep, locId, { canBatch: canBatchAt(locId) }) }))
      .filter((x) => x.a.offered)
      .sort((a, b) => a.a.servings - b.a.servings);

    if (!offered.length) {
      card.append(el("div", { class: "empty-state" }, [
        "No drink has a par on all of its components here yet. Set pars on the count sheet above and this bar's list builds itself.",
      ]));
      return card;
    }

    const table = el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, ["Drink"]),
        el("th", { class: "num" }, ["Pours"]),
        el("th", {}, ["Runs Out First"]),
        el("th", { class: "num" }, ["Pour Cost"]),
        el("th", {}, ["Status"]),
      ])]),
    ]);
    const tbody = el("tbody");
    offered.forEach(({ r, a }) => {
      const cost = B.recipeCost(r, getIngredient, getPrep);
      tbody.append(el("tr", { class: a.servings <= 0 ? "row-bad" : a.servings < 10 ? "row-warn" : "" }, [
        el("td", {}, [el("strong", {}, [r.name])]),
        el("td", { class: "num" }, [String(a.servings)]),
        el("td", { class: "muted" }, [a.limitedBy ? a.limitedBy.name : "—"]),
        el("td", { class: "num" }, [B.fmtMoney(cost)]),
        el("td", {}, [
          a.servings <= 0 ? el("span", { class: "pill bad" }, ["86'd"])
            : a.servings < 10 ? el("span", { class: "pill warn" }, ["Running low"])
            : el("span", { class: "pill good" }, ["Covered"]),
        ]),
      ]));
    });
    table.append(tbody);
    card.append(el("div", { class: "table-wrap" }, [table]));

    const notOffered = state.recipes.length - offered.length;
    if (notOffered > 0) {
      card.append(el("div", { class: "hint", style: "margin-top:10px" }, [
        `${notOffered} other drink(s) aren't on this bar's list — it carries no par on something each of them needs.`,
      ]));
    }
    return card;
  }

  function fillToPar(id, locId) {
    const owner = stockOwner(id);
    if (!owner) return;
    const par = B.parAt(owner, locId);
    if (par <= 0) { toast("Set a par here first."); return; }
    if (B.onHandAt(owner, locId) < par) B.setQtyAt(owner.onHand, locId, par);
    persist(); renderAll();
    toast(`${owner.name} counted up to par at ${locShort(locId)}.`);
  }

  function fillAllToPar(locId) {
    const low = stockItems().filter((i) => B.belowParAt(i, locId));
    if (!low.length) { toast("Nothing is below par here."); return; }
    if (!confirm(`Bring ${low.length} item(s) up to par at ${locName(locId)}? Use this after a delivery is put away — it does not move anything off another location.`)) return;
    low.forEach((i) => {
      const owner = stockOwner(i.id);
      if (owner) B.setQtyAt(owner.onHand, locId, B.parAt(owner, locId));
    });
    persist(); renderAll();
    toast(`${low.length} item(s) filled to par.`);
  }

  function proposeRestock(locId) {
    const hub = hubId();
    if (!hub) { toast("No central storage location is set up."); return; }
    const lines = [];
    const shortOfHub = [];
    stockItems().forEach((item) => {
      const gap = Math.max(0, B.parAt(item, locId) - B.onHandAt(item, locId));
      if (gap <= 0) return;
      const available = B.onHandAt(item, hub);
      const move = Math.min(gap, available);
      if (move > 0) lines.push({ module: "bar", kind: "ingredient", itemId: item.id, qty: move });
      if (available < gap) shortOfHub.push(item.name);
    });
    if (!lines.length) {
      toast(shortOfHub.length ? "The commissary has none of what this bar is short." : "Nothing to restock here.");
      return;
    }
    openModal("Restock " + locName(locId), (body, close) => {
      body.append(el("p", {}, [
        `Bringing ${locName(locId)} up to par takes ${lines.length} item(s) off the commissary. This creates a draft transfer on the Fleet tab — nothing moves until it is marked received.`,
      ]));
      const ul = el("ul", { class: "breakdown-list" });
      lines.forEach((ln) => {
        const item = stockItem(ln.itemId);
        ul.append(el("li", {}, [el("span", {}, [item.name]), el("span", { class: "muted" }, [B.fmtBaseQty(item, ln.qty)])]));
      });
      body.append(ul);
      if (shortOfHub.length) {
        body.append(el("div", { class: "callout warn", style: "margin-top:12px" }, [
          `The commissary can't fully cover: ${shortOfHub.slice(0, 6).join(", ")}${shortOfHub.length > 6 ? `, and ${shortOfHub.length - 6} more` : ""}.`,
        ]));
      }
      body.append(el("div", { class: "form-actions" }, [
        el("button", { class: "btn", onclick: close }, ["Cancel"]),
        el("button", {
          class: "btn btn-primary",
          onclick: () => {
            FleetApp.createTransfer(hub, locId, lines, `Restock to par — ${locName(locId)}`);
            close();
            toast("Draft transfer created on the Fleet tab.");
          },
        }, ["Create Draft Transfer"]),
      ]));
    });
  }

  // ================= USAGE =================
  function renderUsage() {
    const panel = $("#bar-panel-usage");
    panel.innerHTML = "";
    panel.append(el("div", { class: "panel-head" }, [
      el("div", {}, [
        el("h2", {}, ["Usage & Projections"]),
        el("div", { class: "sub" }, ["What the beverage program runs at its current pace, and how long the fleet's stock covers it."]),
      ]),
    ]));

    const rows = state.recipes.map((r) => {
      const cost = B.recipeCost(r, getIngredient, getPrep);
      const proj = B.periodProjection(cost, r.menuPrice, r.servingsPerWeek);
      const avail = B.servingsAt(r, getIngredient, getPrep, null, {});
      const bars = FleetStorage.bars().filter((l) => B.offeredAt(r, getIngredient, getPrep, l.id)).length;
      return { r, cost, proj, avail, bars, cover: avail.servings && r.servingsPerWeek ? (avail.servings / (r.servingsPerWeek / 7)) : null };
    });

    const totals = rows.reduce((a, x) => {
      a.cost += x.proj.weekly.cost;
      a.revenue += x.proj.weekly.revenue;
      a.profit += x.proj.weekly.profit;
      a.servings += x.proj.weekly.servings;
      return a;
    }, { cost: 0, revenue: 0, profit: 0, servings: 0 });

    panel.append(el("div", { class: "grid grid-4" }, [
      statCard("Pours / Week", Math.round(totals.servings)),
      statCard("Pour Cost / Week", B.fmtMoney0(totals.cost)),
      statCard("Revenue / Week", B.fmtMoney0(totals.revenue)),
      statCard("Gross / Week", B.fmtMoney0(totals.profit), totals.revenue ? B.fmtPct((totals.cost / totals.revenue) * 100) + " pour cost" : "—"),
    ]));

    const projCard = el("div", { class: "card" }, [el("h3", {}, ["Projected"])]);
    const ptable = el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, ["Period"]), el("th", { class: "num" }, ["Pours"]),
        el("th", { class: "num" }, ["Pour Cost"]), el("th", { class: "num" }, ["Revenue"]), el("th", { class: "num" }, ["Gross"]),
      ])]),
    ]);
    const ptbody = el("tbody");
    [["Weekly", 1], ["Monthly", 4.33], ["Annual", 52]].forEach(([label, m]) => {
      ptbody.append(el("tr", {}, [
        el("td", {}, [el("strong", {}, [label])]),
        el("td", { class: "num" }, [Math.round(totals.servings * m).toLocaleString()]),
        el("td", { class: "num" }, [B.fmtMoney0(totals.cost * m)]),
        el("td", { class: "num" }, [B.fmtMoney0(totals.revenue * m)]),
        el("td", { class: "num" }, [B.fmtMoney0(totals.profit * m)]),
      ]));
    });
    ptable.append(ptbody);
    projCard.append(el("div", { class: "table-wrap" }, [ptable]));
    panel.append(projCard);

    const card = el("div", { class: "card" }, [
      el("div", { class: "card-head-row" }, [
        el("h3", {}, ["By Drink"]),
        el("span", { class: "muted small-note" }, ["Sorted by days of cover"]),
      ]),
    ]);
    const table = el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, ["Drink"]),
        el("th", { class: "num" }, ["Bars"]),
        el("th", { class: "num" }, ["Per Week"]),
        el("th", { class: "num" }, ["Pour Cost"]),
        el("th", { class: "num" }, ["Pour Cost %"]),
        el("th", { class: "num" }, ["Weekly Gross"]),
        el("th", { class: "num" }, ["Fleet Pours"]),
        el("th", { class: "num" }, ["Days Of Cover"]),
      ])]),
    ]);
    const tbody = el("tbody");
    rows
      .slice()
      .sort((a, b) => (a.cover == null ? 999 : a.cover) - (b.cover == null ? 999 : b.cover))
      .forEach((x) => {
        const pct = x.r.menuPrice ? B.pourCostPct(x.cost, x.r.menuPrice) : 0;
        const cls = x.cover == null ? "" : x.cover < 1 ? "row-bad" : x.cover < 3 ? "row-warn" : "";
        tbody.append(el("tr", { class: cls }, [
          el("td", {}, [el("strong", {}, [x.r.name]), el("div", { class: "muted small-note" }, [x.r.category])]),
          el("td", { class: "num" }, [String(x.bars)]),
          el("td", { class: "num" }, [B.fmtQty(x.r.servingsPerWeek, 0)]),
          el("td", { class: "num" }, [B.fmtMoney(x.cost)]),
          el("td", { class: "num" }, [x.r.menuPrice ? B.fmtPct(pct) : "—"]),
          el("td", { class: "num" }, [B.fmtMoney0(x.proj.weekly.profit)]),
          el("td", { class: "num" }, [String(x.avail.servings)]),
          el("td", { class: "num" }, [x.cover == null ? "—" : B.fmtNum(x.cover, 1)]),
        ]));
      });
    table.append(tbody);
    card.append(el("div", { class: "table-wrap" }, [table]));
    panel.append(card);
  }

  // ---------- form helpers ----------
  function field(label, inputEl, hint) {
    if (!inputEl) return null;
    return el("div", { class: "field" }, [el("label", {}, [label]), inputEl, hint ? el("div", { class: "hint" }, [hint]) : null]);
  }
  function fieldRow(fields) { return el("div", { class: "field-row" }, fields.filter(Boolean)); }
  function selectEl(options, value, onChange, required) {
    const sel = el("select", { required: required ? "required" : null });
    options.forEach((o) => {
      const opt = el("option", { value: o.id }, [o.label]);
      if (o.id === value) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", (e) => onChange(e.target.value));
    return sel;
  }

  // ================= the fleet's stock interface =================
  function transferCatalog() {
    return stockItems().map((i) => ({
      module: "bar", kind: "ingredient", id: i.id, name: i.name + (i.isPrep ? " (house prep)" : ""),
      group: i.category, unit: B.unitLabel(i, 2),
      fmt: (q) => B.fmtBaseQty(i, q),
      step: i.baseUnit === "each" ? 1 : 0.25,
    }));
  }

  function availableAt(kind, itemId, locId) {
    const item = stockItem(itemId);
    return item ? B.onHandAt(item, locId) : 0;
  }

  function moveStock(line, fromLocId, toLocId, qty) {
    const owner = stockOwner(line.itemId);
    if (!owner) return { moved: 0, note: "unknown item" };
    const want = Number(qty) || 0;
    const here = B.onHandAt(owner, fromLocId);
    const take = Math.min(here, want);
    if (take <= 0) return { moved: 0, note: `none at ${locShort(fromLocId)}` };
    B.setQtyAt(owner.onHand, fromLocId, here - take);
    B.setQtyAt(owner.onHand, toLocId, B.onHandAt(owner, toLocId) + take);
    persist();
    const item = stockItem(line.itemId);
    return { moved: take, note: take < want ? `only ${B.fmtBaseQty(item, take)} was at ${locShort(fromLocId)}` : "" };
  }

  function describeLine(line) {
    const item = stockItem(line.itemId);
    return {
      name: item ? item.name : "Unknown item",
      qtyText: item ? B.fmtBaseQty(item, line.qty) : String(line.qty),
    };
  }

  function locationValue(locId) {
    const raw = stockItems().reduce((s, i) => s + B.inventoryValueAt(i, locId), 0);
    return { raw, prepared: 0, total: raw };
  }

  // ---------- house dashboard / Ask ----------
  function summary() {
    const items = stockItems();
    const belowPar = items.filter(B.belowParAnywhere);
    const priced = state.recipes.filter((r) => Number(r.menuPrice) > 0);
    const avg = priced.length
      ? priced.reduce((s, r) => s + B.pourCostPct(B.recipeCost(r, getIngredient, getPrep), r.menuPrice), 0) / priced.length
      : 0;
    const eightySixed = [];
    state.recipes.forEach((r) => {
      FleetStorage.bars().forEach((l) => {
        const a = B.servingsAt(r, getIngredient, getPrep, l.id, { canBatch: canBatchAt(l.id) });
        if (a.offered && a.servings <= 0) eightySixed.push(`${r.name} at ${l.short || l.name}`);
      });
    });
    const weekly = state.recipes.reduce((s, r) =>
      s + (Number(r.menuPrice) || 0) * (Number(r.servingsPerWeek) || 0), 0);

    return {
      drinks: state.recipes.length,
      ingredients: state.ingredients.length,
      preps: state.preps.length,
      bars: FleetStorage.bars().length,
      avgPourCostPct: avg,
      inventoryValue: items.reduce((s, i) => s + B.inventoryValueTotal(i), 0),
      belowPar: belowPar.map((i) => i.name),
      belowParDetail: belowPar.map((i) => ({ name: i.name, at: B.shortLocations(i).map(locShort) })),
      eightySixed,
      weeklySales: weekly,
      byLocation: bevLocations().map((l) => ({ id: l.id, name: l.name, ...locationValue(l.id) })),
    };
  }

  function snapshot() {
    return {
      ingredients: sortedIngredients().map((i) => ({
        name: i.name,
        category: i.category,
        purchase: `${B.fmtQty(i.purchaseQty)} ${B.purchaseUnit(i.baseUnit, i.purchaseUnit).label} for ${B.fmtMoney(i.purchaseCost)}`,
        costPerUnit: round2(B.costPerBaseUnit(i)),
        unit: B.unitLabel(i, 1),
        onHandByBar: bevLocations()
          .filter((l) => B.onHandAt(i, l.id) > 0)
          .reduce((o, l) => { o[l.name] = B.fmtBaseQty(i, B.onHandAt(i, l.id)); return o; }, {}),
        masterOnHand: B.fmtBaseQty(i, B.onHandTotal(i)),
        belowParAt: B.shortLocations(i).map(locName),
        masterValue: round2(B.inventoryValueTotal(i)),
      })),
      preps: state.preps.map((p) => {
        const asIng = B.prepAsIngredient(p, getIngredient);
        return {
          name: p.name,
          yields: `${B.fmtQty(p.yieldQty)} ${B.unitLabel(asIng, p.yieldQty)}`,
          batchCost: round2(B.prepBatchCost(p, getIngredient)),
          costPerUnit: round2(B.prepCostPerUnit(p, getIngredient)),
          masterOnHand: B.fmtBaseQty(asIng, B.onHandTotal(p)),
          masterValue: round2(B.inventoryValueTotal(asIng)),
          onHandByBar: bevLocations()
            .filter((l) => B.onHandAt(p, l.id) > 0)
            .reduce((o, l) => { o[l.name] = B.fmtBaseQty(asIng, B.onHandAt(p, l.id)); return o; }, {}),
          belowParAt: B.shortLocations(p).map(locName),
          madeFrom: (p.components || []).map((c) => {
            const src = stockItem(c.ingredientId);
            return src ? `${src.name} ${B.fmtBaseQty(src, c.qty)}` : null;
          }).filter(Boolean),
        };
      }),
      drinks: state.recipes.map((r) => {
        const cost = B.recipeCost(r, getIngredient, getPrep);
        const master = B.servingsAt(r, getIngredient, getPrep, null, {});
        return {
          name: r.name,
          category: r.category,
          glass: getGlass(r.glasswareId) ? getGlass(r.glasswareId).name : null,
          pourCost: round2(cost),
          menuPrice: Number(r.menuPrice) || 0,
          pourCostPct: r.menuPrice ? round2(B.pourCostPct(cost, r.menuPrice)) : null,
          profitPerPour: r.menuPrice ? round2(Number(r.menuPrice) - cost) : null,
          poursPerWeek: Number(r.servingsPerWeek) || 0,
          fleetPoursAvailable: master.servings,
          firstToRunOut: master.limitedBy ? master.limitedBy.name : null,
          byBar: FleetStorage.bars().map((l) => {
            const a = B.servingsAt(r, getIngredient, getPrep, l.id, { canBatch: canBatchAt(l.id) });
            return {
              bar: l.name,
              offered: a.offered,
              pours: a.offered ? a.servings : null,
              eightySixed: a.offered && a.servings <= 0,
              limitedBy: a.offered && a.limitedBy ? a.limitedBy.name : null,
            };
          }),
          buildsFrom: (r.components || []).map((c) => {
            const src = stockItem(c.ingredientId);
            return src ? `${src.name} ${B.fmtBaseQty(src, c.qty)}` : null;
          }).filter(Boolean),
        };
      }),
      glassware: state.glassware.map((g) => ({ name: g.name, volumeOz: g.volumeOz, defaultIceOz: g.defaultIceOz, straw: !!g.straw, note: g.note || null })),
      targets: { defaultPourCostPct: state.settings.defaultTargetPourCostPct },
    };
  }

  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

  // ---------- init ----------
  function renderAll() {
    renderDashboard();
    renderIngredients();
    renderPreps();
    renderGlassware();
    renderRecipes();
    renderInventory();
    renderUsage();
  }

  function init() {
    $all(".tab-btn").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
    const reset = $("#bar-btn-reset");
    if (reset) reset.addEventListener("click", resetData);
    renderAll();
  }

  return {
    init, renderAll, summary, snapshot, switchTab,
    transferCatalog, availableAt, moveStock, describeLine, locationValue,
  };
})();
