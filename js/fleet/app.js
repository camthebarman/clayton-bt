/* fleet/app.js — the boats, the places stock sits, and the tickets that move
   it between them.

   This tab is the reason the other two can stay simple. Catering and Bar each
   know how to hold quantities per location and how to move some on request;
   neither knows anything about the other, and neither owns the ledger. Fleet
   owns the ledger, and talks to both through the same three-call contract:

     transferCatalog()                    what can travel
     availableAt(kind, itemId, locId)     how much is there
     moveStock(line, from, to, qty)       move some, report what happened

   A transfer does nothing to stock until it is received. A case that left the
   commissary but hasn't been checked onto the boat is still the commissary's,
   and "in transit" is exactly the state a provisioning list needs to show. */

const FleetApp = (function () {
  const ROOT = document.getElementById("mod-fleet");
  const el = Core.el;
  const openModal = Core.openModal;
  const toast = Core.toast;

  const MODULES = {
    catering: { label: "Catering", get app() { return CateringApp; } },
    bar: { label: "Bar", get app() { return BarApp; } },
  };

  let activeTransferId = null;

  function $(sel, root) { return (root || ROOT).querySelector(sel); }
  function $all(sel, root) { return Array.from((root || ROOT).querySelectorAll(sel)); }

  function locName(id) { return FleetStorage.locationName(id); }
  function locShort(id) { return FleetStorage.locationShort(id); }
  function getTransfer(id) { return FleetStorage.transfers().find((t) => t.id === id); }

  function money(n) {
    return (Number(n) || 0).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  }
  function money2(n) {
    return (Number(n) || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
  }
  function fmtDate(str) {
    if (!str) return "—";
    const d = new Date(String(str).length <= 10 ? str + "T00:00:00" : str);
    return isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function statCard(label, value, sub) {
    return el("div", { class: "stat-card" }, [
      el("div", { class: "label" }, [label]),
      el("div", { class: "value" }, [String(value)]),
      sub ? el("div", { class: "muted small-note" }, [sub]) : null,
    ]);
  }

  function switchTab(name) {
    $all(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    $all(".panel").forEach((p) => p.classList.toggle("active", p.id === "fleet-panel-" + name));
  }

  // Combined value at a location, asking each program for its own figure.
  function valueAt(locId) {
    const c = CateringApp.locationValue(locId);
    const b = BarApp.locationValue(locId);
    return {
      food: c.raw, prepared: c.prepared, bev: b.raw,
      total: c.raw + c.prepared + b.raw,
    };
  }

  // ================= MASTER =================
  /* The accumulation. Every location's stock, from both programs, in one
     table with a total at the bottom — which is the number the owner of a
     three-boat operation actually wants and cannot get from any one tab. */

  function renderMaster() {
    const panel = $("#fleet-panel-master");
    panel.innerHTML = "";
    panel.append(el("div", { class: "panel-head" }, [
      el("div", {}, [
        el("h2", {}, ["Master Inventory"]),
        el("div", { class: "sub" }, ["Everything the operation owns, wherever it is sitting. Raw food, prepared food and bar stock, accumulated across the commissary, the kitchen and every boat."]),
      ]),
    ]));

    const locs = FleetStorage.locations();
    const rows = locs.map((l) => ({ loc: l, v: valueAt(l.id) }));
    const totals = rows.reduce((a, r) => {
      a.food += r.v.food; a.prepared += r.v.prepared; a.bev += r.v.bev; a.total += r.v.total;
      return a;
    }, { food: 0, prepared: 0, bev: 0, total: 0 });

    const afloat = rows.filter((r) => r.loc.vesselId).reduce((s, r) => s + r.v.total, 0);
    const pending = FleetStorage.transfers().filter((t) => t.status === "draft" || t.status === "sent");

    panel.append(el("div", { class: "grid grid-4" }, [
      statCard("Total Inventory", money(totals.total), `${locs.length} locations`),
      statCard("Ashore", money(totals.total - afloat), "Commissary, kitchen, porch"),
      statCard("Afloat", money(afloat), `${FleetStorage.vessels().length} boats`),
      statCard("In Motion", pending.length, pending.length ? "Transfers not yet received" : "Nothing in transit"),
    ]));

    const card = el("div", { class: "card" }, [
      el("div", { class: "card-head-row" }, [
        el("h3", {}, ["By Location"]),
        el("span", { class: "muted small-note" }, ["Catering and bar, side by side"]),
      ]),
    ]);
    const table = el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, ["Location"]),
        el("th", {}, ["Where"]),
        el("th", { class: "num" }, ["Raw Food"]),
        el("th", { class: "num" }, ["Prepared"]),
        el("th", { class: "num" }, ["Bar"]),
        el("th", { class: "num" }, ["Total"]),
        el("th", { class: "num" }, ["Share"]),
      ])]),
    ]);
    const tbody = el("tbody");

    // Grouped: ashore first, then boat by boat, so the table reads like the
    // dock does.
    const shore = rows.filter((r) => !r.loc.vesselId);
    shore.forEach((r) => tbody.append(masterRow(r, totals.total)));
    FleetStorage.vessels().forEach((v) => {
      const mine = rows.filter((r) => r.loc.vesselId === v.id);
      if (!mine.length) return;
      const sub = mine.reduce((s, r) => s + r.v.total, 0);
      tbody.append(el("tr", { class: "cat-row" }, [
        el("td", { colspan: "6" }, [`${v.name} — ${v.kind}, ${v.capacity} guests`]),
        el("td", { class: "num" }, [money(sub)]),
      ]));
      mine.forEach((r) => tbody.append(masterRow(r, totals.total)));
    });

    tbody.append(el("tr", { class: "row-total" }, [
      el("td", {}, [el("strong", {}, ["Master"])]),
      el("td", {}, [""]),
      el("td", { class: "num" }, [el("strong", {}, [money2(totals.food)])]),
      el("td", { class: "num" }, [el("strong", {}, [money2(totals.prepared)])]),
      el("td", { class: "num" }, [el("strong", {}, [money2(totals.bev)])]),
      el("td", { class: "num" }, [el("strong", {}, [money2(totals.total)])]),
      el("td", { class: "num" }, ["100%"]),
    ]));
    table.append(tbody);
    card.append(el("div", { class: "table-wrap" }, [table]));
    panel.append(card);

    // Below par, gathered from both programs into one ordering list.
    const cSum = CateringApp.summary();
    const bSum = BarApp.summary();
    const shortRows = [
      ...cSum.belowParDetail.map((x) => ({ ...x, program: "Catering" })),
      ...bSum.belowParDetail.map((x) => ({ ...x, program: "Bar" })),
    ];
    const shortCard = el("div", { class: "card" }, [
      el("div", { class: "card-head-row" }, [
        el("h3", {}, ["Short Somewhere"]),
        el("span", { class: "muted small-note" }, ["Both programs, every location"]),
      ]),
    ]);
    if (!shortRows.length) {
      shortCard.append(el("div", { class: "empty-state" }, ["Every location is at par."]));
    } else {
      const t2 = el("table", {}, [
        el("thead", {}, [el("tr", {}, [
          el("th", {}, ["Item"]), el("th", {}, ["Program"]), el("th", {}, ["Short At"]), el("th", { class: "num" }, ["Locations"]),
        ])]),
      ]);
      const tb2 = el("tbody");
      shortRows
        .slice()
        .sort((a, b) => b.at.length - a.at.length || a.name.localeCompare(b.name))
        .forEach((x) => {
          tb2.append(el("tr", { class: x.at.length > 2 ? "row-warn" : "" }, [
            el("td", {}, [el("strong", {}, [x.name])]),
            el("td", {}, [el("span", { class: "pill" }, [x.program])]),
            el("td", { class: "muted" }, [x.at.join(", ")]),
            el("td", { class: "num" }, [String(x.at.length)]),
          ]));
        });
      t2.append(tb2);
      shortCard.append(el("div", { class: "table-wrap" }, [t2]));
    }
    panel.append(shortCard);
  }

  function masterRow(r, grand) {
    const share = grand ? (r.v.total / grand) * 100 : 0;
    const v = FleetStorage.vessel(r.loc.vesselId);
    return el("tr", {}, [
      el("td", {}, [el("strong", {}, [r.loc.name])]),
      el("td", {}, [el("span", { class: "pill " + (v ? "afloat" : "") }, [v ? "Afloat" : r.loc.canCook ? "Kitchen" : r.loc.hub ? "Hub" : "Ashore"])]),
      el("td", { class: "num" }, [r.v.food ? money2(r.v.food) : el("span", { class: "muted" }, ["—"])]),
      el("td", { class: "num" }, [r.v.prepared ? money2(r.v.prepared) : el("span", { class: "muted" }, ["—"])]),
      el("td", { class: "num" }, [r.v.bev ? money2(r.v.bev) : el("span", { class: "muted" }, ["—"])]),
      el("td", { class: "num" }, [el("strong", {}, [money2(r.v.total)])]),
      el("td", { class: "num muted" }, [share.toFixed(1) + "%"]),
    ]);
  }

  // ================= LOCATIONS =================
  function renderLocations() {
    const panel = $("#fleet-panel-locations");
    panel.innerHTML = "";
    panel.append(el("div", { class: "panel-head" }, [
      el("div", {}, [
        el("h2", {}, ["Boats & Locations"]),
        el("div", { class: "sub" }, ["Every place stock can sit. What a location holds decides which count sheets it appears on; whether it can cook decides whether a dish can be made there at all."]),
      ]),
      el("div", { class: "head-controls" }, [
        el("button", { class: "btn", onclick: () => openVesselForm() }, ["Add Boat"]),
        el("button", { class: "btn btn-primary", onclick: () => openLocationForm() }, ["Add Location"]),
      ]),
    ]));

    const shore = FleetStorage.locations().filter((l) => !l.vesselId);
    if (shore.length) {
      panel.append(el("div", { class: "menu-head" }, [
        el("h3", {}, ["Ashore"]),
        el("span", { class: "muted small-note" }, [`${shore.length} location(s)`]),
      ]));
      panel.append(el("div", { class: "loc-cards" }, shore.map(locationCard)));
    }

    FleetStorage.vessels().forEach((v) => {
      const mine = FleetStorage.locationsForVessel(v.id);
      const value = mine.reduce((s, l) => s + valueAt(l.id).total, 0);
      panel.append(el("div", { class: "menu-head" }, [
        el("h3", {}, [v.name]),
        el("span", { class: "muted small-note" }, [`${v.kind} · ${v.capacity} guests · ${money(value)} aboard`]),
        el("div", { class: "row-actions", style: "margin-left:auto" }, [
          el("button", { class: "btn btn-sm", onclick: () => openVesselForm(v.id) }, ["Edit Boat"]),
          el("button", { class: "btn btn-sm danger", onclick: () => deleteVessel(v.id) }, ["Delete"]),
        ]),
      ]));
      if (v.notes) panel.append(el("p", { class: "muted small-note", style: "margin:-6px 0 10px" }, [v.notes]));
      if (!mine.length) {
        panel.append(el("div", { class: "empty-state" }, ["No galley or bar set up on this boat yet."]));
      } else {
        panel.append(el("div", { class: "loc-cards" }, mine.map(locationCard)));
      }
    });
  }

  function locationCard(loc) {
    const v = valueAt(loc.id);
    const holds = (loc.holds || []).map((h) => (h === "food" ? "Food" : "Bar")).join(" + ");
    const card = el("div", { class: "card loc-card" + (loc.hub ? " hub" : "") });
    card.append(el("div", { class: "loc-card-head" }, [
      el("div", {}, [
        el("h4", {}, [loc.name]),
        el("div", { class: "muted small-note" }, [
          [loc.kind, holds, loc.canCook ? "can cook" : null, loc.hub ? "central storage" : null].filter(Boolean).join(" · "),
        ]),
      ]),
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn btn-sm", onclick: () => openLocationForm(loc.id) }, ["Edit"]),
        el("button", { class: "btn btn-sm danger", onclick: () => deleteLocation(loc.id) }, ["Delete"]),
      ]),
    ]));
    card.append(el("div", { class: "loc-card-metrics" }, [
      metric("Raw Food", v.food ? money(v.food) : "—"),
      metric("Prepared", v.prepared ? money(v.prepared) : "—"),
      metric("Bar", v.bev ? money(v.bev) : "—"),
      metric("Total", money(v.total)),
    ]));
    if (loc.notes) card.append(el("p", { class: "muted small-note", style: "margin:10px 0 0" }, [loc.notes]));
    card.append(el("div", { style: "margin-top:12px" }, [
      el("button", { class: "btn btn-sm", onclick: () => startTransferTo(loc.id) }, ["Send stock here →"]),
    ]));
    return card;
  }

  function metric(label, value) {
    return el("div", { class: "tool-metric" }, [
      el("div", { class: "label" }, [label]),
      el("div", { class: "value" }, [String(value)]),
    ]);
  }

  function openLocationForm(id) {
    const existing = id ? FleetStorage.location(id) : null;
    const draft = existing
      ? JSON.parse(JSON.stringify(existing))
      : { id: "loc_" + Math.random().toString(36).slice(2, 9), name: "", short: "", kind: "bar",
          vesselId: null, holds: ["bev"], canCook: false, hub: false, notes: "" };

    openModal(existing ? "Edit Location" : "Add Location", (body, close) => {
      const form = el("form", { autocomplete: "off" });
      const nameInput = el("input", { type: "text", value: draft.name, required: "required", placeholder: "Island Duchess Main Bar" });
      const shortInput = el("input", { type: "text", value: draft.short || "", placeholder: "Duchess Main" });
      const kindSel = selectEl(
        ["storage", "kitchen", "galley", "bar"].map((k) => ({ id: k, label: k })),
        draft.kind, (v) => { draft.kind = v; }
      );
      form.append(fieldRow([field("Name", nameInput), field("Short name", shortInput, "Used in column headers."), field("Kind", kindSel)]));

      const vesselSel = selectEl(
        [{ id: "", label: "Ashore" }, ...FleetStorage.vessels().map((v) => ({ id: v.id, label: v.name }))],
        draft.vesselId || "", (v) => { draft.vesselId = v || null; }
      );
      form.append(field("On which boat", vesselSel));

      const foodCheck = el("input", { type: "checkbox", checked: (draft.holds || []).includes("food") ? "checked" : null });
      const bevCheck = el("input", { type: "checkbox", checked: (draft.holds || []).includes("bev") ? "checked" : null });
      const cookCheck = el("input", { type: "checkbox", checked: draft.canCook ? "checked" : null });
      const hubCheck = el("input", { type: "checkbox", checked: draft.hub ? "checked" : null });
      form.append(el("div", { class: "section-title" }, ["What It Holds"]));
      form.append(el("div", { class: "field checkbox-field" }, [foodCheck, el("label", {}, ["Food — appears on catering count sheets"])]));
      form.append(el("div", { class: "field checkbox-field" }, [bevCheck, el("label", {}, ["Beverage — appears on bar count sheets"])]));
      form.append(el("div", { class: "field checkbox-field" }, [cookCheck, el("label", {}, ["Can cook — dishes can be produced here, not just held"])]));
      form.append(el("div", { class: "field checkbox-field" }, [hubCheck, el("label", {}, ["Central storage — the hub restocks come from"])]));
      form.append(el("div", { class: "hint" }, [
        "Only one location should be the hub. A location that can't cook shows prepared portions as its whole capacity to serve — which is the right answer for a boat galley.",
      ]));

      const notesInput = el("textarea", {}, [draft.notes || ""]);
      form.append(field("Notes", notesInput));
      form.append(el("div", { class: "form-actions" }, [
        el("button", { type: "button", class: "btn", onclick: close }, ["Cancel"]),
        el("button", { type: "submit", class: "btn btn-primary" }, [existing ? "Save" : "Add Location"]),
      ]));

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!nameInput.value.trim()) { toast("Give the location a name."); return; }
        draft.name = nameInput.value.trim();
        draft.short = shortInput.value.trim() || draft.name;
        draft.holds = [foodCheck.checked ? "food" : null, bevCheck.checked ? "bev" : null].filter(Boolean);
        draft.canCook = !!cookCheck.checked;
        draft.hub = !!hubCheck.checked;
        draft.notes = notesInput.value.trim();
        if (!draft.holds.length) { toast("A location has to hold food, beverage or both."); return; }

        if (draft.hub) FleetStorage.locations().forEach((l) => { if (l.id !== draft.id) l.hub = false; });
        if (existing) Object.assign(existing, draft);
        else FleetStorage.locations().push(draft);
        FleetStorage.save();
        close();
        renderAll();
        CateringApp.renderAll();
        BarApp.renderAll();
        toast(existing ? "Location saved." : "Location added.");
      });
      body.append(form);
    });
  }

  function deleteLocation(id) {
    const loc = FleetStorage.location(id);
    if (!loc) return;
    const v = valueAt(id);
    let msg = `Delete ${loc.name}?`;
    if (v.total > 0) {
      msg += `\n\n${money2(v.total)} of stock is counted there. Deleting the location does NOT move it — those quantities will simply stop being counted anywhere. Transfer the stock off first if it is real.`;
    }
    const tied = FleetStorage.transfers().filter((t) => t.fromLocId === id || t.toLocId === id);
    if (tied.length) msg += `\n\n${tied.length} transfer(s) reference it; they will be removed.`;
    if (!confirm(msg)) return;

    const locs = FleetStorage.locations();
    const idx = locs.findIndex((l) => l.id === id);
    if (idx >= 0) locs.splice(idx, 1);
    const trs = FleetStorage.transfers();
    for (let i = trs.length - 1; i >= 0; i--) {
      if (trs[i].fromLocId === id || trs[i].toLocId === id) trs.splice(i, 1);
    }
    FleetStorage.save();
    renderAll();
    CateringApp.renderAll();
    BarApp.renderAll();
    toast(`${loc.name} deleted.`);
  }

  function openVesselForm(id) {
    const existing = id ? FleetStorage.vessel(id) : null;
    const draft = existing
      ? { ...existing }
      : { id: "ves_" + Math.random().toString(36).slice(2, 9), name: "", kind: "Sightseeing tour", capacity: 40, notes: "" };

    openModal(existing ? "Edit Boat" : "Add Boat", (body, close) => {
      const form = el("form", { autocomplete: "off" });
      const nameInput = el("input", { type: "text", value: draft.name, required: "required" });
      const kindInput = el("input", { type: "text", value: draft.kind, placeholder: "Dinner cruise, private charter…" });
      const capInput = el("input", { type: "number", step: "1", min: "0", value: draft.capacity });
      form.append(fieldRow([field("Name", nameInput), field("Runs", kindInput), field("Guest capacity", capInput, "Orders over this get flagged.")]));
      const notesInput = el("textarea", {}, [draft.notes || ""]);
      form.append(field("Notes", notesInput));
      form.append(el("div", { class: "form-actions" }, [
        el("button", { type: "button", class: "btn", onclick: close }, ["Cancel"]),
        el("button", { type: "submit", class: "btn btn-primary" }, [existing ? "Save" : "Add Boat"]),
      ]));
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!nameInput.value.trim()) { toast("Give the boat a name."); return; }
        draft.name = nameInput.value.trim();
        draft.kind = kindInput.value.trim() || "Charter";
        draft.capacity = Math.max(0, Math.round(Number(capInput.value) || 0));
        draft.notes = notesInput.value.trim();
        if (existing) Object.assign(existing, draft);
        else FleetStorage.vessels().push(draft);
        FleetStorage.save();
        close();
        renderAll();
        toast(existing ? "Boat saved." : "Boat added.");
      });
      body.append(form);
    });
  }

  function deleteVessel(id) {
    const v = FleetStorage.vessel(id);
    if (!v) return;
    const mine = FleetStorage.locationsForVessel(id);
    if (!confirm(`Delete ${v.name}?${mine.length ? `\n\nIts ${mine.length} location(s) stay, but become shore locations. Delete them separately if the stock is gone too.` : ""}`)) return;
    const vs = FleetStorage.vessels();
    const idx = vs.findIndex((x) => x.id === id);
    if (idx >= 0) vs.splice(idx, 1);
    mine.forEach((l) => { l.vesselId = null; });
    FleetStorage.save();
    renderAll();
    toast(`${v.name} deleted.`);
  }

  // ================= TRANSFERS =================
  /* The ledger. Three states and one rule:

       draft     being built, nothing has left
       sent      loaded and gone — still counted at the origin
       received  checked in, and only now does stock actually move

     Keeping the move on receipt is what makes the count sheets honest. If a
     transfer moved stock the moment it was written, a runner's clipboard and
     the walk-in would disagree all afternoon. */

  const STATUS_LABEL = { draft: "Draft", sent: "In transit", received: "Received", cancelled: "Cancelled" };
  const STATUS_PILL = { draft: "", sent: "warn", received: "good", cancelled: "" };

  function renderTransfers() {
    const panel = $("#fleet-panel-transfers");
    panel.innerHTML = "";
    panel.append(el("div", { class: "panel-head" }, [
      el("div", {}, [
        el("h2", {}, ["Transfers"]),
        el("div", { class: "sub" }, ["Everything moving between the commissary, the kitchen and the boats. Stock stays counted at the origin until the ticket is received."]),
      ]),
      el("button", { class: "btn btn-primary", onclick: () => openTransferForm() }, ["New Transfer"]),
    ]));

    const all = FleetStorage.transfers();
    const drafts = all.filter((t) => t.status === "draft");
    const sent = all.filter((t) => t.status === "sent");
    const received = all.filter((t) => t.status === "received");

    panel.append(el("div", { class: "grid grid-4" }, [
      statCard("Drafts", drafts.length, drafts.length ? "Not loaded yet" : "Nothing waiting"),
      statCard("In Transit", sent.length, sent.length ? "Still counted at the origin" : "Nothing on the move"),
      statCard("Received", received.length, "This season"),
      statCard("Lines Pending", drafts.concat(sent).reduce((s, t) => s + (t.lines || []).length, 0), "Items to check in"),
    ]));

    if (!all.length) {
      panel.append(el("div", { class: "empty-state" }, [
        "No transfers yet. Build one here, or let a count sheet propose one: “Restock From Commissary” on the Catering or Bar inventory tab, and “Build Load-Out” on a catering order.",
      ]));
      return;
    }

    const order = { draft: 0, sent: 1, received: 2, cancelled: 3 };
    const sorted = all.slice().sort((a, b) =>
      (order[a.status] - order[b.status]) || String(b.createdOn || "").localeCompare(String(a.createdOn || "")));
    if (!activeTransferId || !getTransfer(activeTransferId)) activeTransferId = sorted[0].id;

    const chips = el("div", { class: "chip-row" });
    sorted.forEach((t) => {
      chips.append(el("button", {
        class: "chip" + (t.id === activeTransferId ? " active" : ""),
        onclick: () => { activeTransferId = t.id; renderTransfers(); },
      }, [
        el("span", {}, [t.ref || "Transfer"]),
        el("span", { class: "chip-sub" }, [`${locShort(t.fromLocId)} → ${locShort(t.toLocId)} · ${STATUS_LABEL[t.status]}`]),
      ]));
    });
    panel.append(chips);
    panel.append(renderTransferDetail(getTransfer(activeTransferId)));
  }

  function renderTransferDetail(t) {
    if (!t) return el("div", {});
    const card = el("div", { class: "card" });

    card.append(el("div", { class: "card-head-row" }, [
      el("div", {}, [
        el("h3", {}, [
          `${t.ref || "Transfer"} — ${locName(t.fromLocId)} → ${locName(t.toLocId)}`,
          el("span", { class: "tag status-" + t.status }, [STATUS_LABEL[t.status]]),
        ]),
        el("div", { class: "muted small-note" }, [
          [`created ${fmtDate(t.createdOn)}`, t.receivedOn ? `received ${fmtDate(t.receivedOn)}` : null].filter(Boolean).join(" · "),
        ]),
      ]),
      el("div", { class: "row-actions" }, [
        t.status === "draft" ? el("button", { class: "btn btn-sm", onclick: () => addTransferLine(t.id) }, ["Add Item"]) : null,
        t.status === "draft" ? el("button", { class: "btn btn-sm btn-primary", onclick: () => markSent(t.id) }, ["Mark Sent"]) : null,
        t.status === "sent" ? el("button", { class: "btn btn-sm btn-primary", onclick: () => receiveTransfer(t.id) }, ["Receive"]) : null,
        t.status === "sent" ? el("button", { class: "btn btn-sm", onclick: () => unsendTransfer(t.id) }, ["Back To Draft"]) : null,
        t.status === "draft" || t.status === "sent" ? el("button", { class: "btn btn-sm", onclick: () => openTransferForm(t.id) }, ["Edit"]) : null,
        el("button", { class: "btn btn-sm danger", onclick: () => deleteTransfer(t.id) }, ["Delete"]),
      ]),
    ]));

    if (t.notes) card.append(el("p", { class: "muted small-note", style: "margin-top:6px" }, [t.notes]));

    if (!(t.lines || []).length) {
      card.append(el("div", { class: "empty-state" }, ["Nothing on this ticket yet."]));
      return card;
    }

    const table = el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, ["Item"]),
        el("th", {}, ["Program"]),
        el("th", { class: "num" }, ["Quantity"]),
        el("th", { class: "num" }, ["At " + locShort(t.fromLocId)]),
        el("th", {}, ["Check"]),
        el("th", {}, [""]),
      ])]),
    ]);
    const tbody = el("tbody");
    let anyShort = false;
    (t.lines || []).forEach((ln, idx) => {
      const mod = MODULES[ln.module];
      if (!mod) return;
      const desc = mod.app.describeLine(ln);
      const available = mod.app.availableAt(ln.kind, ln.itemId, t.fromLocId);
      const short = t.status !== "received" && available < Number(ln.qty);
      if (short) anyShort = true;
      tbody.append(el("tr", { class: short ? "row-warn" : "" }, [
        el("td", {}, [el("strong", {}, [desc.name])]),
        el("td", {}, [el("span", { class: "pill" }, [mod.label])]),
        el("td", { class: "num" }, [desc.qtyText]),
        el("td", { class: "num muted" }, [
          t.status === "received" ? "—" : formatQtyLike(mod, ln, available),
        ]),
        el("td", {}, [
          t.status === "received" ? el("span", { class: "pill good" }, ["Moved"])
            : short ? el("span", { class: "pill warn" }, ["Not all there"])
            : el("span", { class: "pill good" }, ["Available"]),
        ]),
        el("td", {}, [
          t.status === "draft"
            ? el("div", { class: "row-actions" }, [
                el("button", { class: "btn btn-sm danger", onclick: () => removeTransferLine(t.id, idx) }, ["×"]),
              ])
            : null,
        ]),
      ]));
    });
    table.append(tbody);
    card.append(el("div", { class: "table-wrap" }, [table]));

    if (anyShort) {
      card.append(el("div", { class: "callout warn", style: "margin-top:12px" }, [
        `Some lines ask for more than ${locName(t.fromLocId)} is counted as having. Receiving moves whatever is actually there and tells you what it could not.`,
      ]));
    }
    if (t.status === "sent") {
      card.append(el("div", { class: "callout", style: "margin-top:12px" }, [
        `Loaded and gone, but still counted at ${locName(t.fromLocId)}. Receiving is what moves it onto ${locName(t.toLocId)}'s count sheet.`,
      ]));
    }
    return card;
  }

  function formatQtyLike(mod, line, qty) {
    return mod.app.describeLine({ ...line, qty }).qtyText;
  }

  function openTransferForm(id) {
    const existing = id ? getTransfer(id) : null;
    const hub = FleetStorage.hub();
    const draft = existing
      ? JSON.parse(JSON.stringify(existing))
      : {
          id: "tr_" + Math.random().toString(36).slice(2, 9), ref: null,
          fromLocId: hub ? hub.id : FleetStorage.locations()[0].id,
          toLocId: (FleetStorage.locations().find((l) => !l.hub) || FleetStorage.locations()[0]).id,
          status: "draft", createdOn: todayISO(), receivedOn: null, notes: "", lines: [],
        };

    openModal(existing ? "Edit Transfer" : "New Transfer", (body, close) => {
      const form = el("form", { autocomplete: "off" });
      const locOptions = FleetStorage.locations().map((l) => ({ id: l.id, label: l.name }));
      const fromSel = selectEl(locOptions, draft.fromLocId, (v) => { draft.fromLocId = v; });
      const toSel = selectEl(locOptions, draft.toLocId, (v) => { draft.toLocId = v; });
      const dateInput = el("input", { type: "date", value: draft.createdOn });
      form.append(fieldRow([field("From", fromSel), field("To", toSel), field("Date", dateInput)]));
      const notesInput = el("textarea", {}, [draft.notes || ""]);
      form.append(field("Notes", notesInput, "Who is running it down, what cruise it is for."));

      form.append(el("div", { class: "form-actions" }, [
        el("button", { type: "button", class: "btn", onclick: close }, ["Cancel"]),
        el("button", { type: "submit", class: "btn btn-primary" }, [existing ? "Save" : "Create Transfer"]),
      ]));

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (draft.fromLocId === draft.toLocId) { toast("A transfer needs two different locations."); return; }
        draft.createdOn = dateInput.value || todayISO();
        draft.notes = notesInput.value.trim();
        if (existing) {
          Object.assign(existing, draft);
        } else {
          draft.ref = FleetStorage.nextTransferRef();
          FleetStorage.transfers().push(draft);
          activeTransferId = draft.id;
        }
        FleetStorage.save();
        close();
        renderTransfers();
        toast(existing ? "Transfer saved." : "Transfer created — add what is going on it.");
      });
      body.append(form);
    });
  }

  function addTransferLine(id) {
    const t = getTransfer(id);
    if (!t) return;
    const catalog = [...CateringApp.transferCatalog(), ...BarApp.transferCatalog()];
    if (!catalog.length) { toast("Nothing to transfer yet."); return; }

    openModal("Add To " + (t.ref || "Transfer"), (body, close) => {
      let entry = catalog[0];
      let qty = 1;
      const wrap = el("div");

      function draw() {
        wrap.innerHTML = "";
        // Grouped by program and category, because a runner's list is built
        // by walking a shelf, not by scrolling one flat menu.
        const groups = new Map();
        catalog.forEach((c) => {
          const k = `${MODULES[c.module].label} — ${c.group}`;
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k).push(c);
        });
        const sel = el("select");
        Array.from(groups.keys()).sort().forEach((g) => {
          const og = el("optgroup", { label: g });
          groups.get(g).slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((c) => {
            const opt = el("option", { value: c.module + "|" + c.kind + "|" + c.id }, [c.name]);
            if (c === entry) opt.selected = true;
            og.appendChild(opt);
          });
          sel.appendChild(og);
        });
        sel.addEventListener("change", (e) => {
          const [m, k, i] = e.target.value.split("|");
          entry = catalog.find((c) => c.module === m && c.kind === k && c.id === i) || catalog[0];
          draw();
        });

        const available = MODULES[entry.module].app.availableAt(entry.kind, entry.id, t.fromLocId);
        const qtyInput = el("input", { type: "number", step: String(entry.step), min: "0", value: qty,
          oninput: (e) => { qty = Number(e.target.value) || 0; } });

        wrap.append(
          field("Item", sel),
          field(`Quantity (${entry.unit})`, qtyInput,
            `${entry.fmt(available)} counted at ${locName(t.fromLocId)}.`)
        );
      }
      draw();

      const form = el("form", {}, [wrap, el("div", { class: "form-actions" }, [
        el("button", { type: "button", class: "btn", onclick: close }, ["Cancel"]),
        el("button", { type: "submit", class: "btn btn-primary" }, ["Add To Transfer"]),
      ])]);
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (qty <= 0) { toast("Put a quantity on it."); return; }
        t.lines.push({ id: "trl_" + Math.random().toString(36).slice(2, 9), module: entry.module, kind: entry.kind, itemId: entry.id, qty });
        FleetStorage.save();
        close();
        renderTransfers();
      });
      body.append(form);
    });
  }

  function removeTransferLine(id, idx) {
    const t = getTransfer(id);
    if (!t) return;
    t.lines.splice(idx, 1);
    FleetStorage.save();
    renderTransfers();
  }

  function markSent(id) {
    const t = getTransfer(id);
    if (!t) return;
    if (!(t.lines || []).length) { toast("Put something on the ticket first."); return; }
    t.status = "sent";
    FleetStorage.save();
    renderAll();
    toast("Marked in transit. Stock still counts at the origin until it is received.");
  }

  function unsendTransfer(id) {
    const t = getTransfer(id);
    if (!t) return;
    t.status = "draft";
    FleetStorage.save();
    renderTransfers();
    toast("Back to draft.");
  }

  // The one place stock actually moves. Each line goes through its own
  // program, which reports how much it could really move — so a ticket
  // written against a stale count lands honestly rather than inventing stock.
  function receiveTransfer(id) {
    const t = getTransfer(id);
    if (!t) return;
    if (!confirm(`Receive ${t.ref || "this transfer"} onto ${locName(t.toLocId)}? This moves the stock off ${locName(t.fromLocId)}'s count.`)) return;

    const notes = [];
    let movedLines = 0;
    (t.lines || []).forEach((ln) => {
      const mod = MODULES[ln.module];
      if (!mod) return;
      const res = mod.app.moveStock(ln, t.fromLocId, t.toLocId, ln.qty);
      if (res.moved > 0) movedLines++;
      if (res.note) notes.push(`${mod.app.describeLine(ln).name}: ${res.note}`);
      ln.receivedQty = res.moved;
    });

    t.status = "received";
    t.receivedOn = todayISO();
    FleetStorage.save();
    renderAll();
    CateringApp.renderAll();
    BarApp.renderAll();

    if (notes.length) {
      openModal("Received With Differences", (body, close) => {
        body.append(el("p", {}, [
          `${movedLines} of ${t.lines.length} line(s) moved in full. These did not, because the origin was not counted as having that much:`,
        ]));
        const ul = el("ul", { class: "breakdown-list" });
        notes.forEach((n) => ul.append(el("li", {}, [el("span", {}, [n])])));
        body.append(ul);
        body.append(el("div", { class: "callout warn", style: "margin-top:12px" }, [
          "What did reach the boat is on its count sheet. Re-count the origin — a ticket written against a stale number is the usual cause.",
        ]));
        body.append(el("div", { class: "form-actions" }, [el("button", { class: "btn btn-primary", onclick: close }, ["Got it"])]));
      });
    } else {
      toast("Received. Both count sheets updated.");
    }
  }

  function deleteTransfer(id) {
    const t = getTransfer(id);
    if (!t) return;
    const msg = t.status === "received"
      ? `Delete the record of ${t.ref}? The stock it moved stays where it is — this only removes the ticket from the ledger.`
      : `Delete ${t.ref}? Nothing has moved, so nothing is undone.`;
    if (!confirm(msg)) return;
    const trs = FleetStorage.transfers();
    const idx = trs.findIndex((x) => x.id === id);
    if (idx >= 0) trs.splice(idx, 1);
    if (activeTransferId === id) activeTransferId = null;
    FleetStorage.save();
    renderTransfers();
    toast("Transfer deleted.");
  }

  // Called from the location cards, and by Catering and Bar when a count
  // sheet or an order proposes a move.
  function startTransferTo(toLocId) {
    const hub = FleetStorage.hub();
    const from = hub && hub.id !== toLocId ? hub.id : FleetStorage.locations().find((l) => l.id !== toLocId).id;
    createTransfer(from, toLocId, [], "");
    switchTab("transfers");
    toast("Draft transfer started — add what is going on it.");
  }

  function createTransfer(fromLocId, toLocId, lines, notes) {
    const t = {
      id: "tr_" + Math.random().toString(36).slice(2, 9),
      ref: FleetStorage.nextTransferRef(),
      fromLocId, toLocId,
      status: "draft",
      createdOn: todayISO(),
      receivedOn: null,
      notes: notes || "",
      lines: (lines || []).map((ln) => ({
        id: "trl_" + Math.random().toString(36).slice(2, 9),
        module: ln.module, kind: ln.kind || "ingredient", itemId: ln.itemId, qty: ln.qty,
      })),
    };
    FleetStorage.transfers().push(t);
    FleetStorage.save();
    activeTransferId = t.id;
    renderAll();
    return t;
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

  function resetData() {
    if (!confirm("Reset the fleet to its seeded boats, locations and transfers? Catering and bar stock counted at a location you have added will stop being counted anywhere.")) return;
    FleetStorage.resetToDefaults();
    renderAll();
    CateringApp.renderAll();
    BarApp.renderAll();
    toast("Fleet reset.");
  }

  // ---------- house dashboard / Ask ----------
  function summary() {
    const locs = FleetStorage.locations();
    const rows = locs.map((l) => ({ loc: l, v: valueAt(l.id) }));
    const total = rows.reduce((s, r) => s + r.v.total, 0);
    const afloat = rows.filter((r) => r.loc.vesselId).reduce((s, r) => s + r.v.total, 0);
    const pending = FleetStorage.transfers().filter((t) => t.status === "draft" || t.status === "sent");
    return {
      vessels: FleetStorage.vessels().length,
      locations: locs.length,
      bars: FleetStorage.bars().length,
      galleys: FleetStorage.galleys().length,
      totalValue: total,
      afloatValue: afloat,
      ashoreValue: total - afloat,
      pendingTransfers: pending.length,
      inTransit: pending.filter((t) => t.status === "sent").length,
      drafts: pending.filter((t) => t.status === "draft").length,
      byLocation: rows.map((r) => ({ name: r.loc.name, vessel: r.loc.vesselId ? FleetStorage.vessel(r.loc.vesselId).name : null, ...r.v })),
    };
  }

  function snapshot() {
    return {
      vessels: FleetStorage.vessels().map((v) => ({
        name: v.name, runs: v.kind, capacity: v.capacity, notes: v.notes || null,
        locations: FleetStorage.locationsForVessel(v.id).map((l) => l.name),
      })),
      locations: FleetStorage.locations().map((l) => {
        const v = valueAt(l.id);
        return {
          name: l.name,
          short: l.short || l.name,
          kind: l.kind,
          vessel: l.vesselId ? FleetStorage.vessel(l.vesselId).name : null,
          holds: l.holds,
          canCook: !!l.canCook,
          centralStorage: !!l.hub,
          rawFoodValue: Math.round(v.food * 100) / 100,
          preparedFoodValue: Math.round(v.prepared * 100) / 100,
          barValue: Math.round(v.bev * 100) / 100,
          totalValue: Math.round(v.total * 100) / 100,
          notes: l.notes || null,
        };
      }),
      transfers: FleetStorage.transfers().map((t) => ({
        ref: t.ref,
        from: locName(t.fromLocId),
        to: locName(t.toLocId),
        status: STATUS_LABEL[t.status],
        createdOn: t.createdOn,
        receivedOn: t.receivedOn,
        lines: (t.lines || []).map((ln) => {
          const mod = MODULES[ln.module];
          if (!mod) return null;
          const d = mod.app.describeLine(ln);
          return `${d.name} — ${d.qtyText}`;
        }).filter(Boolean),
        notes: t.notes || null,
      })),
    };
  }

  // ---------- init ----------
  function renderAll() {
    renderMaster();
    renderLocations();
    renderTransfers();
  }

  function init() {
    $all(".tab-btn").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
    const reset = $("#fleet-btn-reset");
    if (reset) reset.addEventListener("click", resetData);
    renderAll();
  }

  return { init, renderAll, summary, snapshot, switchTab, createTransfer, valueAt };
})();
