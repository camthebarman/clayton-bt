/* catering/app.js — the catering program's seven tabs.

   Every DOM lookup is scoped to #mod-catering, so this file can share class
   names with the bar and fleet tools without colliding.

   Two ideas run through all of it:

   * Scope. Most tabs are read either for one location or for the whole fleet
     at once. `scope` is a location id, or null for the master roll-up, and
     the chip strip at the top of a tab is the only thing that changes it.

   * Prepared vs raw. The kitchen is the only place that can cook, so a boat's
     capacity to serve is the prepared portions sitting in its galley. That is
     why the Prepared tab is not a sub-page of Inventory: it is the inventory
     that matters once the lines are thrown. */

const CateringApp = (function () {
  const ROOT = document.getElementById("mod-catering");
  const el = Core.el;
  const openModal = Core.openModal;
  const closeModal = Core.closeModal;
  const toast = Core.toast;
  const C = CateringCalc;

  let state = CateringStorage.load();

  // Per-tab scope: which location the tab is being read for. null = master.
  let scope = { inventory: null, prepared: null, dashboard: null };
  let activeOrderId = null;

  function $(sel, root) { return (root || ROOT).querySelector(sel); }
  function $all(sel, root) { return Array.from((root || ROOT).querySelectorAll(sel)); }
  function persist() { CateringStorage.save(state); }

  function getIngredient(id) { return state.ingredients.find((i) => i.id === id); }
  function getRecipe(id) { return state.recipes.find((r) => r.id === id); }
  function getBatch(id) { return state.batches.find((b) => b.id === id); }
  function getOrder(id) { return state.orders.find((o) => o.id === id); }

  function foodLocations() { return FleetStorage.foodLocations(); }
  function locName(id) { return FleetStorage.locationName(id); }
  function locShort(id) { return FleetStorage.locationShort(id); }
  function canCookAt(locId) {
    const l = FleetStorage.location(locId);
    return !!(l && l.canCook);
  }
  function kitchenId() {
    const k = FleetStorage.kitchen();
    return k ? k.id : null;
  }

  function countUnit(ing) { return ing.countUnit || ing.purchaseUnit; }

  function menuOrder(name) {
    const i = CateringStorage.MENUS.indexOf(name);
    return i === -1 ? CateringStorage.MENUS.length : i;
  }
  function sortedIngredients() {
    return state.ingredients.slice().sort((a, b) =>
      a.category === b.category ? a.name.localeCompare(b.name) : a.category.localeCompare(b.category));
  }

  // ---------- shared bits ----------
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

  // The scope strip. "Master" first because the roll-up is the reason this
  // program exists; the locations follow in fleet order.
  function scopeStrip(key, onChange, opts) {
    const o = opts || {};
    const strip = el("div", { class: "scope-strip" });
    const mk = (id, label, sub) =>
      el("button", {
        class: "scope-chip" + (scope[key] === id ? " active" : "") + (id === null ? " master" : ""),
        onclick: () => { scope[key] = id; onChange(); },
      }, [
        el("span", { class: "scope-name" }, [label]),
        sub ? el("span", { class: "scope-sub" }, [sub]) : null,
      ]);

    strip.append(mk(null, "Master", "All locations"));
    foodLocations().forEach((l) => {
      if (o.filter && !o.filter(l)) return;
      const v = FleetStorage.vessel(l.vesselId);
      strip.append(mk(l.id, l.short || l.name, v ? v.name : l.kind === "kitchen" ? "Ashore · cooks" : "Ashore"));
    });
    return strip;
  }

  function scopeLabel(key) {
    return scope[key] ? locName(scope[key]) : "the whole fleet";
  }

  // ---------- tabs ----------
  function switchTab(name) {
    $all(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    $all(".panel").forEach((p) => p.classList.toggle("active", p.id === "catering-panel-" + name));
  }

  function resetData() {
    if (!confirm("Reset the catering program to its seeded starting data? Every ingredient, recipe, prepared batch and order you have changed here will be lost. The bar and the fleet are untouched.")) return;
    state = CateringStorage.resetToDefaults();
    renderAll();
    toast("Catering data reset.");
  }

  // ================= OVERVIEW =================
  function renderDashboard() {
    const panel = $("#catering-panel-dashboard");
    panel.innerHTML = "";

    const sc = scope.dashboard;
    panel.append(
      el("div", { class: "panel-head" }, [
        el("div", {}, [
          el("h2", {}, ["Catering Overview"]),
          el("div", { class: "sub" }, ["The kitchen's costs and counts, read for " + scopeLabel("dashboard") + "."]),
        ]),
      ])
    );
    panel.append(scopeStrip("dashboard", renderDashboard));

    const value = state.ingredients.reduce((s, i) => s + C.inventoryValueIn(i, sc), 0);
    const preparedPortions = state.batches
      .filter((b) => C.batchState(b) !== "expired")
      .reduce((s, b) => s + C.batchPortionsIn(b, sc), 0);
    const preparedValue = state.batches.reduce((s, b) => {
      const r = getRecipe(b.recipeId);
      if (!r || C.batchState(b) === "expired") return s;
      return s + C.batchPortionsIn(b, sc) * C.recipeCost(r, getIngredient);
    }, 0);

    const low = state.ingredients.filter((i) =>
      sc ? C.belowParAt(i, sc) : C.belowParAnywhere(i));

    const priced = state.recipes.filter((r) => Number(r.menuPrice) > 0);
    const avgPct = priced.length
      ? priced.reduce((s, r) => s + C.foodCostPct(C.recipeCost(r, getIngredient), r.menuPrice), 0) / priced.length
      : 0;

    panel.append(
      el("div", { class: "grid grid-4" }, [
        statCard("Raw Inventory", C.fmtMoney0(value), sc ? locName(sc) : `Across ${foodLocations().length} locations`),
        statCard("Prepared On Hand", preparedPortions + " portions", C.fmtMoney0(preparedValue) + " of food"),
        statCard("Below Par", low.length, sc ? "At " + locShort(sc) : "Somewhere in the fleet"),
        statCard("Avg Food Cost", priced.length ? C.fmtPct(avgPct) : "—", `${state.recipes.length} dishes costed`),
      ])
    );

    // Value by location — the master roll-up, itemised. This is the table the
    // owner actually wants: how much food is sitting where.
    if (!sc) {
      const card = el("div", { class: "card" }, [
        el("div", { class: "card-head-row" }, [
          el("h3", {}, ["Where The Food Is"]),
          el("span", { class: "muted small-note" }, ["Raw stock plus prepared portions, by location"]),
        ]),
      ]);
      const table = el("table", {}, [
        el("thead", {}, [el("tr", {}, [
          el("th", {}, ["Location"]),
          el("th", {}, ["Type"]),
          el("th", { class: "num" }, ["Raw Value"]),
          el("th", { class: "num" }, ["Prepared"]),
          el("th", { class: "num" }, ["Prepared Value"]),
          el("th", { class: "num" }, ["Total"]),
        ])]),
      ]);
      const tbody = el("tbody");
      let tR = 0, tP = 0, tPV = 0;
      foodLocations().forEach((l) => {
        const raw = state.ingredients.reduce((s, i) => s + C.inventoryValueAt(i, l.id), 0);
        const port = state.batches
          .filter((b) => C.batchState(b) !== "expired")
          .reduce((s, b) => s + C.batchPortionsAt(b, l.id), 0);
        const pv = state.batches.reduce((s, b) => {
          const r = getRecipe(b.recipeId);
          if (!r || C.batchState(b) === "expired") return s;
          return s + C.batchPortionsAt(b, l.id) * C.recipeCost(r, getIngredient);
        }, 0);
        tR += raw; tP += port; tPV += pv;
        const v = FleetStorage.vessel(l.vesselId);
        tbody.append(el("tr", {}, [
          el("td", {}, [el("strong", {}, [l.name])]),
          el("td", {}, [el("span", { class: "pill " + (v ? "afloat" : "") }, [v ? v.name : l.canCook ? "Kitchen" : "Ashore"])]),
          el("td", { class: "num" }, [C.fmtMoney(raw)]),
          el("td", { class: "num" }, [String(port)]),
          el("td", { class: "num" }, [C.fmtMoney(pv)]),
          el("td", { class: "num" }, [el("strong", {}, [C.fmtMoney(raw + pv)])]),
        ]));
      });
      tbody.append(el("tr", { class: "row-total" }, [
        el("td", {}, [el("strong", {}, ["Master"])]),
        el("td", {}, [""]),
        el("td", { class: "num" }, [el("strong", {}, [C.fmtMoney(tR)])]),
        el("td", { class: "num" }, [el("strong", {}, [String(tP)])]),
        el("td", { class: "num" }, [el("strong", {}, [C.fmtMoney(tPV)])]),
        el("td", { class: "num" }, [el("strong", {}, [C.fmtMoney(tR + tPV)])]),
      ]));
      table.append(tbody);
      card.append(el("div", { class: "table-wrap" }, [table]));
      panel.append(card);
    }

    // What is about to go off, and what the next orders need. Two lists that
    // between them are the whole morning meeting.
    panel.append(el("div", { class: "two-col" }, [expiringCard(sc), upcomingCard()]));

    if (low.length) {
      const card = el("div", { class: "card" }, [
        el("div", { class: "card-head-row" }, [
          el("h3", {}, ["Below Par"]),
          el("span", { class: "muted small-note" }, [sc ? "At " + locName(sc) : "Anywhere in the fleet"]),
        ]),
      ]);
      const list = el("ul", { class: "breakdown-list" });
      low.slice(0, 12).forEach((i) => {
        const where = sc ? [sc] : C.shortLocations(i);
        list.append(el("li", {}, [
          el("span", {}, [i.name]),
          el("span", { class: "muted" }, ["short at " + where.map(locShort).join(", ")]),
        ]));
      });
      card.append(list);
      if (low.length > 12) card.append(el("div", { class: "muted small-note", style: "margin-top:8px" }, [`and ${low.length - 12} more`]));
      panel.append(card);
    }
  }

  function expiringCard(sc) {
    const card = el("div", { class: "card" }, [
      el("div", { class: "card-head-row" }, [
        el("h3", {}, ["Prepared, By Date"]),
        el("button", { class: "btn btn-sm", onclick: () => switchTab("prepared") }, ["Prep board"]),
      ]),
    ]);
    const live = state.batches
      .filter((b) => C.batchPortionsIn(b, sc) > 0)
      .sort((a, b) => (C.daysLeft(a) == null ? 99 : C.daysLeft(a)) - (C.daysLeft(b) == null ? 99 : C.daysLeft(b)))
      .slice(0, 7);
    if (!live.length) {
      card.append(el("div", { class: "empty-state" }, ["Nothing prepared is sitting " + (sc ? "at " + locShort(sc) : "anywhere") + " right now."]));
      return card;
    }
    const list = el("ul", { class: "breakdown-list" });
    live.forEach((b) => {
      const r = getRecipe(b.recipeId);
      const st = C.batchState(b);
      const left = C.daysLeft(b);
      list.append(el("li", {}, [
        el("span", {}, [
          (r ? r.name : "Unknown"),
          el("span", { class: "muted small-note" }, [` · ${C.batchPortionsIn(b, sc)} portions`]),
        ]),
        el("span", { class: "pill " + batchPillClass(st) }, [batchPillText(st, left)]),
      ]));
    });
    card.append(list);
    return card;
  }

  function upcomingCard() {
    const card = el("div", { class: "card" }, [
      el("div", { class: "card-head-row" }, [
        el("h3", {}, ["Next Orders Out"]),
        el("button", { class: "btn btn-sm", onclick: () => switchTab("orders") }, ["All orders"]),
      ]),
    ]);
    const upcoming = state.orders
      .slice()
      .sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999")))
      .slice(0, 6);
    if (!upcoming.length) {
      card.append(el("div", { class: "empty-state" }, ["No orders on the books."]));
      return card;
    }
    const list = el("ul", { class: "breakdown-list" });
    upcoming.forEach((o) => {
      const v = FleetStorage.vessel(o.vesselId);
      list.append(el("li", {}, [
        el("span", {}, [
          o.name,
          el("span", { class: "muted small-note" }, [` · ${o.guestCount} guests${v ? " · " + v.name : ""}`]),
        ]),
        el("span", { class: "muted" }, [C.fmtDate(o.date)]),
      ]));
    });
    card.append(list);
    return card;
  }

  function batchPillClass(st) {
    return st === "expired" ? "bad" : st === "today" || st === "soon" ? "warn" : "good";
  }
  function batchPillText(st, left) {
    if (st === "expired") return "Past date";
    if (st === "today") return "Use today";
    if (st === "soon") return "1 day left";
    return left == null ? "No date" : left + " days left";
  }

  // ================= INGREDIENTS =================
  function renderIngredients() {
    const panel = $("#catering-panel-ingredients");
    panel.innerHTML = "";
    panel.append(
      el("div", { class: "panel-head" }, [
        el("div", {}, [
          el("h2", {}, ["Ingredients"]),
          el("div", { class: "sub" }, ["What you pay, how you buy it, and how much survives trimming. Everything prices down to a cost per usable unit. On-hand and par live per location — set them on the Inventory tab or in the form here."]),
        ]),
        el("button", { class: "btn btn-primary", onclick: () => openIngredientForm() }, ["Add Ingredient"]),
      ])
    );

    if (!state.ingredients.length) {
      panel.append(el("div", { class: "empty-state" }, ["No ingredients yet."]));
      return;
    }

    const table = el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, ["Ingredient"]),
        el("th", {}, ["Category"]),
        el("th", {}, ["Purchase"]),
        el("th", { class: "num" }, ["Yield"]),
        el("th", { class: "num" }, ["Cost / Usable Unit"]),
        el("th", { class: "num" }, ["Master On Hand"]),
        el("th", { class: "num" }, ["Value"]),
        el("th", {}, ["Stocked At"]),
        el("th", {}, [""]),
      ])]),
    ]);
    const tbody = el("tbody");
    sortedIngredients().forEach((ing) => {
      const u = C.purchaseUnit(ing.baseUnit, ing.purchaseUnit);
      const stocked = foodLocations().filter((l) => C.onHandAt(ing, l.id) > 0);
      tbody.append(el("tr", {}, [
        el("td", {}, [el("strong", {}, [ing.name])]),
        el("td", {}, [el("span", { class: "pill" }, [ing.category])]),
        el("td", { class: "muted" }, [`${C.fmtQty(ing.purchaseQty)} ${u.label} / ${C.fmtMoney(ing.purchaseCost)}`]),
        el("td", { class: "num" }, [C.fmtQty(ing.yieldPct) + "%"]),
        el("td", { class: "num" }, [C.fmtMoney(C.costPerUsableUnit(ing)) + " / " + C.unitLabel(ing, 1)]),
        el("td", { class: "num" }, [C.fmtBaseQty(ing, C.onHandTotal(ing))]),
        el("td", { class: "num" }, [C.fmtMoney(C.inventoryValueTotal(ing))]),
        el("td", { class: "muted small-note" }, [stocked.length ? stocked.map((l) => l.short).join(", ") : "nowhere"]),
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
      : {
          id: C.uid("cing"), name: "", category: CateringStorage.CATEGORIES[0], baseUnit: "ozwt",
          purchaseUnit: "lb", purchaseQty: 1, purchaseCost: 0, yieldPct: 100, unitNoun: "",
          onHand: {}, par: {},
        };

    openModal(existing ? "Edit Ingredient" : "Add Ingredient", (body, close) => {
      const form = el("form", { autocomplete: "off" });

      const nameInput = el("input", { type: "text", value: draft.name, required: "required", placeholder: "Chicken Breast" });
      const catSel = selectEl(CateringStorage.CATEGORIES.map((c) => ({ id: c, label: c })), draft.category, (v) => { draft.category = v; });
      form.append(fieldRow([field("Name", nameInput), field("Category", catSel)]));

      const unitWrap = el("div");
      const qtyInput = el("input", { type: "number", step: "any", min: "0", value: draft.purchaseQty });
      const costInput = el("input", { type: "number", step: "0.01", min: "0", value: draft.purchaseCost });
      const yieldInput = el("input", { type: "number", step: "any", min: "1", max: "100", value: draft.yieldPct });
      const nounInput = el("input", { type: "text", value: draft.unitNoun || "", placeholder: "bun, clove, case…" });

      function drawUnits() {
        unitWrap.innerHTML = "";
        const baseSel = selectEl(
          Object.entries(C.BASE_UNITS).map(([k, v]) => ({ id: k, label: v.long })),
          draft.baseUnit,
          (v) => {
            draft.baseUnit = v;
            draft.purchaseUnit = C.purchaseUnitsFor(v)[0].id;
            drawUnits();
          }
        );
        const puSel = selectEl(
          C.purchaseUnitsFor(draft.baseUnit).map((u) => ({ id: u.id, label: u.label })),
          draft.purchaseUnit,
          (v) => { draft.purchaseUnit = v; }
        );
        unitWrap.append(
          fieldRow([field("Measured in", baseSel), field("Bought by", puSel)]),
          fieldRow([
            field("Pack size", qtyInput, "How many of the purchase unit are in one pack."),
            field("Pack cost", costInput),
            field("Yield %", yieldInput, "What survives trim and waste."),
          ]),
          draft.baseUnit === "each" ? field("Unit name (optional)", nounInput, "Shown instead of “each”.") : null
        );
      }
      drawUnits();
      form.append(unitWrap);

      // Per-location stock. A plain grid beats a modal-inside-a-modal, and it
      // is the only place an ingredient's whole footprint is visible at once.
      form.append(el("div", { class: "section-title" }, ["Stock By Location"]));
      form.append(el("div", { class: "hint", style: "margin-bottom:8px" }, [
        "Counted in the purchase unit. Leave a location blank if it doesn't stock this — a location with no par is never flagged as below par for it.",
      ]));
      const unitId = countUnit(draft);
      const grid = el("div", { class: "loc-grid" });
      const inputs = [];
      foodLocations().forEach((l) => {
        const onIn = el("input", { class: "inline-input num", type: "number", step: "any", min: "0",
          value: C.onHandAt(draft, l.id) ? C.fmtQty(C.fromBaseQty(draft.baseUnit, unitId, C.onHandAt(draft, l.id)), 3) : "" });
        const parIn = el("input", { class: "inline-input num", type: "number", step: "any", min: "0",
          value: C.parAt(draft, l.id) ? C.fmtQty(C.fromBaseQty(draft.baseUnit, unitId, C.parAt(draft, l.id)), 3) : "" });
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
        el("button", { type: "submit", class: "btn btn-primary" }, [existing ? "Save" : "Add Ingredient"]),
      ]));

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!nameInput.value.trim()) { toast("Give the ingredient a name."); return; }
        draft.name = nameInput.value.trim();
        draft.purchaseQty = Number(qtyInput.value) || 0;
        draft.purchaseCost = Number(costInput.value) || 0;
        draft.yieldPct = Math.min(Math.max(Number(yieldInput.value) || 100, 1), 100);
        draft.unitNoun = draft.baseUnit === "each" ? nounInput.value.trim() : "";
        draft.onHand = {};
        draft.par = {};
        const u = countUnit(draft);
        inputs.forEach(({ locId, onIn, parIn }) => {
          C.setQtyAt(draft.onHand, locId, C.toBaseQty(draft.baseUnit, u, onIn.value));
          C.setQtyAt(draft.par, locId, C.toBaseQty(draft.baseUnit, u, parIn.value));
        });

        if (existing) Object.assign(existing, draft);
        else state.ingredients.push(draft);
        persist();
        close();
        renderAll();
        toast(existing ? "Ingredient saved." : "Ingredient added.");
      });

      body.append(form);
    });
  }

  function deleteIngredient(id) {
    const ing = getIngredient(id);
    if (!ing) return;
    const usedBy = state.recipes.filter((r) => (r.components || []).some((c) => c.ingredientId === id));
    const suppliedTo = state.orders.filter((o) => (o.supplies || []).some((s) => s.ingredientId === id));
    let msg = `Delete ${ing.name}?`;
    if (usedBy.length) msg += `\n\nIt is used by ${usedBy.length} recipe(s): ${usedBy.slice(0, 4).map((r) => r.name).join(", ")}${usedBy.length > 4 ? "…" : ""}. Those components will be dropped.`;
    if (suppliedTo.length) msg += `\n\nIt is a supply line on ${suppliedTo.length} order(s). Those lines will be dropped too.`;
    if (!confirm(msg)) return;

    state.ingredients = state.ingredients.filter((i) => i.id !== id);
    state.recipes.forEach((r) => { r.components = (r.components || []).filter((c) => c.ingredientId !== id); });
    state.orders.forEach((o) => { o.supplies = (o.supplies || []).filter((s) => s.ingredientId !== id); });
    persist();
    renderAll();
    toast(`${ing.name} deleted.`);
  }

  // ================= RECIPES =================
  function renderRecipes() {
    const panel = $("#catering-panel-recipes");
    panel.innerHTML = "";
    panel.append(
      el("div", { class: "panel-head" }, [
        el("div", {}, [
          el("h2", {}, ["Recipes"]),
          el("div", { class: "sub" }, ["Batch yields, portion costs and pricing. A recipe marked prep-ahead is one the kitchen produces before service — those are the ones that show up on the Prepared tab."]),
        ]),
        el("button", { class: "btn btn-primary", onclick: () => openRecipeForm() }, ["Add Recipe"]),
      ])
    );

    if (!state.recipes.length) {
      panel.append(el("div", { class: "empty-state" }, ["No recipes yet."]));
      return;
    }

    const groups = new Map();
    state.recipes.forEach((r) => {
      if (!groups.has(r.menu)) groups.set(r.menu, []);
      groups.get(r.menu).push(r);
    });
    Array.from(groups.keys())
      .sort((a, b) => menuOrder(a) - menuOrder(b) || a.localeCompare(b))
      .forEach((menu) => {
        const list = groups.get(menu).slice().sort((a, b) => a.name.localeCompare(b.name));
        panel.append(el("div", { class: "menu-head" }, [
          el("h3", {}, [menu]),
          el("span", { class: "muted small-note" }, [`${list.length} item${list.length === 1 ? "" : "s"}`]),
        ]));
        list.forEach((r) => panel.append(renderRecipeCard(r)));
      });
  }

  function renderRecipeCard(recipe) {
    const cost = C.recipeCost(recipe, getIngredient);
    const price = Number(recipe.menuPrice) || 0;
    const pct = price ? C.foodCostPct(cost, price) : 0;
    const suggested = C.suggestedPrice(cost, recipe.targetFoodCostPct);
    // Read availability across the fleet: prepared portions anywhere plus what
    // the kitchen could still cook.
    const avail = C.servingsAt(recipe, getIngredient, state.batches, null, {});

    const card = el("div", { class: "card recipe-card" });
    card.append(el("div", { class: "recipe-card-head" }, [
      el("div", {}, [
        el("h3", {}, [
          recipe.name,
          recipe.prepAhead ? el("span", { class: "tag prep" }, ["Prep ahead"]) : null,
        ]),
        el("div", { class: "recipe-meta" }, [
          `${recipe.category} · yields ${C.fmtQty(recipe.portions)} portion${Number(recipe.portions) === 1 ? "" : "s"}` +
          (recipe.prepAhead ? ` · ${(CateringStorage.HOLDS[recipe.hold] || {}).label || recipe.hold}, ${recipe.shelfLifeDays}-day life` : " · made to order"),
        ]),
      ]),
      el("div", { class: "row-actions" }, [
        recipe.prepAhead ? el("button", { class: "btn btn-sm", onclick: () => openBatchForm(null, recipe.id) }, ["Log Batch"]) : null,
        el("button", { class: "btn btn-sm", onclick: () => openRecipeForm(recipe.id) }, ["Edit"]),
        el("button", { class: "btn btn-sm danger", onclick: () => deleteRecipe(recipe.id) }, ["Delete"]),
      ]),
    ]));

    const body = el("div", { class: "recipe-card-body" });
    body.append(el("div", { class: "stat-mini-row" }, [
      statMini("Portion Cost", C.fmtMoney(cost)),
      statMini("Price", price ? C.fmtMoney(price) : "—"),
      statMini("Food Cost", price ? C.fmtPct(pct) : "—"),
      statMini("Profit", price ? C.fmtMoney(price - cost) : "—"),
      statMini("Suggested", suggested ? C.fmtMoney(suggested) : "—"),
      statMini("Available Now", String(avail.total)),
    ]));

    const two = el("div", { class: "two-col", style: "margin-top:14px" });

    const buildCard = el("div", {}, [el("h4", {}, ["Build (per batch)"])]);
    if (!(recipe.components || []).length) {
      buildCard.append(el("div", { class: "empty-state" }, ["No components yet."]));
    } else {
      const ul = el("ul", { class: "breakdown-list" });
      recipe.components.forEach((c) => {
        const ing = getIngredient(c.ingredientId);
        if (!ing) return;
        ul.append(el("li", {}, [
          el("span", {}, [ing.name, el("span", { class: "muted small-note" }, [` · ${C.fmtBaseQty(ing, c.qty)}`])]),
          el("span", { class: "muted" }, [C.fmtMoney(C.componentCost(ing, c.qty))]),
        ]));
      });
      buildCard.append(ul);
    }
    two.append(buildCard);

    const availCard = el("div", {}, [el("h4", {}, ["Where It Can Be Served"])]);
    const ul2 = el("ul", { class: "breakdown-list" });
    ul2.append(el("li", {}, [
      el("span", {}, [el("strong", {}, ["Master"])]),
      el("span", {}, [`${avail.total} (${avail.prepared} prepared + ${avail.raw} cookable)`]),
    ]));
    foodLocations().forEach((l) => {
      const a = C.servingsAt(recipe, getIngredient, state.batches, l.id, { canCook: l.canCook });
      if (!a.total && !l.canCook) return;
      ul2.append(el("li", {}, [
        el("span", { class: "muted" }, [l.short || l.name]),
        el("span", {}, [
          String(a.total),
          el("span", { class: "muted small-note" }, [l.canCook ? ` (${a.prepared} prepped + ${a.raw} cookable)` : " prepped"]),
        ]),
      ]));
    });
    availCard.append(ul2);
    if (avail.limitedBy) {
      availCard.append(el("div", { class: "callout " + (avail.total <= 0 ? "bad" : "warn"), style: "margin-top:10px" }, [
        avail.total <= 0
          ? `Nothing prepared and the kitchen is out of ${avail.limitedBy.name}.`
          : `The kitchen runs out of ${avail.limitedBy.name} first.`,
      ]));
    }
    two.append(availCard);

    body.append(two);
    if (recipe.notes) body.append(el("p", { class: "muted small-note", style: "margin-top:12px" }, [recipe.notes]));
    card.append(body);
    return card;
  }

  function openRecipeForm(id) {
    const existing = id ? getRecipe(id) : null;
    const draft = existing
      ? JSON.parse(JSON.stringify(existing))
      : {
          id: C.uid("crec"), name: "", category: "Entrée", menu: CateringStorage.MENUS[1],
          portions: 1, menuPrice: 0, targetFoodCostPct: state.settings.defaultTargetFoodCostPct,
          servingsPerWeek: 0, prepAhead: true, hold: "chilled", shelfLifeDays: 2, panNote: "",
          notes: "", components: [],
        };

    openModal(existing ? "Edit Recipe" : "Add Recipe", (body, close) => {
      const form = el("form", { autocomplete: "off" });
      const nameInput = el("input", { type: "text", value: draft.name, required: "required" });
      const catInput = el("input", { type: "text", value: draft.category, placeholder: "Entrée, Salad, Canapé…" });
      const menuSel = selectEl(CateringStorage.MENUS.map((m) => ({ id: m, label: m })), draft.menu, (v) => { draft.menu = v; });
      form.append(fieldRow([field("Name", nameInput), field("Category", catInput), field("Menu", menuSel)]));

      const portionsInput = el("input", { type: "number", step: "any", min: "0.01", value: draft.portions });
      const priceInput = el("input", { type: "number", step: "0.01", min: "0", value: draft.menuPrice });
      const targetInput = el("input", { type: "number", step: "any", min: "1", max: "100", value: draft.targetFoodCostPct });
      const weekInput = el("input", { type: "number", step: "any", min: "0", value: draft.servingsPerWeek });
      form.append(fieldRow([
        field("Portions per batch", portionsInput, "Components below are per batch."),
        field("Menu price", priceInput),
        field("Target food cost %", targetInput),
        field("Servings / week", weekInput),
      ]));

      const holdWrap = el("div");
      const prepCheck = el("input", { type: "checkbox", checked: draft.prepAhead ? "checked" : null });
      const shelfInput = el("input", { type: "number", step: "1", min: "0", value: draft.shelfLifeDays });
      const panInput = el("input", { type: "text", value: draft.panNote || "", placeholder: "Half pan, 4 oz scoop" });
      function drawHold() {
        holdWrap.innerHTML = "";
        if (!prepCheck.checked) {
          holdWrap.append(el("div", { class: "hint" }, ["Made to order. It will not appear on the Prepared tab."]));
          return;
        }
        const holdSel = selectEl(
          Object.entries(CateringStorage.HOLDS).map(([k, v]) => ({ id: k, label: `${v.label} — ${v.note}` })),
          draft.hold, (v) => { draft.hold = v; }
        );
        holdWrap.append(fieldRow([
          field("Held", holdSel),
          field("Shelf life (days)", shelfInput),
          field("Pan / packing note", panInput),
        ]));
      }
      prepCheck.addEventListener("change", drawHold);
      form.append(el("div", { class: "field checkbox-field" }, [prepCheck, el("label", {}, ["Prepared ahead in the kitchen"])]));
      drawHold();
      form.append(holdWrap);

      form.append(el("div", { class: "section-title" }, ["Components (per batch)"]));
      const compWrap = el("div");
      function drawComponents() {
        compWrap.innerHTML = "";
        if (!draft.components.length) {
          compWrap.append(el("div", { class: "empty-state" }, ["No components yet."]));
        }
        draft.components.forEach((c, idx) => {
          const ing = getIngredient(c.ingredientId);
          const sel = selectEl(
            sortedIngredients().map((i) => ({ id: i.id, label: `${i.name} (${C.unitLabel(i, 2)})` })),
            c.ingredientId,
            (v) => { c.ingredientId = v; drawComponents(); }
          );
          const qty = el("input", { class: "inline-input num", type: "number", step: "any", min: "0", value: c.qty,
            oninput: (e) => { c.qty = Number(e.target.value) || 0; } });
          compWrap.append(el("div", { class: "component-row" }, [
            el("div", { style: "flex:1" }, [sel]),
            el("div", { class: "comp-qty" }, [qty, el("span", { class: "muted small-note" }, [ing ? C.unitLabel(ing, 2) : ""])]),
            el("button", { type: "button", class: "btn btn-sm danger", onclick: () => { draft.components.splice(idx, 1); drawComponents(); } }, ["×"]),
          ]));
        });
        compWrap.append(el("button", {
          type: "button", class: "btn btn-sm", style: "margin-top:8px",
          onclick: () => {
            if (!state.ingredients.length) { toast("Add an ingredient first."); return; }
            draft.components.push({ id: C.uid("comp"), ingredientId: sortedIngredients()[0].id, qty: 1 });
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
        el("button", { type: "submit", class: "btn btn-primary" }, [existing ? "Save" : "Add Recipe"]),
      ]));

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!nameInput.value.trim()) { toast("Give the recipe a name."); return; }
        draft.name = nameInput.value.trim();
        draft.category = catInput.value.trim() || "Entrée";
        draft.portions = Math.max(Number(portionsInput.value) || 1, 0.01);
        draft.menuPrice = Number(priceInput.value) || 0;
        draft.targetFoodCostPct = Number(targetInput.value) || state.settings.defaultTargetFoodCostPct;
        draft.servingsPerWeek = Number(weekInput.value) || 0;
        draft.prepAhead = !!prepCheck.checked;
        draft.shelfLifeDays = Number(shelfInput.value) || 0;
        draft.panNote = panInput.value.trim();
        draft.notes = notesInput.value.trim();
        draft.components = draft.components.filter((c) => c.ingredientId && Number(c.qty) > 0);

        if (existing) Object.assign(existing, draft);
        else state.recipes.push(draft);
        persist();
        close();
        renderAll();
        toast(existing ? "Recipe saved." : "Recipe added.");
      });

      body.append(form);
    });
  }

  function deleteRecipe(id) {
    const r = getRecipe(id);
    if (!r) return;
    const batches = state.batches.filter((b) => b.recipeId === id);
    const orders = state.orders.filter((o) => (o.lines || []).some((ln) => ln.recipeId === id));
    let msg = `Delete ${r.name}?`;
    if (batches.length) msg += `\n\n${batches.length} prepared batch(es) of it will be removed from the prep board.`;
    if (orders.length) msg += `\n\nIt is on ${orders.length} order(s); those lines will be dropped.`;
    if (!confirm(msg)) return;
    state.recipes = state.recipes.filter((x) => x.id !== id);
    state.batches = state.batches.filter((b) => b.recipeId !== id);
    state.orders.forEach((o) => { o.lines = (o.lines || []).filter((ln) => ln.recipeId !== id); });
    persist();
    renderAll();
    toast(`${r.name} deleted.`);
  }

  // ================= PREPARED =================
  /* The tab that exists because this is a B&B, not a line kitchen.

     Food here is produced hours or days before anyone eats it, then split
     across a walk-in and three boats. So the unit of inventory on this tab is
     a batch: one production run, with a date, a hold, a shelf life, and a map
     of where its portions currently sit. The prep list at the top is the
     inverse read — what the booked orders need that no batch covers yet. */

  function livePortions(recipeId, sc) {
    return C.preparedServings(recipeId, state.batches, sc);
  }

  function renderPrepared() {
    const panel = $("#catering-panel-prepared");
    panel.innerHTML = "";
    const sc = scope.prepared;

    panel.append(
      el("div", { class: "panel-head" }, [
        el("div", {}, [
          el("h2", {}, ["Prepared"]),
          el("div", { class: "sub" }, ["Everything the kitchen has already made, where it is sitting, and how long it is good for. A boat cannot cook — what is on this board is what that boat can serve."]),
        ]),
        el("button", { class: "btn btn-primary", onclick: () => openBatchForm() }, ["Log a Batch"]),
      ])
    );
    panel.append(scopeStrip("prepared", renderPrepared));

    const live = state.batches.filter((b) => C.batchState(b) !== "expired");
    const portions = live.reduce((s, b) => s + C.batchPortionsIn(b, sc), 0);
    const value = live.reduce((s, b) => {
      const r = getRecipe(b.recipeId);
      return r ? s + C.batchPortionsIn(b, sc) * C.recipeCost(r, getIngredient) : s;
    }, 0);
    const urgent = live.filter((b) => C.batchPortionsIn(b, sc) > 0 && ["today", "soon"].includes(C.batchState(b)));
    const dead = state.batches.filter((b) => C.batchPortionsIn(b, sc) > 0 && C.batchState(b) === "expired");

    panel.append(el("div", { class: "grid grid-4" }, [
      statCard("Portions On Hand", portions, sc ? locName(sc) : "Across the fleet"),
      statCard("Food Value", C.fmtMoney0(value), `${live.filter((b) => C.batchPortionsIn(b, sc) > 0).length} live batches`),
      statCard("Use Within A Day", urgent.reduce((s, b) => s + C.batchPortionsIn(b, sc), 0), urgent.length ? urgent.length + " batch(es)" : "Nothing urgent"),
      statCard("Past Date", dead.reduce((s, b) => s + C.batchPortionsIn(b, sc), 0), dead.length ? "Pull and discard" : "Board is clean"),
    ]));

    panel.append(renderPrepList());

    if (dead.length) {
      const card = el("div", { class: "card callout-card bad" }, [
        el("div", { class: "card-head-row" }, [
          el("h3", {}, ["Past Date — Pull These"]),
          el("button", { class: "btn btn-sm danger", onclick: discardAllExpired }, ["Discard All"]),
        ]),
      ]);
      const ul = el("ul", { class: "breakdown-list" });
      dead.forEach((b) => {
        const r = getRecipe(b.recipeId);
        ul.append(el("li", {}, [
          el("span", {}, [
            r ? r.name : "Unknown",
            el("span", { class: "muted small-note" }, [` · made ${C.fmtDate(b.producedOn)} · ${C.batchPortionsIn(b, sc)} portions at ${C.locationsWithStock(b.portions).map(locShort).join(", ")}`]),
          ]),
          el("button", { class: "btn btn-sm danger", onclick: () => discardBatch(b.id) }, ["Discard"]),
        ]));
      });
      card.append(ul);
      panel.append(card);
    }

    // The board itself.
    const boardCard = el("div", { class: "card" }, [
      el("div", { class: "card-head-row" }, [
        el("h3", {}, ["Prep Board"]),
        el("span", { class: "muted small-note" }, [sc ? "Batches with portions at " + locName(sc) : "Every live batch, and where its portions are"]),
      ]),
    ]);

    const rows = state.batches
      .filter((b) => (sc ? C.batchPortionsAt(b, sc) > 0 : C.batchPortionsTotal(b) > 0))
      .sort((a, b) => {
        const da = C.daysLeft(a), db = C.daysLeft(b);
        return (da == null ? 99 : da) - (db == null ? 99 : db);
      });

    if (!rows.length) {
      boardCard.append(el("div", { class: "empty-state" }, [
        sc ? `Nothing prepared is sitting at ${locName(sc)}. Send it a batch from the Fleet tab, or log one here.`
           : "Nothing prepared on hand. Log a batch when the kitchen produces one.",
      ]));
      panel.append(boardCard);
      return;
    }

    const table = el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, ["Dish"]),
        el("th", {}, ["Hold"]),
        el("th", {}, ["Made"]),
        el("th", {}, ["Good Until"]),
        el("th", { class: "num" }, [sc ? "Portions Here" : "Portions"]),
        el("th", {}, ["Sitting At"]),
        el("th", { class: "num" }, ["Value"]),
        el("th", {}, ["Status"]),
        el("th", {}, [""]),
      ])]),
    ]);
    const tbody = el("tbody");
    rows.forEach((b) => {
      const r = getRecipe(b.recipeId);
      const st = C.batchState(b);
      const left = C.daysLeft(b);
      const exp = C.expiryDate(b);
      const cost = r ? C.recipeCost(r, getIngredient) : 0;
      const qty = C.batchPortionsIn(b, sc);
      const hold = CateringStorage.HOLDS[b.hold] || { label: b.hold };
      tbody.append(el("tr", { class: st === "expired" ? "row-bad" : st === "today" || st === "soon" ? "row-warn" : "" }, [
        el("td", {}, [
          el("strong", {}, [r ? r.name : "Unknown dish"]),
          b.notes ? el("div", { class: "muted small-note" }, [b.notes]) : null,
        ]),
        el("td", {}, [el("span", { class: "pill hold-" + b.hold }, [hold.label])]),
        el("td", { class: "muted" }, [C.fmtDate(b.producedOn)]),
        el("td", { class: "muted" }, [exp ? exp.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"]),
        el("td", { class: "num" }, [
          el("input", {
            class: "inline-input num", type: "number", step: "1", min: "0", value: String(qty),
            disabled: sc ? null : "disabled",
            title: sc ? "" : "Pick a location to edit portions",
            onchange: (e) => {
              if (!sc) return;
              C.setQtyAt(b.portions, sc, Math.max(0, Math.round(Number(e.target.value) || 0)));
              persist();
              renderPrepared();
              renderDashboard();
            },
          }),
        ]),
        el("td", { class: "muted small-note" }, [
          C.locationsWithStock(b.portions).map((l) => `${locShort(l)} ${C.batchPortionsAt(b, l)}`).join(" · ") || "—",
        ]),
        el("td", { class: "num" }, [C.fmtMoney(qty * cost)]),
        el("td", {}, [el("span", { class: "pill " + batchPillClass(st) }, [batchPillText(st, left)])]),
        el("td", {}, [el("div", { class: "row-actions" }, [
          el("button", { class: "btn btn-sm", onclick: () => openBatchForm(b.id) }, ["Edit"]),
          el("button", { class: "btn btn-sm danger", onclick: () => discardBatch(b.id) }, ["Discard"]),
        ])]),
      ]));
    });
    table.append(tbody);
    boardCard.append(el("div", { class: "table-wrap" }, [table]));
    panel.append(boardCard);
  }

  // What the booked orders need that no live batch covers. This is the list
  // the kitchen works from, and it is derived, never stored — so it is right
  // the moment an order changes or a batch is logged.
  function prepDemand(horizonDays) {
    const today = C.parseDate(C.todayISO());
    const need = new Map();
    state.orders.forEach((o) => {
      if (o.status === "cancelled") return;
      const d = C.parseDate(o.date);
      if (d && horizonDays != null) {
        const days = Math.round((d.getTime() - today.getTime()) / 86400000);
        if (days < 0 || days > horizonDays) return;
      }
      (o.lines || []).forEach((ln) => {
        const r = getRecipe(ln.recipeId);
        if (!r || !r.prepAhead) return;
        const portions = C.orderPortions(o.guestCount, ln.portionsPerGuest, ln.overagePct);
        const found = need.get(r.id);
        if (found) { found.portions += portions; found.orders.push(o); }
        else need.set(r.id, { recipe: r, portions, orders: [o] });
      });
    });
    return Array.from(need.values()).map((n) => {
      const have = livePortions(n.recipe.id, null);
      return { ...n, have, short: Math.max(0, n.portions - have) };
    });
  }

  function renderPrepList() {
    const HORIZON = 7;
    const demand = prepDemand(HORIZON).sort((a, b) => b.short - a.short || a.recipe.name.localeCompare(b.recipe.name));
    const card = el("div", { class: "card" }, [
      el("div", { class: "card-head-row" }, [
        el("h3", {}, ["Prep List — Next 7 Days"]),
        el("span", { class: "muted small-note" }, ["Booked orders, less what is already made"]),
      ]),
    ]);

    if (!demand.length) {
      card.append(el("div", { class: "empty-state" }, ["Nothing booked in the next seven days needs prepping ahead."]));
      return card;
    }

    const table = el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, ["Dish"]),
        el("th", { class: "num" }, ["Needed"]),
        el("th", { class: "num" }, ["Made"]),
        el("th", { class: "num" }, ["To Produce"]),
        el("th", { class: "num" }, ["Batches"]),
        el("th", {}, ["Pan / Hold"]),
        el("th", {}, ["For"]),
        el("th", {}, [""]),
      ])]),
    ]);
    const tbody = el("tbody");
    demand.forEach((d) => {
      const batches = d.short > 0 ? Math.ceil(d.short / C.portionsPerBatch(d.recipe)) : 0;
      const hold = CateringStorage.HOLDS[d.recipe.hold] || { label: d.recipe.hold };
      const names = Array.from(new Set(d.orders.map((o) => o.name)));
      tbody.append(el("tr", { class: d.short > 0 ? "row-warn" : "" }, [
        el("td", {}, [el("strong", {}, [d.recipe.name])]),
        el("td", { class: "num" }, [String(d.portions)]),
        el("td", { class: "num" }, [String(d.have)]),
        el("td", { class: "num" }, [d.short > 0 ? el("strong", {}, [String(d.short)]) : el("span", { class: "muted" }, ["—"])]),
        el("td", { class: "num" }, [batches ? String(batches) : "—"]),
        el("td", { class: "muted small-note" }, [`${hold.label}${d.recipe.panNote ? " · " + d.recipe.panNote : ""}`]),
        el("td", { class: "muted small-note" }, [names.slice(0, 2).join(", ") + (names.length > 2 ? ` +${names.length - 2}` : "")]),
        el("td", {}, [
          d.short > 0
            ? el("button", { class: "btn btn-sm", onclick: () => openBatchForm(null, d.recipe.id, batches * C.portionsPerBatch(d.recipe)) }, ["Log Batch"])
            : el("span", { class: "pill good" }, ["Covered"]),
        ]),
      ]));
    });
    table.append(tbody);
    card.append(el("div", { class: "table-wrap" }, [table]));

    const shortTotal = demand.reduce((s, d) => s + d.short, 0);
    card.append(el("div", { class: "callout " + (shortTotal ? "warn" : "good"), style: "margin-top:12px" }, [
      shortTotal
        ? `${shortTotal} portions still to produce across ${demand.filter((d) => d.short > 0).length} dishes.`
        : "Everything booked this week is already made and on the board.",
    ]));
    return card;
  }

  function openBatchForm(id, presetRecipeId, presetPortions) {
    const existing = id ? getBatch(id) : null;
    const prepRecipes = state.recipes.filter((r) => r.prepAhead);
    if (!existing && !prepRecipes.length) {
      toast("Mark a recipe as prepared ahead first.");
      return;
    }
    const seedRecipe = existing ? getRecipe(existing.recipeId) : getRecipe(presetRecipeId) || prepRecipes[0];
    const draft = existing
      ? JSON.parse(JSON.stringify(existing))
      : {
          id: C.uid("prep_b"), recipeId: seedRecipe.id, producedOn: C.todayISO(),
          shelfLifeDays: seedRecipe.shelfLifeDays, hold: seedRecipe.hold,
          portions: kitchenId() ? { [kitchenId()]: Math.round(presetPortions || C.portionsPerBatch(seedRecipe)) } : {},
          notes: "",
        };

    openModal(existing ? "Edit Batch" : "Log a Batch", (body, close) => {
      const form = el("form", { autocomplete: "off" });
      const wrap = el("div");

      const dateInput = el("input", { type: "date", value: draft.producedOn });
      const shelfInput = el("input", { type: "number", step: "1", min: "0", value: draft.shelfLifeDays });
      const notesInput = el("input", { type: "text", value: draft.notes || "", placeholder: "Pan count, labelling, who made it…" });
      const portionInputs = [];

      function draw() {
        wrap.innerHTML = "";
        portionInputs.length = 0;
        const recipe = getRecipe(draft.recipeId);

        const recSel = selectEl(
          prepRecipes.map((r) => ({ id: r.id, label: `${r.name} — yields ${C.fmtQty(r.portions)}` })),
          draft.recipeId,
          (v) => {
            draft.recipeId = v;
            const r = getRecipe(v);
            if (r) {
              draft.shelfLifeDays = r.shelfLifeDays;
              draft.hold = r.hold;
              shelfInput.value = r.shelfLifeDays;
              // A different dish is a different batch size. Carrying the last
              // dish's yield over is how you log twelve of something that
              // comes twenty to a pan.
              draft.portions = kitchenId() ? { [kitchenId()]: Math.round(C.portionsPerBatch(r)) } : {};
            }
            draw();
          }
        );
        const holdSel = selectEl(
          Object.entries(CateringStorage.HOLDS).map(([k, v]) => ({ id: k, label: v.label })),
          draft.hold, (v) => { draft.hold = v; }
        );

        wrap.append(field("Dish", recSel));
        wrap.append(fieldRow([field("Produced on", dateInput), field("Shelf life (days)", shelfInput), field("Held", holdSel)]));

        if (recipe && recipe.panNote) {
          wrap.append(el("div", { class: "callout", style: "margin-bottom:12px" }, [recipe.panNote]));
        }

        wrap.append(el("div", { class: "section-title" }, ["Portions By Location"]));
        wrap.append(el("div", { class: "hint", style: "margin-bottom:8px" }, [
          "Usually all of it lands in the kitchen and moves out later on a transfer. Split it here if it went straight to a boat.",
        ]));
        const grid = el("div", { class: "loc-grid" });
        foodLocations().forEach((l) => {
          const input = el("input", { class: "inline-input num", type: "number", step: "1", min: "0",
            value: C.batchPortionsAt(draft, l.id) || "" });
          portionInputs.push({ locId: l.id, input });
          grid.append(el("div", { class: "loc-grid-row" }, [
            el("div", { class: "loc-grid-name" }, [
              el("strong", {}, [l.short || l.name]),
              el("span", { class: "muted small-note" }, [l.canCook ? "Cooks here" : "Holds only"]),
            ]),
            el("label", { class: "loc-grid-field wide" }, [el("span", {}, ["Portions"]), input]),
          ]));
        });
        wrap.append(grid);
        wrap.append(field("Notes", notesInput));
      }
      draw();
      form.append(wrap);

      // Only on a new batch. Editing one after the fact should not draw the
      // ingredients a second time.
      const drawCheck = el("input", { type: "checkbox", checked: "checked" });
      if (!existing) {
        form.append(el("div", { class: "field checkbox-field", style: "margin-top:4px" }, [
          drawCheck,
          el("label", {}, ["Take the ingredients out of raw stock"]),
        ]));
        form.append(el("div", { class: "hint" }, [
          "Pulls what the batch used from the kitchen first, then the commissary. Leave it off if you have already counted the raw stock down yourself.",
        ]));
      }

      form.append(el("div", { class: "form-actions" }, [
        el("button", { type: "button", class: "btn", onclick: close }, ["Cancel"]),
        el("button", { type: "submit", class: "btn btn-primary" }, [existing ? "Save Batch" : "Log Batch"]),
      ]));

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        draft.producedOn = dateInput.value || C.todayISO();
        draft.shelfLifeDays = Number(shelfInput.value) || 0;
        draft.notes = notesInput.value.trim();
        draft.portions = {};
        portionInputs.forEach(({ locId, input }) => {
          C.setQtyAt(draft.portions, locId, Math.max(0, Math.round(Number(input.value) || 0)));
        });
        if (C.batchPortionsTotal(draft) <= 0) { toast("Put some portions somewhere."); return; }

        if (existing) {
          Object.assign(existing, draft);
          persist();
          close();
          renderAll();
          toast("Batch saved.");
          return;
        }

        state.batches.push(draft);
        let short = [];
        if (drawCheck.checked) {
          const recipe = getRecipe(draft.recipeId);
          if (recipe) short = drawDownForBatch(recipe, C.batchPortionsTotal(draft));
        }
        persist();
        close();
        renderAll();

        if (short.length) {
          // The batch is on the board either way — it was cooked. But the
          // counts that fed it were wrong, and that is worth saying once.
          openModal("Logged, But The Counts Were Short", (b2, close2) => {
            b2.append(el("p", {}, [
              "The batch is on the prep board. Drawing its ingredients took every one of these down to zero and still came up short, so the raw counts were already behind what the kitchen actually had:",
            ]));
            const ul = el("ul", { class: "breakdown-list" });
            short.forEach((x) => ul.append(el("li", {}, [
              el("span", {}, [x.ingredient.name]),
              el("span", { class: "muted" }, ["short " + C.fmtBaseQty(x.ingredient, x.qty)]),
            ])));
            b2.append(ul);
            b2.append(el("div", { class: "callout warn", style: "margin-top:12px" }, [
              "Re-count these on the Inventory tab. Until you do, the master will read low on them.",
            ]));
            b2.append(el("div", { class: "form-actions" }, [
              el("button", { class: "btn btn-primary", onclick: close2 }, ["Got it"]),
            ]));
          });
        } else {
          toast(drawCheck.checked ? "Batch logged and the ingredients drawn down." : "Batch logged.");
        }
      });

      body.append(form);
    });
  }

  // Producing a batch consumes the ingredients that went into it. Without
  // this, logging a batch would add prepared food to the master while the
  // raw chicken it was made from still sat in the walk-in, and the operation
  // would look richer every time it cooked.
  //
  // The cook pulls from the kitchen and walks to the commissary for the rest,
  // so that is the order stock comes out in.
  function drawDownForBatch(recipe, portions) {
    const order = [kitchenId(), hubId()].filter(Boolean);
    const short = [];
    C.portionRequirements(recipe, portions, getIngredient).forEach((req) => {
      let left = req.asPurchasedQty;
      order.forEach((locId) => {
        if (left <= 0) return;
        const here = C.onHandAt(req.ingredient, locId);
        const take = Math.min(here, left);
        if (take > 0) {
          C.setQtyAt(req.ingredient.onHand, locId, here - take);
          left -= take;
        }
      });
      if (left > 0.0001) short.push({ ingredient: req.ingredient, qty: left });
    });
    persist();
    return short;
  }

  function discardBatch(id) {
    const b = getBatch(id);
    if (!b) return;
    const r = getRecipe(b.recipeId);
    if (!confirm(`Discard this batch of ${r ? r.name : "prepared food"}? ${C.batchPortionsTotal(b)} portions come off the board.`)) return;
    state.batches = state.batches.filter((x) => x.id !== id);
    persist();
    renderAll();
    toast("Batch discarded.");
  }

  function discardAllExpired() {
    const dead = state.batches.filter((b) => C.batchState(b) === "expired");
    if (!dead.length) { toast("Nothing is past date."); return; }
    const portions = dead.reduce((s, b) => s + C.batchPortionsTotal(b), 0);
    if (!confirm(`Discard ${dead.length} batch(es) past their date — ${portions} portions in total?`)) return;
    state.batches = state.batches.filter((b) => C.batchState(b) !== "expired");
    persist();
    renderAll();
    toast(`${dead.length} batch(es) discarded.`);
  }

  // ================= INVENTORY =================
  /* Two readings of the same numbers. Pick a location and you get that
     location's count sheet, in the unit it counts in. Pick Master and you get
     one row per ingredient with a column per location and the total beside
     them — which is the view that answers "do we have enough anywhere", as
     opposed to "is this boat short". Both are editable; the master grid is
     how you fix a count you took on paper for three places at once. */

  function renderInventory() {
    const panel = $("#catering-panel-inventory");
    panel.innerHTML = "";
    const sc = scope.inventory;

    panel.append(
      el("div", { class: "panel-head" }, [
        el("div", {}, [
          el("h2", {}, ["Inventory"]),
          el("div", { class: "sub" }, ["Raw stock, counted where it sits. Prepared food is on its own tab."]),
        ]),
        el("div", { class: "head-controls" }, [
          sc ? el("button", { class: "btn", onclick: () => fillAllToPar(sc) }, ["Fill To Par"]) : null,
          sc && sc !== hubId() ? el("button", { class: "btn btn-primary", onclick: () => proposeRestock(sc) }, ["Restock From Commissary"]) : null,
        ]),
      ])
    );
    panel.append(scopeStrip("inventory", renderInventory));

    const value = state.ingredients.reduce((s, i) => s + C.inventoryValueIn(i, sc), 0);
    const low = state.ingredients.filter((i) => (sc ? C.belowParAt(i, sc) : C.belowParAnywhere(i)));
    const stocked = state.ingredients.filter((i) => C.onHandIn(i, sc) > 0);
    const reorder = low.reduce((s, i) => {
      const gap = sc ? Math.max(0, C.parAt(i, sc) - C.onHandAt(i, sc)) : C.parGap(i);
      const pack = C.packBaseQty(i);
      return s + (pack > 0 ? Math.ceil(gap / pack) * (Number(i.purchaseCost) || 0) : 0);
    }, 0);

    panel.append(el("div", { class: "grid grid-4" }, [
      statCard("Stock Value", C.fmtMoney0(value), sc ? locName(sc) : "Master, all locations"),
      statCard("Items Stocked", stocked.length, `of ${state.ingredients.length} tracked`),
      statCard("Below Par", low.length, sc ? "At " + locShort(sc) : "Anywhere"),
      statCard(sc ? "Cost To Fill" : "Cost To Order", C.fmtMoney0(reorder), sc ? "Whole packs" : "Whole packs, fleet-wide"),
    ]));

    panel.append(sc ? countSheetFor(sc) : masterGrid());
  }

  function hubId() {
    const h = FleetStorage.hub();
    return h ? h.id : null;
  }

  // ---- master grid: one column per location, plus the total ----
  function masterGrid() {
    const locs = foodLocations();
    const card = el("div", { class: "card" }, [
      el("div", { class: "card-head-row" }, [
        el("h3", {}, ["Master Count"]),
        el("span", { class: "muted small-note" }, ["Every location, side by side. Counts are in each item's own count unit."]),
      ]),
    ]);

    const table = el("table", { class: "master-grid" }, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, ["Ingredient"]),
        ...locs.map((l) => el("th", { class: "num", title: l.name }, [l.short || l.name])),
        el("th", { class: "num" }, ["Master"]),
        el("th", { class: "num" }, ["Par"]),
        el("th", { class: "num" }, ["Value"]),
        el("th", {}, ["Status"]),
      ])]),
    ]);
    const tbody = el("tbody");
    let lastCat = null;
    sortedIngredients().forEach((ing) => {
      if (ing.category !== lastCat) {
        lastCat = ing.category;
        tbody.append(el("tr", { class: "cat-row" }, [
          el("td", { colspan: String(locs.length + 5) }, [ing.category]),
        ]));
      }
      const unit = countUnit(ing);
      const total = C.onHandTotal(ing);
      const par = C.parTotal(ing);
      const short = C.shortLocations(ing);
      tbody.append(el("tr", { class: short.length ? "row-warn" : "" }, [
        el("td", {}, [
          el("strong", {}, [ing.name]),
          el("div", { class: "muted small-note" }, [C.purchaseUnit(ing.baseUnit, unit).label]),
        ]),
        ...locs.map((l) => {
          const has = C.parAt(ing, l.id) > 0 || C.onHandAt(ing, l.id) > 0;
          const isShort = C.belowParAt(ing, l.id);
          return el("td", { class: "num" + (isShort ? " cell-short" : "") }, [
            el("input", {
              class: "inline-input num" + (has ? "" : " ghost"),
              type: "number", step: "any", min: "0",
              title: `${ing.name} at ${l.name}`,
              value: C.onHandAt(ing, l.id) ? C.fmtQty(C.fromBaseQty(ing.baseUnit, unit, C.onHandAt(ing, l.id)), 3) : "",
              oninput: (e) => {
                C.setQtyAt(ing.onHand, l.id, C.toBaseQty(ing.baseUnit, unit, e.target.value));
                persist();
              },
              onchange: () => { renderInventory(); renderDashboard(); },
            }),
          ]);
        }),
        el("td", { class: "num" }, [el("strong", {}, [C.fmtQty(C.fromBaseQty(ing.baseUnit, unit, total), 2)])]),
        el("td", { class: "num muted" }, [par ? C.fmtQty(C.fromBaseQty(ing.baseUnit, unit, par), 2) : "—"]),
        el("td", { class: "num" }, [C.fmtMoney(C.inventoryValueTotal(ing))]),
        el("td", {}, [
          short.length
            ? el("span", { class: "pill warn", title: "Short at " + short.map(locName).join(", ") }, ["Short ×" + short.length])
            : par
            ? el("span", { class: "pill good" }, ["OK"])
            : el("span", { class: "pill" }, ["No par"]),
        ]),
      ]));
    });
    table.append(tbody);
    card.append(el("div", { class: "table-wrap" }, [table]));
    card.append(el("div", { class: "hint", style: "margin-top:10px" }, [
      "A blank cell means that location doesn't stock the item. Type a number to start stocking it there; set its par in the ingredient's own form so it gets flagged when it runs short.",
    ]));
    return card;
  }

  // ---- one location's count sheet ----
  function countSheetFor(locId) {
    const loc = FleetStorage.location(locId);
    const card = el("div", { class: "card" }, [
      el("div", { class: "card-head-row" }, [
        el("h3", {}, [(loc ? loc.name : "Location") + " Count Sheet"]),
        el("span", { class: "muted small-note" }, [loc && loc.notes ? loc.notes : ""]),
      ]),
    ]);

    // Items this location actually carries come first; everything else is
    // tucked behind a toggle so a count sheet for a boat galley is a page,
    // not a catalogue.
    const carried = state.ingredients.filter((i) => C.parAt(i, locId) > 0 || C.onHandAt(i, locId) > 0);
    const rest = state.ingredients.filter((i) => !carried.includes(i));

    if (!carried.length) {
      card.append(el("div", { class: "empty-state" }, [
        `${loc ? loc.name : "This location"} isn't stocking anything yet. Add a par on an ingredient, or count something in below.`,
      ]));
    } else {
      card.append(el("div", { class: "table-wrap" }, [countTable(carried, locId)]));
    }

    if (rest.length) {
      const more = el("details", { class: "more-items" }, [
        el("summary", {}, [`Everything else the kitchen tracks (${rest.length})`]),
      ]);
      more.append(el("div", { class: "table-wrap", style: "margin-top:10px" }, [countTable(rest, locId)]));
      card.append(more);
    }
    return card;
  }

  function countTable(items, locId) {
    const table = el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, ["Ingredient"]),
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
      .forEach((ing) => {
        const unit = countUnit(ing);
        const low = C.belowParAt(ing, locId);
        const out = C.onHandAt(ing, locId) <= 0;
        const par = C.parAt(ing, locId);
        tbody.append(el("tr", { class: out && par > 0 ? "row-bad" : low ? "row-warn" : "" }, [
          el("td", {}, [el("strong", {}, [ing.name])]),
          el("td", {}, [el("span", { class: "pill" }, [ing.category])]),
          el("td", { class: "num" }, [
            el("input", {
              class: "inline-input num", type: "number", step: "any", min: "0",
              value: C.onHandAt(ing, locId) ? C.fmtQty(C.fromBaseQty(ing.baseUnit, unit, C.onHandAt(ing, locId)), 3) : "",
              oninput: (e) => { C.setQtyAt(ing.onHand, locId, C.toBaseQty(ing.baseUnit, unit, e.target.value)); persist(); },
              onchange: () => { renderInventory(); renderDashboard(); renderRecipes(); },
            }),
          ]),
          el("td", { class: "num" }, [
            el("input", {
              class: "inline-input num", type: "number", step: "any", min: "0",
              value: par ? C.fmtQty(C.fromBaseQty(ing.baseUnit, unit, par), 3) : "",
              oninput: (e) => { C.setQtyAt(ing.par, locId, C.toBaseQty(ing.baseUnit, unit, e.target.value)); persist(); },
              onchange: () => renderInventory(),
            }),
          ]),
          el("td", {}, [
            selectEl(
              C.purchaseUnitsFor(ing.baseUnit).map((u) => ({ id: u.id, label: u.id === "each" ? C.unitLabel(ing, 2) || u.label : u.label })),
              unit,
              (v) => { ing.countUnit = v; persist(); renderInventory(); }
            ),
          ]),
          el("td", { class: "num" }, [C.fmtMoney(C.inventoryValueAt(ing, locId))]),
          el("td", { class: "num muted" }, [C.fmtBaseQty(ing, C.onHandTotal(ing))]),
          el("td", {}, [
            !par ? el("span", { class: "pill" }, ["No par"])
              : out ? el("span", { class: "pill bad" }, ["Out"])
              : low ? el("span", { class: "pill warn" }, ["Short"])
              : el("span", { class: "pill good" }, ["OK"]),
          ]),
          el("td", {}, [el("div", { class: "row-actions" }, [
            el("button", { class: "btn btn-sm", title: "Count this up to par", onclick: () => fillToPar(ing.id, locId) }, ["To Par"]),
          ])]),
        ]));
      });
    table.append(tbody);
    return table;
  }

  function fillToPar(id, locId) {
    const ing = getIngredient(id);
    if (!ing) return;
    const par = C.parAt(ing, locId);
    if (par <= 0) { toast("Set a par for this item at this location first."); return; }
    if (C.onHandAt(ing, locId) < par) C.setQtyAt(ing.onHand, locId, par);
    persist();
    renderAll();
    toast(`${ing.name} counted up to par at ${locShort(locId)}.`);
  }

  function fillAllToPar(locId) {
    const low = state.ingredients.filter((i) => C.belowParAt(i, locId));
    if (!low.length) { toast("Nothing is below par here."); return; }
    if (!confirm(`Bring ${low.length} item(s) up to par at ${locName(locId)}? Use this after a delivery is put away — it does not move anything off another location.`)) return;
    low.forEach((i) => C.setQtyAt(i.onHand, locId, C.parAt(i, locId)));
    persist();
    renderAll();
    toast(`${low.length} item(s) filled to par.`);
  }

  // Build a transfer that would bring a location back up to par, drawing on
  // what the commissary actually has. Handing it to Fleet rather than moving
  // stock here keeps one ledger for anything that travels.
  function proposeRestock(locId) {
    const hub = hubId();
    if (!hub) { toast("No central storage location is set up."); return; }
    const lines = [];
    const shortOfHub = [];
    state.ingredients.forEach((ing) => {
      const gap = Math.max(0, C.parAt(ing, locId) - C.onHandAt(ing, locId));
      if (gap <= 0) return;
      const available = C.onHandAt(ing, hub);
      const move = Math.min(gap, available);
      if (move > 0) lines.push({ module: "catering", itemId: ing.id, qty: move, kind: "ingredient" });
      if (available < gap) shortOfHub.push(ing.name);
    });

    if (!lines.length) {
      toast(shortOfHub.length ? "The commissary has none of what this location is short." : "Nothing to restock here.");
      return;
    }

    openModal("Restock " + locName(locId), (body, close) => {
      body.append(el("p", {}, [
        `Bringing ${locName(locId)} up to par takes ${lines.length} item(s) off the commissary. This creates a draft transfer on the Fleet tab — nothing moves until it is marked received.`,
      ]));
      const ul = el("ul", { class: "breakdown-list" });
      lines.forEach((ln) => {
        const ing = getIngredient(ln.itemId);
        ul.append(el("li", {}, [
          el("span", {}, [ing.name]),
          el("span", { class: "muted" }, [C.fmtBaseQty(ing, ln.qty)]),
        ]));
      });
      body.append(ul);
      if (shortOfHub.length) {
        body.append(el("div", { class: "callout warn", style: "margin-top:12px" }, [
          `The commissary can't fully cover: ${shortOfHub.slice(0, 6).join(", ")}${shortOfHub.length > 6 ? `, and ${shortOfHub.length - 6} more` : ""}. Those go on the order instead.`,
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

  // ================= ORDERS =================
  /* Every piece of paid food service is an order, and a preplanned lunch is
     just an order with a service type and a recurrence — same lines, same
     overage, same shopping list. The tab ends in a load-out, because on this
     operation the last step isn't "plate it", it's "get it on the boat". */

  const SERVICE_TYPES = ["Preplanned Lunch", "Dinner Cruise", "Private Charter", "B&B Breakfast", "Offsite Catering"];
  const ORDER_STATUSES = ["quoted", "confirmed", "prepped", "delivered", "cancelled"];

  function linePortions(order, line) {
    return C.orderPortions(order.guestCount, line.portionsPerGuest, line.overagePct);
  }
  function supplyQty(order, sup) {
    return Math.ceil((Number(order.guestCount) || 0) * (Number(sup.qtyPerGuest) || 0));
  }

  function orderRequirements(order) {
    const lists = (order.lines || []).map((ln) => {
      const r = getRecipe(ln.recipeId);
      return r ? C.portionRequirements(r, linePortions(order, ln), getIngredient) : [];
    });
    (order.supplies || []).forEach((s) => {
      const ing = getIngredient(s.ingredientId);
      if (!ing) return;
      const qty = supplyQty(order, s);
      lists.push([{ ingredient: ing, usableQty: qty, asPurchasedQty: qty / C.yieldFactor(ing), cost: C.componentCost(ing, qty) }]);
    });
    return C.aggregateRequirements(lists);
  }

  function orderTotals(order) {
    let foodCost = 0;
    let menuRevenue = 0;
    (order.lines || []).forEach((ln) => {
      const r = getRecipe(ln.recipeId);
      if (!r) return;
      const p = linePortions(order, ln);
      foodCost += C.recipeCost(r, getIngredient) * p;
      menuRevenue += (Number(r.menuPrice) || 0) * p;
    });
    let supplyCost = 0;
    (order.supplies || []).forEach((s) => {
      const ing = getIngredient(s.ingredientId);
      if (ing) supplyCost += C.componentCost(ing, supplyQty(order, s));
    });
    const totalCost = foodCost + supplyCost;
    const revenue =
      order.pricingMode === "perGuest" ? (Number(order.pricePerGuest) || 0) * (Number(order.guestCount) || 0)
      : order.pricingMode === "menu" ? menuRevenue
      : 0;
    return {
      foodCost, supplyCost, totalCost, revenue,
      profit: revenue - totalCost,
      costPct: revenue ? (totalCost / revenue) * 100 : 0,
      costPerGuest: order.guestCount ? totalCost / order.guestCount : 0,
    };
  }

  function renderOrders() {
    const panel = $("#catering-panel-orders");
    panel.innerHTML = "";
    panel.append(
      el("div", { class: "panel-head" }, [
        el("div", {}, [
          el("h2", {}, ["Catering Orders"]),
          el("div", { class: "sub" }, ["Cruises, charters, breakfasts and the standing preplanned lunch runs — all the same shape, so they all cost and provision the same way."]),
        ]),
        el("button", { class: "btn btn-primary", onclick: () => openOrderForm() }, ["Add Order"]),
      ])
    );

    if (!state.orders.length) {
      panel.append(el("div", { class: "empty-state" }, ["No orders yet."]));
      return;
    }

    const sorted = state.orders.slice().sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999")));
    if (!activeOrderId || !getOrder(activeOrderId)) activeOrderId = sorted[0].id;

    const chips = el("div", { class: "chip-row" });
    sorted.forEach((o) => {
      chips.append(el("button", {
        class: "chip" + (o.id === activeOrderId ? " active" : ""),
        onclick: () => { activeOrderId = o.id; renderOrders(); },
      }, [
        el("span", {}, [o.name]),
        el("span", { class: "chip-sub" }, [`${C.fmtDate(o.date)} · ${o.guestCount}`]),
      ]));
    });
    panel.append(chips);

    const order = getOrder(activeOrderId);
    panel.append(renderOrderSummary(order));
    panel.append(renderOrderMenu(order));
    panel.append(renderOrderPrepPlan(order));
    panel.append(renderOrderSupplies(order));
    panel.append(renderOrderShoppingList(order));
  }

  function renderOrderSummary(order) {
    const t = orderTotals(order);
    const v = FleetStorage.vessel(order.vesselId);
    const card = el("div", { class: "card" });
    card.append(el("div", { class: "card-head-row" }, [
      el("div", {}, [
        el("h3", {}, [
          order.name,
          el("span", { class: "tag status-" + order.status }, [order.status]),
        ]),
        el("div", { class: "muted small-note" }, [
          [order.serviceType, C.fmtDate(order.date), v ? v.name : "Ashore",
           order.locationId ? "out of " + locShort(order.locationId) : null,
           order.recurring || null].filter(Boolean).join(" · "),
        ]),
      ]),
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn btn-sm btn-primary", onclick: () => buildLoadOut(order.id) }, ["Build Load-Out"]),
        el("button", { class: "btn btn-sm", onclick: () => exportOrderSheet(order.id) }, ["Prep Sheet"]),
        el("button", { class: "btn btn-sm", onclick: () => openOrderForm(order.id) }, ["Edit"]),
        el("button", { class: "btn btn-sm", onclick: () => duplicateOrder(order.id) }, ["Duplicate"]),
        el("button", { class: "btn btn-sm danger", onclick: () => deleteOrder(order.id) }, ["Delete"]),
      ]),
    ]));

    card.append(el("div", { class: "grid grid-4", style: "margin-top:12px;margin-bottom:0" }, [
      statCard("Guests", order.guestCount, order.pricingMode === "included" ? "Included in the room rate" : C.fmtMoney(order.pricePerGuest) + " per guest"),
      statCard("Food + Supplies", C.fmtMoney0(t.totalCost), C.fmtMoney(t.costPerGuest) + " per guest"),
      statCard("Revenue", t.revenue ? C.fmtMoney0(t.revenue) : "—", order.pricingMode === "menu" ? "At menu prices" : order.pricingMode === "included" ? "No revenue booked" : "Package price"),
      statCard("Food Cost %", t.revenue ? C.fmtPct(t.costPct) : "—", t.revenue ? C.fmtMoney0(t.profit) + " gross" : "—"),
    ]));

    if (v && Number(order.guestCount) > Number(v.capacity)) {
      card.append(el("div", { class: "callout bad", style: "margin-top:12px" }, [
        `${order.guestCount} guests is over ${v.name}'s certified capacity of ${v.capacity}.`,
      ]));
    }
    if (order.notes) card.append(el("p", { class: "muted small-note", style: "margin-top:12px" }, [order.notes]));
    return card;
  }

  function renderOrderMenu(order) {
    const card = el("div", { class: "card" }, [
      el("div", { class: "card-head-row" }, [
        el("h3", {}, ["Menu"]),
        el("button", { class: "btn btn-sm", onclick: () => addOrderLine(order.id) }, ["Add Dish"]),
      ]),
    ]);
    if (!(order.lines || []).length) {
      card.append(el("div", { class: "empty-state" }, ["No dishes on this order yet."]));
      return card;
    }
    const table = el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, ["Dish"]),
        el("th", { class: "num" }, ["Per Guest"]),
        el("th", { class: "num" }, ["Overage %"]),
        el("th", { class: "num" }, ["Portions"]),
        el("th", { class: "num" }, ["Cost"]),
        el("th", { class: "num" }, ["At Menu Price"]),
        el("th", {}, [""]),
      ])]),
    ]);
    const tbody = el("tbody");
    (order.lines || []).forEach((ln, idx) => {
      const r = getRecipe(ln.recipeId);
      if (!r) return;
      const p = linePortions(order, ln);
      const proj = C.lineProjection(C.recipeCost(r, getIngredient), r.menuPrice, p);
      tbody.append(el("tr", {}, [
        el("td", {}, [
          el("strong", {}, [r.name]),
          r.prepAhead ? el("span", { class: "tag prep" }, ["prep"]) : null,
          el("div", { class: "muted small-note" }, [r.menu]),
        ]),
        el("td", { class: "num" }, [
          el("input", { class: "inline-input num", type: "number", step: "0.05", min: "0", value: ln.portionsPerGuest,
            oninput: (e) => { ln.portionsPerGuest = Number(e.target.value) || 0; persist(); },
            onchange: renderOrders }),
        ]),
        el("td", { class: "num" }, [
          el("input", { class: "inline-input num", type: "number", step: "1", min: "0", value: ln.overagePct,
            oninput: (e) => { ln.overagePct = Number(e.target.value) || 0; persist(); },
            onchange: renderOrders }),
        ]),
        el("td", { class: "num" }, [el("strong", {}, [String(p)])]),
        el("td", { class: "num" }, [C.fmtMoney(proj.cost)]),
        el("td", { class: "num muted" }, [C.fmtMoney(proj.revenue)]),
        el("td", {}, [el("div", { class: "row-actions" }, [
          el("button", { class: "btn btn-sm danger", onclick: () => removeOrderLine(order.id, idx) }, ["×"]),
        ])]),
      ]));
    });
    table.append(tbody);
    card.append(el("div", { class: "table-wrap" }, [table]));
    return card;
  }

  // The bridge between an order and the prep board: for each prep-ahead dish,
  // how many portions are already made, how many are where this order is being
  // served, and how many the kitchen still owes it.
  function renderOrderPrepPlan(order) {
    const prepLines = (order.lines || []).filter((ln) => {
      const r = getRecipe(ln.recipeId);
      return r && r.prepAhead;
    });
    const card = el("div", { class: "card" }, [
      el("div", { class: "card-head-row" }, [
        el("h3", {}, ["Prep Plan"]),
        el("span", { class: "muted small-note" }, [order.locationId ? "Served out of " + locName(order.locationId) : "No service location set"]),
      ]),
    ]);
    if (!prepLines.length) {
      card.append(el("div", { class: "empty-state" }, ["Nothing on this order is prepped ahead."]));
      return card;
    }

    const table = el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, ["Dish"]),
        el("th", { class: "num" }, ["Needs"]),
        el("th", { class: "num" }, ["Made (fleet)"]),
        el("th", { class: "num" }, ["Already There"]),
        el("th", { class: "num" }, ["To Produce"]),
        el("th", { class: "num" }, ["To Send"]),
        el("th", {}, ["Status"]),
      ])]),
    ]);
    const tbody = el("tbody");
    prepLines.forEach((ln) => {
      const r = getRecipe(ln.recipeId);
      const need = linePortions(order, ln);
      const made = livePortions(r.id, null);
      const there = order.locationId ? livePortions(r.id, order.locationId) : 0;
      const toProduce = Math.max(0, need - made);
      const toSend = Math.max(0, Math.min(need, made) - there);
      const ok = toProduce <= 0 && toSend <= 0;
      tbody.append(el("tr", { class: toProduce > 0 ? "row-warn" : "" }, [
        el("td", {}, [el("strong", {}, [r.name])]),
        el("td", { class: "num" }, [String(need)]),
        el("td", { class: "num" }, [String(made)]),
        el("td", { class: "num" }, [String(there)]),
        el("td", { class: "num" }, [toProduce > 0 ? el("strong", {}, [String(toProduce)]) : el("span", { class: "muted" }, ["—"])]),
        el("td", { class: "num" }, [toSend > 0 ? String(toSend) : el("span", { class: "muted" }, ["—"])]),
        el("td", {}, [
          ok ? el("span", { class: "pill good" }, ["On the boat"])
            : toProduce > 0 ? el("span", { class: "pill warn" }, ["Kitchen owes it"])
            : el("span", { class: "pill" }, ["Needs sending"]),
        ]),
      ]));
    });
    table.append(tbody);
    card.append(el("div", { class: "table-wrap" }, [table]));
    return card;
  }

  function renderOrderSupplies(order) {
    const card = el("div", { class: "card" }, [
      el("div", { class: "card-head-row" }, [
        el("h3", {}, ["Supplies"]),
        el("button", { class: "btn btn-sm", onclick: () => addOrderSupply(order.id) }, ["Add Supply"]),
      ]),
    ]);
    if (!(order.supplies || []).length) {
      card.append(el("div", { class: "empty-state" }, ["No boxes, cutlery or fuel on this order — worth a second look before it goes out."]));
      return card;
    }
    const table = el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, ["Item"]),
        el("th", { class: "num" }, ["Per Guest"]),
        el("th", { class: "num" }, ["Total"]),
        el("th", { class: "num" }, ["Cost"]),
        el("th", { class: "num" }, ["At Service Location"]),
        el("th", {}, [""]),
      ])]),
    ]);
    const tbody = el("tbody");
    (order.supplies || []).forEach((s, idx) => {
      const ing = getIngredient(s.ingredientId);
      if (!ing) return;
      const qty = supplyQty(order, s);
      const there = order.locationId ? C.onHandAt(ing, order.locationId) : 0;
      tbody.append(el("tr", { class: order.locationId && there < qty ? "row-warn" : "" }, [
        el("td", {}, [el("strong", {}, [ing.name])]),
        el("td", { class: "num" }, [
          el("input", { class: "inline-input num", type: "number", step: "0.05", min: "0", value: s.qtyPerGuest,
            oninput: (e) => { s.qtyPerGuest = Number(e.target.value) || 0; persist(); },
            onchange: renderOrders }),
        ]),
        el("td", { class: "num" }, [C.fmtBaseQty(ing, qty)]),
        el("td", { class: "num" }, [C.fmtMoney(C.componentCost(ing, qty))]),
        el("td", { class: "num muted" }, [order.locationId ? C.fmtBaseQty(ing, there) : "—"]),
        el("td", {}, [el("div", { class: "row-actions" }, [
          el("button", { class: "btn btn-sm danger", onclick: () => removeOrderSupply(order.id, idx) }, ["×"]),
        ])]),
      ]));
    });
    table.append(tbody);
    card.append(el("div", { class: "table-wrap" }, [table]));
    return card;
  }

  // What has to be bought, measured against the whole fleet's raw stock —
  // because an order is provisioned from wherever the food is, not from one
  // shelf. The shortfall is what goes on the purveyor order.
  function renderOrderShoppingList(order) {
    const reqs = orderRequirements(order).sort((a, b) => a.ingredient.name.localeCompare(b.ingredient.name));
    const card = el("div", { class: "card" }, [
      el("div", { class: "card-head-row" }, [
        el("h3", {}, ["Shopping List"]),
        el("span", { class: "muted small-note" }, ["Against every location's raw stock"]),
      ]),
    ]);
    if (!reqs.length) {
      card.append(el("div", { class: "empty-state" }, ["Nothing to buy — this order has no dishes or supplies yet."]));
      return card;
    }

    const table = el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, ["Ingredient"]),
        el("th", { class: "num" }, ["Needed"]),
        el("th", { class: "num" }, ["Fleet On Hand"]),
        el("th", { class: "num" }, ["Short"]),
        el("th", { class: "num" }, ["Packs To Buy"]),
        el("th", { class: "num" }, ["Buy Cost"]),
      ])]),
    ]);
    const tbody = el("tbody");
    let buyTotal = 0;
    let shortCount = 0;
    reqs.forEach((req) => {
      const sf = C.shortfall(req, null);
      buyTotal += sf.buyCost;
      if (sf.shortQty > 0) shortCount++;
      tbody.append(el("tr", { class: sf.shortQty > 0 ? "row-warn" : "" }, [
        el("td", {}, [el("strong", {}, [req.ingredient.name])]),
        el("td", { class: "num" }, [C.fmtBaseQty(req.ingredient, req.asPurchasedQty)]),
        el("td", { class: "num muted" }, [C.fmtBaseQty(req.ingredient, sf.onHandQty)]),
        el("td", { class: "num" }, [sf.shortQty > 0 ? C.fmtBaseQty(req.ingredient, sf.shortQty) : "—"]),
        el("td", { class: "num" }, [sf.packs ? String(sf.packs) : "—"]),
        el("td", { class: "num" }, [sf.buyCost ? C.fmtMoney(sf.buyCost) : "—"]),
      ]));
    });
    table.append(tbody);
    card.append(el("div", { class: "table-wrap" }, [table]));
    card.append(el("div", { class: "callout " + (shortCount ? "warn" : "good"), style: "margin-top:12px" }, [
      shortCount
        ? `${shortCount} item(s) short across the fleet — ${C.fmtMoney(buyTotal)} to order in whole packs.`
        : "Everything this order needs is already somewhere in the fleet.",
    ]));
    return card;
  }

  // Turn an order into a transfer: the prepared portions and supplies that
  // have to physically reach the boat. This is the step that actually moves
  // inventory, and it goes through Fleet so there is one ledger for it.
  function buildLoadOut(id) {
    const order = getOrder(id);
    if (!order) return;
    if (!order.locationId) { toast("Set a service location on this order first."); return; }
    const from = kitchenId() || hubId();
    if (!from) { toast("No kitchen or commissary is set up to send from."); return; }
    if (from === order.locationId) { toast("This order is served out of the kitchen — nothing to send."); return; }

    const prepared = [];
    const supplies = [];
    const cannot = [];

    (order.lines || []).forEach((ln) => {
      const r = getRecipe(ln.recipeId);
      if (!r || !r.prepAhead) return;
      const need = linePortions(order, ln);
      const there = livePortions(r.id, order.locationId);
      const gap = Math.max(0, need - there);
      if (gap <= 0) return;
      const atSource = livePortions(r.id, from);
      const move = Math.min(gap, atSource);
      if (move > 0) prepared.push({ recipe: r, qty: move });
      if (atSource < gap) cannot.push(`${r.name} (${gap - atSource} portions still to make)`);
    });

    (order.supplies || []).forEach((s) => {
      const ing = getIngredient(s.ingredientId);
      if (!ing) return;
      const gap = Math.max(0, supplyQty(order, s) - C.onHandAt(ing, order.locationId));
      if (gap <= 0) return;
      const atSource = C.onHandAt(ing, from);
      const move = Math.min(gap, atSource);
      if (move > 0) supplies.push({ ingredient: ing, qty: move });
      if (atSource < gap) cannot.push(`${ing.name} (${C.fmtBaseQty(ing, gap - atSource)} short at ${locShort(from)})`);
    });

    openModal("Load-Out — " + order.name, (body, close) => {
      body.append(el("p", {}, [
        `Everything ${locName(order.locationId)} still needs for this order, drawn from ${locName(from)}. Nothing moves until the transfer is marked received on the Fleet tab.`,
      ]));

      if (!prepared.length && !supplies.length) {
        body.append(el("div", { class: "callout good" }, ["Nothing to send — the service location already has everything this order needs."]));
      } else {
        if (prepared.length) {
          body.append(el("div", { class: "section-title" }, ["Prepared Food"]));
          const ul = el("ul", { class: "breakdown-list" });
          prepared.forEach((p) => ul.append(el("li", {}, [
            el("span", {}, [p.recipe.name]),
            el("span", { class: "muted" }, [p.qty + " portions"]),
          ])));
          body.append(ul);
        }
        if (supplies.length) {
          body.append(el("div", { class: "section-title" }, ["Supplies"]));
          const ul = el("ul", { class: "breakdown-list" });
          supplies.forEach((s) => ul.append(el("li", {}, [
            el("span", {}, [s.ingredient.name]),
            el("span", { class: "muted" }, [C.fmtBaseQty(s.ingredient, s.qty)]),
          ])));
          body.append(ul);
        }
      }

      if (cannot.length) {
        body.append(el("div", { class: "callout warn", style: "margin-top:12px" }, [
          "Not covered by " + locShort(from) + ": " + cannot.slice(0, 5).join("; ") + (cannot.length > 5 ? `; and ${cannot.length - 5} more` : "") + ".",
        ]));
      }

      body.append(el("div", { class: "form-actions" }, [
        el("button", { class: "btn", onclick: close }, ["Close"]),
        prepared.length || supplies.length
          ? el("button", {
              class: "btn btn-primary",
              onclick: () => {
                const lines = [
                  ...prepared.map((p) => ({ module: "catering", kind: "prepared", itemId: p.recipe.id, qty: p.qty })),
                  ...supplies.map((s) => ({ module: "catering", kind: "ingredient", itemId: s.ingredient.id, qty: s.qty })),
                ];
                FleetApp.createTransfer(from, order.locationId, lines, `Load-out — ${order.name}`);
                close();
                toast("Load-out drafted on the Fleet tab.");
              },
            }, ["Create Transfer"])
          : null,
      ]));
    });
  }

  function exportOrderSheet(id) {
    const order = getOrder(id);
    if (!order) return;
    const t = orderTotals(order);
    const v = FleetStorage.vessel(order.vesselId);
    const lines = [];
    lines.push(order.name.toUpperCase());
    lines.push("=".repeat(order.name.length));
    lines.push(`${order.serviceType} · ${order.date || "no date"} · ${order.guestCount} guests`);
    if (v) lines.push(`Vessel: ${v.name} (capacity ${v.capacity})`);
    if (order.locationId) lines.push(`Served out of: ${locName(order.locationId)}`);
    if (order.recurring) lines.push(`Recurring: ${order.recurring}`);
    if (order.notes) lines.push("", order.notes);

    lines.push("", "PRODUCE", "-------");
    (order.lines || []).forEach((ln) => {
      const r = getRecipe(ln.recipeId);
      if (!r) return;
      const need = linePortions(order, ln);
      const made = livePortions(r.id, null);
      const toMake = r.prepAhead ? Math.max(0, need - made) : need;
      const batches = toMake > 0 ? Math.ceil(toMake / C.portionsPerBatch(r)) : 0;
      lines.push(
        `[ ] ${r.name} — ${need} portions` +
        (r.prepAhead ? ` (${made} already made, produce ${toMake}${batches ? `, ${batches} batch${batches === 1 ? "" : "es"}` : ""})` : " (to order)") +
        (r.panNote ? `\n      ${r.panNote}` : "")
      );
    });

    lines.push("", "SUPPLIES", "--------");
    (order.supplies || []).forEach((s) => {
      const ing = getIngredient(s.ingredientId);
      if (ing) lines.push(`[ ] ${ing.name} — ${C.fmtBaseQty(ing, supplyQty(order, s))}`);
    });

    lines.push("", "SHOPPING", "--------");
    orderRequirements(order).forEach((req) => {
      const sf = C.shortfall(req, null);
      if (sf.shortQty > 0) {
        lines.push(`[ ] ${req.ingredient.name} — short ${C.fmtBaseQty(req.ingredient, sf.shortQty)}, buy ${sf.packs} pack(s) ${C.fmtMoney(sf.buyCost)}`);
      }
    });

    lines.push("", "COST", "----");
    lines.push(`Food        ${C.fmtMoney(t.foodCost)}`);
    lines.push(`Supplies    ${C.fmtMoney(t.supplyCost)}`);
    lines.push(`Total       ${C.fmtMoney(t.totalCost)}  (${C.fmtMoney(t.costPerGuest)} / guest)`);
    if (t.revenue) {
      lines.push(`Revenue     ${C.fmtMoney(t.revenue)}`);
      lines.push(`Food cost   ${C.fmtPct(t.costPct)}`);
      lines.push(`Gross       ${C.fmtMoney(t.profit)}`);
    }

    Core.downloadText(lines.join("\n"), order.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + "-prep-sheet.txt");
    toast("Prep sheet saved.");
  }

  function addOrderLine(id) {
    const order = getOrder(id);
    if (!order || !state.recipes.length) { toast("Add a recipe first."); return; }
    openModal("Add Dish To Order", (body, close) => {
      let recipeId = state.recipes[0].id;
      let per = 1;
      let over = state.settings.defaultOveragePct;
      const form = el("form", {}, [
        field("Dish", selectEl(
          state.recipes.slice().sort((a, b) => menuOrder(a.menu) - menuOrder(b.menu) || a.name.localeCompare(b.name))
            .map((r) => ({ id: r.id, label: `${r.menu} — ${r.name}` })),
          recipeId, (v) => { recipeId = v; })),
        fieldRow([
          field("Portions per guest", el("input", { type: "number", step: "0.05", min: "0", value: per, oninput: (e) => { per = Number(e.target.value) || 0; } })),
          field("Overage %", el("input", { type: "number", step: "1", min: "0", value: over, oninput: (e) => { over = Number(e.target.value) || 0; } })),
        ]),
        el("div", { class: "form-actions" }, [
          el("button", { type: "button", class: "btn", onclick: close }, ["Cancel"]),
          el("button", { type: "submit", class: "btn btn-primary" }, ["Add"]),
        ]),
      ]);
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        order.lines.push({ id: C.uid("ln"), recipeId, portionsPerGuest: per, overagePct: over });
        persist(); close(); renderOrders(); renderPrepared();
      });
      body.append(form);
    });
  }

  function removeOrderLine(id, idx) {
    const order = getOrder(id);
    if (!order) return;
    order.lines.splice(idx, 1);
    persist();
    renderOrders();
    renderPrepared();
  }

  function addOrderSupply(id) {
    const order = getOrder(id);
    if (!order) return;
    const pool = state.ingredients.filter((i) => i.category === "Packaging");
    const options = (pool.length ? pool : state.ingredients).slice().sort((a, b) => a.name.localeCompare(b.name));
    if (!options.length) { toast("Add an ingredient first."); return; }
    openModal("Add Supply To Order", (body, close) => {
      let ingredientId = options[0].id;
      let per = 1;
      const form = el("form", {}, [
        field("Item", selectEl(options.map((i) => ({ id: i.id, label: i.name })), ingredientId, (v) => { ingredientId = v; })),
        field("Per guest", el("input", { type: "number", step: "0.05", min: "0", value: per, oninput: (e) => { per = Number(e.target.value) || 0; } })),
        el("div", { class: "form-actions" }, [
          el("button", { type: "button", class: "btn", onclick: close }, ["Cancel"]),
          el("button", { type: "submit", class: "btn btn-primary" }, ["Add"]),
        ]),
      ]);
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        order.supplies.push({ id: C.uid("sup"), ingredientId, qtyPerGuest: per });
        persist(); close(); renderOrders();
      });
      body.append(form);
    });
  }

  function removeOrderSupply(id, idx) {
    const order = getOrder(id);
    if (!order) return;
    order.supplies.splice(idx, 1);
    persist();
    renderOrders();
  }

  function openOrderForm(id) {
    const existing = id ? getOrder(id) : null;
    const draft = existing
      ? JSON.parse(JSON.stringify(existing))
      : {
          id: C.uid("cord"), name: "", date: C.todayISO(), serviceType: SERVICE_TYPES[0], recurring: "",
          status: "quoted", vesselId: null, locationId: kitchenId(), guestCount: 20,
          pricingMode: "perGuest", pricePerGuest: 0, notes: "", lines: [], supplies: [],
        };

    openModal(existing ? "Edit Order" : "Add Order", (body, close) => {
      const form = el("form", { autocomplete: "off" });
      const nameInput = el("input", { type: "text", value: draft.name, required: "required", placeholder: "Belle Noon Tour — Preplanned Lunch" });
      const dateInput = el("input", { type: "date", value: draft.date || "" });
      form.append(fieldRow([field("Order name", nameInput), field("Date", dateInput)]));

      const typeSel = selectEl(SERVICE_TYPES.map((t) => ({ id: t, label: t })), draft.serviceType, (v) => { draft.serviceType = v; });
      const statusSel = selectEl(ORDER_STATUSES.map((s) => ({ id: s, label: s })), draft.status, (v) => { draft.status = v; });
      const recurInput = el("input", { type: "text", value: draft.recurring || "", placeholder: "Daily, Jun–Sep" });
      form.append(fieldRow([
        field("Service type", typeSel, "Preplanned lunches are ordinary orders with a recurrence."),
        field("Status", statusSel),
        field("Recurring", recurInput),
      ]));

      const vesselSel = selectEl(
        [{ id: "", label: "Ashore / no vessel" }, ...FleetStorage.vessels().map((v) => ({ id: v.id, label: `${v.name} (${v.capacity})` }))],
        draft.vesselId || "", (v) => { draft.vesselId = v || null; }
      );
      const locSel = selectEl(
        [{ id: "", label: "No service location" }, ...foodLocations().map((l) => ({ id: l.id, label: l.name }))],
        draft.locationId || "", (v) => { draft.locationId = v || null; }
      );
      const guestInput = el("input", { type: "number", step: "1", min: "0", value: draft.guestCount });
      form.append(fieldRow([field("Vessel", vesselSel), field("Served out of", locSel), field("Guests", guestInput)]));

      const priceWrap = el("div");
      const priceInput = el("input", { type: "number", step: "0.01", min: "0", value: draft.pricePerGuest });
      function drawPricing() {
        priceWrap.innerHTML = "";
        const modeSel = selectEl([
          { id: "perGuest", label: "Package price per guest" },
          { id: "menu", label: "Billed at menu prices" },
          { id: "included", label: "Included — books no revenue" },
        ], draft.pricingMode, (v) => { draft.pricingMode = v; drawPricing(); });
        priceWrap.append(fieldRow([
          field("Pricing", modeSel),
          draft.pricingMode === "perGuest" ? field("Price per guest", priceInput) : null,
        ]));
      }
      drawPricing();
      form.append(priceWrap);

      const notesInput = el("textarea", {}, [draft.notes || ""]);
      form.append(field("Notes", notesInput));

      form.append(el("div", { class: "form-actions" }, [
        el("button", { type: "button", class: "btn", onclick: close }, ["Cancel"]),
        el("button", { type: "submit", class: "btn btn-primary" }, [existing ? "Save" : "Add Order"]),
      ]));

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!nameInput.value.trim()) { toast("Give the order a name."); return; }
        draft.name = nameInput.value.trim();
        draft.date = dateInput.value;
        draft.recurring = recurInput.value.trim();
        draft.guestCount = Math.max(0, Math.round(Number(guestInput.value) || 0));
        draft.pricePerGuest = Number(priceInput.value) || 0;
        draft.notes = notesInput.value.trim();

        if (existing) Object.assign(existing, draft);
        else { state.orders.push(draft); activeOrderId = draft.id; }
        persist();
        close();
        renderAll();
        toast(existing ? "Order saved." : "Order added.");
      });

      body.append(form);
    });
  }

  function duplicateOrder(id) {
    const order = getOrder(id);
    if (!order) return;
    const copy = JSON.parse(JSON.stringify(order));
    copy.id = C.uid("cord");
    copy.name = order.name + " (copy)";
    copy.status = "quoted";
    copy.sinceVersion = undefined;
    copy.lines.forEach((l) => (l.id = C.uid("ln")));
    copy.supplies.forEach((s) => (s.id = C.uid("sup")));
    state.orders.push(copy);
    activeOrderId = copy.id;
    persist();
    renderOrders();
    toast("Order duplicated — a standing lunch run copies in one click.");
  }

  function deleteOrder(id) {
    const order = getOrder(id);
    if (!order) return;
    if (!confirm(`Delete ${order.name}?`)) return;
    state.orders = state.orders.filter((o) => o.id !== id);
    if (activeOrderId === id) activeOrderId = null;
    persist();
    renderAll();
    toast("Order deleted.");
  }

  // ================= USAGE =================
  function renderUsage() {
    const panel = $("#catering-panel-usage");
    panel.innerHTML = "";
    panel.append(
      el("div", { class: "panel-head" }, [
        el("div", {}, [
          el("h2", {}, ["Usage & Projections"]),
          el("div", { class: "sub" }, ["What the catering program runs at its current pace. Days of cover reads against everything on hand — prepared portions plus what the kitchen could still cook."]),
        ]),
      ])
    );

    const rows = state.recipes.map((r) => {
      const cost = C.recipeCost(r, getIngredient);
      const proj = C.periodProjection(cost, r.menuPrice, r.servingsPerWeek);
      const avail = C.servingsAt(r, getIngredient, state.batches, null, {});
      return { r, cost, proj, avail, cover: C.daysOfCover(avail.total, r.servingsPerWeek) };
    });

    const totals = rows.reduce((acc, x) => {
      acc.cost += x.proj.weekly.cost;
      acc.revenue += x.proj.weekly.revenue;
      acc.profit += x.proj.weekly.profit;
      acc.servings += x.proj.weekly.servings;
      return acc;
    }, { cost: 0, revenue: 0, profit: 0, servings: 0 });

    panel.append(el("div", { class: "grid grid-4" }, [
      statCard("Servings / Week", Math.round(totals.servings)),
      statCard("Food Cost / Week", C.fmtMoney0(totals.cost)),
      statCard("Revenue / Week", C.fmtMoney0(totals.revenue), "At menu prices"),
      statCard("Gross / Week", C.fmtMoney0(totals.profit), totals.revenue ? C.fmtPct((totals.cost / totals.revenue) * 100) + " food cost" : "—"),
    ]));

    const projCard = el("div", { class: "card" }, [el("h3", {}, ["Projected"])]);
    const ptable = el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, ["Period"]),
        el("th", { class: "num" }, ["Servings"]),
        el("th", { class: "num" }, ["Food Cost"]),
        el("th", { class: "num" }, ["Revenue"]),
        el("th", { class: "num" }, ["Gross Profit"]),
      ])]),
    ]);
    const ptbody = el("tbody");
    [["Weekly", 1], ["Monthly", 4.33], ["Annual", 52]].forEach(([label, mult]) => {
      ptbody.append(el("tr", {}, [
        el("td", {}, [el("strong", {}, [label])]),
        el("td", { class: "num" }, [Math.round(totals.servings * mult).toLocaleString()]),
        el("td", { class: "num" }, [C.fmtMoney0(totals.cost * mult)]),
        el("td", { class: "num" }, [C.fmtMoney0(totals.revenue * mult)]),
        el("td", { class: "num" }, [C.fmtMoney0(totals.profit * mult)]),
      ]));
    });
    ptable.append(ptbody);
    projCard.append(el("div", { class: "table-wrap" }, [ptable]));
    panel.append(projCard);

    const card = el("div", { class: "card" }, [
      el("div", { class: "card-head-row" }, [
        el("h3", {}, ["By Dish"]),
        el("span", { class: "muted small-note" }, ["Sorted by what runs out first"]),
      ]),
    ]);
    const table = el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, ["Dish"]),
        el("th", { class: "num" }, ["Per Week"]),
        el("th", { class: "num" }, ["Portion Cost"]),
        el("th", { class: "num" }, ["Weekly Cost"]),
        el("th", { class: "num" }, ["Weekly Gross"]),
        el("th", { class: "num" }, ["Available"]),
        el("th", { class: "num" }, ["Days Of Cover"]),
        el("th", {}, ["Status"]),
      ])]),
    ]);
    const tbody = el("tbody");
    rows
      .slice()
      .sort((a, b) => (a.cover == null ? 999 : a.cover) - (b.cover == null ? 999 : b.cover))
      .forEach((x) => {
        const cls = x.cover == null ? "" : x.cover < 1 ? "row-bad" : x.cover < 3 ? "row-warn" : "";
        tbody.append(el("tr", { class: cls }, [
          el("td", {}, [el("strong", {}, [x.r.name]), el("div", { class: "muted small-note" }, [x.r.menu])]),
          el("td", { class: "num" }, [C.fmtQty(x.r.servingsPerWeek, 0)]),
          el("td", { class: "num" }, [C.fmtMoney(x.cost)]),
          el("td", { class: "num" }, [C.fmtMoney0(x.proj.weekly.cost)]),
          el("td", { class: "num" }, [C.fmtMoney0(x.proj.weekly.profit)]),
          el("td", { class: "num" }, [String(x.avail.total)]),
          el("td", { class: "num" }, [x.cover == null ? "—" : C.fmtNum(x.cover, 1)]),
          el("td", {}, [
            x.cover == null ? el("span", { class: "pill" }, ["No run rate"])
              : x.cover < 1 ? el("span", { class: "pill bad" }, ["Under a day"])
              : x.cover < 3 ? el("span", { class: "pill warn" }, ["Thin"])
              : el("span", { class: "pill good" }, ["Covered"]),
          ]),
        ]));
      });
    table.append(tbody);
    card.append(el("div", { class: "table-wrap" }, [table]));
    panel.append(card);
  }

  // ---------- form helpers ----------
  function field(label, inputEl, hint) {
    if (!inputEl) return null;
    return el("div", { class: "field" }, [
      el("label", {}, [label]),
      inputEl,
      hint ? el("div", { class: "hint" }, [hint]) : null,
    ]);
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
  /* Fleet moves things between locations but must not know how catering
     stores them. These three functions are the whole contract: what can
     travel, how much of it is at a location, and move some. */

  function transferCatalog() {
    const out = [];
    state.ingredients.forEach((i) => {
      out.push({
        module: "catering", kind: "ingredient", id: i.id, name: i.name,
        group: i.category, unit: C.unitLabel(i, 2),
        fmt: (q) => C.fmtBaseQty(i, q),
        step: i.baseUnit === "each" ? 1 : 0.25,
      });
    });
    state.recipes
      .filter((r) => r.prepAhead)
      .forEach((r) => {
        out.push({
          module: "catering", kind: "prepared", id: r.id, name: r.name + " (prepared)",
          group: "Prepared Food", unit: "portions",
          fmt: (q) => `${C.fmtQty(q, 0)} portions`,
          step: 1,
        });
      });
    return out;
  }

  function availableAt(kind, itemId, locId) {
    if (kind === "prepared") return livePortions(itemId, locId);
    const ing = getIngredient(itemId);
    return ing ? C.onHandAt(ing, locId) : 0;
  }

  // Moves stock and reports what actually happened. Prepared portions move
  // oldest-first: if two batches of chicken salad are in the walk-in, the one
  // that expires tomorrow is the one that goes on the boat, which is both
  // correct rotation and the only way the prep board stays honest.
  function moveStock(line, fromLocId, toLocId, qty) {
    const want = Number(qty) || 0;
    if (want <= 0) return { moved: 0, note: "nothing to move" };

    if (line.kind === "prepared") {
      const batches = state.batches
        .filter((b) => b.recipeId === line.itemId && C.batchPortionsAt(b, fromLocId) > 0)
        .sort((a, b) => {
          const da = C.daysLeft(a), db = C.daysLeft(b);
          return (da == null ? 999 : da) - (db == null ? 999 : db);
        });
      let left = want;
      batches.forEach((b) => {
        if (left <= 0) return;
        const here = C.batchPortionsAt(b, fromLocId);
        const take = Math.min(here, left);
        C.setQtyAt(b.portions, fromLocId, here - take);
        C.setQtyAt(b.portions, toLocId, C.batchPortionsAt(b, toLocId) + take);
        left -= take;
      });
      const moved = want - left;
      persist();
      return { moved, note: left > 0 ? `${left} portions were not at ${locShort(fromLocId)}` : "" };
    }

    const ing = getIngredient(line.itemId);
    if (!ing) return { moved: 0, note: "unknown item" };
    const here = C.onHandAt(ing, fromLocId);
    const take = Math.min(here, want);
    C.setQtyAt(ing.onHand, fromLocId, here - take);
    C.setQtyAt(ing.onHand, toLocId, C.onHandAt(ing, toLocId) + take);
    persist();
    return { moved: take, note: take < want ? `only ${C.fmtBaseQty(ing, take)} was at ${locShort(fromLocId)}` : "" };
  }

  function describeLine(line) {
    if (line.kind === "prepared") {
      const r = getRecipe(line.itemId);
      return { name: r ? r.name + " (prepared)" : "Unknown prepared item", qtyText: `${C.fmtQty(line.qty, 0)} portions` };
    }
    const ing = getIngredient(line.itemId);
    return {
      name: ing ? ing.name : "Unknown ingredient",
      qtyText: ing ? C.fmtBaseQty(ing, line.qty) : String(line.qty),
    };
  }

  function locationValue(locId) {
    const raw = state.ingredients.reduce((s, i) => s + C.inventoryValueAt(i, locId), 0);
    const prepared = state.batches.reduce((s, b) => {
      const r = getRecipe(b.recipeId);
      if (!r || C.batchState(b) === "expired") return s;
      return s + C.batchPortionsAt(b, locId) * C.recipeCost(r, getIngredient);
    }, 0);
    return { raw, prepared, total: raw + prepared };
  }

  // ---------- house dashboard / Ask ----------
  function summary() {
    const belowPar = state.ingredients.filter(C.belowParAnywhere);
    const priced = state.recipes.filter((r) => Number(r.menuPrice) > 0);
    const avg = priced.length
      ? priced.reduce((s, r) => s + C.foodCostPct(C.recipeCost(r, getIngredient), r.menuPrice), 0) / priced.length
      : 0;
    const live = state.batches.filter((b) => C.batchState(b) !== "expired");
    const expiring = state.batches.filter((b) => C.batchPortionsTotal(b) > 0 && ["today", "soon"].includes(C.batchState(b)));
    const expired = state.batches.filter((b) => C.batchPortionsTotal(b) > 0 && C.batchState(b) === "expired");
    const cannotServe = state.recipes
      .map((r) => ({ name: r.name, avail: C.servingsAt(r, getIngredient, state.batches, null, {}).total }))
      .filter((x) => x.avail <= 0);
    const demand = prepDemand(7);

    return {
      dishes: state.recipes.length,
      ingredients: state.ingredients.length,
      avgFoodCostPct: avg,
      inventoryValue: state.ingredients.reduce((s, i) => s + C.inventoryValueTotal(i), 0),
      preparedValue: live.reduce((s, b) => {
        const r = getRecipe(b.recipeId);
        return r ? s + C.batchPortionsTotal(b) * C.recipeCost(r, getIngredient) : s;
      }, 0),
      preparedPortions: live.reduce((s, b) => s + C.batchPortionsTotal(b), 0),
      belowPar: belowPar.map((i) => i.name),
      belowParDetail: belowPar.map((i) => ({ name: i.name, at: C.shortLocations(i).map(locShort) })),
      eightySixed: cannotServe.map((x) => x.name),
      expiringSoon: expiring.map((b) => {
        const r = getRecipe(b.recipeId);
        return { name: r ? r.name : "Unknown", portions: C.batchPortionsTotal(b), daysLeft: C.daysLeft(b) };
      }),
      expiredBatches: expired.length,
      expiredPortions: expired.reduce((s, b) => s + C.batchPortionsTotal(b), 0),
      toProduce: demand.filter((d) => d.short > 0).map((d) => ({ name: d.recipe.name, portions: d.short })),
      orders: state.orders.length,
      upcomingOrders: state.orders
        .slice()
        .sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999")))
        .slice(0, 5)
        .map((o) => ({ name: o.name, date: o.date, guests: o.guestCount, status: o.status, serviceType: o.serviceType })),
      byLocation: foodLocations().map((l) => ({ id: l.id, name: l.name, ...locationValue(l.id) })),
    };
  }

  function snapshot() {
    return {
      ingredients: sortedIngredients().map((ing) => ({
        name: ing.name,
        category: ing.category,
        purchase: `${C.fmtQty(ing.purchaseQty)} ${C.purchaseUnit(ing.baseUnit, ing.purchaseUnit).label} for ${C.fmtMoney(ing.purchaseCost)}`,
        yieldPct: Number(ing.yieldPct) || 100,
        costPerUsableUnit: round2(C.costPerUsableUnit(ing)),
        unit: C.unitLabel(ing, 1),
        onHandByLocation: foodLocations()
          .filter((l) => C.onHandAt(ing, l.id) > 0)
          .reduce((o, l) => { o[l.name] = C.fmtBaseQty(ing, C.onHandAt(ing, l.id)); return o; }, {}),
        masterOnHand: C.fmtBaseQty(ing, C.onHandTotal(ing)),
        belowParAt: C.shortLocations(ing).map(locName),
        masterValue: round2(C.inventoryValueTotal(ing)),
      })),
      dishes: state.recipes.map((r) => {
        const cost = C.recipeCost(r, getIngredient);
        const avail = C.servingsAt(r, getIngredient, state.batches, null, {});
        return {
          name: r.name,
          menu: r.menu,
          preppedAhead: !!r.prepAhead,
          hold: r.prepAhead ? r.hold : null,
          shelfLifeDays: r.prepAhead ? r.shelfLifeDays : null,
          portionCost: round2(cost),
          menuPrice: Number(r.menuPrice) || 0,
          foodCostPct: r.menuPrice ? round2(C.foodCostPct(cost, r.menuPrice)) : null,
          profitPerPortion: r.menuPrice ? round2(Number(r.menuPrice) - cost) : null,
          servingsPerWeek: Number(r.servingsPerWeek) || 0,
          preparedPortionsOnHand: avail.prepared,
          cookableNow: avail.raw,
          totalAvailable: avail.total,
          firstToRunOut: avail.limitedBy ? avail.limitedBy.name : null,
          servableAt: foodLocations()
            .map((l) => ({ location: l.name, portions: C.servingsAt(r, getIngredient, state.batches, l.id, { canCook: l.canCook }).total }))
            .filter((x) => x.portions > 0),
          buildsFrom: (r.components || [])
            .map((c) => {
              const ing = getIngredient(c.ingredientId);
              return ing ? `${ing.name} ${C.fmtBaseQty(ing, C.componentQtyPerPortion(r, c))}` : null;
            })
            .filter(Boolean),
        };
      }),
      preparedBatches: state.batches.map((b) => {
        const r = getRecipe(b.recipeId);
        return {
          dish: r ? r.name : "Unknown",
          producedOn: b.producedOn,
          hold: b.hold,
          daysLeft: C.daysLeft(b),
          state: C.batchState(b),
          portionsByLocation: C.locationsWithStock(b.portions)
            .reduce((o, l) => { o[locName(l)] = C.batchPortionsAt(b, l); return o; }, {}),
          totalPortions: C.batchPortionsTotal(b),
        };
      }),
      orders: state.orders.map((o) => {
        const t = orderTotals(o);
        const v = FleetStorage.vessel(o.vesselId);
        return {
          name: o.name,
          date: o.date || null,
          serviceType: o.serviceType,
          recurring: o.recurring || null,
          status: o.status,
          vessel: v ? v.name : null,
          servedOutOf: o.locationId ? locName(o.locationId) : null,
          guests: Number(o.guestCount) || 0,
          dishes: (o.lines || []).map((ln) => {
            const r = getRecipe(ln.recipeId);
            return r ? `${r.name} × ${linePortions(o, ln)}` : null;
          }).filter(Boolean),
          totalCost: round2(t.totalCost),
          revenue: round2(t.revenue),
          costPerGuest: round2(t.costPerGuest),
          foodCostPct: t.revenue ? round2(t.costPct) : null,
        };
      }),
      prepListNext7Days: prepDemand(7)
        .filter((d) => d.short > 0)
        .map((d) => ({ dish: d.recipe.name, needed: d.portions, alreadyMade: d.have, toProduce: d.short })),
      targets: { defaultFoodCostPct: state.settings.defaultTargetFoodCostPct },
    };
  }

  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

  // ---------- init ----------
  function renderAll() {
    renderDashboard();
    renderIngredients();
    renderRecipes();
    renderPrepared();
    renderInventory();
    renderOrders();
    renderUsage();
  }

  function init() {
    $all(".tab-btn").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
    const reset = $("#catering-btn-reset");
    if (reset) reset.addEventListener("click", resetData);
    renderAll();
  }

  return {
    init, renderAll, summary, snapshot, switchTab,
    transferCatalog, availableAt, moveStock, describeLine, locationValue,
  };
})();
