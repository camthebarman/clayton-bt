/* ui/widgets.js — the small pieces every page is built from: icons, the
   page header, stat tiles, cost meters, status pills, form fields. */

const W = (function () {
  const el = Core.el;

  // Stroke icons, drawn at 24x24 and sized by CSS. Inline so the page needs
  // nothing but itself.
  const PATHS = {
    inventory: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/>',
    food: '<path d="M4 3v7a3 3 0 0 0 6 0V3"/><path d="M7 3v18"/><path d="M17 21V3c2.5 1.5 4 4 4 7s-1.5 4-4 4"/>',
    bar: '<path d="M4 4h16l-8 9z"/><path d="M12 13v7"/><path d="M8 20h8"/><path d="m15 4 2.5-2"/>',
    catering: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8"/><path d="M8 11h2"/><path d="M14 11h2"/><path d="M8 15h2"/><path d="M14 15h2"/>',
    locations: '<path d="M12 22V8"/><circle cx="12" cy="5" r="3"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2l2.5 11h11L21 8H6.5"/>',
    fridge: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M5 10h14"/><path d="M9 5v2M9 13v3"/>',
    boat: '<path d="M3 17h18l-2.5 4h-13z"/><path d="M12 3v11"/><path d="M12 4l6 9h-6"/>',
    shore: '<path d="M3 21h18"/><path d="M5 21V10l7-5 7 5v11"/><path d="M10 21v-6h4v6"/>',
    kitchen: '<path d="M6 13h12v8H6z"/><path d="M4 13h16"/><path d="M8 10c0-2 1-3 1-5M12 10c0-2 1-3 1-5M16 10c0-2 1-3 1-5"/>',
    storage: '<rect x="3" y="4" width="18" height="6" rx="1"/><path d="M5 10v10h14V10"/><path d="M10 14h4"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17.5v.5"/>',
    duplicate: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
    reset: '<path d="M4 4v6h6"/><path d="M4.5 15a8 8 0 1 0 1.5-8.5L4 10"/>',
  };

  function icon(name) {
    const span = document.createElement("span");
    span.style.display = "contents";
    span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ""}</svg>`;
    return span.firstChild;
  }

  function btn(label, opts) {
    const o = opts || {};
    const cls = ["btn", o.kind ? "btn-" + o.kind : "", o.sm ? "btn-sm" : "", o.iconOnly ? "btn-icon" : "", o.cls || ""].filter(Boolean).join(" ");
    return el("button", { type: o.type || "button", class: cls, title: o.title || (o.iconOnly ? label : null), onclick: o.onclick, disabled: o.disabled ? "disabled" : null, "aria-label": o.iconOnly ? label : null }, [
      o.icon ? icon(o.icon) : null,
      o.iconOnly ? null : label,
    ]);
  }

  function pageHead(title, sub, actions, eyebrow) {
    return el("div", { class: "page-head" }, [
      el("div", {}, [
        el("div", { class: "eyebrow" }, [el("i"), el("span", { class: "label" }, [eyebrow || "Clayton Boat Tours"])]),
        el("h1", {}, [title]),
        sub ? el("p", {}, [sub]) : null,
      ]),
      actions && actions.length ? el("div", { class: "head-actions" }, actions) : null,
    ]);
  }

  function sectionHead(title, sub, actions) {
    return el("div", { class: "section-head" }, [
      el("div", {}, [el("h2", {}, [title]), sub ? el("div", { class: "muted" }, [sub]) : null]),
      actions && actions.length ? el("div", { class: "head-actions" }, actions) : null,
    ]);
  }

  function stat(label, value, sub, opts) {
    const o = opts || {};
    return el("div", { class: "stat" }, [
      el("div", { class: "label" }, [label]),
      el("div", { class: "stat-value" + (o.accent ? " accent" : "") }, [String(value)]),
      sub ? el("div", { class: "stat-sub" }, [sub]) : null,
      o.meter || null,
    ]);
  }

  // A cost % against its target. Scaled so the target sits at 60% of the
  // track: there is room to show how far over something runs.
  function meter(pctValue, target) {
    const t = Number(target) || 30;
    const scale = t / 0.6;
    const fill = Math.max(0, Math.min(100, ((Number(pctValue) || 0) / scale) * 100));
    const tone = Store.costTone(pctValue, target);
    return el("div", { class: "meter " + tone, title: `Target ${Store.pct(t)}` }, [
      el("span", { style: `width:${fill}%` }),
      target ? el("b", { style: `left:60%` }) : null,
    ]);
  }

  function pctCell(pctValue, target) {
    if (!pctValue) return el("span", { class: "faint" }, ["—"]);
    return el("div", { class: "pct-cell" }, [
      el("span", { class: "mono" }, [Store.pct(pctValue)]),
      meter(pctValue, target),
    ]);
  }

  const STATUS = {
    ok: ["good", "OK"],
    low: ["warn", "Low"],
    out: ["bad", "Out"],
    none: ["", "No par"],
  };
  function statusPill(st) {
    const s = STATUS[st] || STATUS.none;
    return el("span", { class: "pill " + s[0] }, [s[1]]);
  }

  function field(label, input, hint) {
    return el("div", { class: "field" }, [
      el("label", { class: "label" }, [label]),
      input,
      hint ? el("div", { class: "hint" }, [hint]) : null,
    ]);
  }
  function fieldRow(fields) { return el("div", { class: "field-row" }, fields.filter(Boolean)); }

  // options: [{ id, label }] or [{ group, options: [...] }]
  function select(options, value, onChange, attrs) {
    const s = el("select", attrs || {});
    function add(parent, o) {
      parent.append(el("option", { value: o.id }, [o.label]));
    }
    options.forEach((o) => {
      if (o.group) {
        const g = el("optgroup", { label: o.group });
        o.options.forEach((x) => add(g, x));
        s.append(g);
      } else add(s, o);
    });
    if (value != null) s.value = value;
    if (onChange) s.addEventListener("change", (e) => onChange(e.target.value));
    return s;
  }

  function seg(options, value, onChange) {
    return el("div", { class: "seg", role: "tablist" }, options.map((o) =>
      el("button", {
        type: "button",
        class: o.id === value ? "active" : "",
        role: "tab",
        "aria-selected": o.id === value ? "true" : "false",
        style: o.dot ? `--dot:${o.dot}` : null,
        onclick: () => onChange(o.id),
      }, [o.dot ? el("i") : null, o.label])
    ));
  }

  function toggle(label, checked, onChange) {
    const input = el("input", { type: "checkbox" });
    input.checked = !!checked;
    input.addEventListener("change", () => onChange(input.checked));
    return el("label", { class: "toggle" }, [input, el("span", { class: "track" }), label]);
  }

  function numInput(value, onInput, attrs) {
    const a = Object.assign({ type: "number", step: "any", min: "0", inputmode: "decimal" }, attrs || {});
    const input = el("input", a);
    input.value = value === "" || value == null ? "" : value;
    if (onInput) input.addEventListener("input", () => onInput(input.value));
    return input;
  }

  // Enter moves down the column, the way a count sheet is filled in.
  function enterMovesDown(table) {
    table.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || !e.target.matches("input[data-col]")) return;
      e.preventDefault();
      const col = e.target.dataset.col;
      const all = Array.from(table.querySelectorAll(`input[data-col="${col}"]`));
      const next = all[all.indexOf(e.target) + (e.shiftKey ? -1 : 1)];
      e.target.blur();
      if (next) { next.focus(); next.select(); }
    });
  }

  function empty(title, text) {
    return el("div", { class: "empty" }, [el("strong", {}, [title]), text || null]);
  }

  function dateParts(iso) {
    const d = Store.C.parseDate(iso);
    if (!d) return { m: "—", d: "—" };
    return {
      m: d.toLocaleDateString(undefined, { month: "short" }),
      d: String(d.getDate()),
    };
  }

  return {
    icon, btn, pageHead, sectionHead, stat, meter, pctCell, statusPill,
    field, fieldRow, select, seg, toggle, numInput, enterMovesDown, empty, dateParts,
  };
})();
