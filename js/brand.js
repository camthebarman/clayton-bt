/* brand.js — the operation's name, in one object.

   ═══════════════════════════════════════════════════════════════════════
   TO RE-BRAND THIS APP FOR ANOTHER OPERATION, EDIT THIS FILE AND
   css/brand.css. NOTHING ELSE CARRIES A COLOR OR A COMPANY NAME.
   ═══════════════════════════════════════════════════════════════════════

   Nothing here is cosmetic-only. The masthead, the browser tab, the mark,
   the favicon, the front page's opening line and the brief the Ask tab hands
   to Claude all read from this object, so a rename lands everywhere at once
   instead of in eight places and a stale <title>.

   The mark is drawn from the --mark-* custom properties in brand.css rather
   than from hexes repeated here, so the logo re-colours with the palette. */

const Brand = (function () {
  const config = {
    // What the business is called.
    name: "Clayton Boat Tours",
    shortName: "Clayton Boat Tours",
    initials: "CBT",

    // The line under the name in the masthead.
    tagline: "Fleet provisioning · catering · Harborside B&B",

    // Where it is, and what the water is called. Both appear in the brief the
    // Ask tab gives Claude, which is the difference between an assistant that
    // knows it is on a river and one that does not.
    place: "Clayton, New York",
    region: "the Thousand Islands",
    water: "the St. Lawrence River",

    // The lodging side of the business. The kitchen belongs to it, which is
    // the whole reason food has to be prepared ahead and carried out.
    lodging: "Harborside B&B",

    // The browser tab.
    documentTitle: "Clayton Boat Tours — Provisioning",

    // The front page's opening line.
    heroTitle: "Clayton Boat Tours",

    // The glyph each tool wears, in the masthead of its own tab and on its
    // card on the front page. Swap these for a different operation's shape —
    // a coach fleet, a ski hill — without touching either app file.
    marks: {
      catering: "\uD83C\uDF7D\uFE0F",  // plate and cutlery
      bar: "\uD83C\uDF78",              // cocktail
      fleet: "\u2693",                   // anchor
      agent: "\uD83D\uDCAC",            // speech balloon
    },

    // One sentence of context for Claude, in the operation's own terms.
    business:
      "a boat tour operator on the St. Lawrence River in Clayton, New York, " +
      "at the head of the Thousand Islands, which also runs a bed and breakfast " +
      "and caters every cruise and charter out of the B&B kitchen",
  };

  // Reads a colour token out of brand.css. Doing it this way rather than
  // repeating hexes keeps one source of truth for the palette.
  function token(name, fallback) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) {
      return fallback;
    }
  }

  /* The mark: a launch hull with a brass sheer stripe, on river water.
     Clayton is the home of the Antique Boat Museum, so a varnished hull is
     the honest shape for this place — and it stays legible at 16px, which a
     castle or a lighthouse would not. */
  function markSVG(opts) {
    const o = opts || {};
    const field = o.field || token("--mark-field", "#0f4a5f");
    const hull = o.hull || token("--mark-hull", "#ffffff");
    const trim = o.trim || token("--mark-trim", "#c08f3e");
    const radius = o.radius == null ? 7 : o.radius;
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="100%" height="100%" role="img" aria-label="${config.name}">`,
      `<rect width="32" height="32" rx="${radius}" fill="${field}"/>`,
      // the brass sheer stripe, sitting on the gunwale
      `<rect x="5.4" y="13.6" width="21.2" height="2" rx="1" fill="${trim}"/>`,
      // the hull
      `<path d="M5.4 16.9 H26.6 L23.4 22.6 Q16 24.4 8.6 22.6 Z" fill="${hull}"/>`,
      // her wake
      `<path d="M4 26.6 q3 -1.5 6 0 t6 0 t6 0 t6 0" fill="none" stroke="${hull}"`,
      ` stroke-width="1.7" stroke-linecap="round" opacity="0.5"/>`,
      `</svg>`,
    ].join("");
  }

  // The same mark as a data URI, with the colours resolved — a favicon gets
  // no access to the page's stylesheet, so var() would come out blank.
  function faviconHref() {
    return "data:image/svg+xml," + encodeURIComponent(markSVG({ radius: 6 }));
  }

  // Stamps the identity onto the page. Called once at boot.
  function apply() {
    document.title = config.documentTitle;

    const mark = document.querySelector(".house-mark");
    if (mark) {
      mark.innerHTML = markSVG();
      mark.setAttribute("title", config.name);
    }

    const h1 = document.querySelector(".house-brand h1");
    if (h1) h1.textContent = config.name;

    const tag = document.querySelector(".house-brand .tagline");
    if (tag) tag.textContent = config.tagline;

    Object.keys(config.marks).forEach((mod) => {
      const node = document.querySelector("#mod-" + mod + " .module-title .brand-mark");
      if (node) node.textContent = config.marks[mod];
    });

    let icon = document.querySelector('link[rel="icon"]');
    if (!icon) {
      icon = document.createElement("link");
      icon.setAttribute("rel", "icon");
      document.head.appendChild(icon);
    }
    icon.setAttribute("type", "image/svg+xml");
    icon.setAttribute("href", faviconHref());
  }

  // The lines the Ask tab prepends to Claude's brief.
  function assistantPreamble() {
    return [
      `You are the operations assistant for ${config.name} — ${config.business}.`,
      `It operates on ${config.water} out of ${config.place}, in ${config.region}.`,
      "You are answering questions from the owners and the staff who run it.",
    ];
  }

  return {
    config, token, markSVG, faviconHref, apply, assistantPreamble,
    get name() { return config.name; },
    get heroTitle() { return config.heroTitle; },
    get lodging() { return config.lodging; },
    get marks() { return config.marks; },
  };
})();
