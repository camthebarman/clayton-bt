/* ui/store.js — one door into the three data stores.

   Food and Bar each keep their own state and localStorage key (so resetting
   one never touches the other), and Fleet owns the list of locations every
   quantity is keyed by. The pages never reach into those directly: they ask
   here, and they get back plain answers — what an item costs, how much of it
   is where, what the food and bar menus run at.

   The one abstraction worth knowing about is the inventory *row*: a food
   ingredient, a bar ingredient and a bar house prep all count, value and
   par the same way, so `inventoryRows()` wraps each in the same shape and
   the Inventory page never has to ask which it is holding. */

const Store = (function () {
  const C = CateringCalc;
  const B = BarCalc;

  let food = CateringStorage.load();
  let bar = BarStorage.load();

  // ---------- persistence ----------
  function saveFood() { CateringStorage.save(food); }
  function saveBar() { BarStorage.save(bar); }
  function saveFleet() { FleetStorage.save(); }
  function saveAll() { saveFood(); saveBar(); saveFleet(); }

  function resetAll() {
    food = CateringStorage.resetToDefaults();
    bar = BarStorage.resetToDefaults();
    FleetStorage.resetToDefaults();
  }

  // ---------- per-viewer UI memory ----------
  // Which filter was last open. Browser storage can throw (private mode, a
  // blocked site), and the page has to render the same without it.
  const UI_KEY = "ctb.ui.v2";
  let ui = {};
  try { ui = JSON.parse(localStorage.getItem(UI_KEY) || "{}") || {}; } catch (e) { ui = {}; }
  function uiGet(k, dflt) { return ui[k] === undefined ? dflt : ui[k]; }
  function uiSet(k, v) {
    ui[k] = v;
    try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) { /* keep it in memory */ }
  }

  // ---------- lookups ----------
  function foodIng(id) { return food.ingredients.find((i) => i.id === id) || null; }
  function barIng(id) { return bar.ingredients.find((i) => i.id === id) || null; }
  function barPrep(id) { return bar.preps.find((p) => p.id === id) || null; }
  function dish(id) { return food.recipes.find((r) => r.id === id) || null; }
  function drink(id) { return bar.recipes.find((r) => r.id === id) || null; }
  function event(id) { return food.orders.find((o) => o.id === id) || null; }

  // A bar component can be a raw ingredient or another house prep (the punch
  // base is made with simple syrup). This resolves either to something that
  // costs like an ingredient, and refuses a prep that contains itself.
  function barItem(id, seen) {
    const ing = barIng(id);
    if (ing) return ing;
    const prep = barPrep(id);
    if (!prep) return null;
    const path = new Set(seen || []);
    if (path.has(id)) return null;
    path.add(id);
    return B.prepAsIngredient(prep, (cid) => barItem(cid, path));
  }

  // ---------- costing ----------
  function dishCost(r) { return C.recipeCost(r, foodIng); }
  function dishBatchCost(r) { return C.recipeBatchCost(r, foodIng); }
  function drinkCost(r) { return B.recipeCost(r, (id) => barItem(id), barPrep); }
  function prepBatchCost(p) { return B.prepBatchCost(p, (id) => barItem(id, [p.id])); }
  function prepCostPerUnit(p) { return B.prepCostPerUnit(p, (id) => barItem(id, [p.id])); }

  // The headline number for a menu. Weighted by each item's weekly mix when
  // anything has one — a 40% dish that sells twice a week shouldn't move the
  // number as much as a 20% one that sells two hundred times. With no mix at
  // all it is plain total cost over total price.
  function menuCost(items, costFn, target) {
    const priced = items.filter((r) => Number(r.menuPrice) > 0);
    const weighted = priced.some((r) => Number(r.servingsPerWeek) > 0);
    let cost = 0;
    let revenue = 0;
    let weekCost = 0;
    let weekRevenue = 0;
    priced.forEach((r) => {
      const c = costFn(r);
      const w = weighted ? Number(r.servingsPerWeek) || 0 : 1;
      cost += c * w;
      revenue += Number(r.menuPrice) * w;
      weekCost += c * (Number(r.servingsPerWeek) || 0);
      weekRevenue += Number(r.menuPrice) * (Number(r.servingsPerWeek) || 0);
    });
    const pct = revenue ? (cost / revenue) * 100 : 0;
    return {
      pct, target: Number(target) || 0, weighted,
      count: items.length, priced: priced.length,
      avgCost: priced.length ? priced.reduce((s, r) => s + costFn(r), 0) / priced.length : 0,
      weekCost, weekRevenue, weekProfit: weekRevenue - weekCost,
    };
  }

  function foodTarget() { return Number(food.settings.defaultTargetFoodCostPct) || 0; }
  function barTarget() { return Number(bar.settings.defaultTargetPourCostPct) || 0; }
  function foodCost(filter) {
    return menuCost(food.recipes.filter(filter || (() => true)), dishCost, foodTarget());
  }
  function barCost(filter) {
    return menuCost(bar.recipes.filter(filter || (() => true)), drinkCost, barTarget());
  }

  // How far over target a cost % is, as a tone the meters and pills share.
  function costTone(pct, target) {
    if (!pct || !target) return "";
    if (pct <= target) return "good";
    if (pct <= target + 5) return "warn";
    return "bad";
  }

  // ---------- locations ----------
  // program: "food" | "bar" | "all". Bar stock lives where a location holds
  // "bev", which is Fleet's word for it.
  function locationsFor(program) {
    if (program === "food") return FleetStorage.foodLocations();
    if (program === "bar") return FleetStorage.bevLocations();
    return FleetStorage.locations();
  }
  function holds(loc, program) {
    if (!loc) return false;
    if (program === "all") return true;
    return (loc.holds || []).includes(program === "bar" ? "bev" : "food");
  }

  // Shore first, then each boat in fleet order: the groups the scope rail
  // and every location picker are built from.
  function locationGroups(program) {
    const locs = locationsFor(program);
    const groups = [];
    const shore = locs.filter((l) => !l.vesselId || !FleetStorage.vessel(l.vesselId));
    if (shore.length) groups.push({ id: "shore", name: "Shore", vessel: null, locations: shore });
    FleetStorage.vessels().forEach((v) => {
      const onBoard = locs.filter((l) => l.vesselId === v.id);
      if (onBoard.length) groups.push({ id: v.id, name: v.name, vessel: v, locations: onBoard });
    });
    return groups;
  }
  function locationWhere(loc) {
    const v = loc && FleetStorage.vessel(loc.vesselId);
    return v ? v.name : "Shore";
  }

  // ---------- inventory rows ----------
  function unitLabelFor(calc, obj, unitId) {
    if (unitId === "each" && obj.unitNoun) return calc.unitLabel(obj, 2);
    if (unitId === "each") return "each";
    return calc.purchaseUnit(obj.baseUnit, unitId).label;
  }

  // "8 loaves", not "8 each"; "1 × 1.75 L bottle" reads as "1 1.75 L bottle".
  function packLabel(calc, obj) {
    const q = Number(obj.purchaseQty) || 0;
    if (obj.purchaseUnit === "each" && obj.unitNoun) return `${calc.fmtQty(q)} ${calc.unitLabel(obj, q)}`;
    return `${calc.fmtQty(q)} ${calc.purchaseUnit(obj.baseUnit, obj.purchaseUnit).label}`;
  }

  function makeRow(program, kind, obj) {
    const calc = program === "food" ? C : B;
    const unitId = kind === "prep" ? obj.baseUnit : obj.countUnit || obj.purchaseUnit;
    const costPerBase = kind === "prep" ? prepCostPerUnit(obj) : calc.costPerBaseUnit(obj);
    const packBase = kind === "prep" ? Number(obj.yieldQty) || 0 : calc.packBaseQty(obj);
    return {
      key: `${program}:${obj.id}`,
      program, kind, obj, calc,
      id: obj.id,
      name: obj.name,
      category: kind === "prep" ? "House Prep" : obj.category || "Other",
      unitId,
      unit: unitLabelFor(calc, obj, unitId),
      costPerBase,
      packBase,
      packCost: kind === "prep" ? prepBatchCost(obj) : Number(obj.purchaseCost) || 0,
      packLabel: kind === "prep" ? "batch" : packLabel(calc, obj),
      toCount(base) { return calc.fromBaseQty(obj.baseUnit, unitId, base); },
      toBase(count) { return calc.toBaseQty(obj.baseUnit, unitId, count); },
      fmtBase(base) { return calc.fmtBaseQty(obj, base); },
      onHandAt(locId) { return calc.qtyAt(obj.onHand, locId); },
      parAt(locId) { return calc.qtyAt(obj.par, locId); },
      setOnHand(locId, base) { calc.setQtyAt(obj.onHand, locId, base); },
      setPar(locId, base) { calc.setQtyAt(obj.par, locId, base); },
      save() { if (program === "food") saveFood(); else saveBar(); },
    };
  }

  function inventoryRows(program) {
    const out = [];
    if (program !== "bar") food.ingredients.forEach((i) => out.push(makeRow("food", "ing", i)));
    if (program !== "food") {
      bar.ingredients.forEach((i) => out.push(makeRow("bar", "ing", i)));
      bar.preps.forEach((p) => out.push(makeRow("bar", "prep", p)));
    }
    return out;
  }

  // Sums over a set of location ids. A row only counts at locations that
  // hold its program — a stray key on the wrong kind of place is ignored.
  function rowLocIds(row, locIds) {
    return locIds.filter((id) => holds(FleetStorage.location(id), row.program));
  }
  function rowOnHand(row, locIds) { return rowLocIds(row, locIds).reduce((s, id) => s + row.onHandAt(id), 0); }
  function rowPar(row, locIds) { return rowLocIds(row, locIds).reduce((s, id) => s + row.parAt(id), 0); }
  function rowGap(row, locIds) {
    return rowLocIds(row, locIds).reduce((s, id) => s + Math.max(0, row.parAt(id) - row.onHandAt(id)), 0);
  }
  function rowValue(row, locIds) { return rowOnHand(row, locIds) * row.costPerBase; }
  function rowCarried(row, locIds) {
    return rowLocIds(row, locIds).some((id) => row.parAt(id) > 0 || row.onHandAt(id) > 0);
  }

  // "Below par" only means something where a par is set. A place that
  // doesn't carry an item is never flagged for it.
  function rowStatus(row, locIds) {
    const ids = rowLocIds(row, locIds);
    const withPar = ids.filter((id) => row.parAt(id) > 0);
    if (!withPar.length) return rowOnHand(row, ids) > 0 ? "ok" : "none";
    const lowAt = withPar.filter((id) => row.onHandAt(id) < row.parAt(id));
    if (!lowAt.length) return "ok";
    if (lowAt.some((id) => row.onHandAt(id) <= 0)) return "out";
    return "low";
  }

  function allLocIds() { return FleetStorage.locations().map((l) => l.id); }

  function inventoryTotals(program, locIds) {
    const ids = locIds || allLocIds();
    let value = 0;
    let low = 0;
    let out = 0;
    let carried = 0;
    inventoryRows(program).forEach((row) => {
      value += rowValue(row, ids);
      if (!rowCarried(row, ids)) return;
      carried++;
      const st = rowStatus(row, ids);
      if (st === "low") low++;
      if (st === "out") out++;
    });
    return { value, low, out, short: low + out, carried };
  }

  // ---------- formatting ----------
  function money(n) { return C.fmtMoney(n); }
  function money0(n) { return C.fmtMoney0(n); }
  function pct(n) { return C.fmtPct(n); }
  function qty(n, d) { return C.fmtQty(n, d == null ? 2 : d); }

  return {
    C, B,
    get food() { return food; },
    get bar() { return bar; },
    saveFood, saveBar, saveFleet, saveAll, resetAll,
    uiGet, uiSet,
    foodIng, barIng, barPrep, barItem, dish, drink, event,
    dishCost, dishBatchCost, drinkCost, prepBatchCost, prepCostPerUnit,
    foodCost, barCost, foodTarget, barTarget, costTone,
    locationsFor, holds, locationGroups, locationWhere, allLocIds,
    makeRow, packLabel, inventoryRows, rowLocIds, rowOnHand, rowPar, rowGap, rowValue, rowCarried, rowStatus, inventoryTotals,
    money, money0, pct, qty,
  };
})();
