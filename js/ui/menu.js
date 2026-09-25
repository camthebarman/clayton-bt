/* ui/menu.js — the Food and Bar pages.

   They are the same page wearing two colours: a menu, what each item on it
   costs to make, what it sells for, and the one number at the top that the
   whole menu runs at. So one factory builds both, from a small config that
   says where the recipes live and how a plate (or a pour) is costed.

   Bar has one extra: house preps — the syrups and batched bases made ahead
   and poured from — which are costed from their own recipes and then used
   as ingredients in drinks. */

const MenuPages = (function () {
  const el = Core.el;

  const CONFIGS = {
    food: {
      key: "food",
      title: "Food",
      accent: "accent-food",
      noun: "dish",
      nouns: "dishes",
      costWord: "Food cost",
      unitCost: "Plate cost",
      groupWord: "Menu",
      sub: "What every dish costs to plate against what it sells for. The headline food cost is weighted by each dish's weekly mix.",
      recipes: () => Store.food.recipes,
      cost: (r) => Store.dishCost(r),
      summary: (f) => Store.foodCost(f),
      target: () => Store.foodTarget(),
      setTarget: (v) => { Store.food.settings.defaultTargetFoodCostPct = v; Store.saveFood(); },
      group: (r) => r.menu || "Other",
      groups: () => CateringStorage.MENUS,
      save: () => Store.saveFood(),
      pool: () => Store.food.ingredients,
      resolve: (id) => Store.foodIng(id),
      calc: () => Store.C,
    },
    bar: {
      key: "bar",
      title: "Bar",
      accent: "accent-bar",
      noun: "drink",
      nouns: "drinks",
      costWord: "Bar cost",
      unitCost: "Pour cost",
      groupWord: "Section",
      sub: "What every drink costs to pour against what it sells for. The headline bar cost is weighted by each drink's weekly mix.",
      recipes: () => Store.bar.recipes,
      cost: (r) => Store.drinkCost(r),
      summary: (f) => Store.barCost(f),
      target: () => Store.barTarget(),
      setTarget: (v) => { Store.bar.settings.defaultTargetPourCostPct = v; Store.saveBar(); },
      group: (r) => r.category || "Cocktail",
      groups: () => ["Cocktail", "Batched", "Non-Alcoholic", "Beer", "Wine"],
      save: () => Store.saveBar(),
      pool: () => [...Store.bar.ingredients, ...Store.bar.preps],
      resolve: (id) => Store.barItem(id),
      calc: () => Store.B,
    },
  };

  function make(cfgKey) {
    const cfg = CONFIGS[cfgKey];
    let host = null;

    function filterKey() { return cfg.key + ".group"; }
    function activeGroup() { return Store.uiGet(filterKey(), ""); }

    function allGroups() {
      const list = cfg.groups().slice();
      cfg.recipes().forEach((r) => { const g = cfg.group(r); if (!list.includes(g)) list.push(g); });
      return list.filter((g) => cfg.recipes().some((r) => cfg.group(r) === g));
    }

    function render(target) {
      if (target) host = target;
      if (!host) return;
      host.innerHTML = "";
      host.className = "page " + cfg.accent;

      host.append(W.pageHead(cfg.title, cfg.sub, [
        cfg.key === "bar" ? W.btn("Add house prep", { icon: "plus", onclick: () => openPrep(null) }) : null,
        W.btn(`Add ${cfg.noun}`, { icon: "plus", kind: "primary", onclick: () => openRecipe(null) }),
      ].filter(Boolean), cfg.key === "food" ? "Kitchen" : "Beverage"));

      host.append(el("div", { class: "grid grid-4", id: "menu-stats" }));
      host.append(el("div", { class: "section" }, [
        W.sectionHead(cfg.groupWord === "Menu" ? "Menus" : "Bar menu", `Tap one to narrow the list. Each runs at its own ${cfg.costWord.toLowerCase()}.`),
        el("div", { class: "tiles", id: "menu-tiles" }),
      ]));
      host.append(el("div", { class: "section" }, [el("div", { class: "card", id: "menu-table" })]));
      if (cfg.key === "bar") host.append(el("div", { class: "section", id: "prep-section" }));

      drawStats();
      drawTiles();
      drawTable();
      if (cfg.key === "bar") drawPreps();
    }

    function drawStats() {
      const box = host.querySelector("#menu-stats");
      if (!box) return;
      const s = cfg.summary();
      box.innerHTML = "";
      const targetInput = W.numInput(s.target || "", (v) => {
        cfg.setTarget(Number(v) || 0);
        drawStatsExceptTarget();
        drawTiles();
        drawTable();
        Shell.refreshKpis();
      }, { class: "cell-input sm", step: "0.5", "aria-label": "Target cost %" });
      box.append(
        W.stat(cfg.costWord, s.priced ? Store.pct(s.pct) : "—", s.weighted ? "Weighted by weekly mix" : "Across priced items", { accent: true, meter: W.meter(s.pct, s.target) }),
        el("div", { class: "stat" }, [
          el("div", { class: "label" }, ["Target"]),
          el("div", { class: "stat-value", style: "display:flex;align-items:center;gap:6px" }, [targetInput, el("span", { class: "muted" }, ["%"])]),
          el("div", { class: "stat-sub", id: "target-sub" }, [targetNote(s)]),
        ]),
        W.stat(`Avg ${cfg.unitCost.toLowerCase()}`, Store.money(s.avgCost), `${s.count} ${cfg.nouns} · ${s.priced} priced`),
        W.stat("Weekly", Store.money0(s.weekCost), s.weekRevenue ? `${Store.money0(s.weekRevenue)} sales · ${Store.money0(s.weekProfit)} gross` : "Set a weekly mix to project")
      );
    }
    function targetNote(s) {
      if (!s.priced || !s.target) return "Set a target";
      const d = s.pct - s.target;
      return Math.abs(d) < 0.05 ? "Right on target" : d > 0 ? `${d.toFixed(1)} pts over` : `${(-d).toFixed(1)} pts under`;
    }
    // Leaves the target input in place so typing into it isn't interrupted.
    function drawStatsExceptTarget() {
      const box = host.querySelector("#menu-stats");
      if (!box) return;
      const s = cfg.summary();
      const first = box.children[0];
      first.replaceWith(W.stat(cfg.costWord, s.priced ? Store.pct(s.pct) : "—", s.weighted ? "Weighted by weekly mix" : "Across priced items", { accent: true, meter: W.meter(s.pct, s.target) }));
      const note = box.querySelector("#target-sub");
      if (note) note.textContent = targetNote(s);
      box.children[2].replaceWith(W.stat(`Avg ${cfg.unitCost.toLowerCase()}`, Store.money(s.avgCost), `${s.count} ${cfg.nouns} · ${s.priced} priced`));
      box.children[3].replaceWith(W.stat("Weekly", Store.money0(s.weekCost), s.weekRevenue ? `${Store.money0(s.weekRevenue)} sales · ${Store.money0(s.weekProfit)} gross` : "Set a weekly mix to project"));
    }

    function drawTiles() {
      const box = host.querySelector("#menu-tiles");
      if (!box) return;
      box.innerHTML = "";
      const g = activeGroup();
      const target = cfg.target();
      const tile = (id, name, s) => el("button", {
        type: "button",
        class: "tile" + (g === id ? " active" : ""),
        onclick: () => { Store.uiSet(filterKey(), g === id ? "" : id); drawTiles(); drawTable(); },
      }, [
        el("div", { class: "tile-name" }, [name]),
        el("div", { class: "tile-value" }, [s.priced ? Store.pct(s.pct) : "—"]),
        el("div", { class: "tile-sub" }, [`${s.count} ${s.count === 1 ? cfg.noun : cfg.nouns} · avg ${Store.money(s.avgCost)}`]),
        W.meter(s.pct, target),
      ]);
      box.append(tile("", "Everything", cfg.summary()));
      allGroups().forEach((name) => box.append(tile(name, name, cfg.summary((r) => cfg.group(r) === name))));
    }

    function drawTable() {
      const box = host.querySelector("#menu-table");
      if (!box) return;
      box.innerHTML = "";
      const g = activeGroup();
      const list = cfg.recipes()
        .filter((r) => !g || cfg.group(r) === g)
        .slice()
        .sort((a, b) => allGroups().indexOf(cfg.group(a)) - allGroups().indexOf(cfg.group(b)) || a.name.localeCompare(b.name));

      box.append(el("div", { class: "card-head" }, [
        el("div", {}, [el("h3", {}, [g || `All ${cfg.nouns}`]), el("div", { class: "sub" }, ["Click a row to edit its recipe. Price and mix edit in place."])]),
      ]));
      if (!list.length) { box.append(W.empty(`No ${cfg.nouns} here yet.`)); return; }

      const target = cfg.target();
      const table = el("table", { class: "data" }, [
        el("thead", {}, [el("tr", {}, [
          el("th", {}, [cfg.noun === "dish" ? "Dish" : "Drink"]),
          el("th", { class: "num" }, [cfg.unitCost]),
          el("th", { class: "num" }, ["Price"]),
          el("th", { class: "num" }, [cfg.costWord + " %"]),
          el("th", { class: "num" }, ["Margin"]),
          el("th", { class: "num" }, ["Mix / wk"]),
          el("th", {}, [""]),
        ])]),
      ]);
      const body = el("tbody");
      let last = "";
      list.forEach((r) => {
        const grp = cfg.group(r);
        if (!g && grp !== last) {
          body.append(el("tr", { class: "group-row" }, [el("td", { colspan: 7 }, [grp])]));
          last = grp;
        }
        body.append(recipeRow(r, target));
      });
      table.append(body);
      W.enterMovesDown(table);
      box.append(el("div", { class: "table-wrap" }, [table]));
    }

    function recipeRow(r, target) {
      const cost = cfg.cost(r);
      const pctCell = el("td", { class: "num" });
      const marginCell = el("td", { class: "num" });
      function refresh() {
        const price = Number(r.menuPrice) || 0;
        pctCell.innerHTML = "";
        pctCell.append(W.pctCell(price ? (cost / price) * 100 : 0, target));
        marginCell.textContent = price ? Store.money(price - cost) : "—";
      }
      const stop = (e) => e.stopPropagation();
      const priceIn = W.numInput(r.menuPrice || "", (v) => { r.menuPrice = Number(v) || 0; cfg.save(); refresh(); afterInline(); },
        { class: "cell-input sm", step: "0.25", "data-col": "price", "aria-label": `${r.name} price`, onclick: stop });
      const mixIn = W.numInput(r.servingsPerWeek || "", (v) => { r.servingsPerWeek = Number(v) || 0; cfg.save(); afterInline(); },
        { class: "cell-input sm", step: "1", "data-col": "mix", "aria-label": `${r.name} weekly mix`, onclick: stop });
      const tr = el("tr", { class: "clickable", onclick: () => openRecipe(r) }, [
        el("td", {}, [
          el("div", { class: "item-name" }, [r.name]),
          el("div", { class: "item-sub" }, [`${(r.components || []).length} components${cfg.key === "food" && Number(r.portions) > 1 ? ` · batch of ${r.portions}` : ""}`]),
        ]),
        el("td", { class: "num mono" }, [Store.money(cost)]),
        el("td", { class: "num" }, [priceIn]),
        pctCell,
        marginCell,
        el("td", { class: "num" }, [mixIn]),
        el("td", { class: "num faint" }, [W.icon("chevron")]),
      ]);
      tr.querySelector("td:last-child svg").style.cssText = "width:16px;height:16px";
      refresh();
      return tr;
    }

    function afterInline() {
      drawStatsExceptTarget();
      drawTiles();
      Shell.refreshKpis();
    }

    // ---------- recipe editor ----------
    function openRecipe(existing) {
      const draft = existing
        ? JSON.parse(JSON.stringify(existing))
        : cfg.key === "food"
          ? { id: Store.C.uid("crec"), name: "", menu: activeGroup() || cfg.groups()[0], category: "", portions: 1, menuPrice: 0, servingsPerWeek: 0, targetFoodCostPct: cfg.target(), notes: "", components: [] }
          : { id: Store.B.uid("brec"), name: "", category: activeGroup() || "Cocktail", glasswareId: "", menuPrice: 0, servingsPerWeek: 0, targetPourCostPct: cfg.target(), notes: "", components: [] };

      Core.openModal(existing ? existing.name : `Add ${cfg.noun}`, (body, close) => {
        const form = el("form", { autocomplete: "off" });
        const nameInput = el("input", { type: "text", value: draft.name, placeholder: cfg.key === "food" ? "Chicken salad croissant" : "River mule" });
        const groupList = el("datalist", { id: "group-options" }, allGroups().concat(cfg.groups()).filter((v, i, a) => a.indexOf(v) === i).map((gname) => el("option", { value: gname })));
        const groupInput = el("input", { type: "text", list: "group-options", value: cfg.key === "food" ? draft.menu : draft.category });

        form.append(W.fieldRow([W.field("Name", nameInput), W.field(cfg.groupWord, el("div", {}, [groupInput, groupList]))]));
        form.append(W.fieldRow([
          cfg.key === "food" ? W.field("Batch yield", W.numInput(draft.portions, (v) => { draft.portions = Number(v) || 1; drawSummary(); }, { min: "1", step: "1" }), "Portions the quantities below make") : null,
          W.field("Menu price", W.numInput(draft.menuPrice || "", (v) => { draft.menuPrice = Number(v) || 0; drawSummary(); }, { step: "0.25" })),
          W.field("Weekly mix", W.numInput(draft.servingsPerWeek || "", (v) => { draft.servingsPerWeek = Number(v) || 0; }, { step: "1" }), "Sold per week — weights the headline %"),
          cfg.key === "bar" && Store.bar.glassware.length ? W.field("Glass", W.select(
            [{ id: "", label: "—" }, ...Store.bar.glassware.map((gl) => ({ id: gl.id, label: gl.name }))],
            draft.glasswareId || "", (v) => { draft.glasswareId = v; })) : null,
        ]));

        form.append(el("div", { class: "form-section" }, [
          el("h4", {}, ["Recipe"]),
          el("span", { class: "small faint" }, [cfg.key === "food" ? "Quantities for the whole batch, as used (after trim)" : "Quantities for one drink"]),
        ]));
        const compHost = el("div", { class: "card" });
        form.append(compHost);
        const summary = el("div", { class: "summary-bar" });
        form.append(summary);
        const notes = el("textarea", { placeholder: "Method, plating, anything the next person needs." }, [draft.notes || ""]);
        form.append(el("div", { style: "margin-top:14px" }, [W.field("Notes", notes)]));

        function drawComponents() {
          compHost.innerHTML = "";
          const table = el("table", { class: "data comp-table" }, [
            el("thead", {}, [el("tr", {}, [
              el("th", {}, ["Ingredient"]),
              el("th", { class: "num" }, ["Qty"]),
              el("th", {}, [""]),
              el("th", { class: "num" }, ["Cost"]),
              el("th", {}, [""]),
            ])]),
          ]);
          const tbody = el("tbody");
          draft.components.forEach((c, idx) => tbody.append(componentRow(c, idx)));
          table.append(tbody);
          compHost.append(el("div", { class: "table-wrap" }, [table]));
          if (!draft.components.length) compHost.append(W.empty("No ingredients yet.", "Add the first one below."));
          compHost.append(el("div", { class: "add-row" }, [
            ingredientPicker("", (id) => {
              if (!id) return;
              draft.components.push({ id: Store.C.uid("comp"), ingredientId: id, qty: 1 });
              drawComponents();
              drawSummary();
              const inputs = compHost.querySelectorAll("input");
              if (inputs.length) { inputs[inputs.length - 1].focus(); inputs[inputs.length - 1].select(); }
            }, true),
          ]));
        }

        function componentRow(c, idx) {
          const ing = cfg.resolve(c.ingredientId);
          const costCell = el("td", { class: "num mono" });
          const unitCell = el("td", { class: "faint small" });
          function refresh() {
            const it = cfg.resolve(c.ingredientId);
            unitCell.textContent = it ? cfg.calc().unitLabel(it, c.qty) : "";
            costCell.textContent = it ? Store.money(cfg.calc().componentCost(it, c.qty)) : "—";
          }
          const tr = el("tr", {}, [
            el("td", {}, [ingredientPicker(c.ingredientId, (id) => { c.ingredientId = id; refresh(); drawSummary(); })]),
            el("td", { class: "num" }, [W.numInput(c.qty, (v) => { c.qty = Number(v) || 0; refresh(); drawSummary(); }, { "aria-label": `Quantity of ${ing ? ing.name : "ingredient"}` })]),
            unitCell,
            costCell,
            el("td", {}, [W.btn("Remove", { sm: true, kind: "ghost", icon: "x", iconOnly: true, onclick: () => { draft.components.splice(idx, 1); drawComponents(); drawSummary(); } })]),
          ]);
          refresh();
          return tr;
        }

        function drawSummary() {
          const calc = cfg.calc();
          const batch = draft.components.reduce((s, c) => s + calc.componentCost(cfg.resolve(c.ingredientId), c.qty), 0);
          const unit = cfg.key === "food" ? batch / Math.max(Number(draft.portions) || 1, 0.0001) : batch;
          const price = Number(draft.menuPrice) || 0;
          const p = price ? (unit / price) * 100 : 0;
          const target = cfg.target();
          summary.innerHTML = "";
          const cell = (label, value, extra) => el("div", {}, [el("div", { class: "label" }, [label]), el("div", { class: "stat-value" }, [value]), extra || null]);
          summary.append(
            cfg.key === "food" ? cell("Batch cost", Store.money(batch)) : cell("Ingredients", String(draft.components.length)),
            cell(cfg.unitCost, Store.money(unit)),
            cell(cfg.costWord, price ? Store.pct(p) : "—", el("div", { style: "margin-top:6px" }, [W.meter(p, target)])),
            cell(`Price at ${Store.pct(target)}`, target ? Store.money(unit / (target / 100)) : "—")
          );
        }

        drawComponents();
        drawSummary();

        form.append(el("div", { class: "form-actions" }, [
          existing ? W.btn("Delete", { kind: "danger", icon: "trash", cls: "left", onclick: () => {
            if (cfg.key === "food") {
              const events = Store.food.orders.filter((o) => (o.lines || []).some((l) => l.recipeId === existing.id));
              if (events.length) { Core.toast(`On ${events.length} catering event${events.length === 1 ? "" : "s"} — take it off first.`); return; }
            }
            if (!confirm(`Delete ${existing.name}?`)) return;
            const list = cfg.recipes();
            list.splice(list.indexOf(existing), 1);
            cfg.save();
            close();
            Shell.render();
            Core.toast("Deleted.");
          } }) : null,
          W.btn("Cancel", { onclick: close }),
          W.btn(existing ? "Save" : `Add ${cfg.noun}`, { kind: "primary", type: "submit" }),
        ]));

        form.addEventListener("submit", (e) => {
          e.preventDefault();
          if (!nameInput.value.trim()) { Core.toast(`Give the ${cfg.noun} a name.`); nameInput.focus(); return; }
          draft.name = nameInput.value.trim();
          const grp = groupInput.value.trim() || cfg.groups()[0];
          if (cfg.key === "food") draft.menu = grp; else draft.category = grp;
          draft.notes = notes.value.trim();
          draft.components = draft.components.filter((c) => cfg.resolve(c.ingredientId) && Number(c.qty) > 0);
          if (existing) Object.assign(existing, draft);
          else cfg.recipes().push(draft);
          cfg.save();
          close();
          Shell.render();
          Core.toast(existing ? "Saved." : `${cfg.noun[0].toUpperCase() + cfg.noun.slice(1)} added.`);
        });

        body.append(form);
      }, { wide: true, noFocus: !!existing });
    }

    // Ingredients grouped by category, house preps on their own at the end.
    function ingredientPicker(value, onChange, isAdd, excludeId) {
      const groups = new Map();
      cfg.pool().forEach((i) => {
        if (excludeId && i.id === excludeId) return;
        const cat = i.yieldQty != null && i.components ? "House Prep" : i.category || "Other";
        if (!groups.has(cat)) groups.set(cat, []);
        groups.get(cat).push({ id: i.id, label: i.name });
      });
      const opts = Array.from(groups.entries())
        .sort((a, b) => (a[0] === "House Prep") - (b[0] === "House Prep") || a[0].localeCompare(b[0]))
        .map(([group, options]) => ({ group, options: options.sort((a, b) => a.label.localeCompare(b.label)) }));
      const s = W.select(isAdd ? [{ id: "", label: "+ Add an ingredient…" }, ...opts] : opts, value || "", (v) => {
        onChange(v);
        if (isAdd) s.value = "";
      });
      return s;
    }

    // ---------- house preps (bar only) ----------
    function drawPreps() {
      const box = host.querySelector("#prep-section");
      if (!box) return;
      box.innerHTML = "";
      box.append(W.sectionHead("House preps", "Syrups, shrubs and batched bases — costed from their own recipe, then poured like any bottle.", [
        W.btn("Add house prep", { sm: true, icon: "plus", onclick: () => openPrep(null) }),
      ]));
      const card = el("div", { class: "card" });
      box.append(card);
      if (!Store.bar.preps.length) { card.append(W.empty("No house preps yet.")); return; }
      const allLocs = Store.allLocIds();
      const table = el("table", { class: "data" }, [
        el("thead", {}, [el("tr", {}, [
          el("th", {}, ["Prep"]),
          el("th", { class: "num" }, ["Batch yield"]),
          el("th", { class: "num" }, ["Batch cost"]),
          el("th", { class: "num" }, ["Cost / unit"]),
          el("th", { class: "num" }, ["On hand (all)"]),
          el("th", {}, [""]),
        ])]),
        el("tbody", {}, Store.bar.preps.slice().sort((a, b) => a.name.localeCompare(b.name)).map((p) => {
          const row = Store.makeRow("bar", "prep", p);
          const unit = Store.B.unitLabel(p, 2);
          return el("tr", { class: "clickable", onclick: () => openPrep(p) }, [
            el("td", {}, [el("div", { class: "item-name" }, [p.name]), el("div", { class: "item-sub" }, [p.batchNote || ""])]),
            el("td", { class: "num mono" }, [`${Store.qty(p.yieldQty)} `, el("span", { class: "unit" }, [unit])]),
            el("td", { class: "num mono" }, [Store.money(Store.prepBatchCost(p))]),
            el("td", { class: "num mono" }, [Store.money(Store.prepCostPerUnit(p)), el("span", { class: "unit" }, ["/ " + Store.B.unitLabel(p, 1)])]),
            el("td", { class: "num mono" }, [Store.qty(Store.rowOnHand(row, allLocs)), el("span", { class: "unit" }, [unit])]),
            el("td", { class: "num faint" }, [W.icon("chevron")]),
          ]);
        })),
      ]);
      table.querySelectorAll("td:last-child svg").forEach((s) => { s.style.cssText = "width:16px;height:16px"; });
      card.append(el("div", { class: "table-wrap" }, [table]));
    }

    function openPrep(existing) {
      const draft = existing
        ? JSON.parse(JSON.stringify(existing))
        : { id: Store.B.uid("bprep"), name: "", category: "House Prep", baseUnit: "floz", yieldQty: 32, batchNote: "", onHand: {}, par: {}, components: [] };

      Core.openModal(existing ? existing.name : "Add house prep", (body, close) => {
        const form = el("form", { autocomplete: "off" });
        const nameInput = el("input", { type: "text", value: draft.name, placeholder: "Simple syrup" });
        form.append(W.fieldRow([
          W.field("Name", nameInput),
          W.field("Batch yield", W.numInput(draft.yieldQty, (v) => { draft.yieldQty = Number(v) || 0; drawSummary(); })),
          W.field("Measured in", W.select(
            Object.entries(Store.B.BASE_UNITS).map(([k, v]) => ({ id: k, label: v.label })),
            draft.baseUnit, (v) => { draft.baseUnit = v; drawSummary(); })),
        ]));
        const note = el("input", { type: "text", value: draft.batchNote || "", placeholder: "Method and how long it holds" });
        form.append(W.field("Batch note", note));
        form.append(el("div", { class: "form-section" }, [el("h4", {}, ["Recipe"]), el("span", { class: "small faint" }, ["Quantities for one batch"])]));
        const compHost = el("div", { class: "card" });
        const summary = el("div", { class: "summary-bar" });
        form.append(compHost, summary);

        function drawComponents() {
          compHost.innerHTML = "";
          const tbody = el("tbody");
          draft.components.forEach((c, idx) => {
            const costCell = el("td", { class: "num mono" });
            const unitCell = el("td", { class: "faint small" });
            const refresh = () => {
              const it = Store.barItem(c.ingredientId, [draft.id]);
              unitCell.textContent = it ? Store.B.unitLabel(it, c.qty) : "";
              costCell.textContent = it ? Store.money(Store.B.componentCost(it, c.qty)) : "—";
            };
            tbody.append(el("tr", {}, [
              el("td", {}, [ingredientPicker(c.ingredientId, (id) => { c.ingredientId = id; refresh(); drawSummary(); }, false, draft.id)]),
              el("td", { class: "num" }, [W.numInput(c.qty, (v) => { c.qty = Number(v) || 0; refresh(); drawSummary(); })]),
              unitCell,
              costCell,
              el("td", {}, [W.btn("Remove", { sm: true, kind: "ghost", icon: "x", iconOnly: true, onclick: () => { draft.components.splice(idx, 1); drawComponents(); drawSummary(); } })]),
            ]));
            refresh();
          });
          compHost.append(el("div", { class: "table-wrap" }, [el("table", { class: "data comp-table" }, [
            el("thead", {}, [el("tr", {}, [el("th", {}, ["Ingredient"]), el("th", { class: "num" }, ["Qty"]), el("th", {}, [""]), el("th", { class: "num" }, ["Cost"]), el("th", {}, [""])])]),
            tbody,
          ])]));
          if (!draft.components.length) compHost.append(W.empty("No ingredients yet."));
          compHost.append(el("div", { class: "add-row" }, [ingredientPicker("", (id) => {
            if (!id) return;
            draft.components.push({ id: Store.B.uid("pc"), ingredientId: id, qty: 1 });
            drawComponents();
            drawSummary();
          }, true, draft.id)]));
        }

        function drawSummary() {
          const batch = draft.components.reduce((s, c) => s + Store.B.componentCost(Store.barItem(c.ingredientId, [draft.id]), c.qty), 0);
          const y = Number(draft.yieldQty) || 0;
          summary.innerHTML = "";
          const cell = (label, value) => el("div", {}, [el("div", { class: "label" }, [label]), el("div", { class: "stat-value" }, [value])]);
          summary.append(
            cell("Batch cost", Store.money(batch)),
            cell("Yield", `${Store.qty(y)} ${Store.B.BASE_UNITS[draft.baseUnit].label}`),
            cell("Cost / " + Store.B.BASE_UNITS[draft.baseUnit].label, y ? Store.money(batch / y) : "—"),
            cell("Ingredients", String(draft.components.length))
          );
        }

        drawComponents();
        drawSummary();

        form.append(el("div", { class: "form-actions" }, [
          existing ? W.btn("Delete", { kind: "danger", icon: "trash", cls: "left", onclick: () => {
            const used = [...Store.bar.recipes, ...Store.bar.preps].filter((r) => r !== existing && (r.components || []).some((c) => c.ingredientId === existing.id));
            if (used.length) { Core.toast(`Used in ${used.slice(0, 3).map((u) => u.name).join(", ")} — remove it there first.`); return; }
            if (!confirm(`Delete ${existing.name}?`)) return;
            Store.bar.preps.splice(Store.bar.preps.indexOf(existing), 1);
            Store.saveBar();
            close();
            Shell.render();
            Core.toast("Deleted.");
          } }) : null,
          W.btn("Cancel", { onclick: close }),
          W.btn(existing ? "Save" : "Add house prep", { kind: "primary", type: "submit" }),
        ]));

        form.addEventListener("submit", (e) => {
          e.preventDefault();
          if (!nameInput.value.trim()) { Core.toast("Give the prep a name."); nameInput.focus(); return; }
          if (!(Number(draft.yieldQty) > 0)) { Core.toast("Set how much one batch makes."); return; }
          draft.name = nameInput.value.trim();
          draft.batchNote = note.value.trim();
          draft.components = draft.components.filter((c) => Store.barItem(c.ingredientId, [draft.id]) && Number(c.qty) > 0);
          if (existing) Object.assign(existing, draft);
          else Store.bar.preps.push(draft);
          Store.saveBar();
          close();
          Shell.render();
          Core.toast(existing ? "Saved." : "House prep added.");
        });
        body.append(form);
      }, { wide: true, noFocus: !!existing });
    }

    return { render };
  }

  return { food: make("food"), bar: make("bar") };
})();
