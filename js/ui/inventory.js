/* ui/inventory.js — the page the app opens on.

   One table, three ways to read it, picked from the rail across the top:

     Master     every item once, with its total across the fleet and where
                that total actually sits. Click a row to edit it.
     A boat     one column per place on that boat (or ashore), each a count
                you type straight into.
     A place    that one fridge, bar or store room as a count sheet: on
                hand and par, what it carries first, the rest folded away.

   Food / Bar / All narrows every one of those, and changes which places are
   on the rail — a bar never shows up on a food count. */

const InventoryPage = (function () {
  const el = Core.el;
  let host = null;
  let query = "";
  let showAll = false;

  // ---------- filter state ----------
  function program() { return Store.uiGet("inv.program", "all"); }
  function category() { return Store.uiGet("inv.category", ""); }
  function lowOnly() { return !!Store.uiGet("inv.lowOnly", false); }

  // "master" | "g:<groupId>" | "l:<locId>". A scope that the current program
  // can't see (the Porch Bar, on a Food count) falls back to master.
  function scope() {
    const sc = Store.uiGet("inv.scope", "master");
    return resolveScope(sc, program()) ? sc : "master";
  }
  function resolveScope(sc, prog) {
    if (!sc || sc === "master") {
      return { type: "master", name: "Master", locIds: Store.locationsFor(prog).map((l) => l.id) };
    }
    if (sc.startsWith("g:")) {
      const g = Store.locationGroups(prog).find((x) => x.id === sc.slice(2));
      return g ? { type: "group", name: g.name, group: g, locIds: g.locations.map((l) => l.id) } : null;
    }
    if (sc.startsWith("l:")) {
      const loc = FleetStorage.location(sc.slice(2));
      return loc && Store.holds(loc, prog)
        ? { type: "loc", name: loc.name, loc, locIds: [loc.id] }
        : null;
    }
    return null;
  }
  function current() { return resolveScope(scope(), program()); }

  function setScope(sc) { Store.uiSet("inv.scope", sc); showAll = false; render(); }

  // Opened from elsewhere (the KPI strip): straight to the low-stock list.
  function showLow() {
    Store.uiSet("inv.lowOnly", true);
    Store.uiSet("inv.scope", "master");
  }
  function showMaster() { Store.uiSet("inv.scope", "master"); }

  // ---------- page ----------
  function render(target) {
    if (target) host = target;
    if (!host) return;
    const prog = program();
    host.innerHTML = "";
    host.className = "page " + (prog === "food" ? "accent-food" : prog === "bar" ? "accent-bar" : "accent-house");

    host.append(W.pageHead(
      "Inventory",
      "The master count across every fridge, store room and bar — or pick a boat or a single place to count it.",
      [
        W.btn("Order sheet", { icon: "cart", onclick: openOrderSheet }),
        W.btn("Add item", { icon: "plus", kind: "primary", onclick: () => openItem(null) }),
      ],
      "Most important"
    ));

    host.append(toolbar());
    const rail = el("div", { class: "scope-rail", id: "inv-rail" });
    host.append(rail);
    const strip = el("div", { class: "stat-strip", id: "inv-strip", style: "margin-bottom:14px" });
    host.append(strip);
    const tableHost = el("div", { class: "card", id: "inv-table" });
    host.append(tableHost);

    drawRail();
    drawStrip();
    drawTable();
  }

  function toolbar() {
    const prog = program();
    const cats = categoriesFor(prog);
    const search = el("input", { type: "search", placeholder: "Search items…", value: query, "aria-label": "Search items" });
    search.addEventListener("input", () => { query = search.value; drawTable(); });

    return el("div", { class: "toolbar" }, [
      W.seg([
        { id: "all", label: "All", dot: "var(--brand)" },
        { id: "food", label: "Food", dot: "var(--food)" },
        { id: "bar", label: "Bar", dot: "var(--bar)" },
      ], prog, (v) => {
        Store.uiSet("inv.program", v);
        if (category() && !categoriesFor(v).includes(category())) Store.uiSet("inv.category", "");
        render();
      }),
      el("div", { class: "search" }, [W.icon("search"), search]),
      W.select(
        [{ id: "", label: "All categories" }, ...cats.map((c) => ({ id: c, label: c }))],
        category(),
        (v) => { Store.uiSet("inv.category", v); drawTable(); }
      ),
      el("div", { class: "spacer" }),
      W.toggle("Low stock only", lowOnly(), (v) => { Store.uiSet("inv.lowOnly", v); drawTable(); }),
    ]);
  }

  function categoriesFor(prog) {
    const set = new Set();
    Store.inventoryRows(prog).forEach((r) => set.add(r.category));
    return Array.from(set).sort();
  }

  // ---------- the rail: master, then each boat and the places on it ----------
  function drawRail() {
    const rail = host && host.querySelector("#inv-rail");
    if (!rail) return;
    const prog = program();
    const sc = scope();
    rail.innerHTML = "";

    const master = Store.inventoryTotals(prog, Store.locationsFor(prog).map((l) => l.id));
    rail.append(el("div", { class: "scope-group" + (sc === "master" ? " active" : "") }, [
      el("div", { class: "scope-group-title" + (sc === "master" ? " active" : "") }, [W.icon("inventory"), "All locations"]),
      el("div", { class: "scope-chips" }, [
        chip("Master", master, sc === "master", () => setScope("master"), "chip-master"),
      ]),
    ]));

    Store.locationGroups(prog).forEach((g) => {
      const gid = "g:" + g.id;
      const groupActive = sc === gid || g.locations.some((l) => sc === "l:" + l.id);
      rail.append(el("div", { class: "scope-group" + (groupActive ? " active" : "") }, [
        el("button", {
          type: "button",
          class: "scope-group-title" + (sc === gid ? " active" : ""),
          title: `Count everything ${g.vessel ? "aboard " + g.name : "ashore"}`,
          onclick: () => setScope(gid),
        }, [W.icon(g.vessel ? "boat" : "shore"), g.name]),
        el("div", { class: "scope-chips" }, g.locations.map((l) => {
          const t = Store.inventoryTotals(prog, [l.id]);
          return chip(l.short || l.name, t, sc === "l:" + l.id, () => setScope("l:" + l.id));
        })),
      ]));
    });
  }

  function chip(name, totals, active, onclick, extra) {
    return el("button", { type: "button", class: "chip" + (active ? " active" : "") + (extra ? " " + extra : ""), onclick }, [
      el("span", { class: "chip-name" }, [name]),
      el("span", { class: "chip-sub" }, [
        Store.money0(totals.value),
        totals.short ? el("span", { class: "bad" }, [` · ${totals.short} low`]) : null,
      ]),
    ]);
  }

  function drawStrip() {
    const strip = host && host.querySelector("#inv-strip");
    if (!strip) return;
    const sc = current();
    const t = Store.inventoryTotals(program(), sc.locIds);
    strip.innerHTML = "";
    const cell = (label, value, cls) => el("div", {}, [
      el("div", { class: "label" }, [label]),
      el("div", { class: "stat-value" + (cls ? " " + cls : "") }, [String(value)]),
    ]);
    strip.append(
      cell(sc.type === "master" ? "Master value" : sc.name, Store.money(t.value), "accent"),
      cell("Items carried", t.carried),
      cell("Below par", t.low),
      cell("Out", t.out)
    );
  }

  // ---------- the table ----------
  function visibleRows(sc) {
    const prog = program();
    const q = query.trim().toLowerCase();
    const cat = category();
    const all = Store.inventoryRows(prog)
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q))
      .filter((r) => !cat || r.category === cat)
      .filter((r) => Store.rowLocIds(r, sc.locIds).length > 0)
      .filter((r) => !lowOnly() || ["low", "out"].includes(Store.rowStatus(r, sc.locIds)));

    // At a boat or a single place, lead with what it carries; the rest of the
    // catalogue is one click away rather than sixty rows of zeros.
    if (sc.type === "master" || showAll || q) return { rows: sortRows(all), hidden: 0 };
    const carried = all.filter((r) => Store.rowCarried(r, sc.locIds));
    return { rows: sortRows(carried), hidden: all.length - carried.length };
  }

  function sortRows(rows) {
    return rows.slice().sort((a, b) =>
      (a.program === b.program ? 0 : a.program === "food" ? -1 : 1) ||
      a.category.localeCompare(b.category) ||
      a.name.localeCompare(b.name));
  }

  function drawTable() {
    const box = host && host.querySelector("#inv-table");
    if (!box) return;
    const sc = current();
    box.innerHTML = "";
    const { rows, hidden } = visibleRows(sc);

    if (!rows.length) {
      box.append(W.empty(
        lowOnly() ? "Nothing below par here." : "No items match.",
        lowOnly() ? "Every item with a par in this view is at or above it." : "Try a different search or category."
      ));
    } else {
      const table = el("table", { class: "data" });
      const locs = sc.locIds.map((id) => FleetStorage.location(id));
      table.append(el("thead", {}, [headRow(sc, locs)]));
      const body = el("tbody");
      let lastGroup = "";
      const span = sc.type === "master" ? 6 : sc.type === "group" ? locs.length + 4 : 6;
      rows.forEach((r) => {
        const group = (program() === "all" ? (r.program === "food" ? "Food · " : "Bar · ") : "") + r.category;
        if (group !== lastGroup) {
          body.append(el("tr", { class: "group-row" }, [el("td", { colspan: span }, [group])]));
          lastGroup = group;
        }
        body.append(sc.type === "master" ? masterRow(r, sc) : sc.type === "group" ? groupRow(r, sc, locs) : locRow(r, sc));
      });
      table.append(body);
      W.enterMovesDown(table);
      box.append(el("div", { class: "table-wrap" }, [table]));
    }

    if (hidden) {
      box.append(el("div", { class: "more-row" }, [
        W.btn(`Show ${hidden} item${hidden === 1 ? "" : "s"} not carried here`, {
          sm: true, kind: "ghost", icon: "plus",
          onclick: () => { showAll = true; drawTable(); },
        }),
      ]));
    } else if (showAll && sc.type !== "master") {
      box.append(el("div", { class: "more-row" }, [
        W.btn("Only show what's carried here", { sm: true, kind: "ghost", onclick: () => { showAll = false; drawTable(); } }),
      ]));
    }
  }

  function headRow(sc, locs) {
    if (sc.type === "master") {
      return el("tr", {}, [
        el("th", {}, ["Item"]),
        el("th", { class: "num" }, ["On hand"]),
        el("th", { class: "num" }, ["Par"]),
        el("th", {}, ["Where it is"]),
        el("th", { class: "num" }, ["Value"]),
        el("th", {}, ["Status"]),
      ]);
    }
    if (sc.type === "group") {
      return el("tr", {}, [
        el("th", {}, ["Item"]),
        ...locs.map((l) => el("th", { class: "num" }, [l.short || l.name])),
        el("th", { class: "num" }, ["Total"]),
        el("th", { class: "num" }, ["Value"]),
        el("th", {}, ["Status"]),
      ]);
    }
    return el("tr", {}, [
      el("th", {}, ["Item"]),
      el("th", { class: "num" }, ["On hand"]),
      el("th", { class: "num" }, ["Par"]),
      el("th", { class: "num" }, ["Value"]),
      el("th", {}, ["Status"]),
      el("th", {}, [""]),
    ]);
  }

  function itemCell(r) {
    return el("td", {}, [
      el("div", { class: "item-name" }, [el("span", { class: "prog prog-" + r.program }), r.name]),
      el("div", { class: "item-sub" }, [
        r.kind === "prep" ? `House prep · counted in ${r.unit}` : `${r.packLabel} · ${Store.money(r.packCost)} · counted in ${r.unit}`,
      ]),
    ]);
  }

  function countText(r, base) {
    return [Store.qty(r.toCount(base)), el("span", { class: "unit" }, [r.unit])];
  }

  function rowTone(st) { return st === "out" ? "row-bad" : st === "low" ? "row-warn" : ""; }

  function masterRow(r, sc) {
    const st = Store.rowStatus(r, sc.locIds);
    const spread = el("div", { class: "spread" });
    Store.rowLocIds(r, sc.locIds).forEach((id) => {
      const on = r.onHandAt(id);
      const par = r.parAt(id);
      if (on <= 0 && par <= 0) return;
      const low = par > 0 && on < par;
      spread.append(el("span", { class: low ? "low" : "", title: `${FleetStorage.locationName(id)}${par ? " · par " + Store.qty(r.toCount(par)) : ""}` }, [
        FleetStorage.locationShort(id),
        el("b", {}, [Store.qty(r.toCount(on))]),
      ]));
    });
    return el("tr", { class: "clickable " + rowTone(st), onclick: () => openItem(r) }, [
      itemCell(r),
      el("td", { class: "num" }, countText(r, Store.rowOnHand(r, sc.locIds))),
      el("td", { class: "num muted" }, [Store.rowPar(r, sc.locIds) ? Store.qty(r.toCount(Store.rowPar(r, sc.locIds))) : "—"]),
      el("td", {}, [spread.childNodes.length ? spread : el("span", { class: "faint" }, ["Not stocked anywhere"])]),
      el("td", { class: "num" }, [Store.money(Store.rowValue(r, sc.locIds))]),
      el("td", {}, [W.statusPill(st)]),
    ]);
  }

  // A count input for one place. Typing writes straight through; the row's
  // totals, the strip, the rail and the KPI bar follow without a re-render,
  // so Tab and Enter keep moving through the sheet.
  function countInput(r, locId, which, col, onChange) {
    const base = which === "par" ? r.parAt(locId) : r.onHandAt(locId);
    return W.numInput(base ? Store.qty(r.toCount(base), 3) : "", (v) => {
      const b = r.toBase(v);
      if (which === "par") r.setPar(locId, b);
      else r.setOnHand(locId, b);
      r.save();
      onChange();
    }, { class: "cell-input", "data-col": col, "aria-label": `${r.name} ${which === "par" ? "par" : "on hand"} at ${FleetStorage.locationShort(locId)}` });
  }

  function afterEdit() {
    drawStrip();
    drawRail();
    Shell.refreshKpis();
  }

  function groupRow(r, sc, locs) {
    const totalCell = el("td", { class: "num" });
    const valueCell = el("td", { class: "num" });
    const statusCell = el("td", {});
    const tr = el("tr");
    function refresh() {
      const st = Store.rowStatus(r, sc.locIds);
      totalCell.innerHTML = "";
      totalCell.append(...countText(r, Store.rowOnHand(r, sc.locIds)));
      valueCell.textContent = Store.money(Store.rowValue(r, sc.locIds));
      statusCell.innerHTML = "";
      statusCell.append(W.statusPill(st));
      tr.className = rowTone(st);
    }
    tr.append(itemCell(r));
    locs.forEach((l, i) => {
      if (!Store.holds(l, r.program)) { tr.append(el("td", { class: "num faint" }, ["—"])); return; }
      const par = r.parAt(l.id);
      tr.append(el("td", { class: "num" }, [
        countInput(r, l.id, "on", "c" + i, () => { refresh(); afterEdit(); }),
        el("div", { class: "item-sub" }, [par ? "par " + Store.qty(r.toCount(par)) : "no par"]),
      ]));
    });
    tr.append(totalCell, valueCell, statusCell);
    refresh();
    return tr;
  }

  function locRow(r, sc) {
    const locId = sc.locIds[0];
    const valueCell = el("td", { class: "num" });
    const statusCell = el("td", {});
    const tr = el("tr");
    const onIn = countInput(r, locId, "on", "on", () => { refresh(); afterEdit(); });
    const parIn = countInput(r, locId, "par", "par", () => { refresh(); afterEdit(); });
    function refresh() {
      const st = Store.rowStatus(r, [locId]);
      valueCell.textContent = Store.money(Store.rowValue(r, [locId]));
      statusCell.innerHTML = "";
      statusCell.append(W.statusPill(st));
      tr.className = rowTone(st);
    }
    tr.append(
      itemCell(r),
      el("td", { class: "num" }, [onIn, el("span", { class: "unit" }, [r.unit])]),
      el("td", { class: "num" }, [parIn]),
      valueCell,
      statusCell,
      el("td", {}, [el("div", { class: "row-actions" }, [
        W.btn("Count up to par", {
          sm: true, kind: "ghost", icon: "target", iconOnly: true,
          onclick: () => {
            const par = r.parAt(locId);
            if (!par) { Core.toast("No par set here."); return; }
            r.setOnHand(locId, par);
            r.save();
            onIn.value = Store.qty(r.toCount(par), 3);
            refresh();
            afterEdit();
          },
        }),
        W.btn("Edit item", { sm: true, kind: "ghost", icon: "edit", iconOnly: true, onclick: () => openItem(r) }),
      ])]),
    );
    refresh();
    return tr;
  }

  // ---------- order sheet ----------
  // What to buy to bring the current view back to par, in whole packs.
  function orderLines(sc) {
    return sortRows(Store.inventoryRows(program()))
      .map((r) => {
        const gap = Store.rowGap(r, sc.locIds);
        if (gap <= 0) return null;
        const packs = r.packBase > 0 ? Math.ceil(gap / r.packBase - 1e-9) : 0;
        return { r, gap, packs, cost: packs * r.packCost };
      })
      .filter(Boolean);
  }

  function openOrderSheet() {
    const sc = current();
    const lines = orderLines(sc);
    const total = lines.reduce((s, l) => s + l.cost, 0);
    Core.openModal("Order sheet — " + sc.name, (body, close) => {
      body.append(el("p", { class: "muted", style: "margin-bottom:14px" }, [
        sc.type === "master"
          ? "Everything below par at any location, summed across the fleet and rounded up to whole packs."
          : `Everything below par at ${sc.name}, rounded up to whole packs.`,
      ]));
      if (!lines.length) {
        body.append(el("div", { class: "callout good" }, [W.icon("check"), "Everything here is at or above par. Nothing to order."]));
        body.append(el("div", { class: "form-actions" }, [W.btn("Close", { onclick: close })]));
        return;
      }
      const table = el("table", { class: "data" }, [
        el("thead", {}, [el("tr", {}, [
          el("th", {}, ["Item"]),
          el("th", { class: "num" }, ["Short"]),
          el("th", { class: "num" }, ["Buy"]),
          el("th", { class: "num" }, ["Cost"]),
        ])]),
        el("tbody", {}, lines.map((l) => el("tr", {}, [
          el("td", {}, [el("div", { class: "item-name" }, [el("span", { class: "prog prog-" + l.r.program }), l.r.name])]),
          el("td", { class: "num" }, countText(l.r, l.gap)),
          el("td", { class: "num" }, [l.packs ? `${l.packs} × ${l.r.packLabel}` : "—"]),
          el("td", { class: "num" }, [l.cost ? Store.money(l.cost) : "—"]),
        ]))),
        el("tfoot", {}, [el("tr", {}, [
          el("td", { colspan: 3 }, [`${lines.length} item${lines.length === 1 ? "" : "s"}`]),
          el("td", { class: "num mono" }, [Store.money(total)]),
        ])]),
      ]);
      body.append(el("div", { class: "card table-wrap" }, [table]));

      const text = [
        `ORDER SHEET — ${sc.name.toUpperCase()}`,
        new Date().toLocaleDateString(),
        "",
        ...lines.map((l) => `[ ] ${l.r.name} — ${l.packs} × ${l.r.packLabel} (short ${Store.qty(l.r.toCount(l.gap))} ${l.r.unit}) ${Store.money(l.cost)}`),
        "",
        `Total ${Store.money(total)}`,
      ].join("\n");

      body.append(el("div", { class: "form-actions" }, [
        W.btn("Copy", { icon: "copy", onclick: () => Core.copyText(text).then((ok) => Core.toast(ok ? "Copied." : "Couldn't reach the clipboard — use Download.")) }),
        W.btn("Download", { icon: "download", onclick: () => { Core.downloadText(text, `order-sheet-${sc.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`); } }),
        W.btn("Done", { kind: "primary", onclick: close }),
      ]));
    }, { wide: true, noFocus: true });
  }

  // ---------- item editor ----------
  function usageOf(program, id) {
    const names = [];
    if (program === "food") {
      Store.food.recipes.forEach((r) => { if ((r.components || []).some((c) => c.ingredientId === id)) names.push(r.name); });
      Store.food.orders.forEach((o) => { if ((o.supplies || []).some((s) => s.ingredientId === id)) names.push(o.name); });
    } else {
      Store.bar.recipes.forEach((r) => { if ((r.components || []).some((c) => c.ingredientId === id)) names.push(r.name); });
      Store.bar.preps.forEach((p) => { if ((p.components || []).some((c) => c.ingredientId === id)) names.push(p.name); });
    }
    return names;
  }

  function openItem(row) {
    const isNew = !row;
    let prog = row ? row.program : program() === "bar" ? "bar" : "food";
    const isPrep = row && row.kind === "prep";

    function blank(p) {
      return p === "food"
        ? { id: Store.C.uid("cing"), name: "", category: CateringStorage.CATEGORIES[0], baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 1, purchaseCost: 0, yieldPct: 100, unitNoun: "", onHand: {}, par: {} }
        : { id: Store.B.uid("bing"), name: "", category: BarStorage.CATEGORIES[0], baseUnit: "floz", purchaseUnit: "ml750", purchaseQty: 1, purchaseCost: 0, unitNoun: "", onHand: {}, par: {} };
    }
    let draft = row ? JSON.parse(JSON.stringify(row.obj)) : blank(prog);

    Core.openModal(isNew ? "Add item" : row.name, (body, close) => {
      const form = el("form", { autocomplete: "off" });
      const detailHost = el("div");
      const gridHost = el("div");
      form.append(detailHost, gridHost);

      function calc() { return prog === "food" ? Store.C : Store.B; }
      function countUnit() { return isPrep ? draft.baseUnit : draft.countUnit || draft.purchaseUnit; }
      function countLabel() {
        const u = countUnit();
        if (u === "each" && draft.unitNoun) return calc().unitLabel(draft, 2);
        return calc().purchaseUnit(draft.baseUnit, u).label;
      }

      const nameInput = el("input", { type: "text", value: draft.name, placeholder: prog === "food" ? "Chicken breast" : "London dry gin" });
      const qtyInput = W.numInput(draft.purchaseQty, (v) => { draft.purchaseQty = Number(v) || 0; });
      const costInput = W.numInput(draft.purchaseCost, (v) => { draft.purchaseCost = Number(v) || 0; }, { step: "0.01" });
      const yieldInput = W.numInput(draft.yieldPct == null ? 100 : draft.yieldPct, (v) => { draft.yieldPct = Number(v) || 100; }, { min: "1", max: "100" });
      const nounInput = el("input", { type: "text", value: draft.unitNoun || "", placeholder: "bottle, case, bunch…" });
      nounInput.addEventListener("input", () => { draft.unitNoun = nounInput.value.trim(); drawGrid(); });

      function drawDetails() {
        detailHost.innerHTML = "";
        if (isPrep) {
          detailHost.append(el("div", { class: "callout", style: "margin-bottom:6px" }, [
            W.icon("bar"),
            el("span", { class: "grow" }, [`A house prep, counted in ${countLabel()}. Its recipe and batch yield live on the Bar page.`]),
          ]));
          return;
        }
        if (isNew) {
          detailHost.append(W.fieldRow([W.field("Program", W.seg([
            { id: "food", label: "Food", dot: "var(--food)" },
            { id: "bar", label: "Bar", dot: "var(--bar)" },
          ], prog, (v) => {
            if (v === prog) return;
            const name = nameInput.value;
            prog = v;
            draft = blank(v);
            draft.name = name;
            Object.keys(onHand).forEach((k) => delete onHand[k]);
            Object.keys(par).forEach((k) => delete par[k]);
            drawDetails();
            drawGrid();
          }))]));
        }
        const cats = (prog === "food" ? CateringStorage.CATEGORIES : BarStorage.CATEGORIES).filter((c) => c !== "House Prep");
        if (draft.category && !cats.includes(draft.category)) cats.push(draft.category);
        detailHost.append(W.fieldRow([
          W.field("Name", nameInput),
          W.field("Category", W.select(cats.map((c) => ({ id: c, label: c })), draft.category, (v) => { draft.category = v; })),
        ]));
        detailHost.append(W.fieldRow([
          W.field("Measured in", W.select(
            Object.entries(calc().BASE_UNITS).map(([k, v]) => ({ id: k, label: v.long })),
            draft.baseUnit,
            (v) => {
              draft.baseUnit = v;
              draft.purchaseUnit = calc().purchaseUnitsFor(v)[0].id;
              delete draft.countUnit;
              drawDetails();
              drawGrid();
            }
          )),
          W.field("Bought by", W.select(
            calc().purchaseUnitsFor(draft.baseUnit).map((u) => ({ id: u.id, label: u.label })),
            draft.purchaseUnit,
            (v) => { draft.purchaseUnit = v; drawDetails(); drawGrid(); }
          )),
          W.field("Counted in", W.select(
            calc().purchaseUnitsFor(draft.baseUnit).map((u) => ({ id: u.id, label: u.label })),
            countUnit(),
            (v) => { draft.countUnit = v; drawGrid(); }
          ), "The unit you count shelves in."),
        ]));
        detailHost.append(W.fieldRow([
          W.field("Pack size", qtyInput, `${calc().purchaseUnit(draft.baseUnit, draft.purchaseUnit).label} per pack`),
          W.field("Pack cost", costInput),
          prog === "food" ? W.field("Yield %", yieldInput, "What survives trim.") : null,
          draft.baseUnit === "each" ? W.field("Unit name", nounInput) : null,
        ]));
      }

      // Stock is held in base units while editing, and shown in whatever
      // unit is picked above — so switching "Counted in" converts the numbers
      // rather than reinterpreting them.
      const onHand = Object.assign({}, draft.onHand);
      const par = Object.assign({}, draft.par);
      function drawGrid() {
        gridHost.innerHTML = "";
        gridHost.append(el("div", { class: "form-section" }, [
          el("h4", {}, ["Stock by location"]),
          el("span", { class: "small faint" }, [`in ${countLabel()} · leave par blank where it isn't carried`]),
        ]));
        const c = calc();
        const u = countUnit();
        const grid = el("div", { class: "loc-grid" });
        Store.locationsFor(prog).forEach((l) => {
          const show = (m) => (m[l.id] ? Store.qty(c.fromBaseQty(draft.baseUnit, u, m[l.id]), 3) : "");
          grid.append(el("div", { class: "loc-grid-row" }, [
            el("div", {}, [el("div", { class: "nm" }, [l.short || l.name]), el("div", { class: "wh" }, [Store.locationWhere(l)])]),
            W.numInput(show(onHand), (v) => { c.setQtyAt(onHand, l.id, c.toBaseQty(draft.baseUnit, u, v)); }, { placeholder: "—", "aria-label": `On hand at ${l.name}` }),
            W.numInput(show(par), (v) => { c.setQtyAt(par, l.id, c.toBaseQty(draft.baseUnit, u, v)); }, { placeholder: "—", "aria-label": `Par at ${l.name}` }),
          ]));
        });
        gridHost.append(
          el("div", { class: "loc-grid-head" }, [el("span"), el("span", { class: "label", style: "text-align:right" }, ["On hand"]), el("span", { class: "label", style: "text-align:right" }, ["Par"])]),
          grid
        );
      }

      drawDetails();
      drawGrid();

      form.append(el("div", { class: "form-actions" }, [
        !isNew && !isPrep ? W.btn("Delete", { kind: "danger", icon: "trash", cls: "left", onclick: () => {
          const used = usageOf(prog, draft.id);
          if (used.length) {
            Core.toast(`Used in ${used.slice(0, 3).join(", ")}${used.length > 3 ? "…" : ""} — remove it there first.`);
            return;
          }
          if (!confirm(`Delete ${row.name}? Its counts at every location go with it.`)) return;
          const list = prog === "food" ? Store.food.ingredients : Store.bar.ingredients;
          list.splice(list.indexOf(row.obj), 1);
          row.save();
          close();
          Shell.render();
          Core.toast("Item deleted.");
        } }) : null,
        W.btn("Cancel", { onclick: close }),
        W.btn(isNew ? "Add item" : "Save", { kind: "primary", type: "submit" }),
      ]));

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!isPrep) {
          if (!nameInput.value.trim()) { Core.toast("Give the item a name."); nameInput.focus(); return; }
          draft.name = nameInput.value.trim();
          draft.unitNoun = draft.baseUnit === "each" ? nounInput.value.trim() : "";
          if (prog === "food") draft.yieldPct = Math.min(Math.max(Number(draft.yieldPct) || 100, 1), 100);
        }
        draft.onHand = onHand;
        draft.par = par;
        if (isNew) {
          (prog === "food" ? Store.food.ingredients : Store.bar.ingredients).push(draft);
        } else if (isPrep) {
          row.obj.onHand = onHand;
          row.obj.par = par;
        } else {
          Object.assign(row.obj, draft);
        }
        if (prog === "food") Store.saveFood(); else Store.saveBar();
        close();
        Shell.render();
        Core.toast(isNew ? "Item added." : "Saved.");
      });

      body.append(form);
    }, { wide: true, noFocus: !isNew });
  }

  return { render, showLow, showMaster, openItem };
})();
