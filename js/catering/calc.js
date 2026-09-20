/* catering/calc.js — pure math for the catering program. No DOM in here.

   Two things make this different from a single-kitchen cost sheet:

   1. Every on-hand and par figure is a map of locationId -> quantity. A helper
      that used to read `ing.onHandQty` now reads `onHandAt(ing, locId)`, and
      the master figure the fleet cares about is `onHandTotal(ing)`.

   2. Servings do not only come from raw ingredients. The kitchen produces
      batches ahead of service, those batches ride out to the boats, and a boat
      cannot cook. So "how many can we serve at the Belle right now" is a
      question about prepared portions sitting in the Belle's galley, not about
      chicken in a walk-in five miles away. `servingsAt()` answers it that way. */

const CateringCalc = (function () {
  const BASE_UNITS = {
    ozwt: { label: "oz", long: "Weight (ounces / pounds)" },
    floz: { label: "fl oz", long: "Volume (fluid ounces / gallons)" },
    each: { label: "each", long: "Count (each / dozen / case)" },
  };

  const PURCHASE_UNITS = {
    ozwt: [
      { id: "ozwt", label: "oz", factor: 1 },
      { id: "lb", label: "lb", factor: 16 },
      { id: "g", label: "g", factor: 1 / 28.3495 },
      { id: "kg", label: "kg", factor: 35.274 },
    ],
    floz: [
      { id: "floz", label: "fl oz", factor: 1 },
      { id: "cup", label: "cup", factor: 8 },
      { id: "pint", label: "pint", factor: 16 },
      { id: "qt", label: "quart", factor: 32 },
      { id: "gal", label: "gallon", factor: 128 },
      { id: "ml", label: "mL", factor: 1 / 29.5735 },
      { id: "liter", label: "liter", factor: 33.814 },
      { id: "tbsp", label: "tbsp", factor: 0.5 },
      { id: "tsp", label: "tsp", factor: 1 / 6 },
    ],
    each: [
      { id: "each", label: "each", factor: 1 },
      { id: "dozen", label: "dozen", factor: 12 },
      { id: "case24", label: "case (24)", factor: 24 },
      { id: "case48", label: "case (48)", factor: 48 },
    ],
  };

  function purchaseUnitsFor(baseUnit) { return PURCHASE_UNITS[baseUnit] || PURCHASE_UNITS.each; }
  function purchaseUnit(baseUnit, id) {
    const units = purchaseUnitsFor(baseUnit);
    return units.find((u) => u.id === id) || units[0];
  }
  function toBaseQty(baseUnit, unitId, qty) { return (Number(qty) || 0) * purchaseUnit(baseUnit, unitId).factor; }
  function fromBaseQty(baseUnit, unitId, baseQty) {
    const f = purchaseUnit(baseUnit, unitId).factor;
    return f ? (Number(baseQty) || 0) / f : 0;
  }

  // ---------- per-location stock maps ----------
  // Quantities live as { locationId: baseQty }. Missing key means zero, and an
  // empty map is a perfectly valid "we don't stock this anywhere".
  function qtyAt(map, locId) { return Number(map && map[locId]) || 0; }
  function qtyTotal(map) {
    if (!map) return 0;
    return Object.keys(map).reduce((s, k) => s + (Number(map[k]) || 0), 0);
  }
  function setQtyAt(map, locId, qty) {
    const v = Number(qty) || 0;
    if (v <= 0) delete map[locId];
    else map[locId] = v;
    return map;
  }
  function locationsWithStock(map) {
    return Object.keys(map || {}).filter((k) => (Number(map[k]) || 0) > 0);
  }

  function onHandAt(ing, locId) { return qtyAt(ing && ing.onHand, locId); }
  function onHandTotal(ing) { return qtyTotal(ing && ing.onHand); }
  function parAt(ing, locId) { return qtyAt(ing && ing.par, locId); }
  function parTotal(ing) { return qtyTotal(ing && ing.par); }

  // Scope is a location id, or null for the master roll-up across the fleet.
  function onHandIn(ing, scope) { return scope ? onHandAt(ing, scope) : onHandTotal(ing); }
  function parIn(ing, scope) { return scope ? parAt(ing, scope) : parTotal(ing); }

  // "Below par" only means something where a par is actually set. A location
  // that doesn't stock an item has no par, so it is never flagged for it.
  function belowParAt(ing, locId) {
    const par = parAt(ing, locId);
    return par > 0 && onHandAt(ing, locId) < par;
  }
  function belowParAnywhere(ing) {
    return Object.keys((ing && ing.par) || {}).some((locId) => belowParAt(ing, locId));
  }
  function shortLocations(ing) {
    return Object.keys((ing && ing.par) || {}).filter((locId) => belowParAt(ing, locId));
  }
  // Total quantity needed to bring every location back up to its own par.
  function parGap(ing) {
    return Object.keys((ing && ing.par) || {}).reduce(
      (s, locId) => s + Math.max(0, parAt(ing, locId) - onHandAt(ing, locId)), 0);
  }

  // ---------- ingredient costing ----------
  function packBaseQty(ing) { return toBaseQty(ing.baseUnit, ing.purchaseUnit, ing.purchaseQty); }

  function costPerBaseUnit(ing) {
    const q = packBaseQty(ing);
    return q ? (Number(ing.purchaseCost) || 0) / q : 0;
  }

  function yieldFactor(ing) {
    const pct = ing && ing.yieldPct != null ? Number(ing.yieldPct) : 100;
    if (!pct || pct <= 0) return 1;
    return Math.min(pct, 100) / 100;
  }

  function costPerUsableUnit(ing) { return ing ? costPerBaseUnit(ing) / yieldFactor(ing) : 0; }
  function componentCost(ing, qty) { return ing ? costPerUsableUnit(ing) * (Number(qty) || 0) : 0; }

  function inventoryValueAt(ing, locId) { return onHandAt(ing, locId) * costPerBaseUnit(ing); }
  function inventoryValueTotal(ing) { return onHandTotal(ing) * costPerBaseUnit(ing); }
  function inventoryValueIn(ing, scope) {
    return scope ? inventoryValueAt(ing, scope) : inventoryValueTotal(ing);
  }

  function usableOnHandIn(ing, scope) { return onHandIn(ing, scope) * yieldFactor(ing); }

  // ---------- recipes ----------
  function portionsPerBatch(recipe) { return Math.max(Number(recipe && recipe.portions) || 1, 0.0001); }

  function recipeBatchCost(recipe, resolveIngredient) {
    return (recipe.components || []).reduce(
      (s, c) => s + componentCost(resolveIngredient(c.ingredientId), c.qty), 0);
  }

  function recipeCost(recipe, resolveIngredient) {
    return recipeBatchCost(recipe, resolveIngredient) / portionsPerBatch(recipe);
  }

  function componentQtyPerPortion(recipe, component) {
    return (Number(component.qty) || 0) / portionsPerBatch(recipe);
  }

  function suggestedPrice(cost, targetPct) {
    const p = Number(targetPct) || 0;
    return p ? cost / (p / 100) : 0;
  }
  function foodCostPct(cost, price) {
    const p = Number(price) || 0;
    return p ? (cost / p) * 100 : 0;
  }
  function grossProfit(cost, price) { return (Number(price) || 0) - cost; }
  function marginPct(cost, price) {
    const p = Number(price) || 0;
    return p ? (grossProfit(cost, p) / p) * 100 : 0;
  }

  // How many servings the raw ingredients in `scope` could produce, and what
  // runs out first. Scope null = the whole fleet's raw stock pooled.
  function rawServings(recipe, resolveIngredient, scope) {
    const comps = (recipe.components || []).filter((c) => (Number(c.qty) || 0) > 0);
    if (!comps.length) return { portions: 0, limitedBy: null, unlimited: true };

    let best = Infinity;
    let limitedBy = null;
    comps.forEach((c) => {
      const ing = resolveIngredient(c.ingredientId);
      if (!ing) return;
      const per = componentQtyPerPortion(recipe, c);
      if (per <= 0) return;
      const possible = usableOnHandIn(ing, scope) / per;
      if (possible < best) { best = possible; limitedBy = ing; }
    });

    if (best === Infinity) return { portions: 0, limitedBy: null, unlimited: true };
    return { portions: Math.floor(best), limitedBy, unlimited: false };
  }

  // ---------- prepared batches ----------
  // A batch is one production run: made on a date, good for so many days, with
  // its portions spread across wherever they were sent.
  function batchPortionsAt(batch, locId) { return qtyAt(batch && batch.portions, locId); }
  function batchPortionsTotal(batch) { return qtyTotal(batch && batch.portions); }
  function batchPortionsIn(batch, scope) {
    return scope ? batchPortionsAt(batch, scope) : batchPortionsTotal(batch);
  }

  function parseDate(str) {
    if (!str) return null;
    const d = new Date(str + (String(str).length <= 10 ? "T00:00:00" : ""));
    return isNaN(d.getTime()) ? null : d;
  }

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function expiryDate(batch) {
    const made = parseDate(batch && batch.producedOn);
    if (!made) return null;
    const days = Number(batch.shelfLifeDays);
    if (!days && days !== 0) return null;
    const d = new Date(made.getTime());
    d.setDate(d.getDate() + days);
    return d;
  }

  // Whole days from today until the batch is past its date. Negative is expired.
  function daysLeft(batch, now) {
    const exp = expiryDate(batch);
    if (!exp) return null;
    const ref = parseDate(now || todayISO());
    return Math.round((exp.getTime() - ref.getTime()) / 86400000);
  }

  function batchState(batch, now) {
    const left = daysLeft(batch, now);
    if (left == null) return "ok";
    if (left < 0) return "expired";
    if (left === 0) return "today";
    if (left <= 1) return "soon";
    return "ok";
  }

  function batchValue(batch, portionCost) {
    return batchPortionsTotal(batch) * (Number(portionCost) || 0);
  }

  // Prepared portions of a recipe that are still good, in a given scope.
  function preparedServings(recipeId, batches, scope, now) {
    return (batches || [])
      .filter((b) => b.recipeId === recipeId && batchState(b, now) !== "expired")
      .reduce((s, b) => s + batchPortionsIn(b, scope), 0);
  }

  // The headline availability number. At a location that cannot cook, the only
  // servings that exist are the prepared ones already there — the raw stock in
  // a boat galley is garnish and bread, not a dish. At the kitchen (or across
  // the fleet, where the kitchen's capacity is part of the pool) prepared
  // portions and raw capacity both count.
  function servingsAt(recipe, resolveIngredient, batches, scope, opts) {
    const o = opts || {};
    const prepared = preparedServings(recipe.id, batches, scope, o.now);
    const canCook = scope ? !!o.canCook : true;
    const raw = canCook ? rawServings(recipe, resolveIngredient, scope) : { portions: 0, limitedBy: null, unlimited: false };
    return {
      prepared,
      raw: raw.portions,
      total: prepared + raw.portions,
      limitedBy: raw.limitedBy,
      canCook,
      unlimited: raw.unlimited && canCook,
    };
  }

  // ---------- requirements ----------
  // Ingredient draw for a number of servings of one recipe.
  function portionRequirements(recipe, servings, resolveIngredient) {
    const out = [];
    (recipe.components || []).forEach((c) => {
      const ing = resolveIngredient(c.ingredientId);
      if (!ing) return;
      const usable = componentQtyPerPortion(recipe, c) * (Number(servings) || 0);
      out.push({
        ingredient: ing,
        usableQty: usable,
        asPurchasedQty: usable / yieldFactor(ing),
        cost: componentCost(ing, usable),
      });
    });
    return out;
  }

  function aggregateRequirements(lists) {
    const byId = new Map();
    lists.forEach((list) => {
      list.forEach((req) => {
        const found = byId.get(req.ingredient.id);
        if (found) {
          found.usableQty += req.usableQty;
          found.asPurchasedQty += req.asPurchasedQty;
          found.cost += req.cost;
        } else {
          byId.set(req.ingredient.id, { ...req });
        }
      });
    });
    return Array.from(byId.values());
  }

  // What's missing for a requirement measured against a scope's stock, and
  // what covering it costs in whole purchase packs.
  function shortfall(req, scope) {
    const onHand = onHandIn(req.ingredient, scope);
    const short = Math.max(0, req.asPurchasedQty - onHand);
    const pack = packBaseQty(req.ingredient);
    const packs = short > 0 && pack > 0 ? Math.ceil(short / pack) : 0;
    return { onHandQty: onHand, shortQty: short, packs, buyCost: packs * (Number(req.ingredient.purchaseCost) || 0) };
  }

  // ---------- orders ----------
  function orderPortions(guestCount, portionsPerGuest, overagePct) {
    const g = Number(guestCount) || 0;
    const per = Number(portionsPerGuest) || 0;
    const over = Number(overagePct) || 0;
    return Math.ceil(g * per * (1 + over / 100));
  }

  function lineProjection(cost, price, portions) {
    const p = Number(portions) || 0;
    const c = cost * p;
    const r = (Number(price) || 0) * p;
    return { portions: p, cost: c, revenue: r, profit: r - c };
  }

  // ---------- usage ----------
  function periodProjection(cost, price, servingsPerWeek) {
    const s = Number(servingsPerWeek) || 0;
    const wc = cost * s;
    const wr = (Number(price) || 0) * s;
    const wp = wr - wc;
    return {
      weekly: { servings: s, cost: wc, revenue: wr, profit: wp },
      monthly: { servings: s * 4.33, cost: wc * 4.33, revenue: wr * 4.33, profit: wp * 4.33 },
      annual: { servings: s * 52, cost: wc * 52, revenue: wr * 52, profit: wp * 52 },
    };
  }

  function daysOfCover(portionsOnHand, servingsPerWeek) {
    const perDay = (Number(servingsPerWeek) || 0) / 7;
    if (!perDay) return null;
    return (Number(portionsOnHand) || 0) / perDay;
  }

  // ---------- formatting ----------
  function fmtMoney(n) {
    return (Number(n) || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
  }
  function fmtMoney0(n) {
    return (Number(n) || 0).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  }
  function fmtPct(n) { return (Number(n) || 0).toFixed(1) + "%"; }
  function fmtNum(n, d) { return (Number(n) || 0).toFixed(d == null ? 2 : d); }
  function fmtQty(n, d) { return parseFloat((Number(n) || 0).toFixed(d == null ? 2 : d)).toString(); }

  function pluralize(w) {
    if (/[^aeiou]y$/i.test(w)) return w.slice(0, -1) + "ies";
    if (/(s|x|z|ch|sh)$/i.test(w)) return w + "es";
    return w + "s";
  }

  function unitLabel(ing, qty) {
    if (!ing) return "";
    if (ing.unitNoun) return Number(qty) === 1 ? ing.unitNoun : pluralize(ing.unitNoun);
    return BASE_UNITS[ing.baseUnit].label;
  }

  function fmtBaseQty(ing, baseQty) {
    if (!ing) return fmtQty(baseQty);
    const q = Number(baseQty) || 0;
    if (ing.baseUnit === "ozwt" && Math.abs(q) >= 32) return `${fmtQty(q / 16)} lb`;
    if (ing.baseUnit === "floz" && Math.abs(q) >= 128) return `${fmtQty(q / 128)} gal`;
    return `${fmtQty(q)} ${unitLabel(ing, q)}`;
  }

  function fmtDate(str) {
    const d = parseDate(str);
    if (!d) return "—";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function uid(prefix) {
    return (prefix || "id") + "_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  return {
    BASE_UNITS, purchaseUnitsFor, purchaseUnit, toBaseQty, fromBaseQty,
    qtyAt, qtyTotal, setQtyAt, locationsWithStock,
    onHandAt, onHandTotal, parAt, parTotal, onHandIn, parIn,
    belowParAt, belowParAnywhere, shortLocations, parGap,
    packBaseQty, costPerBaseUnit, yieldFactor, costPerUsableUnit, componentCost,
    inventoryValueAt, inventoryValueTotal, inventoryValueIn, usableOnHandIn,
    portionsPerBatch, recipeBatchCost, recipeCost, componentQtyPerPortion,
    suggestedPrice, foodCostPct, grossProfit, marginPct, rawServings,
    batchPortionsAt, batchPortionsTotal, batchPortionsIn, expiryDate, daysLeft,
    batchState, batchValue, preparedServings, servingsAt, parseDate, todayISO,
    portionRequirements, aggregateRequirements, shortfall,
    orderPortions, lineProjection, periodProjection, daysOfCover,
    fmtMoney, fmtMoney0, fmtPct, fmtNum, fmtQty, unitLabel, fmtBaseQty, fmtDate, uid,
  };
})();
