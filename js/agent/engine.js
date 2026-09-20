/* agent/engine.js — the built-in answer engine.

   Works with no API key, no network and no account. It reads the same live
   snapshot the three tools expose, matches the question against the things
   somebody running this operation actually asks, and computes the answer from
   the real data. It is not a language model: the numbers it gives are the
   numbers in the app, and it says so when it can't match a question rather
   than guessing.

   Nearly every answer here names a location. On a single-site operation
   "we have twelve" is an answer; across a commissary, a kitchen and three
   boats it is a trap. */

const AgentEngine = (function () {
  function snapshot() {
    return {
      catering: CateringApp.snapshot(),
      bar: BarApp.snapshot(),
      fleet: FleetApp.snapshot(),
      cateringSummary: CateringApp.summary(),
      barSummary: BarApp.summary(),
      fleetSummary: FleetApp.summary(),
    };
  }

  // ---------- helpers ----------
  function money(n) {
    return (Number(n) || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
  }
  function money0(n) {
    return (Number(n) || 0).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  }
  function pct(n) { return (Number(n) || 0).toFixed(1) + "%"; }
  function plural(n, one, many) { return `${n} ${n === 1 ? one : many || one + "s"}`; }
  function norm(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function has(q, ...words) { return words.some((w) => q.includes(w)); }
  function list(names, limit) {
    const n = limit == null ? 6 : limit;
    if (!names.length) return "none";
    if (names.length <= n) return names.join(", ");
    return names.slice(0, n).join(", ") + ` and ${names.length - n} more`;
  }

  // Which location a question is about, if any. Matches the full name, the
  // short name, or a boat's name — "what's on the Belle" has to work.
  function findLocation(q, snap) {
    let best = null;
    let bestLen = 0;
    snap.fleet.locations.forEach((l) => {
      // Both the full name and the short one, because nobody says "Island
      // Duchess Upper Bar" out loud — they say "the Duchess upper bar".
      [l.name, l.short].forEach((label) => {
        const n = norm(label);
        if (n && q.includes(n) && n.length > bestLen) { best = l; bestLen = n.length; }
      });
    });
    if (best) return best;
    // A boat name matches every location on that boat.
    let vessel = null;
    snap.fleet.vessels.forEach((v) => {
      const n = norm(v.name);
      if (!n) return;
      const words = n.split(" ").filter((w) => w.length > 3);
      if (q.includes(n) || words.some((w) => q.includes(w))) {
        if (!vessel || n.length > norm(vessel.name).length) vessel = v;
      }
    });
    if (vessel) return { vesselGroup: vessel };
    return null;
  }

  function findEntity(q, snap) {
    const pool = [];
    snap.catering.dishes.forEach((d) => pool.push({ kind: "dish", name: d.name, item: d }));
    snap.bar.drinks.forEach((d) => pool.push({ kind: "drink", name: d.name, item: d }));
    snap.catering.ingredients.forEach((i) => pool.push({ kind: "ingredient", name: i.name, item: i, side: "kitchen" }));
    snap.bar.ingredients.forEach((i) => pool.push({ kind: "ingredient", name: i.name, item: i, side: "bar" }));
    snap.bar.preps.forEach((p) => pool.push({ kind: "prep", name: p.name, item: p }));

    let best = null;
    pool.forEach((e) => {
      const n = norm(e.name);
      if (n && q.includes(n) && (!best || n.length > norm(best.name).length)) best = e;
    });
    if (best) return best;

    // Nothing matched whole; try the most distinctive word of each name.
    let partial = null;
    pool.forEach((e) => {
      norm(e.name).split(" ").forEach((w) => {
        if (w.length < 5) return;
        if (q.includes(w) && (!partial || w.length > partial.word.length)) partial = { ...e, word: w };
      });
    });
    if (partial) return partial;

    // Last chance: the head noun. People ask about "gin", not "London Dry
    // Gin". Only accept it when exactly one item in the pool ends in that
    // word — "oil" matches two, and answering about the wrong one is worse
    // than admitting the question wasn't understood.
    const words = q.split(" ").filter((w) => w.length >= 3);
    let unique = null;
    for (const w of words) {
      const hits = pool.filter((e) => {
        const parts = norm(e.name).split(" ");
        return parts[parts.length - 1] === w;
      });
      if (hits.length === 1) { unique = hits[0]; break; }
    }
    return unique;
  }

  // ---------- intents ----------
  // Each returns { text, table? } when it recognises the question, else null.

  // What needs ordering or restocking, per location.
  function belowParIntent(q, snap) {
    if (!has(q, "order", "below par", "under par", "restock", "short", "low on", "need to buy", "reorder", "running out of stock")) return null;
    if (has(q, "86", "eighty six")) return null;

    const loc = findLocation(q, snap);
    const cat = snap.cateringSummary.belowParDetail;
    const bar = snap.barSummary.belowParDetail;

    // "Are we short on gin" is about gin. Answer that rather than handing
    // back the whole order list and making someone find it.
    const ent = findEntity(q, snap);
    if (ent && (ent.kind === "ingredient" || ent.kind === "prep")) {
      const i = ent.item;
      const byLoc = i.onHandByLocation || i.onHandByBar || {};
      const rows = Object.keys(byLoc).map((k) => [k, byLoc[k], (i.belowParAt || []).includes(k) ? "below par" : "ok"]);
      return {
        text: (i.belowParAt && i.belowParAt.length)
          ? `${i.name} is below par at ${list(i.belowParAt)}. ${i.masterOnHand} on hand across the fleet, worth ${money(i.masterValue)}.`
          : `${i.name} is at par everywhere it is carried — ${i.masterOnHand} on hand, worth ${money(i.masterValue)}.`,
        table: rows.length ? { head: ["Location", "On hand", "Status"], rows } : null,
      };
    }

    if (loc && !loc.vesselGroup) {
      const here = [
        ...cat.filter((x) => x.at.some((a) => norm(loc.name).includes(norm(a)) || norm(a) === norm(loc.name) || norm(loc.name).startsWith(norm(a)))).map((x) => ["Catering", x.name]),
        ...bar.filter((x) => x.at.some((a) => norm(loc.name).includes(norm(a)) || norm(a) === norm(loc.name) || norm(loc.name).startsWith(norm(a)))).map((x) => ["Bar", x.name]),
      ];
      if (!here.length) {
        return { text: `${loc.name} is at par on everything it carries.` };
      }
      return {
        text: `${plural(here.length, "item")} below par at ${loc.name}. If the commissary has them, restock from there rather than ordering.`,
        table: { head: ["Program", "Item"], rows: here },
      };
    }

    const all = [...cat.map((x) => ["Catering", x.name, x.at.join(", ")]), ...bar.map((x) => ["Bar", x.name, x.at.join(", ")])];
    if (!all.length) return { text: "Nothing is below par anywhere in the fleet." };
    all.sort((a, b) => b[2].split(",").length - a[2].split(",").length);
    return {
      text: `${plural(all.length, "item")} below par somewhere. The ones short in several places are first — those are usually a real order, not a transfer.`,
      table: { head: ["Program", "Item", "Short at"], rows: all.slice(0, 25) },
    };
  }

  // What can't be served or poured.
  function eightySixIntent(q, snap) {
    if (!has(q, "86", "eighty six", "out of stock", "can t make", "cant make", "can t we make", "cant we make",
      "can t serve", "cant serve", "can t we serve", "cant we serve", "can t pour", "cant pour")) return null;
    const loc = findLocation(q, snap);

    if (loc && !loc.vesselGroup) {
      const holds = loc.holds || [];
      const rows = [];

      // Only ask about what this location actually holds. A bar has not 86'd
      // the eggplant; it was never going to serve it.
      if (holds.includes("bev")) {
        snap.bar.drinks.forEach((d) => {
          const row = (d.byBar || []).find((b) => norm(b.bar) === norm(loc.name));
          if (row && row.eightySixed) rows.push([d.name, row.limitedBy ? "out of " + row.limitedBy : "out"]);
        });
      }
      if (holds.includes("food")) {
        snap.catering.dishes
          .filter((d) => (d.servableAt || []).every((x) => norm(x.location) !== norm(loc.name)))
          .forEach((d) => {
            rows.push([d.name, loc.canCook ? "nothing prepared and nothing to cook it from" : "nothing prepared here, and this location can't cook"]);
          });
      }

      if (!rows.length) return { text: `Nothing is 86'd at ${loc.name}.` };
      return {
        text: `${plural(rows.length, "thing")} 86'd at ${loc.name}, out of what it carries.`,
        table: { head: ["Item", "Why"], rows: rows.slice(0, 20) },
      };
    }

    const bar = snap.barSummary.eightySixed;
    const cat = snap.cateringSummary.eightySixed;
    if (!bar.length && !cat.length) return { text: "Nothing is 86'd — every drink a bar carries can be poured, and every dish can be served somewhere." };
    const parts = [];
    if (cat.length) parts.push(`Kitchen: ${list(cat)} — can't be served anywhere in the fleet.`);
    if (bar.length) parts.push(`Bars: ${list(bar, 8)}.`);
    return { text: parts.join("\n\n") };
  }

  // Prepared food: what is made, what is going off, what still has to be cooked.
  function preparedIntent(q, snap) {
    if (!has(q, "prep", "prepped", "prepared", "made ahead", "batch", "expire", "expiring", "going off", "past date", "use today", "shelf life")) return null;
    const loc = findLocation(q, snap);
    const batches = snap.catering.preparedBatches;

    if (has(q, "expire", "expiring", "going off", "past date", "use today", "throw")) {
      const urgent = batches.filter((b) => ["expired", "today", "soon"].includes(b.state));
      if (!urgent.length) return { text: "Nothing prepared is close to its date. The board is clean." };
      return {
        text: `${plural(urgent.length, "batch", "batches")} need attention today.`,
        table: {
          head: ["Dish", "Made", "State", "Portions", "Where"],
          rows: urgent.map((b) => [
            b.dish, b.producedOn,
            b.state === "expired" ? "past date — pull it" : b.state === "today" ? "use today" : "one day left",
            b.totalPortions,
            Object.keys(b.portionsByLocation).join(", ") || "—",
          ]),
        },
      };
    }

    if (has(q, "still", "need to", "to produce", "to make", "prep list", "what should")) {
      const todo = snap.catering.prepListNext7Days;
      if (!todo.length) return { text: "Everything booked in the next seven days is already made and on the board." };
      return {
        text: `${plural(todo.length, "dish", "dishes")} still to produce for what's booked this week.`,
        table: {
          head: ["Dish", "Needed", "Already made", "To produce"],
          rows: todo.map((d) => [d.dish, d.needed, d.alreadyMade, d.toProduce]),
        },
      };
    }

    const rows = batches
      .filter((b) => {
        if (!loc || loc.vesselGroup) return b.totalPortions > 0;
        return Object.keys(b.portionsByLocation).some((k) => norm(k) === norm(loc.name));
      })
      .map((b) => [
        b.dish,
        loc && !loc.vesselGroup ? b.portionsByLocation[loc.name] || 0 : b.totalPortions,
        b.producedOn,
        b.daysLeft == null ? "—" : b.daysLeft < 0 ? "past date" : plural(b.daysLeft, "day") + " left",
        Object.keys(b.portionsByLocation).join(", ") || "—",
      ]);
    if (!rows.length) {
      return { text: loc && !loc.vesselGroup ? `Nothing prepared is sitting at ${loc.name}.` : "Nothing prepared is on hand." };
    }
    const where = loc && !loc.vesselGroup ? ` at ${loc.name}` : " across the fleet";
    return {
      text: `${plural(rows.length, "batch", "batches")} on the board${where}, oldest first.`,
      table: { head: ["Dish", "Portions", "Made", "Life", "Sitting at"], rows },
    };
  }

  // How many of something can we serve or pour, and where.
  function availabilityIntent(q, snap) {
    if (!has(q, "how many", "how much", "enough", "cover", "can we serve", "can we pour", "can i pour", "can i serve", "left")) return null;
    const ent = findEntity(q, snap);
    if (!ent) return null;

    if (ent.kind === "dish") {
      const d = ent.item;
      const rows = (d.servableAt || []).map((x) => [x.location, x.portions]);
      const head = d.preppedAhead
        ? `${d.name}: ${d.totalAvailable} servings across the fleet — ${d.preparedPortionsOnHand} already prepared, ${d.cookableNow} more the kitchen could still cook.`
        : `${d.name}: ${d.cookableNow} servings the kitchen could make from what's counted in.`;
      const tail = d.firstToRunOut ? `\n\n${d.firstToRunOut} runs out first.` : "";
      return {
        text: head + tail + (rows.length ? "" : "\n\nNone of it is on a boat yet."),
        table: rows.length ? { head: ["Location", "Servings"], rows } : null,
      };
    }

    if (ent.kind === "drink") {
      const d = ent.item;
      const rows = (d.byBar || []).map((b) => [
        b.bar,
        b.offered ? (b.eightySixed ? "86'd" : b.pours) : "not on this bar",
        b.offered && b.limitedBy ? b.limitedBy : "—",
      ]);
      return {
        text: `${d.name}: ${d.fleetPoursAvailable} pours across the fleet${d.firstToRunOut ? `, with ${d.firstToRunOut} running out first` : ""}. Bar by bar:`,
        table: { head: ["Bar", "Pours", "Runs out first"], rows },
      };
    }

    if (ent.kind === "ingredient") {
      const i = ent.item;
      const byLoc = i.onHandByLocation || i.onHandByBar || {};
      const rows = Object.keys(byLoc).map((k) => [k, byLoc[k]]);
      return {
        text: `${i.name}: ${i.masterOnHand} across the fleet, worth ${money(i.masterValue)}.` +
          (i.belowParAt && i.belowParAt.length ? ` Below par at ${list(i.belowParAt)}.` : ""),
        table: rows.length ? { head: ["Location", "On hand"], rows } : null,
      };
    }

    if (ent.kind === "prep") {
      const p = ent.item;
      const rows = Object.keys(p.onHandByBar || {}).map((k) => [k, p.onHandByBar[k]]);
      return {
        text: `${p.name} yields ${p.yields} a batch at ${money(p.batchCost)}, or ${money(p.costPerUnit)} a unit.` +
          (p.belowParAt && p.belowParAt.length ? ` Below par at ${list(p.belowParAt)}.` : ""),
        table: rows.length ? { head: ["Bar", "On hand"], rows } : null,
      };
    }
    return null;
  }

  // Where is stock, what is it worth.
  function whereIntent(q, snap) {
    if (!has(q, "where", "worth", "value", "inventory", "how much stock", "on the", "aboard", "carrying")) return null;
    const loc = findLocation(q, snap);
    const f = snap.fleetSummary;

    if (loc && !loc.vesselGroup) {
      const l = snap.fleet.locations.find((x) => x.name === loc.name);
      if (!l) return null;
      return {
        text: `${l.name} is carrying ${money(l.totalValue)} — ${money(l.rawFoodValue)} raw food, ${money(l.preparedFoodValue)} prepared, ${money(l.barValue)} bar stock.` +
          (l.canCook ? " It can cook, so it can produce as well as hold." : " It can't cook — what it can serve is what was sent there prepared.") +
          (l.notes ? `\n\n${l.notes}` : ""),
      };
    }

    if (loc && loc.vesselGroup) {
      const v = loc.vesselGroup;
      const rows = snap.fleet.locations
        .filter((l) => l.vessel === v.name)
        .map((l) => [l.name, money(l.rawFoodValue), money(l.preparedFoodValue), money(l.barValue), money(l.totalValue)]);
      const total = snap.fleet.locations.filter((l) => l.vessel === v.name).reduce((s, l) => s + l.totalValue, 0);
      return {
        text: `${v.name} — ${v.runs}, ${v.capacity} guests — is carrying ${money(total)}.`,
        table: { head: ["Location", "Raw food", "Prepared", "Bar", "Total"], rows },
      };
    }

    return {
      text: `Master inventory is ${money(f.totalValue)} — ${money(f.ashoreValue)} ashore and ${money(f.afloatValue)} afloat across ${plural(f.vessels, "boat")}.`,
      table: {
        head: ["Location", "Raw food", "Prepared", "Bar", "Total"],
        rows: snap.fleet.locations
          .slice()
          .sort((a, b) => b.totalValue - a.totalValue)
          .map((l) => [l.name, money0(l.rawFoodValue), money0(l.preparedFoodValue), money0(l.barValue), money0(l.totalValue)]),
      },
    };
  }

  // What's moving between locations.
  function transferIntent(q, snap) {
    if (!has(q, "transfer", "in transit", "on the way", "moving", "runner", "load out", "load-out", "loadout", "shipment")) return null;
    const pending = snap.fleet.transfers.filter((t) => t.status === "Draft" || t.status === "In transit");
    if (!pending.length) return { text: "Nothing is in transit and there are no drafts waiting." };
    return {
      text: `${plural(pending.length, "transfer")} not yet received. Until they are, that stock still counts at the origin.`,
      table: {
        head: ["Ref", "From", "To", "Status", "Lines"],
        rows: pending.map((t) => [t.ref, t.from, t.to, t.status, t.lines.length]),
      },
    };
  }

  // What's coming up.
  function ordersIntent(q, snap) {
    if (!has(q, "order", "booked", "coming up", "next", "tomorrow", "this week", "schedule", "cruise", "charter", "lunch")) return null;
    if (has(q, "below par", "restock", "reorder")) return null;
    const orders = snap.catering.orders;
    if (!orders.length) return { text: "Nothing is on the books." };
    const sorted = orders.slice().sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999")));
    return {
      text: `${plural(sorted.length, "order")} on the books.`,
      table: {
        head: ["Order", "Date", "Type", "Guests", "Where", "Cost", "Revenue"],
        rows: sorted.slice(0, 12).map((o) => [
          o.name, o.date || "—", o.serviceType, o.guests,
          o.servedOutOf || "—", money0(o.totalCost), o.revenue ? money0(o.revenue) : "—",
        ]),
      },
    };
  }

  // What something costs and earns.
  // An order the question names, matched on the longest name that appears.
  function findOrder(q, snap) {
    let best = null;
    let bestLen = 0;
    snap.catering.orders.forEach((o) => {
      const n = norm(o.name);
      if (!n) return;
      // Order names are long; match on the distinctive front of the name too,
      // so "the chamber of commerce lunch" finds "Chamber of Commerce Lunch
      // Cruise".
      const head = n.split(" ").slice(0, 3).join(" ");
      if ((q.includes(n) && n.length > bestLen)) { best = o; bestLen = n.length; }
      else if (head.length >= 10 && q.includes(head) && head.length > bestLen) { best = o; bestLen = head.length; }
    });
    return best;
  }

  function costIntent(q, snap) {
    if (!has(q, "cost", "price", "earn", "profit", "margin", "make on", "charge")) return null;

    const order = findOrder(q, snap);
    if (order) {
      return {
        text:
          `${order.name} — ${order.serviceType}, ${order.guests} guests on ${order.date || "no date set"}.\n\n` +
          `Food and supplies come to ${money(order.totalCost)}, which is ${money(order.costPerGuest)} a guest.` +
          (order.revenue
            ? ` It bills ${money(order.revenue)}, so food cost runs ${pct(order.foodCostPct)} and it grosses ${money(order.revenue - order.totalCost)}.`
            : " It books no revenue.") +
          (order.servedOutOf ? `\n\nServed out of ${order.servedOutOf}${order.vessel ? ` on the ${order.vessel}` : ""}.` : ""),
        table: order.dishes.length ? { head: ["On the menu"], rows: order.dishes.map((d) => [d]) } : null,
      };
    }

    const ent = findEntity(q, snap);
    if (!ent) return null;

    if (ent.kind === "dish") {
      const d = ent.item;
      return {
        text:
          `${d.name} costs ${money(d.portionCost)} a portion.` +
          (d.menuPrice ? ` At ${money(d.menuPrice)} that is ${pct(d.foodCostPct)} food cost and ${money(d.profitPerPortion)} gross a portion.` : " No menu price is set on it.") +
          (d.servingsPerWeek ? ` It runs about ${d.servingsPerWeek} a week.` : "") +
          (d.preppedAhead ? `\n\nPrepped ahead — ${d.hold} hold, ${plural(d.shelfLifeDays, "day")} of life.` : "\n\nMade to order."),
      };
    }
    if (ent.kind === "drink") {
      const d = ent.item;
      return {
        text:
          `${d.name} pours at ${money(d.pourCost)}.` +
          (d.menuPrice ? ` At ${money(d.menuPrice)} that is ${pct(d.pourCostPct)} pour cost and ${money(d.profitPerPour)} a pour.` : " No price is set on it.") +
          (d.poursPerWeek ? ` It runs about ${d.poursPerWeek} a week.` : ""),
      };
    }
    if (ent.kind === "ingredient") {
      const i = ent.item;
      return { text: `${i.name}: ${i.purchase}. That works out to ${money(i.costPerUsableUnit || i.costPerUnit)} per ${i.unit}${i.yieldPct && i.yieldPct < 100 ? ` after a ${i.yieldPct}% yield` : ""}.` };
    }
    if (ent.kind === "prep") {
      const p = ent.item;
      return { text: `${p.name}: ${money(p.batchCost)} a batch, yielding ${p.yields} — ${money(p.costPerUnit)} a unit. Built from ${list(p.madeFrom, 8)}.` };
    }
    return null;
  }

  // What's in it.
  function recipeIntent(q, snap) {
    if (!has(q, "what s in", "whats in", "what is in", "recipe", "build", "made of", "made from", "ingredients in", "spec")) return null;
    const ent = findEntity(q, snap);
    if (!ent) return null;
    if (ent.kind === "dish") {
      const d = ent.item;
      return {
        text: `${d.name} — per portion:\n\n` + d.buildsFrom.map((b) => "- " + b).join("\n") +
          (d.preppedAhead ? `\n\nMade ahead, ${d.hold}, ${plural(d.shelfLifeDays, "day")} of life.` : ""),
      };
    }
    if (ent.kind === "drink") {
      const d = ent.item;
      return { text: `${d.name}${d.glass ? ` (${d.glass})` : ""}:\n\n` + d.buildsFrom.map((b) => "- " + b).join("\n") };
    }
    if (ent.kind === "prep") {
      const p = ent.item;
      return { text: `${p.name} — one batch yields ${p.yields}:\n\n` + p.madeFrom.map((b) => "- " + b).join("\n") };
    }
    return null;
  }

  // Best and worst by money.
  function rankIntent(q, snap) {
    if (!has(q, "best", "worst", "most profitable", "least profitable", "highest", "lowest", "top", "biggest")) return null;
    const drinks = has(q, "drink", "cocktail", "pour", "bar");
    const pool = drinks
      ? snap.bar.drinks.filter((d) => d.menuPrice).map((d) => ({ name: d.name, cost: d.pourCost, price: d.menuPrice, pct: d.pourCostPct, profit: d.profitPerPour, rate: d.poursPerWeek }))
      : snap.catering.dishes.filter((d) => d.menuPrice).map((d) => ({ name: d.name, cost: d.portionCost, price: d.menuPrice, pct: d.foodCostPct, profit: d.profitPerPortion, rate: d.servingsPerWeek }));
    if (!pool.length) return { text: "Nothing has a price on it yet." };

    const byCostPct = has(q, "food cost", "pour cost", "cost percentage", "cost percent");
    const worst = has(q, "worst", "lowest", "least");
    const sorted = pool.slice().sort((a, b) => (byCostPct ? b.pct - a.pct : b.profit * b.rate - a.profit * a.rate));
    const rows = (worst ? sorted.slice().reverse() : sorted).slice(0, 8);
    const label = byCostPct ? (drinks ? "pour cost %" : "food cost %") : "weekly gross";
    return {
      text: `${worst ? "Worst" : "Best"} by ${label}:`,
      table: {
        head: ["Item", "Cost", "Price", drinks ? "Pour cost %" : "Food cost %", "Per week", "Weekly gross"],
        rows: rows.map((r) => [r.name, money(r.cost), money(r.price), pct(r.pct), r.rate, money0(r.profit * r.rate)]),
      },
    };
  }

  // The whole picture.
  function stateIntent(q, snap) {
    if (!has(q, "how are we", "how s it going", "hows it going", "state of", "overview", "summary", "morning", "brief", "where do we stand", "status")) return null;
    const c = snap.cateringSummary;
    const b = snap.barSummary;
    const f = snap.fleetSummary;
    const parts = [
      `Master inventory is ${money0(f.totalValue)} — ${money0(f.ashoreValue)} ashore, ${money0(f.afloatValue)} afloat across ${plural(f.vessels, "boat")} and ${plural(f.locations, "location")}.`,
      `${c.preparedPortions} prepared portions on hand, worth ${money0(c.preparedValue)}.`,
    ];
    if (c.expiredBatches) parts.push(`${c.expiredPortions} portions are past date in ${plural(c.expiredBatches, "batch", "batches")} — pull them.`);
    if (c.expiringSoon.length) parts.push(`Use within a day: ${list(c.expiringSoon.map((x) => `${x.name} (${x.portions})`), 4)}.`);
    if (c.toProduce.length) parts.push(`Still to produce this week: ${list(c.toProduce.map((x) => `${x.portions} × ${x.name}`), 4)}.`);
    if (f.pendingTransfers) parts.push(`${plural(f.inTransit, "transfer")} in transit and ${plural(f.drafts, "draft")} not loaded.`);
    if (c.belowPar.length || b.belowPar.length) parts.push(`Below par: ${c.belowPar.length} in the kitchen, ${b.belowPar.length} at the bars.`);
    if (b.eightySixed.length) parts.push(`86'd at the bars: ${list(b.eightySixed, 4)}.`);
    if (c.upcomingOrders.length) {
      const n = c.upcomingOrders[0];
      parts.push(`Next out: ${n.name} — ${n.serviceType}, ${n.guests} guests, ${n.date || "no date"}.`);
    }
    return { text: parts.join("\n\n") };
  }

  // Which boats and locations exist at all.
  function fleetIntent(q, snap) {
    if (!has(q, "boat", "vessel", "fleet", "location", "bar", "galley", "how many bars")) return null;
    if (findEntity(q, snap)) return null;
    return {
      text: `${plural(snap.fleetSummary.vessels, "boat")}, ${plural(snap.fleetSummary.locations, "location")} in total — ${snap.fleetSummary.bars} bars and ${snap.fleetSummary.galleys} galleys, plus the commissary and the kitchen.`,
      table: {
        head: ["Location", "Kind", "Boat", "Can cook", "Value"],
        rows: snap.fleet.locations.map((l) => [
          l.name, l.kind, l.vessel || "ashore", l.canCook ? "yes" : "no", money0(l.totalValue),
        ]),
      },
    };
  }

  const INTENTS = [
    stateIntent,
    preparedIntent,
    eightySixIntent,
    belowParIntent,
    transferIntent,
    recipeIntent,
    availabilityIntent,
    costIntent,
    rankIntent,
    ordersIntent,
    whereIntent,
    fleetIntent,
  ];

  function answer(question) {
    const q = norm(question);
    const snap = snapshot();
    for (const intent of INTENTS) {
      let res = null;
      try {
        res = intent(q, snap);
      } catch (e) {
        console.warn("An answer rule failed; falling through to the next.", e);
      }
      if (res) return res;
    }
    return {
      text:
        "I couldn't match that one. I can tell you what's below par and where, what's 86'd, what's prepped and what's going off, what still has to be produced for what's booked, how many of something you can serve or pour and at which location, what a dish or drink costs and earns, what's in a recipe, what's in transit, what's on the books, and what the whole operation is worth.",
      unmatched: true,
    };
  }

  const SUGGESTIONS = [
    "Where do we stand this morning?",
    "What's going off today?",
    "What still has to be prepped?",
    "What do I need to order?",
    "What's on the Thousand Isle Belle?",
    "How many chicken salad croissants can we serve?",
    "What's 86'd at the Duchess Upper Bar?",
    "What's in transit?",
    "What's our master inventory worth?",
    "What's my most profitable dish?",
  ];

  return { answer, snapshot, SUGGESTIONS };
})();
