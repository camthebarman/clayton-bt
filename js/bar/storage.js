/* bar/storage.js — state, persistence and seed data for the beverage program.

   Five bars: one on the porch at the B&B and four afloat. Every on-hand and
   par figure is a map of locationId -> base-unit quantity, and the master
   figure is the sum.

   Par levels are where a multi-bar program actually lives. The Duchess upper
   deck runs beer, wine and two batched cocktails, so it carries no par on gin
   or bourbon — and because "below par" only means something where a par is
   set, the upper bar never nags about a bottle it was never meant to hold.

   Prices are plausible wholesale figures, not quoted invoices. Overwrite them
   with what this operation actually pays. */

const BarStorage = (function () {
  const KEY = "ctb.bar.v1";
  const SEED_VERSION = 1;

  const CATEGORIES = [
    "Spirit", "Liqueur", "Beer", "Wine", "Mixer", "Juice", "Garnish", "Service", "House Prep",
  ];

  // ---- Ingredients ----
  function seedIngredients() {
    return [
      // Spirits
      { id: "bing_vodka", sinceVersion: 1, name: "House Vodka", category: "Spirit", baseUnit: "floz", purchaseUnit: "ml1750", purchaseQty: 1, purchaseCost: 22.5,
        onHand: { loc_commissary: 355, loc_porchbar: 118, loc_duchess_bar: 118, loc_belle_bar: 59, loc_clayton_bar: 59 },
        par: { loc_commissary: 355, loc_porchbar: 118, loc_duchess_bar: 118, loc_belle_bar: 59, loc_clayton_bar: 59 } },
      { id: "bing_gin", sinceVersion: 1, name: "London Dry Gin", category: "Spirit", baseUnit: "floz", purchaseUnit: "ml1750", purchaseQty: 1, purchaseCost: 31.9,
        onHand: { loc_commissary: 118, loc_porchbar: 59, loc_duchess_bar: 30, loc_belle_bar: 30, loc_clayton_bar: 30 },
        par: { loc_commissary: 237, loc_porchbar: 59, loc_duchess_bar: 59, loc_belle_bar: 30, loc_clayton_bar: 30 } },
      { id: "bing_rum", sinceVersion: 1, name: "White Rum", category: "Spirit", baseUnit: "floz", purchaseUnit: "ml1750", purchaseQty: 1, purchaseCost: 24.75,
        onHand: { loc_commissary: 178, loc_porchbar: 59, loc_duchess_bar: 59, loc_belle_bar: 30 },
        par: { loc_commissary: 178, loc_porchbar: 59, loc_duchess_bar: 59, loc_belle_bar: 30 } },
      { id: "bing_bourbon", sinceVersion: 1, name: "Small Batch Bourbon", category: "Spirit", baseUnit: "floz", purchaseUnit: "ml750", purchaseQty: 1, purchaseCost: 28.5,
        onHand: { loc_commissary: 127, loc_porchbar: 51, loc_duchess_bar: 25, loc_clayton_bar: 25 },
        par: { loc_commissary: 152, loc_porchbar: 51, loc_duchess_bar: 51, loc_clayton_bar: 25 } },
      { id: "bing_tequila", sinceVersion: 1, name: "Blanco Tequila", category: "Spirit", baseUnit: "floz", purchaseUnit: "ml750", purchaseQty: 1, purchaseCost: 26.9,
        onHand: { loc_commissary: 101, loc_porchbar: 25, loc_duchess_bar: 25 },
        par: { loc_commissary: 127, loc_porchbar: 25, loc_duchess_bar: 25 } },

      // Liqueur
      { id: "bing_aperitivo", sinceVersion: 1, name: "Orange Aperitivo", category: "Liqueur", baseUnit: "floz", purchaseUnit: "ml750", purchaseQty: 1, purchaseCost: 24.4,
        onHand: { loc_commissary: 76, loc_porchbar: 25, loc_duchess_bar: 25, loc_duchess_upper: 25, loc_belle_bar: 25 },
        par: { loc_commissary: 101, loc_porchbar: 25, loc_duchess_bar: 25, loc_duchess_upper: 25, loc_belle_bar: 25 } },
      { id: "bing_triple_sec", sinceVersion: 1, name: "Triple Sec", category: "Liqueur", baseUnit: "floz", purchaseUnit: "ml750", purchaseQty: 1, purchaseCost: 13.9,
        onHand: { loc_commissary: 76, loc_porchbar: 25, loc_duchess_bar: 25 },
        par: { loc_commissary: 76, loc_porchbar: 25, loc_duchess_bar: 25 } },

      // Beer
      { id: "bing_lager_keg", sinceVersion: 1, name: "Local Lager (1/6 bbl keg)", category: "Beer", baseUnit: "floz", purchaseUnit: "keg sixth", purchaseQty: 1, purchaseCost: 112,
        onHand: { loc_commissary: 1322, loc_porchbar: 661, loc_duchess_bar: 661 },
        par: { loc_commissary: 1322, loc_porchbar: 661, loc_duchess_bar: 661 } },
      { id: "bing_ipa_can", sinceVersion: 1, name: "IPA (12 oz can)", category: "Beer", baseUnit: "each", unitNoun: "can", purchaseUnit: "case24", purchaseQty: 1, purchaseCost: 46.8,
        onHand: { loc_commissary: 96, loc_porchbar: 36, loc_duchess_bar: 48, loc_duchess_upper: 36, loc_belle_bar: 48, loc_clayton_bar: 12 },
        par: { loc_commissary: 144, loc_porchbar: 48, loc_duchess_bar: 48, loc_duchess_upper: 48, loc_belle_bar: 48, loc_clayton_bar: 24 } },
      { id: "bing_light_can", sinceVersion: 1, name: "Light Lager (12 oz can)", category: "Beer", baseUnit: "each", unitNoun: "can", purchaseUnit: "case24", purchaseQty: 1, purchaseCost: 28.8,
        onHand: { loc_commissary: 168, loc_porchbar: 48, loc_duchess_bar: 72, loc_duchess_upper: 72, loc_belle_bar: 96, loc_clayton_bar: 24 },
        par: { loc_commissary: 192, loc_porchbar: 48, loc_duchess_bar: 72, loc_duchess_upper: 72, loc_belle_bar: 96, loc_clayton_bar: 24 } },

      // Wine
      { id: "bing_chardonnay", sinceVersion: 1, name: "House Chardonnay", category: "Wine", baseUnit: "floz", purchaseUnit: "ml750", purchaseQty: 1, purchaseCost: 11.4,
        onHand: { loc_commissary: 304, loc_porchbar: 76, loc_duchess_bar: 152, loc_duchess_upper: 101, loc_belle_bar: 76, loc_clayton_bar: 51 },
        par: { loc_commissary: 380, loc_porchbar: 101, loc_duchess_bar: 152, loc_duchess_upper: 127, loc_belle_bar: 101, loc_clayton_bar: 51 } },
      { id: "bing_rose", sinceVersion: 1, name: "Dry Rosé", category: "Wine", baseUnit: "floz", purchaseUnit: "ml750", purchaseQty: 1, purchaseCost: 12.75,
        onHand: { loc_commissary: 203, loc_porchbar: 76, loc_duchess_bar: 101, loc_duchess_upper: 101, loc_belle_bar: 76 },
        par: { loc_commissary: 254, loc_porchbar: 76, loc_duchess_bar: 101, loc_duchess_upper: 101, loc_belle_bar: 76 } },
      { id: "bing_cabernet", sinceVersion: 1, name: "House Cabernet", category: "Wine", baseUnit: "floz", purchaseUnit: "ml750", purchaseQty: 1, purchaseCost: 12.2,
        onHand: { loc_commissary: 254, loc_porchbar: 76, loc_duchess_bar: 127, loc_duchess_upper: 51, loc_belle_bar: 51, loc_clayton_bar: 25 },
        par: { loc_commissary: 254, loc_porchbar: 76, loc_duchess_bar: 127, loc_duchess_upper: 76, loc_belle_bar: 51, loc_clayton_bar: 25 } },
      { id: "bing_prosecco", sinceVersion: 1, name: "Prosecco", category: "Wine", baseUnit: "floz", purchaseUnit: "ml750", purchaseQty: 1, purchaseCost: 13.9,
        onHand: { loc_commissary: 152, loc_porchbar: 76, loc_duchess_bar: 101, loc_duchess_upper: 76, loc_belle_bar: 51, loc_clayton_bar: 51 },
        par: { loc_commissary: 254, loc_porchbar: 76, loc_duchess_bar: 101, loc_duchess_upper: 101, loc_belle_bar: 51, loc_clayton_bar: 51 } },

      // Mixers
      { id: "bing_tonic", sinceVersion: 1, name: "Tonic Water", category: "Mixer", baseUnit: "floz", purchaseUnit: "floz", purchaseQty: 202, purchaseCost: 31.2,
        onHand: { loc_commissary: 404, loc_porchbar: 135, loc_duchess_bar: 101, loc_belle_bar: 68, loc_clayton_bar: 68 },
        par: { loc_commissary: 404, loc_porchbar: 135, loc_duchess_bar: 135, loc_belle_bar: 101, loc_clayton_bar: 68 } },
      { id: "bing_soda", sinceVersion: 1, name: "Club Soda", category: "Mixer", baseUnit: "floz", purchaseUnit: "floz", purchaseQty: 202, purchaseCost: 24.6,
        onHand: { loc_commissary: 606, loc_porchbar: 135, loc_duchess_bar: 135, loc_duchess_upper: 68, loc_belle_bar: 101, loc_clayton_bar: 68 },
        par: { loc_commissary: 606, loc_porchbar: 135, loc_duchess_bar: 135, loc_duchess_upper: 68, loc_belle_bar: 101, loc_clayton_bar: 68 } },
      { id: "bing_ginger_beer", sinceVersion: 1, name: "Ginger Beer", category: "Mixer", baseUnit: "floz", purchaseUnit: "floz", purchaseQty: 192, purchaseCost: 42,
        onHand: { loc_commissary: 288, loc_porchbar: 96, loc_duchess_bar: 96, loc_duchess_upper: 48, loc_belle_bar: 48 },
        par: { loc_commissary: 384, loc_porchbar: 96, loc_duchess_bar: 96, loc_duchess_upper: 48, loc_belle_bar: 96 } },
      { id: "bing_cola", sinceVersion: 1, name: "Cola", category: "Mixer", baseUnit: "floz", purchaseUnit: "floz", purchaseQty: 240, purchaseCost: 22.8,
        onHand: { loc_commissary: 480, loc_porchbar: 120, loc_duchess_bar: 120, loc_belle_bar: 120, loc_clayton_bar: 60 },
        par: { loc_commissary: 480, loc_porchbar: 120, loc_duchess_bar: 120, loc_belle_bar: 120, loc_clayton_bar: 60 } },

      // Juice
      { id: "bing_lime_juice", sinceVersion: 1, name: "Lime Juice (fresh)", category: "Juice", baseUnit: "floz", purchaseUnit: "qt", purchaseQty: 1, purchaseCost: 11.5,
        onHand: { loc_commissary: 128, loc_porchbar: 32, loc_duchess_bar: 32, loc_belle_bar: 32, loc_clayton_bar: 16 },
        par: { loc_commissary: 192, loc_porchbar: 32, loc_duchess_bar: 32, loc_belle_bar: 32, loc_clayton_bar: 16 } },
      { id: "bing_lemon_juice", sinceVersion: 1, name: "Lemon Juice (fresh)", category: "Juice", baseUnit: "floz", purchaseUnit: "qt", purchaseQty: 1, purchaseCost: 10.9,
        onHand: { loc_commissary: 128, loc_porchbar: 32, loc_duchess_bar: 32, loc_belle_bar: 32, loc_clayton_bar: 16 },
        par: { loc_commissary: 160, loc_porchbar: 32, loc_duchess_bar: 32, loc_belle_bar: 32, loc_clayton_bar: 16 } },
      { id: "bing_cranberry", sinceVersion: 1, name: "Cranberry Juice", category: "Juice", baseUnit: "floz", purchaseUnit: "gal", purchaseQty: 1, purchaseCost: 14.9,
        onHand: { loc_commissary: 256, loc_porchbar: 64, loc_duchess_bar: 64, loc_belle_bar: 64, loc_clayton_bar: 32 },
        par: { loc_commissary: 256, loc_porchbar: 64, loc_duchess_bar: 64, loc_belle_bar: 64, loc_clayton_bar: 32 } },
      { id: "bing_orange_juice", sinceVersion: 1, name: "Orange Juice", category: "Juice", baseUnit: "floz", purchaseUnit: "gal", purchaseQty: 1, purchaseCost: 16.4,
        onHand: { loc_commissary: 256, loc_porchbar: 64, loc_duchess_bar: 64, loc_belle_bar: 64 },
        par: { loc_commissary: 256, loc_porchbar: 64, loc_duchess_bar: 64, loc_belle_bar: 64 } },

      // Garnish
      { id: "bing_lime", sinceVersion: 1, name: "Lime", category: "Garnish", baseUnit: "each", unitNoun: "lime", purchaseUnit: "each", purchaseQty: 200, purchaseCost: 62,
        onHand: { loc_commissary: 200, loc_porchbar: 40, loc_duchess_bar: 40, loc_duchess_upper: 25, loc_belle_bar: 30, loc_clayton_bar: 20 },
        par: { loc_commissary: 200, loc_porchbar: 50, loc_duchess_bar: 50, loc_duchess_upper: 30, loc_belle_bar: 40, loc_clayton_bar: 20 } },
      { id: "bing_lemon_gar", sinceVersion: 1, name: "Lemon (garnish)", category: "Garnish", baseUnit: "each", unitNoun: "lemon", purchaseUnit: "each", purchaseQty: 140, purchaseCost: 58.8,
        onHand: { loc_commissary: 140, loc_porchbar: 30, loc_duchess_bar: 30, loc_belle_bar: 20, loc_clayton_bar: 15 },
        par: { loc_commissary: 140, loc_porchbar: 30, loc_duchess_bar: 30, loc_belle_bar: 20, loc_clayton_bar: 15 } },
      { id: "bing_orange_gar", sinceVersion: 1, name: "Orange (garnish)", category: "Garnish", baseUnit: "each", unitNoun: "orange", purchaseUnit: "each", purchaseQty: 88, purchaseCost: 44,
        onHand: { loc_commissary: 88, loc_porchbar: 20, loc_duchess_bar: 20, loc_duchess_upper: 15, loc_belle_bar: 15, loc_clayton_bar: 12 },
        par: { loc_commissary: 88, loc_porchbar: 20, loc_duchess_bar: 20, loc_duchess_upper: 20, loc_belle_bar: 20, loc_clayton_bar: 12 } },
      { id: "bing_mint", sinceVersion: 1, name: "Fresh Mint", category: "Garnish", baseUnit: "each", unitNoun: "bunch", purchaseUnit: "each", purchaseQty: 12, purchaseCost: 21.6,
        onHand: { loc_commissary: 6, loc_porchbar: 2, loc_duchess_bar: 2, loc_belle_bar: 1, loc_clayton_bar: 1 },
        par: { loc_commissary: 9, loc_porchbar: 3, loc_duchess_bar: 3, loc_belle_bar: 2, loc_clayton_bar: 1 } },
      { id: "bing_cherry", sinceVersion: 1, name: "Cocktail Cherries", category: "Garnish", baseUnit: "each", unitNoun: "cherry", purchaseUnit: "each", purchaseQty: 380, purchaseCost: 28.5,
        onHand: { loc_commissary: 380, loc_porchbar: 100, loc_duchess_bar: 100, loc_clayton_bar: 50 },
        par: { loc_commissary: 380, loc_porchbar: 100, loc_duchess_bar: 100, loc_clayton_bar: 50 } },

      // Service
      { id: "bing_ice", sinceVersion: 1, name: "Ice", category: "Service", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 20, purchaseCost: 4.6,
        onHand: { loc_commissary: 1600, loc_porchbar: 640, loc_duchess_bar: 640, loc_duchess_upper: 320, loc_belle_bar: 480, loc_clayton_bar: 320 },
        par: { loc_commissary: 1600, loc_porchbar: 640, loc_duchess_bar: 640, loc_duchess_upper: 320, loc_belle_bar: 640, loc_clayton_bar: 320 } },
      { id: "bing_straw", sinceVersion: 1, name: "Paper Straw", category: "Service", baseUnit: "each", unitNoun: "straw", purchaseUnit: "each", purchaseQty: 500, purchaseCost: 18.5,
        onHand: { loc_commissary: 1000, loc_porchbar: 250, loc_duchess_bar: 250, loc_duchess_upper: 250, loc_belle_bar: 250, loc_clayton_bar: 125 },
        par: { loc_commissary: 1000, loc_porchbar: 250, loc_duchess_bar: 250, loc_duchess_upper: 250, loc_belle_bar: 250, loc_clayton_bar: 125 } },
      { id: "bing_cocktail_napkin", sinceVersion: 1, name: "Cocktail Napkin", category: "Service", baseUnit: "each", unitNoun: "napkin", purchaseUnit: "each", purchaseQty: 4000, purchaseCost: 33.6,
        onHand: { loc_commissary: 4000, loc_porchbar: 800, loc_duchess_bar: 800, loc_duchess_upper: 600, loc_belle_bar: 800, loc_clayton_bar: 400 },
        par: { loc_commissary: 4000, loc_porchbar: 1000, loc_duchess_bar: 1000, loc_duchess_upper: 800, loc_belle_bar: 1000, loc_clayton_bar: 400 } },

      // Prep inputs — raw goods that only exist to become house preps.
      { id: "bing_sugar", sinceVersion: 1, name: "Granulated Sugar", category: "Mixer", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 50, purchaseCost: 42.5,
        onHand: { loc_commissary: 400 }, par: { loc_commissary: 320 } },
      { id: "bing_ginger", sinceVersion: 1, name: "Fresh Ginger", category: "Mixer", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 5, purchaseCost: 16.25,
        onHand: { loc_commissary: 48 }, par: { loc_commissary: 64 } },
      { id: "bing_maple", sinceVersion: 1, name: "Maple Syrup (Grade A)", category: "Mixer", baseUnit: "floz", purchaseUnit: "gal", purchaseQty: 1, purchaseCost: 68.5,
        onHand: { loc_commissary: 128 }, par: { loc_commissary: 128 } },
      { id: "bing_blueberry", sinceVersion: 1, name: "Blueberries", category: "Mixer", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 10, purchaseCost: 38.5,
        onHand: { loc_commissary: 32 }, par: { loc_commissary: 48 } },
      { id: "bing_cider_vinegar", sinceVersion: 1, name: "Cider Vinegar", category: "Mixer", baseUnit: "floz", purchaseUnit: "gal", purchaseQty: 1, purchaseCost: 12.4,
        onHand: { loc_commissary: 128 }, par: { loc_commissary: 128 } },
    ];
  }

  // ---- House preps ----
  // Batched at the commissary, bottled, and sent out. `onHand` counts bottles
  // of finished prep wherever they are; the raw ingredients behind a batch
  // only exist at the commissary, which is exactly why a bar afloat that runs
  // a bottle dry is 86'd until a runner reaches it.
  function seedPreps() {
    const g = BarCalc.uid;
    return [
      {
        id: "bprep_simple", sinceVersion: 1, name: "Simple Syrup", category: "House Prep",
        baseUnit: "floz", yieldQty: 96, batchNote: "2 qt water, 4 lb sugar, cold process. Holds a month.",
        onHand: { loc_commissary: 192, loc_porchbar: 48, loc_duchess_bar: 48, loc_belle_bar: 32, loc_clayton_bar: 32 },
        par: { loc_commissary: 192, loc_porchbar: 48, loc_duchess_bar: 48, loc_belle_bar: 32, loc_clayton_bar: 32 },
        components: [
          { id: g("pc"), ingredientId: "bing_sugar", qty: 64 },
        ],
      },
      {
        id: "bprep_maple_ginger", sinceVersion: 1, name: "Maple-Ginger Syrup", category: "House Prep",
        baseUnit: "floz", yieldQty: 64, batchNote: "Steep ginger in hot maple and water, strain. Two weeks.",
        onHand: { loc_commissary: 64, loc_porchbar: 32, loc_duchess_bar: 16, loc_duchess_upper: 16, loc_belle_bar: 16, loc_clayton_bar: 16 },
        par: { loc_commissary: 128, loc_porchbar: 32, loc_duchess_bar: 32, loc_duchess_upper: 16, loc_belle_bar: 32, loc_clayton_bar: 16 },
        components: [
          { id: g("pc"), ingredientId: "bing_maple", qty: 32 },
          { id: g("pc"), ingredientId: "bing_ginger", qty: 8 },
          { id: g("pc"), ingredientId: "bing_sugar", qty: 8 },
        ],
      },
      {
        id: "bprep_blueberry_shrub", sinceVersion: 1, name: "Blueberry Shrub", category: "House Prep",
        baseUnit: "floz", yieldQty: 48, batchNote: "Macerate berries in sugar overnight, add vinegar, strain.",
        onHand: { loc_commissary: 48, loc_porchbar: 24, loc_duchess_bar: 24, loc_belle_bar: 16 },
        par: { loc_commissary: 96, loc_porchbar: 24, loc_duchess_bar: 24, loc_belle_bar: 24 },
        components: [
          { id: g("pc"), ingredientId: "bing_blueberry", qty: 24 },
          { id: g("pc"), ingredientId: "bing_sugar", qty: 16 },
          { id: g("pc"), ingredientId: "bing_cider_vinegar", qty: 12 },
        ],
      },
      {
        id: "bprep_river_punch", sinceVersion: 1, name: "River Punch Base", category: "House Prep",
        baseUnit: "floz", yieldQty: 128, batchNote: "Rum, cranberry, citrus and shrub, batched by the gallon for tours.",
        onHand: { loc_commissary: 128, loc_duchess_upper: 128, loc_belle_bar: 64 },
        par: { loc_commissary: 256, loc_duchess_upper: 128, loc_belle_bar: 128 },
        components: [
          { id: g("pc"), ingredientId: "bing_rum", qty: 40 },
          { id: g("pc"), ingredientId: "bing_cranberry", qty: 48 },
          { id: g("pc"), ingredientId: "bing_lime_juice", qty: 12 },
          { id: g("pc"), ingredientId: "bing_orange_juice", qty: 16 },
          { id: g("pc"), ingredientId: "bprep_simple", qty: 12 },
        ],
      },
    ];
  }

  // ---- Glassware ----
  // Boats run unbreakable tumblers on the open decks; the enclosed main deck
  // and the porch use real glass.
  function seedGlassware() {
    return [
      { id: "bglass_rocks", sinceVersion: 1, name: "Rocks Glass", volumeOz: 10.5, defaultIceOz: 6, straw: false, note: "Main bar and porch only." },
      { id: "bglass_highball", sinceVersion: 1, name: "Highball", volumeOz: 12, defaultIceOz: 7, straw: true, note: "Main bar and porch only." },
      { id: "bglass_tumbler", sinceVersion: 1, name: "Unbreakable Tumbler", volumeOz: 12, defaultIceOz: 6, straw: true, note: "Every open deck. Nothing glass goes topside." },
      { id: "bglass_wine", sinceVersion: 1, name: "Wine Glass", volumeOz: 12, defaultIceOz: 0, straw: false, note: "" },
      { id: "bglass_flute", sinceVersion: 1, name: "Flute", volumeOz: 6, defaultIceOz: 0, straw: false, note: "" },
      { id: "bglass_pint", sinceVersion: 1, name: "Pint Glass", volumeOz: 16, defaultIceOz: 0, straw: false, note: "Draft only, main bar and porch." },
    ];
  }

  // ---- Drinks ----
  function seedRecipes() {
    const g = BarCalc.uid;
    return [
      {
        id: "brec_islands_gt", sinceVersion: 1, name: "Thousand Islands G&T", category: "Cocktail",
        glasswareId: "bglass_highball", menuPrice: 14, targetPourCostPct: 20, servingsPerWeek: 210,
        notes: "Gin, tonic, a long lemon peel. The porch's number one.",
        components: [
          { id: g("c"), ingredientId: "bing_gin", qty: 2 },
          { id: g("c"), ingredientId: "bing_tonic", qty: 4 },
          { id: g("c"), ingredientId: "bing_lemon_gar", qty: 0.15 },
          { id: g("c"), ingredientId: "bing_ice", qty: 7 },
          { id: g("c"), ingredientId: "bing_straw", qty: 1 },
          { id: g("c"), ingredientId: "bing_cocktail_napkin", qty: 1 },
        ],
      },
      {
        id: "brec_river_mule", sinceVersion: 1, name: "River Mule", category: "Cocktail",
        glasswareId: "bglass_tumbler", menuPrice: 15, targetPourCostPct: 20, servingsPerWeek: 180,
        notes: "Vodka, maple-ginger syrup, ginger beer, lime. Runs on every boat.",
        components: [
          { id: g("c"), ingredientId: "bing_vodka", qty: 2 },
          { id: g("c"), ingredientId: "bprep_maple_ginger", qty: 0.5 },
          { id: g("c"), ingredientId: "bing_ginger_beer", qty: 4 },
          { id: g("c"), ingredientId: "bing_lime_juice", qty: 0.5 },
          { id: g("c"), ingredientId: "bing_lime", qty: 0.12 },
          { id: g("c"), ingredientId: "bing_ice", qty: 6 },
          { id: g("c"), ingredientId: "bing_straw", qty: 1 },
          { id: g("c"), ingredientId: "bing_cocktail_napkin", qty: 1 },
        ],
      },
      {
        id: "brec_sunset_spritz", sinceVersion: 1, name: "Sunset Spritz", category: "Cocktail",
        glasswareId: "bglass_wine", menuPrice: 14, targetPourCostPct: 22, servingsPerWeek: 165,
        notes: "Aperitivo, prosecco, soda, orange. The upper deck pours nothing else at sunset.",
        components: [
          { id: g("c"), ingredientId: "bing_aperitivo", qty: 2 },
          { id: g("c"), ingredientId: "bing_prosecco", qty: 3 },
          { id: g("c"), ingredientId: "bing_soda", qty: 1 },
          { id: g("c"), ingredientId: "bing_orange_gar", qty: 0.12 },
          { id: g("c"), ingredientId: "bing_ice", qty: 5 },
          { id: g("c"), ingredientId: "bing_cocktail_napkin", qty: 1 },
        ],
      },
      {
        id: "brec_old_fort", sinceVersion: 1, name: "Old Fort Old Fashioned", category: "Cocktail",
        glasswareId: "bglass_rocks", menuPrice: 17, targetPourCostPct: 22, servingsPerWeek: 96,
        notes: "Bourbon, maple-ginger, orange, cherry. Main deck and porch only — it needs a real rocks glass.",
        components: [
          { id: g("c"), ingredientId: "bing_bourbon", qty: 2 },
          { id: g("c"), ingredientId: "bprep_maple_ginger", qty: 0.33 },
          { id: g("c"), ingredientId: "bing_orange_gar", qty: 0.12 },
          { id: g("c"), ingredientId: "bing_cherry", qty: 1 },
          { id: g("c"), ingredientId: "bing_ice", qty: 6 },
          { id: g("c"), ingredientId: "bing_cocktail_napkin", qty: 1 },
        ],
      },
      {
        id: "brec_boldt_lemonade", sinceVersion: 1, name: "Boldt Castle Lemonade", category: "Cocktail",
        glasswareId: "bglass_tumbler", menuPrice: 14, targetPourCostPct: 20, servingsPerWeek: 150,
        notes: "Vodka, lemon, simple, soda, mint. The afternoon tour's default.",
        components: [
          { id: g("c"), ingredientId: "bing_vodka", qty: 2 },
          { id: g("c"), ingredientId: "bing_lemon_juice", qty: 1 },
          { id: g("c"), ingredientId: "bprep_simple", qty: 0.75 },
          { id: g("c"), ingredientId: "bing_soda", qty: 3 },
          { id: g("c"), ingredientId: "bing_mint", qty: 0.05 },
          { id: g("c"), ingredientId: "bing_ice", qty: 6 },
          { id: g("c"), ingredientId: "bing_straw", qty: 1 },
          { id: g("c"), ingredientId: "bing_cocktail_napkin", qty: 1 },
        ],
      },
      {
        id: "brec_skiff_punch", sinceVersion: 1, name: "Skiff Punch", category: "Batched",
        glasswareId: "bglass_tumbler", menuPrice: 12, targetPourCostPct: 18, servingsPerWeek: 280,
        notes: "Poured from the batch. The only cocktail the upper deck can run at volume.",
        components: [
          { id: g("c"), ingredientId: "bprep_river_punch", qty: 4 },
          { id: g("c"), ingredientId: "bing_soda", qty: 1 },
          { id: g("c"), ingredientId: "bing_lime", qty: 0.1 },
          { id: g("c"), ingredientId: "bing_ice", qty: 6 },
          { id: g("c"), ingredientId: "bing_straw", qty: 1 },
          { id: g("c"), ingredientId: "bing_cocktail_napkin", qty: 1 },
        ],
      },
      {
        id: "brec_margarita", sinceVersion: 1, name: "Dockside Margarita", category: "Cocktail",
        glasswareId: "bglass_tumbler", menuPrice: 15, targetPourCostPct: 21, servingsPerWeek: 110,
        notes: "Tequila, triple sec, lime, simple. Porch and main deck.",
        components: [
          { id: g("c"), ingredientId: "bing_tequila", qty: 2 },
          { id: g("c"), ingredientId: "bing_triple_sec", qty: 0.75 },
          { id: g("c"), ingredientId: "bing_lime_juice", qty: 1 },
          { id: g("c"), ingredientId: "bprep_simple", qty: 0.25 },
          { id: g("c"), ingredientId: "bing_lime", qty: 0.12 },
          { id: g("c"), ingredientId: "bing_ice", qty: 6 },
          { id: g("c"), ingredientId: "bing_cocktail_napkin", qty: 1 },
        ],
      },
      {
        id: "brec_shrub_soda", sinceVersion: 1, name: "Blueberry Shrub Soda (NA)", category: "Non-Alcoholic",
        glasswareId: "bglass_tumbler", menuPrice: 7, targetPourCostPct: 18, servingsPerWeek: 120,
        notes: "The non-alcoholic option that isn't a soda gun. Sells better than anyone expected.",
        components: [
          { id: g("c"), ingredientId: "bprep_blueberry_shrub", qty: 1.5 },
          { id: g("c"), ingredientId: "bing_soda", qty: 6 },
          { id: g("c"), ingredientId: "bing_lemon_gar", qty: 0.12 },
          { id: g("c"), ingredientId: "bing_ice", qty: 6 },
          { id: g("c"), ingredientId: "bing_straw", qty: 1 },
          { id: g("c"), ingredientId: "bing_cocktail_napkin", qty: 1 },
        ],
      },
      {
        id: "brec_draft_lager", sinceVersion: 1, name: "Local Lager (draft pint)", category: "Beer",
        glasswareId: "bglass_pint", menuPrice: 9, targetPourCostPct: 22, servingsPerWeek: 320,
        notes: "Porch and main deck only — the other bars have no draft.",
        components: [
          { id: g("c"), ingredientId: "bing_lager_keg", qty: 16 },
          { id: g("c"), ingredientId: "bing_cocktail_napkin", qty: 1 },
        ],
      },
      {
        id: "brec_can_ipa", sinceVersion: 1, name: "IPA (can)", category: "Beer",
        glasswareId: "bglass_tumbler", menuPrice: 8, targetPourCostPct: 25, servingsPerWeek: 260,
        notes: "Served in the can with a tumbler. Every bar carries it.",
        components: [
          { id: g("c"), ingredientId: "bing_ipa_can", qty: 1 },
          { id: g("c"), ingredientId: "bing_cocktail_napkin", qty: 1 },
        ],
      },
      {
        id: "brec_can_light", sinceVersion: 1, name: "Light Lager (can)", category: "Beer",
        glasswareId: "bglass_tumbler", menuPrice: 7, targetPourCostPct: 18, servingsPerWeek: 380,
        notes: "The volume seller on both tour boats.",
        components: [
          { id: g("c"), ingredientId: "bing_light_can", qty: 1 },
          { id: g("c"), ingredientId: "bing_cocktail_napkin", qty: 1 },
        ],
      },
      {
        id: "brec_glass_chard", sinceVersion: 1, name: "Chardonnay (glass)", category: "Wine",
        glasswareId: "bglass_wine", menuPrice: 11, targetPourCostPct: 22, servingsPerWeek: 240,
        notes: "6 oz pour, five to the bottle with a little grace.",
        components: [
          { id: g("c"), ingredientId: "bing_chardonnay", qty: 6 },
          { id: g("c"), ingredientId: "bing_cocktail_napkin", qty: 1 },
        ],
      },
      {
        id: "brec_glass_rose", sinceVersion: 1, name: "Rosé (glass)", category: "Wine",
        glasswareId: "bglass_wine", menuPrice: 12, targetPourCostPct: 22, servingsPerWeek: 200,
        notes: "Outsells both other wines from June through August.",
        components: [
          { id: g("c"), ingredientId: "bing_rose", qty: 6 },
          { id: g("c"), ingredientId: "bing_cocktail_napkin", qty: 1 },
        ],
      },
      {
        id: "brec_glass_cab", sinceVersion: 1, name: "Cabernet (glass)", category: "Wine",
        glasswareId: "bglass_wine", menuPrice: 12, targetPourCostPct: 22, servingsPerWeek: 150,
        notes: "Dinner cruise pour.",
        components: [
          { id: g("c"), ingredientId: "bing_cabernet", qty: 6 },
          { id: g("c"), ingredientId: "bing_cocktail_napkin", qty: 1 },
        ],
      },
      {
        id: "brec_prosecco_flute", sinceVersion: 1, name: "Prosecco (flute)", category: "Wine",
        glasswareId: "bglass_flute", menuPrice: 12, targetPourCostPct: 20, servingsPerWeek: 180,
        notes: "Welcome pour on every charter, so it moves whether anyone orders it or not.",
        components: [
          { id: g("c"), ingredientId: "bing_prosecco", qty: 5 },
          { id: g("c"), ingredientId: "bing_cocktail_napkin", qty: 1 },
        ],
      },
    ];
  }

  function defaultState() {
    return {
      ingredients: seedIngredients(),
      preps: seedPreps(),
      glassware: seedGlassware(),
      recipes: seedRecipes(),
      settings: {
        defaultTargetPourCostPct: 20,
        drinksPerGuest: 2.4,
      },
      seedVersion: SEED_VERSION,
    };
  }

  function applySeedUpdates(s) {
    const from = s.seedVersion || 1;
    if (from >= SEED_VERSION) return s;
    const mergeNew = (list, seeds) => {
      const have = new Set(list.map((x) => x.id));
      seeds.forEach((item) => {
        if (item.sinceVersion > from && !have.has(item.id)) list.push(item);
      });
    };
    mergeNew(s.ingredients, seedIngredients());
    mergeNew(s.preps, seedPreps());
    mergeNew(s.glassware, seedGlassware());
    mergeNew(s.recipes, seedRecipes());
    s.seedVersion = SEED_VERSION;
    save(s);
    return s;
  }

  function asQtyMap(v) {
    if (v && typeof v === "object" && !Array.isArray(v)) return v;
    return {};
  }

  function normalize(s) {
    s.settings = s.settings || {};
    if (s.settings.defaultTargetPourCostPct == null) s.settings.defaultTargetPourCostPct = 20;
    if (s.settings.drinksPerGuest == null) s.settings.drinksPerGuest = 2.4;
    s.preps = s.preps || [];
    s.glassware = s.glassware || [];

    s.ingredients.forEach((i) => {
      i.onHand = asQtyMap(i.onHand);
      i.par = asQtyMap(i.par);
    });
    s.preps.forEach((p) => {
      p.onHand = asQtyMap(p.onHand);
      p.par = asQtyMap(p.par);
      p.components = p.components || [];
      if (!p.yieldQty) p.yieldQty = 1;
    });
    s.recipes.forEach((r) => {
      if (r.targetPourCostPct == null) r.targetPourCostPct = s.settings.defaultTargetPourCostPct;
      if (r.servingsPerWeek == null) r.servingsPerWeek = 0;
      r.components = r.components || [];
    });
    return s;
  }

  function isValid(p) {
    return !!(p && Array.isArray(p.ingredients) && Array.isArray(p.recipes));
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!isValid(parsed)) return defaultState();
      return normalize(applySeedUpdates(parsed));
    } catch (e) {
      console.warn("Bar data failed to load; using defaults.", e);
      return defaultState();
    }
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Could not save bar data.", e);
    }
  }

  function resetToDefaults() {
    const s = defaultState();
    save(s);
    return s;
  }

  return { load, save, resetToDefaults, defaultState, normalize, isValid, KEY, CATEGORIES };
})();
