/* brand.js — the operation's name, in one object.

   ═══════════════════════════════════════════════════════════════════════
   TO RE-BRAND THIS APP FOR ANOTHER OPERATION, EDIT THIS FILE AND
   css/brand.css. NOTHING ELSE CARRIES A COLOR OR A COMPANY NAME.
   ═══════════════════════════════════════════════════════════════════════

   The masthead, the browser tab, the mark and the favicon all read from
   this object, so a rename lands everywhere at once.

   The mark is drawn from the --mark-* custom properties in brand.css rather
   than from hexes repeated here, so the logo re-colours with the palette. */

const Brand = (function () {
  const config = {
    // What the business is called.
    name: "Clayton Boat Tours",
    shortName: "Clayton Boat Tours",
    initials: "CBT",

    // The line under the name in the masthead.
    tagline: "Fleet provisioning",

    // The browser tab.
    documentTitle: "Clayton Boat Tours — Provisioning",
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
      mark.innerHTML = markSVG({ radius: 9 });
      mark.setAttribute("title", config.name);
    }

    const name = document.querySelector(".brand-name");
    if (name) name.textContent = config.shortName;

    const tag = document.querySelector(".brand-tag");
    if (tag) tag.textContent = config.tagline;

    let icon = document.querySelector('link[rel="icon"]');
    if (!icon) {
      icon = document.createElement("link");
      icon.setAttribute("rel", "icon");
      document.head.appendChild(icon);
    }
    icon.setAttribute("type", "image/svg+xml");
    icon.setAttribute("href", faviconHref());
  }

  return {
    config, token, markSVG, faviconHref, apply,
    get name() { return config.name; },
  };
})();
