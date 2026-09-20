/* bar/calc.js — pure math for the beverage program across every bar.

   Same per-location quantity maps as catering. The wrinkle here is house-made
   prep: a drink that calls for ginger syrup isn't limited by the bottle, it's
   limited by the ginger and sugar the next batch needs — but only somewhere
   that can actually batch it. The commissary can. A bar on the upper deck of
   the Duchess, thirty minutes into a sunset cruise, cannot: if the bottle is
   dry the drink is 86'd until a runner brings another one.

   So availability takes a `canBatch` flag the way catering's takes `canCook`,
   and it is the same idea wearing a different hat. */

const BarCalc = (function () {
  const BASE_UNITS = {
    floz: { label: "fl oz", long: "Volume (fluid ounces / liters)" },
    ozwt: { label: "oz", long: "Weight (ounces / pounds)" },
    each: { label: "each", long: "Count (each / case)" },
  };

  const PURCHASE_UNITS = {
    floz: [
      { id: "floz", label: "fl oz", factor: 1 },
      { id: "ml750", label: "750 mL bottle", factor: 25.36 },
      { id: "ml1000", label: "1 L bottle", factor: 33.814 },
      { id: "ml1750", label: "1.75 L bottle", factor: 59.17 },
      { id: "liter", label: "liter", factor: 33.814 },
      { id: "ml", label: "mL", factor: 1 / 29.5735 },
      { id: "qt", label: "quart", factor: 32 },
      { id: "gal", label: "gallon", factor: 128 },
      { id: "keg half", label: "1/2 bbl keg", factor: 1984 },
      { id: "keg sixth", label: "1/6 bbl keg", factor: 661 },
      { id: "can12", label: "12 oz can", factor: 12 },
    ],
    ozwt: [
      { id: "ozwt", label: "oz", factor: 1 },
      { id: "lb", label: "lb", factor: 16 },
      { id: "kg", label: "kg", factor: 35.274 },
    ],
    each: [
      { id: "each", label: "each", factor: 1 },
      { id: "dozen", label: "dozen", factor: 12 },
      { id: "case24", label: "case (24)", factor: 24 },
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
  function onHandAt(item, locId) { return qtyAt(item && item.onHand, locId); }
  function onHandTotal(item) { return qtyTotal(item && item.onHand); }
  function parAt(item, locId) { return qtyAt(item && item.par, locId); }
  function parTotal(item) { return qtyTotal(item && item.par); }
  function onHandIn(item, scope) { return scope ? onHandAt(item, scope) : onHandTotal(item); }
  function parIn(item, scope) { return scope ? parAt(item, scope) : parTotal(item); }

  function belowParAt(item, locId) {
    const par = parAt(item, locId);
    return par > 0 && onHandAt(item, locId) < par;
  }
  function belowParAnywhere(item) {
    return Object.keys((item && item.par) || {}).some((locId) => belowParAt(item, locId));
  }
  function shortLocations(item) {
    return Object.keys((item && item.par) || {}).filter((locId) => belowParAt(item, locId));
  }
  function parGap(item) {
    return Object.keys((item && item.par) || {}).reduce(
      (s, locId) => s + Math.max(0, parAt(item, locId) - onHandAt(item, locId)), 0);
  }

  // ---------- costing ----------
  function packBaseQty(item) { return toBaseQty(item.baseUnit, item.purchaseUnit, item.purchaseQty); }
  function costPerBaseUnit(item) {
    const q = packBaseQty(item);
    return q ? (Number(item.purchaseCost) || 0) / q : 0;
  }
  function componentCost(item, qty) { return item ? costPerBaseUnit(item) * (Number(qty) || 0) : 0; }

  function inventoryValueAt(item, locId) { return onHandAt(item, locId) * costPerBaseUnit(item); }
  function inventoryValueTotal(item) { return onHandTotal(item) * costPerBaseUnit(item); }
  function inventoryValueIn(item, scope) {
    return scope ? inventoryValueAt(item, scope) : inventoryValueTotal(item);
  }

  // ---------- house preps ----------
  function prepBatchCost(prep, resolveIngredient) {
    return (prep.components || []).reduce(
      (s, c) => s + componentCost(resolveIngredient(c.ingredientId), c.qty), 0);
  }
  function prepCostPerUnit(prep, resolveIngredient) {
    const y = Number(prep.yieldQty) || 0;
    return y ? prepBatchCost(prep, resolveIngredient) / y : 0;
  }

  // Presents a prep as an ingredient-shaped object so anything that costs an
  // ingredient can cost a prep without knowing the difference.
  function prepAsIngredient(prep, resolveIngredient) {
    return {
      id: prep.id,
      name: prep.name,
      category: prep.category || "House Prep",
      baseUnit: prep.baseUnit,
      unitNoun: prep.unitNoun,
      purchaseUnit: prep.baseUnit,
      purchaseQty: prep.yieldQty,
      purchaseCost: prepBatchCost(prep, resolveIngredient),
      onHand: prep.onHand,
      par: prep.par,
      isPrep: true,
    };
  }

  // ---------- recipes ----------
  function recipeCost(recipe, resolveIngredient, resolvePrep) {
    return (recipe.components || []).reduce((sum, c) => {
      const ing = resolveIngredient(c.ingredientId);
      if (ing) return sum + componentCost(ing, c.qty);
      const prep = resolvePrep(c.ingredientId);
      if (!prep) return sum;
      return sum + prepCostPerUnit(prep, resolveIngredient) * (Number(c.qty) || 0);
    }, 0);
  }

  function suggestedPrice(cost, targetPct) {
    const p = Number(targetPct) || 0;
    return p ? cost / (p / 100) : 0;
  }
  function pourCostPct(cost, price) {
    const p = Number(price) || 0;
    return p ? (cost / p) * 100 : 0;
  }
  function grossProfit(cost, price) { return (Number(price) || 0) - cost; }
  function marginPct(cost, price) {
    const p = Number(price) || 0;
    return p ? (grossProfit(cost, p) / p) * 100 : 0;
  }

  // What a drink draws, at a place that CAN batch its preps: every prep is
  // expanded into the raw ingredients behind it.
  function rawRequirements(recipe, resolveIngredient, resolvePrep) {
    const totals = new Map();
    function add(id, qty) {
      const ing = resolveIngredient(id);
      if (!ing || !(qty > 0)) return;
      const found = totals.get(ing.id);
      if (found) found.qty += qty;
      else totals.set(ing.id, { ingredient: ing, qty });
    }
    (recipe.components || []).forEach((c) => {
      const qty = Number(c.qty) || 0;
      if (!(qty > 0)) return;
      if (resolveIngredient(c.ingredientId)) { add(c.ingredientId, qty); return; }
      const prep = resolvePrep(c.ingredientId);
      if (!prep) return;
      const y = Number(prep.yieldQty) || 0;
      if (!y) return;
      const batches = qty / y;
      (prep.components || []).forEach((pc) => add(pc.ingredientId, (Number(pc.qty) || 0) * batches));
    });
    return Array.from(totals.values());
  }

  // What a drink draws at a bar that CANNOT batch: the prep counts as itself,
  // measured in bottles of prep actually sitting on that bar.
  function directRequirements(recipe, resolveIngredient, resolvePrep) {
    const totals = new Map();
    (recipe.components || []).forEach((c) => {
      const qty = Number(c.qty) || 0;
      if (!(qty > 0)) return;
      const item = resolveIngredient(c.ingredientId) || resolvePrep(c.ingredientId);
      if (!item) return;
      const found = totals.get(item.id);
      if (found) found.qty += qty;
      else totals.set(item.id, { ingredient: item, qty });
    });
    return Array.from(totals.values());
  }

  // Whether a bar is meant to pour this at all. A par level is a bar's
  // standing statement of what it carries, so a drink is on that bar's menu
  // when every component it needs has a par set there. Without this, the
  // single well on Miss Clayton reads as having 86'd two thirds of the list,
  // when in truth it never offered any of it — and a count sheet that cries
  // wolf on nine bars is a count sheet nobody reads.
  function offeredAt(recipe, resolveIngredient, resolvePrep, locId) {
    if (!locId) return true;
    const reqs = directRequirements(recipe, resolveIngredient, resolvePrep);
    if (!reqs.length) return false;
    return reqs.every((req) => parAt(req.ingredient, locId) > 0);
  }

  // Which components are the reason a drink isn't offered somewhere — the
  // answer to "what would it take to run this off the upper deck?".
  function missingFromMenu(recipe, resolveIngredient, resolvePrep, locId) {
    if (!locId) return [];
    return directRequirements(recipe, resolveIngredient, resolvePrep)
      .filter((req) => parAt(req.ingredient, locId) <= 0)
      .map((req) => req.ingredient);
  }

  // How many of this drink could be poured in `scope`, and what runs out
  // first. scope null pools the whole fleet and assumes the commissary can
  // batch, which is the right reading for a master roll-up.
  function servingsAt(recipe, resolveIngredient, resolvePrep, scope, opts) {
    const o = opts || {};
    const canBatch = scope ? !!o.canBatch : true;
    const offered = offeredAt(recipe, resolveIngredient, resolvePrep, scope);
    const reqs = canBatch
      ? rawRequirements(recipe, resolveIngredient, resolvePrep)
      : directRequirements(recipe, resolveIngredient, resolvePrep);
    if (!reqs.length) return { servings: 0, limitedBy: null, unlimited: true, canBatch, offered };

    let best = Infinity;
    let limitedBy = null;
    reqs.forEach((req) => {
      const possible = onHandIn(req.ingredient, scope) / req.qty;
      if (possible < best) { best = possible; limitedBy = req.ingredient; }
    });
    if (best === Infinity) return { servings: 0, limitedBy: null, unlimited: true, canBatch, offered };
    return { servings: Math.floor(best), limitedBy, unlimited: false, canBatch, offered };
  }

  // ---------- projections ----------
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

  // Drinks a cruise will pour: guests x drinks each x this drink's share of
  // the mix. A two-hour tour and a four-hour dinner cruise are different
  // numbers, which is why the rate is per order rather than a house constant.
  function cruiseServings(guestCount, drinksPerGuest, mixPct) {
    const g = Number(guestCount) || 0;
    const d = Number(drinksPerGuest) || 0;
    const m = Number(mixPct) || 0;
    return Math.ceil(g * d * (m / 100));
  }

  function cruiseProjection(cost, price, servings) {
    const s = Number(servings) || 0;
    const c = cost * s;
    const r = (Number(price) || 0) * s;
    return { servings: s, cost: c, revenue: r, profit: r - c };
  }

  function cruisesOfCover(servingsOnHand, servingsPerCruise) {
    const per = Number(servingsPerCruise) || 0;
    return per ? (Number(servingsOnHand) || 0) / per : null;
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

  function unitLabel(item, qty) {
    if (!item) return "";
    if (item.unitNoun) return Number(qty) === 1 ? item.unitNoun : pluralize(item.unitNoun);
    return (BASE_UNITS[item.baseUnit] || BASE_UNITS.each).label;
  }

  function fmtBaseQty(item, baseQty) {
    if (!item) return fmtQty(baseQty);
    const q = Number(baseQty) || 0;
    if (item.baseUnit === "floz" && Math.abs(q) >= 128) return `${fmtQty(q / 128)} gal`;
    if (item.baseUnit === "ozwt" && Math.abs(q) >= 32) return `${fmtQty(q / 16)} lb`;
    return `${fmtQty(q)} ${unitLabel(item, q)}`;
  }

  function uid(prefix) {
    return (prefix || "id") + "_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  return {
    BASE_UNITS, purchaseUnitsFor, purchaseUnit, toBaseQty, fromBaseQty,
    qtyAt, qtyTotal, setQtyAt,
    onHandAt, onHandTotal, parAt, parTotal, onHandIn, parIn,
    belowParAt, belowParAnywhere, shortLocations, parGap,
    packBaseQty, costPerBaseUnit, componentCost,
    inventoryValueAt, inventoryValueTotal, inventoryValueIn,
    prepBatchCost, prepCostPerUnit, prepAsIngredient,
    recipeCost, suggestedPrice, pourCostPct, grossProfit, marginPct,
    rawRequirements, directRequirements, offeredAt, missingFromMenu, servingsAt,
    periodProjection, cruiseServings, cruiseProjection, cruisesOfCover,
    fmtMoney, fmtMoney0, fmtPct, fmtNum, fmtQty, unitLabel, fmtBaseQty, uid,
  };
})();
