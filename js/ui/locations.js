/* ui/locations.js — the boats and every place stock can sit.

   This list is what the Inventory rail, every count column and every
   catering pull are built from. A place says what it holds (food, bar, or
   both), which decides which counts it shows up on. */

const LocationsPage = (function () {
  const el = Core.el;
  let host = null;

  const KINDS = [
    { id: "storage", label: "Store room / walk-in" },
    { id: "kitchen", label: "Kitchen" },
    { id: "galley", label: "Galley / fridge" },
    { id: "bar", label: "Bar" },
  ];
  const KIND_ICON = { storage: "storage", kitchen: "kitchen", galley: "fridge", bar: "bar" };

  function render(target) {
    if (target) host = target;
    if (!host) return;
    host.innerHTML = "";
    host.className = "page accent-house";

    host.append(W.pageHead(
      "Locations",
      "The boats and every place stock sits. Inventory filters, count columns and catering pulls all read from this list.",
      [
        W.btn("Add boat", { icon: "plus", onclick: () => openBoat(null) }),
        W.btn("Add location", { icon: "plus", kind: "primary", onclick: () => openLocation(null) }),
      ],
      "Fleet"
    ));

    const groups = [];
    groups.push({ id: null, name: "Shore", vessel: null, locations: FleetStorage.locations().filter((l) => !l.vesselId || !FleetStorage.vessel(l.vesselId)) });
    FleetStorage.vessels().forEach((v) => groups.push({ id: v.id, name: v.name, vessel: v, locations: FleetStorage.locationsForVessel(v.id) }));

    const grid = el("div", { class: "grid grid-2" });
    groups.forEach((g) => grid.append(groupCard(g)));
    host.append(grid);

    host.append(el("div", { class: "section" }, [
      W.sectionHead("Sample data", "Put every count, recipe, price, event and location back to the starting set. This can't be undone."),
      W.btn("Reset everything", { icon: "reset", kind: "danger", onclick: () => {
        if (!confirm("Reset ALL data — inventory, recipes, prices, events and locations — to the sample set?\n\nThis can't be undone.")) return;
        Store.resetAll();
        location.reload();
      } }),
    ]));
  }

  function groupCard(g) {
    const card = el("div", { class: "card" });
    const value = g.locations.reduce((s, l) => s + Store.inventoryTotals("all", [l.id]).value, 0);
    card.append(el("div", { class: "card-head" }, [
      el("div", { style: "display:flex;gap:12px;align-items:center" }, [
        el("div", { class: "loc-icon" }, [W.icon(g.vessel ? "boat" : "shore")]),
        el("div", {}, [
          el("h3", {}, [g.name]),
          el("div", { class: "sub" }, [g.vessel
            ? [g.vessel.kind, g.vessel.capacity ? `${g.vessel.capacity} guests` : null].filter(Boolean).join(" · ")
            : "Ashore"]),
        ]),
      ]),
      el("div", { class: "head-actions" }, [
        el("span", { class: "mono muted", style: "align-self:center;margin-right:6px" }, [Store.money0(value)]),
        g.vessel ? W.btn("Edit boat", { sm: true, kind: "ghost", icon: "edit", iconOnly: true, onclick: () => openBoat(g.vessel) }) : null,
        W.btn(`Add location ${g.vessel ? "aboard" : "ashore"}`, { sm: true, kind: "ghost", icon: "plus", iconOnly: true, onclick: () => openLocation(null, g.id) }),
      ]),
    ]));
    if (!g.locations.length) {
      card.append(W.empty("No locations yet.", g.vessel ? "Add its galley or bar." : ""));
      return card;
    }
    card.append(el("ul", { class: "loc-list" }, g.locations.map((l) => el("li", {}, [
      el("div", { class: "loc-icon" }, [W.icon(KIND_ICON[l.kind] || "storage")]),
      el("div", { style: "min-width:0" }, [
        el("div", { class: "item-name" }, [l.name,
          (l.holds || []).includes("food") ? el("span", { class: "tag food" }, ["food"]) : null,
          (l.holds || []).includes("bev") ? el("span", { class: "tag bar" }, ["bar"]) : null,
        ]),
        el("div", { class: "item-sub" }, [l.notes || (KINDS.find((k) => k.id === l.kind) || {}).label || ""]),
      ]),
      el("div", { class: "loc-value" }, [Store.money0(Store.inventoryTotals("all", [l.id]).value)]),
      W.btn("Edit location", { sm: true, kind: "ghost", icon: "edit", iconOnly: true, onclick: () => openLocation(l) }),
    ]))));
    return card;
  }

  function openLocation(existing, presetVesselId) {
    const draft = existing
      ? JSON.parse(JSON.stringify(existing))
      : { id: Core.uid("loc"), name: "", short: "", kind: "galley", vesselId: presetVesselId || null, holds: ["food"], canCook: false, hub: false, notes: "" };

    Core.openModal(existing ? existing.name : "Add location", (body, close) => {
      const form = el("form", { autocomplete: "off" });
      const name = el("input", { type: "text", value: draft.name, placeholder: "Belle walk-in" });
      const short = el("input", { type: "text", value: draft.short || "", placeholder: "Belle Walk-in" });
      form.append(W.fieldRow([W.field("Name", name), W.field("Short name", short, "Shown on chips and column heads")]));

      const food = el("input", { type: "checkbox" });
      food.checked = (draft.holds || []).includes("food");
      const bev = el("input", { type: "checkbox" });
      bev.checked = (draft.holds || []).includes("bev");
      const cook = el("input", { type: "checkbox" });
      cook.checked = !!draft.canCook;
      form.append(W.fieldRow([
        W.field("Kind", W.select(KINDS, draft.kind, (v) => { draft.kind = v; })),
        W.field("Where", W.select(
          [{ id: "", label: "Shore" }, ...FleetStorage.vessels().map((v) => ({ id: v.id, label: v.name }))],
          draft.vesselId || "", (v) => { draft.vesselId = v || null; })),
      ]));
      form.append(W.fieldRow([
        W.field("Holds", el("div", { class: "checks" }, [
          el("label", { class: "toggle" }, [food, el("span", { class: "track" }), "Food"]),
          el("label", { class: "toggle" }, [bev, el("span", { class: "track" }), "Bar"]),
          el("label", { class: "toggle" }, [cook, el("span", { class: "track" }), "Can cook"]),
        ])),
      ]));
      const notes = el("input", { type: "text", value: draft.notes || "", placeholder: "What's there, what it's for" });
      form.append(W.field("Notes", notes));

      form.append(el("div", { class: "form-actions" }, [
        existing ? W.btn("Delete", { kind: "danger", icon: "trash", cls: "left", onclick: () => removeLocation(existing, close) }) : null,
        W.btn("Cancel", { onclick: close }),
        W.btn(existing ? "Save" : "Add location", { kind: "primary", type: "submit" }),
      ]));

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!name.value.trim()) { Core.toast("Give the location a name."); name.focus(); return; }
        if (!food.checked && !bev.checked) { Core.toast("A location has to hold food, bar stock, or both."); return; }
        draft.name = name.value.trim();
        draft.short = short.value.trim() || draft.name;
        draft.holds = [food.checked ? "food" : null, bev.checked ? "bev" : null].filter(Boolean);
        draft.canCook = cook.checked;
        draft.notes = notes.value.trim();
        if (existing) Object.assign(existing, draft);
        else FleetStorage.locations().push(draft);
        Store.saveFleet();
        close();
        Shell.render();
        Core.toast(existing ? "Saved." : "Location added.");
      });
      body.append(form);
    });
  }

  // Deleting a place deletes the counts at it. Say how much that is first.
  function removeLocation(loc, close) {
    const rows = Store.inventoryRows("all");
    const value = rows.reduce((s, r) => s + r.onHandAt(loc.id) * r.costPerBase, 0);
    const stocked = rows.filter((r) => r.onHandAt(loc.id) > 0).length;
    const msg = stocked
      ? `Delete ${loc.name}? It holds ${stocked} item${stocked === 1 ? "" : "s"} worth ${Store.money(value)}, and those counts go with it.`
      : `Delete ${loc.name}?`;
    if (!confirm(msg)) return;
    rows.forEach((r) => { delete r.obj.onHand[loc.id]; delete r.obj.par[loc.id]; });
    Store.food.orders.forEach((o) => { if (o.locationId === loc.id) o.locationId = null; });
    const list = FleetStorage.locations();
    list.splice(list.indexOf(loc), 1);
    Store.saveAll();
    close();
    Shell.render();
    Core.toast("Location deleted.");
  }

  function openBoat(existing) {
    const draft = existing
      ? JSON.parse(JSON.stringify(existing))
      : { id: Core.uid("ves"), name: "", kind: "", capacity: 0, notes: "" };

    Core.openModal(existing ? existing.name : "Add boat", (body, close) => {
      const form = el("form", { autocomplete: "off" });
      const name = el("input", { type: "text", value: draft.name, placeholder: "Island Duchess" });
      const kind = el("input", { type: "text", value: draft.kind || "", placeholder: "Dinner cruise" });
      const cap = W.numInput(draft.capacity || "", null, { step: "1" });
      form.append(W.fieldRow([W.field("Name", name), W.field("Runs", kind), W.field("Capacity", cap, "Guests. Catering warns above it.")]));
      const notes = el("input", { type: "text", value: draft.notes || "" });
      form.append(W.field("Notes", notes));

      form.append(el("div", { class: "form-actions" }, [
        existing ? W.btn("Delete", { kind: "danger", icon: "trash", cls: "left", onclick: () => {
          const aboard = FleetStorage.locationsForVessel(existing.id);
          if (aboard.length) { Core.toast(`Move or delete its ${aboard.length} location${aboard.length === 1 ? "" : "s"} first.`); return; }
          if (!confirm(`Delete ${existing.name}?`)) return;
          const list = FleetStorage.vessels();
          list.splice(list.indexOf(existing), 1);
          Store.saveFleet();
          close();
          Shell.render();
        } }) : null,
        W.btn("Cancel", { onclick: close }),
        W.btn(existing ? "Save" : "Add boat", { kind: "primary", type: "submit" }),
      ]));

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!name.value.trim()) { Core.toast("Give the boat a name."); name.focus(); return; }
        draft.name = name.value.trim();
        draft.kind = kind.value.trim();
        draft.capacity = Math.max(0, Math.round(Number(cap.value) || 0));
        draft.notes = notes.value.trim();
        if (existing) Object.assign(existing, draft);
        else FleetStorage.vessels().push(draft);
        Store.saveFleet();
        close();
        Shell.render();
        Core.toast(existing ? "Saved." : "Boat added — now add its galley or bar.");
      });
      body.append(form);
    });
  }

  return { render };
})();
