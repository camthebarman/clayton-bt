/* fleet/storage.js — the spine of the whole program: where stock can sit.

   86'd tracked one kitchen and one bar, so an ingredient could carry a single
   onHandQty. Here there are boats. The same case of lemons can be split
   between the commissary, the kitchen and three bars, and the number that
   matters to an order is the master total across all of them.

   So every quantity in the catering and bar programs is a map keyed by
   location id, and every roll-up in the app is a sum over that map. This file
   owns the list of places those keys refer to.

   Locations have two properties the rest of the app reasons about:
     holds    which programs stock the place — "food", "bev", or both.
     canCook  whether food can actually be produced there. The B&B kitchen can;
              a boat galley holds, finishes and plates what the kitchen sent. */

const FleetStorage = (function () {
  const KEY = "ctb.fleet.v1";
  const SEED_VERSION = 1;

  // ---- Vessels ----
  // A vessel is a grouping, not a stock location: its galley and its bars are
  // the locations. Capacity is the guest count the boat is certified for,
  // which is what a catering order gets checked against.
  function seedVessels() {
    return [
      { id: "ves_duchess", sinceVersion: 1, name: "Island Duchess", kind: "Dinner cruise", capacity: 90, notes: "65' enclosed, two decks. The only boat that runs plated dinner service." },
      { id: "ves_belle", sinceVersion: 1, name: "Thousand Isle Belle", kind: "Sightseeing tour", capacity: 120, notes: "72' double-decker. Two-hour loops, boxed lunches and bar service." },
      { id: "ves_clayton", sinceVersion: 1, name: "Miss Clayton", kind: "Private charter", capacity: 36, notes: "48' charter. Small groups, cocktail service, passed bites." },
    ];
  }

  // ---- Locations ----
  // Order matters: it is the order locations appear in every filter and
  // column, so the commissary and kitchen lead and the boats follow.
  function seedLocations() {
    return [
      {
        id: "loc_commissary", sinceVersion: 1, name: "Dockside Commissary", short: "Commissary",
        kind: "storage", vesselId: null, holds: ["food", "bev"], canCook: false, hub: true,
        notes: "Dry store, walk-in cooler and freezer behind the dock office. Everything lands here first.",
      },
      {
        id: "loc_kitchen", sinceVersion: 1, name: "B&B Kitchen", short: "Kitchen",
        kind: "kitchen", vesselId: null, holds: ["food"], canCook: true, hub: false,
        notes: "The only production kitchen. Most catering pulls come from its walk-in.",
      },
      {
        id: "loc_porchbar", sinceVersion: 1, name: "Porch Bar", short: "Porch Bar",
        kind: "bar", vesselId: null, holds: ["bev"], canCook: false, hub: false,
        notes: "Shore side, off the B&B porch. Runs before and after every cruise.",
      },

      // Island Duchess
      {
        id: "loc_duchess_galley", sinceVersion: 1, name: "Island Duchess Galley", short: "Duchess Galley",
        kind: "galley", vesselId: "ves_duchess", holds: ["food"], canCook: false, hub: false,
        notes: "Holding cabinet, flat top and a two-burner. Finishes and plates; does not produce.",
      },
      {
        id: "loc_duchess_bar", sinceVersion: 1, name: "Island Duchess Main Bar", short: "Duchess Main",
        kind: "bar", vesselId: "ves_duchess", holds: ["bev"], canCook: false, hub: false,
        notes: "Main deck, full back bar.",
      },
      {
        id: "loc_duchess_upper", sinceVersion: 1, name: "Island Duchess Upper Bar", short: "Duchess Upper",
        kind: "bar", vesselId: "ves_duchess", holds: ["bev"], canCook: false, hub: false,
        notes: "Open-air upper deck. Beer, wine and two batched cocktails only.",
      },

      // Thousand Isle Belle
      {
        id: "loc_belle_galley", sinceVersion: 1, name: "Thousand Isle Belle Galley", short: "Belle Galley",
        kind: "galley", vesselId: "ves_belle", holds: ["food"], canCook: false, hub: false,
        notes: "Cold hold and a warmer. Boxed lunches go out of here.",
      },
      {
        id: "loc_belle_bar", sinceVersion: 1, name: "Thousand Isle Belle Bar", short: "Belle Bar",
        kind: "bar", vesselId: "ves_belle", holds: ["bev"], canCook: false, hub: false,
        notes: "Lower deck service bar.",
      },

      // Miss Clayton
      {
        id: "loc_clayton_galley", sinceVersion: 1, name: "Miss Clayton Service Counter", short: "Clayton Counter",
        kind: "galley", vesselId: "ves_clayton", holds: ["food"], canCook: false, hub: false,
        notes: "Cold hold only. Passed bites and cheese boards.",
      },
      {
        id: "loc_clayton_bar", sinceVersion: 1, name: "Miss Clayton Bar", short: "Clayton Bar",
        kind: "bar", vesselId: "ves_clayton", holds: ["bev"], canCook: false, hub: false,
        notes: "Single well. Whatever the charter asked for, nothing else.",
      },
    ];
  }

  function defaultState() {
    return {
      vessels: seedVessels(),
      locations: seedLocations(),
      seedVersion: SEED_VERSION,
    };
  }

  // ---- persistence ----
  function applySeedUpdates(s) {
    const from = s.seedVersion || 1;
    if (from >= SEED_VERSION) return s;
    const mergeNew = (list, seeds) => {
      const have = new Set(list.map((x) => x.id));
      seeds.forEach((item) => {
        if (item.sinceVersion > from && !have.has(item.id)) list.push(item);
      });
    };
    mergeNew(s.vessels, seedVessels());
    mergeNew(s.locations, seedLocations());
    s.seedVersion = SEED_VERSION;
    return s;
  }

  function normalize(s) {
    s.vessels = s.vessels || [];
    s.locations = s.locations || [];
    // Transfers were retired in the redesign: catering now deducts straight
    // from the fridge it pulls from, so there is no ledger to keep.
    delete s.transfers;
    delete s.settings;
    s.locations.forEach((l) => {
      if (!Array.isArray(l.holds)) l.holds = ["food", "bev"];
      if (l.canCook == null) l.canCook = l.kind === "kitchen";
      if (!l.short) l.short = l.name;
      if (l.vesselId === undefined) l.vesselId = null;
    });
    return s;
  }

  function isValid(p) {
    return !!(p && Array.isArray(p.locations) && Array.isArray(p.vessels));
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!isValid(parsed)) return defaultState();
      return normalize(applySeedUpdates(parsed));
    } catch (e) {
      console.warn("Fleet data failed to load; using defaults.", e);
      return defaultState();
    }
  }

  // The live state. Catering and Bar read locations through the accessors
  // below rather than keeping their own copy, so adding a boat in Fleet shows
  // up in every count sheet on the next render.
  let state = load();

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Could not save fleet data.", e);
    }
  }

  function resetToDefaults() {
    state = defaultState();
    save();
    return state;
  }

  // ---- accessors ----
  function all() { return state; }
  function locations() { return state.locations; }
  function vessels() { return state.vessels; }

  function location(id) { return state.locations.find((l) => l.id === id) || null; }
  function vessel(id) { return state.vessels.find((v) => v.id === id) || null; }

  function locationName(id) {
    const l = location(id);
    return l ? l.name : "Unknown location";
  }
  function locationShort(id) {
    const l = location(id);
    return l ? l.short || l.name : "—";
  }

  // Locations that stock a given program. Everything in catering and bar that
  // needs a column, a picker or a roll-up asks for its list here.
  function locationsHolding(what) {
    return state.locations.filter((l) => (l.holds || []).includes(what));
  }
  function foodLocations() { return locationsHolding("food"); }
  function bevLocations() { return locationsHolding("bev"); }

  function hub() {
    return state.locations.find((l) => l.hub) || state.locations[0] || null;
  }
  function kitchen() {
    return state.locations.find((l) => l.canCook) || null;
  }
  function bars() {
    return state.locations.filter((l) => l.kind === "bar");
  }
  function galleys() {
    return state.locations.filter((l) => l.kind === "galley");
  }
  function afloat(locId) {
    const l = location(locId);
    return !!(l && l.vesselId);
  }
  function locationsForVessel(vesselId) {
    return state.locations.filter((l) => l.vesselId === vesselId);
  }

  return {
    KEY,
    all, save, resetToDefaults, defaultState, normalize, isValid,
    locations, vessels,
    location, vessel, locationName, locationShort,
    locationsHolding, foodLocations, bevLocations,
    hub, kitchen, bars, galleys, afloat, locationsForVessel,
  };
})();
