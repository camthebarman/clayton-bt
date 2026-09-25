/* catering/storage.js — state shape, persistence and seed data for catering.

   Every on-hand and par figure is a map of locationId -> quantity in the
   item's BASE unit (oz, fl oz, each). A location that doesn't stock an item
   simply has no key. The keys come from fleet/storage.js.

   Prices below are plausible foodservice figures, not quoted invoices — they
   are a starting point so the app has something to show, and every one of
   them is meant to be overwritten with what this operation actually pays.

   Seed items carry fixed ids and a `sinceVersion` tag, so items added in a
   later version merge into saved data without clobbering anyone's edits. */

const CateringStorage = (function () {
  const KEY = "ctb.catering.v1";
  const SEED_VERSION = 1;

  const MENUS = ["B&B Breakfast", "Boxed Lunch", "Passed Bites", "Dinner Cruise", "Dessert"];

  const CATEGORIES = [
    "Protein", "Produce", "Dairy", "Bakery", "Dry Goods",
    "Pantry", "Spice", "Packaging",
  ];

  // ---- Ingredients ----
  function seedIngredients() {
    return [
      // Protein
      { id: "cing_chicken_breast", sinceVersion: 1, name: "Chicken Breast", category: "Protein", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 10, purchaseCost: 46.9, yieldPct: 95,
        onHand: { loc_commissary: 480, loc_kitchen: 160 }, par: { loc_commissary: 320, loc_kitchen: 96 } },
      { id: "cing_turkey_breast", sinceVersion: 1, name: "Sliced Roast Turkey", category: "Protein", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 9, purchaseCost: 67.5, yieldPct: 100,
        onHand: { loc_commissary: 144, loc_kitchen: 72 }, par: { loc_commissary: 144, loc_kitchen: 48 } },
      { id: "cing_salmon_side", sinceVersion: 1, name: "Salmon Side (skin on)", category: "Protein", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 10, purchaseCost: 124.5, yieldPct: 86,
        onHand: { loc_commissary: 160, loc_kitchen: 48 }, par: { loc_commissary: 192, loc_kitchen: 48 } },
      { id: "cing_smoked_salmon", sinceVersion: 1, name: "Cold-Smoked Salmon", category: "Protein", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 3, purchaseCost: 62.4, yieldPct: 100,
        onHand: { loc_commissary: 32, loc_kitchen: 16 }, par: { loc_commissary: 48, loc_kitchen: 16 } },
      { id: "cing_shrimp", sinceVersion: 1, name: "Cooked Shrimp 21/25", category: "Protein", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 5, purchaseCost: 63.75, yieldPct: 100,
        onHand: { loc_commissary: 80, loc_kitchen: 32 }, par: { loc_commissary: 80, loc_kitchen: 32 } },
      { id: "cing_scallop", sinceVersion: 1, name: "Sea Scallops 20/30", category: "Protein", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 5, purchaseCost: 118.5, yieldPct: 96,
        onHand: { loc_commissary: 40 }, par: { loc_commissary: 80 } },
      { id: "cing_bacon", sinceVersion: 1, name: "Applewood Bacon", category: "Protein", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 15, purchaseCost: 81.75, yieldPct: 72,
        onHand: { loc_commissary: 192, loc_kitchen: 64 }, par: { loc_commissary: 160, loc_kitchen: 48 } },

      // Produce
      { id: "cing_spring_mix", sinceVersion: 1, name: "Spring Mix", category: "Produce", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 3, purchaseCost: 12.9, yieldPct: 95,
        onHand: { loc_commissary: 48, loc_kitchen: 24 }, par: { loc_commissary: 96, loc_kitchen: 32 } },
      { id: "cing_grape_tomato", sinceVersion: 1, name: "Grape Tomatoes", category: "Produce", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 10, purchaseCost: 26.5, yieldPct: 98,
        onHand: { loc_commissary: 80, loc_kitchen: 32 }, par: { loc_commissary: 80, loc_kitchen: 24 } },
      { id: "cing_red_onion", sinceVersion: 1, name: "Red Onion", category: "Produce", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 25, purchaseCost: 21.75, yieldPct: 85,
        onHand: { loc_commissary: 160, loc_kitchen: 48 }, par: { loc_commissary: 120, loc_kitchen: 32 } },
      { id: "cing_celery", sinceVersion: 1, name: "Celery", category: "Produce", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 25, purchaseCost: 24.5, yieldPct: 75,
        onHand: { loc_commissary: 120, loc_kitchen: 40 }, par: { loc_commissary: 100, loc_kitchen: 32 } },
      { id: "cing_green_beans", sinceVersion: 1, name: "Haricots Verts", category: "Produce", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 10, purchaseCost: 34.9, yieldPct: 88,
        onHand: { loc_commissary: 64, loc_kitchen: 32 }, par: { loc_commissary: 96, loc_kitchen: 32 } },
      { id: "cing_cucumber", sinceVersion: 1, name: "Cucumber", category: "Produce", baseUnit: "each", unitNoun: "cucumber", purchaseUnit: "each", purchaseQty: 24, purchaseCost: 21.6, yieldPct: 90,
        onHand: { loc_commissary: 18, loc_kitchen: 8 }, par: { loc_commissary: 24, loc_kitchen: 6 } },
      { id: "cing_lemon", sinceVersion: 1, name: "Lemon", category: "Produce", baseUnit: "each", unitNoun: "lemon", purchaseUnit: "each", purchaseQty: 140, purchaseCost: 58.8, yieldPct: 100,
        onHand: { loc_commissary: 84, loc_kitchen: 24 }, par: { loc_commissary: 70, loc_kitchen: 18 } },
      { id: "cing_apple", sinceVersion: 1, name: "Apple (local)", category: "Produce", baseUnit: "each", unitNoun: "apple", purchaseUnit: "each", purchaseQty: 88, purchaseCost: 46.2, yieldPct: 88,
        onHand: { loc_commissary: 132, loc_kitchen: 24, loc_belle_galley: 18 }, par: { loc_commissary: 88, loc_kitchen: 24 } },
      { id: "cing_grapes", sinceVersion: 1, name: "Red Grapes", category: "Produce", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 18, purchaseCost: 44.1, yieldPct: 94,
        onHand: { loc_commissary: 96, loc_kitchen: 32 }, par: { loc_commissary: 96, loc_kitchen: 24 } },
      { id: "cing_blueberry", sinceVersion: 1, name: "Blueberries", category: "Produce", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 10, purchaseCost: 38.5, yieldPct: 98,
        onHand: { loc_commissary: 48, loc_kitchen: 16 }, par: { loc_commissary: 64, loc_kitchen: 16 } },
      { id: "cing_dill", sinceVersion: 1, name: "Fresh Dill", category: "Produce", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 1, purchaseCost: 14.5, yieldPct: 65,
        onHand: { loc_commissary: 4, loc_kitchen: 3 }, par: { loc_commissary: 8, loc_kitchen: 4 } },
      { id: "cing_scallion", sinceVersion: 1, name: "Scallions", category: "Produce", baseUnit: "each", unitNoun: "bunch", purchaseUnit: "each", purchaseQty: 48, purchaseCost: 28.8, yieldPct: 80,
        onHand: { loc_commissary: 16, loc_kitchen: 8 }, par: { loc_commissary: 24, loc_kitchen: 8 } },

      // Dairy
      { id: "cing_butter", sinceVersion: 1, name: "Unsalted Butter", category: "Dairy", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 36, purchaseCost: 121.5, yieldPct: 100,
        onHand: { loc_commissary: 288, loc_kitchen: 96 }, par: { loc_commissary: 192, loc_kitchen: 64 } },
      { id: "cing_heavy_cream", sinceVersion: 1, name: "Heavy Cream", category: "Dairy", baseUnit: "floz", purchaseUnit: "qt", purchaseQty: 12, purchaseCost: 76.9, yieldPct: 100,
        onHand: { loc_commissary: 256, loc_kitchen: 96 }, par: { loc_commissary: 192, loc_kitchen: 64 } },
      { id: "cing_whole_milk", sinceVersion: 1, name: "Whole Milk", category: "Dairy", baseUnit: "floz", purchaseUnit: "gal", purchaseQty: 4, purchaseCost: 24.6, yieldPct: 100,
        onHand: { loc_commissary: 384, loc_kitchen: 128 }, par: { loc_commissary: 256, loc_kitchen: 128 } },
      { id: "cing_egg", sinceVersion: 1, name: "Large Egg", category: "Dairy", baseUnit: "each", unitNoun: "egg", purchaseUnit: "dozen", purchaseQty: 15, purchaseCost: 37.5, yieldPct: 100,
        onHand: { loc_commissary: 270, loc_kitchen: 90 }, par: { loc_commissary: 180, loc_kitchen: 60 } },
      { id: "cing_cheddar", sinceVersion: 1, name: "Sharp Cheddar", category: "Dairy", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 10, purchaseCost: 56.9, yieldPct: 100,
        onHand: { loc_commissary: 112, loc_kitchen: 48 }, par: { loc_commissary: 96, loc_kitchen: 32 } },
      { id: "cing_gruyere", sinceVersion: 1, name: "Gruyère", category: "Dairy", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 5, purchaseCost: 71.25, yieldPct: 96,
        onHand: { loc_commissary: 32, loc_kitchen: 16 }, par: { loc_commissary: 48, loc_kitchen: 16 } },
      { id: "cing_mozzarella", sinceVersion: 1, name: "Fresh Mozzarella Pearls", category: "Dairy", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 6, purchaseCost: 35.4, yieldPct: 100,
        onHand: { loc_commissary: 48, loc_kitchen: 24 }, par: { loc_commissary: 48, loc_kitchen: 16 } },
      { id: "cing_brie", sinceVersion: 1, name: "Double-Cream Brie", category: "Dairy", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 4.4, purchaseCost: 48.4, yieldPct: 96,
        onHand: { loc_commissary: 35, loc_kitchen: 18 }, par: { loc_commissary: 52, loc_kitchen: 18 } },
      { id: "cing_cream_cheese", sinceVersion: 1, name: "Cream Cheese", category: "Dairy", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 18, purchaseCost: 92.7, yieldPct: 100,
        onHand: { loc_commissary: 144, loc_kitchen: 48 }, par: { loc_commissary: 96, loc_kitchen: 32 } },
      { id: "cing_parmesan", sinceVersion: 1, name: "Parmesan", category: "Dairy", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 5, purchaseCost: 44.5, yieldPct: 92,
        onHand: { loc_commissary: 40, loc_kitchen: 16 }, par: { loc_commissary: 48, loc_kitchen: 16 } },

      // Bakery
      { id: "cing_croissant", sinceVersion: 1, name: "Butter Croissant", category: "Bakery", baseUnit: "each", unitNoun: "croissant", purchaseUnit: "each", purchaseQty: 48, purchaseCost: 41.75, yieldPct: 100,
        onHand: { loc_commissary: 96, loc_kitchen: 36 }, par: { loc_commissary: 96, loc_kitchen: 24 } },
      { id: "cing_tortilla", sinceVersion: 1, name: 'Flour Tortilla (12")', category: "Bakery", baseUnit: "each", unitNoun: "tortilla", purchaseUnit: "each", purchaseQty: 72, purchaseCost: 35.2, yieldPct: 100,
        onHand: { loc_commissary: 144, loc_kitchen: 48 }, par: { loc_commissary: 144, loc_kitchen: 36 } },
      { id: "cing_dinner_roll", sinceVersion: 1, name: "Parker House Roll", category: "Bakery", baseUnit: "each", unitNoun: "roll", purchaseUnit: "each", purchaseQty: 120, purchaseCost: 39.6, yieldPct: 100,
        onHand: { loc_commissary: 240, loc_kitchen: 60, loc_duchess_galley: 48 }, par: { loc_commissary: 240, loc_kitchen: 60, loc_duchess_galley: 60 } },
      { id: "cing_brioche_loaf", sinceVersion: 1, name: "Brioche Loaf", category: "Bakery", baseUnit: "each", unitNoun: "loaf", purchaseUnit: "each", purchaseQty: 8, purchaseCost: 31.6, yieldPct: 100,
        onHand: { loc_commissary: 10, loc_kitchen: 4 }, par: { loc_commissary: 12, loc_kitchen: 4 } },
      { id: "cing_blini", sinceVersion: 1, name: "Buckwheat Blini", category: "Bakery", baseUnit: "each", unitNoun: "blini", purchaseUnit: "each", purchaseQty: 120, purchaseCost: 33.6, yieldPct: 100,
        onHand: { loc_commissary: 180, loc_kitchen: 60 }, par: { loc_commissary: 240, loc_kitchen: 60 } },

      // Dry goods
      { id: "cing_orzo", sinceVersion: 1, name: "Orzo (dry)", category: "Dry Goods", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 20, purchaseCost: 26.4, yieldPct: 100,
        onHand: { loc_commissary: 240, loc_kitchen: 64 }, par: { loc_commissary: 160, loc_kitchen: 48 } },
      { id: "cing_wild_rice", sinceVersion: 1, name: "Wild Rice Blend (dry)", category: "Dry Goods", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 25, purchaseCost: 78.75, yieldPct: 100,
        onHand: { loc_commissary: 200, loc_kitchen: 48 }, par: { loc_commissary: 160, loc_kitchen: 48 } },
      { id: "cing_farro", sinceVersion: 1, name: "Pearled Farro (dry)", category: "Dry Goods", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 10, purchaseCost: 31.9, yieldPct: 100,
        onHand: { loc_commissary: 80, loc_kitchen: 32 }, par: { loc_commissary: 96, loc_kitchen: 32 } },
      { id: "cing_ap_flour", sinceVersion: 1, name: "All-Purpose Flour", category: "Dry Goods", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 50, purchaseCost: 30.5, yieldPct: 100,
        onHand: { loc_commissary: 400, loc_kitchen: 160 }, par: { loc_commissary: 320, loc_kitchen: 96 } },
      { id: "cing_sugar", sinceVersion: 1, name: "Granulated Sugar", category: "Dry Goods", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 50, purchaseCost: 42.5, yieldPct: 100,
        onHand: { loc_commissary: 400, loc_kitchen: 128 }, par: { loc_commissary: 320, loc_kitchen: 96 } },
      { id: "cing_almonds", sinceVersion: 1, name: "Sliced Almonds", category: "Dry Goods", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 5, purchaseCost: 41.25, yieldPct: 100,
        onHand: { loc_commissary: 32, loc_kitchen: 16 }, par: { loc_commissary: 48, loc_kitchen: 16 } },
      { id: "cing_dark_chocolate", sinceVersion: 1, name: "Dark Chocolate 62%", category: "Dry Goods", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 11, purchaseCost: 96.8, yieldPct: 100,
        onHand: { loc_commissary: 88, loc_kitchen: 32 }, par: { loc_commissary: 88, loc_kitchen: 32 } },
      { id: "cing_oats", sinceVersion: 1, name: "Rolled Oats", category: "Dry Goods", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 25, purchaseCost: 33.75, yieldPct: 100,
        onHand: { loc_commissary: 200, loc_kitchen: 48 }, par: { loc_commissary: 160, loc_kitchen: 48 } },

      // Pantry
      { id: "cing_mayo", sinceVersion: 1, name: "Mayonnaise", category: "Pantry", baseUnit: "floz", purchaseUnit: "gal", purchaseQty: 4, purchaseCost: 99.6, yieldPct: 100,
        onHand: { loc_commissary: 384, loc_kitchen: 128 }, par: { loc_commissary: 256, loc_kitchen: 96 } },
      { id: "cing_olive_oil", sinceVersion: 1, name: "Olive Oil", category: "Pantry", baseUnit: "floz", purchaseUnit: "liter", purchaseQty: 12, purchaseCost: 108.5, yieldPct: 100,
        onHand: { loc_commissary: 270, loc_kitchen: 101 }, par: { loc_commissary: 203, loc_kitchen: 68 } },
      { id: "cing_maple_syrup", sinceVersion: 1, name: "Maple Syrup (Grade A)", category: "Pantry", baseUnit: "floz", purchaseUnit: "gal", purchaseQty: 1, purchaseCost: 68.5, yieldPct: 100,
        onHand: { loc_commissary: 128, loc_kitchen: 64 }, par: { loc_commissary: 128, loc_kitchen: 32 } },
      { id: "cing_dijon", sinceVersion: 1, name: "Dijon Mustard", category: "Pantry", baseUnit: "floz", purchaseUnit: "gal", purchaseQty: 1, purchaseCost: 21.9, yieldPct: 100,
        onHand: { loc_commissary: 128, loc_kitchen: 32 }, par: { loc_commissary: 96, loc_kitchen: 32 } },
      { id: "cing_balsamic", sinceVersion: 1, name: "Balsamic Vinegar", category: "Pantry", baseUnit: "floz", purchaseUnit: "liter", purchaseQty: 4, purchaseCost: 39.8, yieldPct: 100,
        onHand: { loc_commissary: 101, loc_kitchen: 34 }, par: { loc_commissary: 68, loc_kitchen: 34 } },
      { id: "cing_cocktail_sauce", sinceVersion: 1, name: "Cocktail Sauce", category: "Pantry", baseUnit: "floz", purchaseUnit: "gal", purchaseQty: 1, purchaseCost: 18.75, yieldPct: 100,
        onHand: { loc_commissary: 128, loc_kitchen: 32 }, par: { loc_commissary: 128, loc_kitchen: 32 } },
      { id: "cing_kettle_chips", sinceVersion: 1, name: "Kettle Chips (1 oz bag)", category: "Pantry", baseUnit: "each", unitNoun: "bag", purchaseUnit: "each", purchaseQty: 104, purchaseCost: 48.9, yieldPct: 100,
        onHand: { loc_commissary: 208, loc_kitchen: 40, loc_belle_galley: 36, loc_clayton_galley: 12 }, par: { loc_commissary: 208, loc_kitchen: 48, loc_belle_galley: 48 } },
      { id: "cing_pickle_spear", sinceVersion: 1, name: "Pickle Spear", category: "Pantry", baseUnit: "each", unitNoun: "spear", purchaseUnit: "each", purchaseQty: 160, purchaseCost: 34.4, yieldPct: 100,
        onHand: { loc_commissary: 160, loc_kitchen: 48 }, par: { loc_commissary: 160, loc_kitchen: 48 } },

      // Spice
      { id: "cing_kosher_salt", sinceVersion: 1, name: "Kosher Salt", category: "Spice", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 50, purchaseCost: 51.5, yieldPct: 100,
        onHand: { loc_commissary: 320, loc_kitchen: 96 }, par: { loc_commissary: 240, loc_kitchen: 64 } },
      { id: "cing_black_pepper", sinceVersion: 1, name: "Ground Black Pepper", category: "Spice", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 5, purchaseCost: 32.5, yieldPct: 100,
        onHand: { loc_commissary: 48, loc_kitchen: 16 }, par: { loc_commissary: 40, loc_kitchen: 16 } },
      { id: "cing_herb_blend", sinceVersion: 1, name: "Dried Herb Blend", category: "Spice", baseUnit: "ozwt", purchaseUnit: "lb", purchaseQty: 2, purchaseCost: 26.9, yieldPct: 100,
        onHand: { loc_commissary: 16, loc_kitchen: 8 }, par: { loc_commissary: 24, loc_kitchen: 8 } },

      // Packaging — the line items that quietly wreck a catering quote, and the
      // ones most likely to be sitting on the wrong boat.
      { id: "cing_togo_box", sinceVersion: 1, name: "Boxed Lunch Carton", category: "Packaging", baseUnit: "each", unitNoun: "box", purchaseUnit: "each", purchaseQty: 200, purchaseCost: 94, yieldPct: 100,
        onHand: { loc_commissary: 400, loc_kitchen: 120, loc_belle_galley: 60, loc_duchess_galley: 40 },
        par: { loc_commissary: 400, loc_kitchen: 150, loc_belle_galley: 80, loc_duchess_galley: 40 } },
      { id: "cing_cutlery_kit", sinceVersion: 1, name: "Wrapped Cutlery Kit", category: "Packaging", baseUnit: "each", unitNoun: "kit", purchaseUnit: "each", purchaseQty: 500, purchaseCost: 24.5, yieldPct: 100,
        onHand: { loc_commissary: 1000, loc_kitchen: 250, loc_belle_galley: 120, loc_duchess_galley: 100, loc_clayton_galley: 40 },
        par: { loc_commissary: 1000, loc_kitchen: 250, loc_belle_galley: 150, loc_duchess_galley: 100, loc_clayton_galley: 50 } },
      { id: "cing_napkin", sinceVersion: 1, name: "Dinner Napkin", category: "Packaging", baseUnit: "each", unitNoun: "napkin", purchaseUnit: "each", purchaseQty: 3000, purchaseCost: 35.4, yieldPct: 100,
        onHand: { loc_commissary: 3000, loc_kitchen: 600, loc_belle_galley: 250, loc_duchess_galley: 400, loc_clayton_galley: 120 },
        par: { loc_commissary: 2400, loc_kitchen: 600, loc_belle_galley: 300, loc_duchess_galley: 400, loc_clayton_galley: 150 } },
      { id: "cing_deli_cup", sinceVersion: 1, name: "2 oz Portion Cup + Lid", category: "Packaging", baseUnit: "each", unitNoun: "cup", purchaseUnit: "each", purchaseQty: 250, purchaseCost: 21.25, yieldPct: 100,
        onHand: { loc_commissary: 500, loc_kitchen: 150, loc_belle_galley: 60 }, par: { loc_commissary: 500, loc_kitchen: 150, loc_belle_galley: 100 } },
      { id: "cing_shooter_cup", sinceVersion: 1, name: "Shrimp Shooter Glass", category: "Packaging", baseUnit: "each", unitNoun: "glass", purchaseUnit: "each", purchaseQty: 120, purchaseCost: 32.4, yieldPct: 100,
        onHand: { loc_commissary: 120, loc_clayton_galley: 36 }, par: { loc_commissary: 240, loc_clayton_galley: 48 } },
      { id: "cing_half_pan", sinceVersion: 1, name: "Aluminum Half Pan + Lid", category: "Packaging", baseUnit: "each", unitNoun: "pan", purchaseUnit: "each", purchaseQty: 100, purchaseCost: 79, yieldPct: 100,
        onHand: { loc_commissary: 150, loc_kitchen: 60 }, par: { loc_commissary: 200, loc_kitchen: 60 } },
      { id: "cing_chafing_fuel", sinceVersion: 1, name: "Chafing Fuel Can", category: "Packaging", baseUnit: "each", unitNoun: "can", purchaseUnit: "each", purchaseQty: 24, purchaseCost: 29.5, yieldPct: 100,
        onHand: { loc_commissary: 48, loc_duchess_galley: 12 }, par: { loc_commissary: 72, loc_duchess_galley: 24 } },
      { id: "cing_label", sinceVersion: 1, name: "Allergen / Date Label", category: "Packaging", baseUnit: "each", unitNoun: "label", purchaseUnit: "each", purchaseQty: 1000, purchaseCost: 26.9, yieldPct: 100,
        onHand: { loc_commissary: 1000, loc_kitchen: 400 }, par: { loc_commissary: 1000, loc_kitchen: 500 } },
    ];
  }

  // ---- Recipes ----
  // `portions` is the batch yield: component quantities are per BATCH.
  //
  // `menuPrice` and `servingsPerWeek` together are what the headline food
  // cost is weighted by. The prepAhead / hold / panNote fields are kept as
  // kitchen notes; nothing is scheduled off them any more.
  function seedRecipes() {
    const g = CateringCalc.uid;
    return [
      // ===== B&B Breakfast =====
      {
        id: "crec_french_toast", sinceVersion: 1, name: "Overnight Baked French Toast", category: "Breakfast", menu: "B&B Breakfast",
        portions: 12, menuPrice: 11, targetFoodCostPct: 24, servingsPerWeek: 84,
        prepAhead: true, hold: "chilled", shelfLifeDays: 2, panNote: "Full hotel pan, cut 12",
        notes: "Assembled the night before and baked at 7. Travels well if a cruise wants breakfast.",
        components: [
          { id: g("comp"), ingredientId: "cing_brioche_loaf", qty: 2 },
          { id: g("comp"), ingredientId: "cing_egg", qty: 10 },
          { id: g("comp"), ingredientId: "cing_whole_milk", qty: 24 },
          { id: g("comp"), ingredientId: "cing_heavy_cream", qty: 8 },
          { id: g("comp"), ingredientId: "cing_sugar", qty: 6 },
          { id: g("comp"), ingredientId: "cing_butter", qty: 4 },
          { id: g("comp"), ingredientId: "cing_maple_syrup", qty: 12 },
          { id: g("comp"), ingredientId: "cing_blueberry", qty: 8 },
        ],
      },
      {
        id: "crec_quiche", sinceVersion: 1, name: "Bacon & Gruyère Quiche", category: "Breakfast", menu: "B&B Breakfast",
        portions: 8, menuPrice: 13, targetFoodCostPct: 26, servingsPerWeek: 56,
        prepAhead: true, hold: "chilled", shelfLifeDays: 3, panNote: '10" tart shell, cut 8',
        notes: "Baked the afternoon before. Served room temp on the boat, warm at the house.",
        components: [
          { id: g("comp"), ingredientId: "cing_egg", qty: 8 },
          { id: g("comp"), ingredientId: "cing_heavy_cream", qty: 16 },
          { id: g("comp"), ingredientId: "cing_gruyere", qty: 6 },
          { id: g("comp"), ingredientId: "cing_bacon", qty: 8 },
          { id: g("comp"), ingredientId: "cing_ap_flour", qty: 9 },
          { id: g("comp"), ingredientId: "cing_butter", qty: 6 },
          { id: g("comp"), ingredientId: "cing_scallion", qty: 0.5 },
          { id: g("comp"), ingredientId: "cing_kosher_salt", qty: 0.3 },
        ],
      },

      // ===== Boxed Lunch — the preplanned lunch program =====
      {
        id: "crec_chicken_salad", sinceVersion: 1, name: "Chicken Salad Croissant", category: "Sandwich", menu: "Boxed Lunch",
        portions: 20, menuPrice: 15, targetFoodCostPct: 28, servingsPerWeek: 220,
        prepAhead: true, hold: "chilled", shelfLifeDays: 2, panNote: "Salad in 6 qt Cambro; build morning of",
        notes: "Salad holds two days. Croissants only get split and filled the morning they go out.",
        components: [
          { id: g("comp"), ingredientId: "cing_chicken_breast", qty: 90 },
          { id: g("comp"), ingredientId: "cing_mayo", qty: 20 },
          { id: g("comp"), ingredientId: "cing_celery", qty: 12 },
          { id: g("comp"), ingredientId: "cing_red_onion", qty: 4 },
          { id: g("comp"), ingredientId: "cing_grapes", qty: 10 },
          { id: g("comp"), ingredientId: "cing_dill", qty: 0.6 },
          { id: g("comp"), ingredientId: "cing_kosher_salt", qty: 0.8 },
          { id: g("comp"), ingredientId: "cing_black_pepper", qty: 0.2 },
          { id: g("comp"), ingredientId: "cing_croissant", qty: 20 },
          { id: g("comp"), ingredientId: "cing_spring_mix", qty: 5 },
        ],
      },
      {
        id: "crec_turkey_wrap", sinceVersion: 1, name: "Roast Turkey & Cheddar Wrap", category: "Sandwich", menu: "Boxed Lunch",
        portions: 12, menuPrice: 14, targetFoodCostPct: 28, servingsPerWeek: 156,
        prepAhead: true, hold: "chilled", shelfLifeDays: 2, panNote: "Wrapped in parchment, half pan of 12",
        notes: "Rolled tight, cut on the bias, wrapped. Second-best seller on the noon tour.",
        components: [
          { id: g("comp"), ingredientId: "cing_tortilla", qty: 12 },
          { id: g("comp"), ingredientId: "cing_turkey_breast", qty: 48 },
          { id: g("comp"), ingredientId: "cing_cheddar", qty: 12 },
          { id: g("comp"), ingredientId: "cing_spring_mix", qty: 8 },
          { id: g("comp"), ingredientId: "cing_grape_tomato", qty: 8 },
          { id: g("comp"), ingredientId: "cing_mayo", qty: 6 },
          { id: g("comp"), ingredientId: "cing_dijon", qty: 3 },
        ],
      },
      {
        id: "crec_caprese_orzo", sinceVersion: 1, name: "Caprese Orzo Salad", category: "Salad", menu: "Boxed Lunch",
        portions: 16, menuPrice: 9, targetFoodCostPct: 22, servingsPerWeek: 180,
        prepAhead: true, hold: "chilled", shelfLifeDays: 3, panNote: "Half pan, 4 oz scoop",
        notes: "Three-day salad, which is why it anchors the boxed lunch line.",
        components: [
          { id: g("comp"), ingredientId: "cing_orzo", qty: 32 },
          { id: g("comp"), ingredientId: "cing_mozzarella", qty: 16 },
          { id: g("comp"), ingredientId: "cing_grape_tomato", qty: 20 },
          { id: g("comp"), ingredientId: "cing_olive_oil", qty: 6 },
          { id: g("comp"), ingredientId: "cing_balsamic", qty: 3 },
          { id: g("comp"), ingredientId: "cing_kosher_salt", qty: 0.6 },
          { id: g("comp"), ingredientId: "cing_herb_blend", qty: 0.3 },
        ],
      },
      {
        id: "crec_harvest_bowl", sinceVersion: 1, name: "Harvest Farro Bowl", category: "Salad", menu: "Boxed Lunch",
        portions: 14, menuPrice: 13, targetFoodCostPct: 24, servingsPerWeek: 98,
        prepAhead: true, hold: "chilled", shelfLifeDays: 3, panNote: "Half pan; dressing packed separately",
        notes: "The vegetarian box. Dressing rides in a 2 oz cup so the farro doesn't go soft.",
        components: [
          { id: g("comp"), ingredientId: "cing_farro", qty: 28 },
          { id: g("comp"), ingredientId: "cing_apple", qty: 4 },
          { id: g("comp"), ingredientId: "cing_spring_mix", qty: 14 },
          { id: g("comp"), ingredientId: "cing_almonds", qty: 5 },
          { id: g("comp"), ingredientId: "cing_brie", qty: 10 },
          { id: g("comp"), ingredientId: "cing_maple_syrup", qty: 3 },
          { id: g("comp"), ingredientId: "cing_dijon", qty: 2 },
          { id: g("comp"), ingredientId: "cing_olive_oil", qty: 5 },
          { id: g("comp"), ingredientId: "cing_deli_cup", qty: 14 },
        ],
      },
      {
        id: "crec_lunch_sides", sinceVersion: 1, name: "Chips, Pickle & Apple Side", category: "Side", menu: "Boxed Lunch",
        portions: 1, menuPrice: 3.5, targetFoodCostPct: 30, servingsPerWeek: 420,
        prepAhead: false, hold: "ambient", shelfLifeDays: 14, panNote: "",
        notes: "Packed into the box last so nothing gets crushed. Not worth prepping ahead.",
        components: [
          { id: g("comp"), ingredientId: "cing_kettle_chips", qty: 1 },
          { id: g("comp"), ingredientId: "cing_pickle_spear", qty: 1 },
          { id: g("comp"), ingredientId: "cing_apple", qty: 1 },
        ],
      },
      {
        id: "crec_lemon_loaf", sinceVersion: 1, name: "Lemon Blueberry Loaf Slice", category: "Dessert", menu: "Dessert",
        portions: 20, menuPrice: 5, targetFoodCostPct: 20, servingsPerWeek: 260,
        prepAhead: true, hold: "ambient", shelfLifeDays: 4, panNote: "2 loaves, 10 slices each",
        notes: "Bakes Sunday and Wednesday. Four-day life, so it covers the whole lunch run.",
        components: [
          { id: g("comp"), ingredientId: "cing_ap_flour", qty: 22 },
          { id: g("comp"), ingredientId: "cing_sugar", qty: 18 },
          { id: g("comp"), ingredientId: "cing_butter", qty: 12 },
          { id: g("comp"), ingredientId: "cing_egg", qty: 6 },
          { id: g("comp"), ingredientId: "cing_blueberry", qty: 10 },
          { id: g("comp"), ingredientId: "cing_lemon", qty: 4 },
          { id: g("comp"), ingredientId: "cing_whole_milk", qty: 8 },
        ],
      },

      // ===== Passed Bites — charters =====
      {
        id: "crec_salmon_blini", sinceVersion: 1, name: "Smoked Salmon Blini", category: "Canapé", menu: "Passed Bites",
        portions: 40, menuPrice: 4, targetFoodCostPct: 26, servingsPerWeek: 160,
        prepAhead: true, hold: "chilled", shelfLifeDays: 1, panNote: "Two half pans of 20, single layer",
        notes: "Built the morning of. One-day life — do not carry these over.",
        components: [
          { id: g("comp"), ingredientId: "cing_blini", qty: 40 },
          { id: g("comp"), ingredientId: "cing_smoked_salmon", qty: 20 },
          { id: g("comp"), ingredientId: "cing_cream_cheese", qty: 14 },
          { id: g("comp"), ingredientId: "cing_dill", qty: 0.8 },
          { id: g("comp"), ingredientId: "cing_lemon", qty: 2 },
          { id: g("comp"), ingredientId: "cing_cucumber", qty: 1 },
        ],
      },
      {
        id: "crec_shrimp_shooter", sinceVersion: 1, name: "Shrimp Cocktail Shooter", category: "Canapé", menu: "Passed Bites",
        portions: 24, menuPrice: 6, targetFoodCostPct: 30, servingsPerWeek: 96,
        prepAhead: true, hold: "chilled", shelfLifeDays: 1, panNote: "Glasses racked in a half pan",
        notes: "Racked and covered. Sauce goes in on the dock, not the night before.",
        components: [
          { id: g("comp"), ingredientId: "cing_shrimp", qty: 36 },
          { id: g("comp"), ingredientId: "cing_cocktail_sauce", qty: 12 },
          { id: g("comp"), ingredientId: "cing_lemon", qty: 3 },
          { id: g("comp"), ingredientId: "cing_shooter_cup", qty: 24 },
        ],
      },
      {
        id: "crec_scallop_bite", sinceVersion: 1, name: "Bacon-Wrapped Scallop", category: "Canapé", menu: "Passed Bites",
        portions: 30, menuPrice: 7, targetFoodCostPct: 32, servingsPerWeek: 60,
        prepAhead: true, hold: "chilled", shelfLifeDays: 1, panNote: "Skewered, half pan; finish on the boat",
        notes: "Wrapped and skewered at the house, seared in the Duchess galley. The one bite that needs a flat top afloat.",
        components: [
          { id: g("comp"), ingredientId: "cing_scallop", qty: 30 },
          { id: g("comp"), ingredientId: "cing_bacon", qty: 15 },
          { id: g("comp"), ingredientId: "cing_maple_syrup", qty: 2 },
          { id: g("comp"), ingredientId: "cing_black_pepper", qty: 0.2 },
        ],
      },
      {
        id: "crec_cheese_board", sinceVersion: 1, name: "Cheese & Fruit Board (serves 10)", category: "Platter", menu: "Passed Bites",
        portions: 4, menuPrice: 68, targetFoodCostPct: 30, servingsPerWeek: 12,
        prepAhead: true, hold: "chilled", shelfLifeDays: 2, panNote: "Boards wrapped, stacked two high",
        notes: "Built on a board, wrapped tight. Each board covers about ten guests.",
        components: [
          { id: g("comp"), ingredientId: "cing_brie", qty: 16 },
          { id: g("comp"), ingredientId: "cing_cheddar", qty: 16 },
          { id: g("comp"), ingredientId: "cing_grapes", qty: 24 },
          { id: g("comp"), ingredientId: "cing_apple", qty: 4 },
          { id: g("comp"), ingredientId: "cing_almonds", qty: 6 },
          { id: g("comp"), ingredientId: "cing_croissant", qty: 4 },
        ],
      },

      // ===== Dinner Cruise — plated on the Duchess =====
      {
        id: "crec_herb_chicken", sinceVersion: 1, name: "Herb-Roasted Chicken Breast", category: "Entrée", menu: "Dinner Cruise",
        portions: 16, menuPrice: 24, targetFoodCostPct: 26, servingsPerWeek: 96,
        prepAhead: true, hold: "hot", shelfLifeDays: 1, panNote: "Two half pans, held at 145°F",
        notes: "Roasted to temp at the house, held hot in Cambros, plated on the boat.",
        components: [
          { id: g("comp"), ingredientId: "cing_chicken_breast", qty: 112 },
          { id: g("comp"), ingredientId: "cing_butter", qty: 8 },
          { id: g("comp"), ingredientId: "cing_herb_blend", qty: 1 },
          { id: g("comp"), ingredientId: "cing_olive_oil", qty: 4 },
          { id: g("comp"), ingredientId: "cing_lemon", qty: 3 },
          { id: g("comp"), ingredientId: "cing_kosher_salt", qty: 1.2 },
          { id: g("comp"), ingredientId: "cing_black_pepper", qty: 0.4 },
        ],
      },
      {
        id: "crec_cedar_salmon", sinceVersion: 1, name: "Cedar-Planked Salmon", category: "Entrée", menu: "Dinner Cruise",
        portions: 12, menuPrice: 30, targetFoodCostPct: 30, servingsPerWeek: 72,
        prepAhead: true, hold: "hot", shelfLifeDays: 1, panNote: "Portioned on planks, half pan of 12",
        notes: "Portioned and seasoned at the house, finished in the Duchess galley so it plates hot.",
        components: [
          { id: g("comp"), ingredientId: "cing_salmon_side", qty: 84 },
          { id: g("comp"), ingredientId: "cing_maple_syrup", qty: 4 },
          { id: g("comp"), ingredientId: "cing_dijon", qty: 2 },
          { id: g("comp"), ingredientId: "cing_butter", qty: 4 },
          { id: g("comp"), ingredientId: "cing_lemon", qty: 3 },
          { id: g("comp"), ingredientId: "cing_kosher_salt", qty: 0.9 },
        ],
      },
      {
        id: "crec_wild_rice", sinceVersion: 1, name: "Wild Rice Pilaf", category: "Side", menu: "Dinner Cruise",
        portions: 20, menuPrice: 7, targetFoodCostPct: 18, servingsPerWeek: 168,
        prepAhead: true, hold: "hot", shelfLifeDays: 2, panNote: "Full pan, held at 145°F",
        notes: "Cooks the afternoon of. Holds two days chilled if a cruise cancels.",
        components: [
          { id: g("comp"), ingredientId: "cing_wild_rice", qty: 40 },
          { id: g("comp"), ingredientId: "cing_butter", qty: 8 },
          { id: g("comp"), ingredientId: "cing_celery", qty: 10 },
          { id: g("comp"), ingredientId: "cing_red_onion", qty: 8 },
          { id: g("comp"), ingredientId: "cing_almonds", qty: 5 },
          { id: g("comp"), ingredientId: "cing_herb_blend", qty: 0.5 },
          { id: g("comp"), ingredientId: "cing_kosher_salt", qty: 1 },
        ],
      },
      {
        id: "crec_green_beans", sinceVersion: 1, name: "Haricots Verts Almondine", category: "Side", menu: "Dinner Cruise",
        portions: 20, menuPrice: 7, targetFoodCostPct: 20, servingsPerWeek: 168,
        prepAhead: true, hold: "chilled", shelfLifeDays: 2, panNote: "Blanched, shocked, half pan; finish afloat",
        notes: "Blanched and shocked at the house. Tossed in butter in the galley right before service.",
        components: [
          { id: g("comp"), ingredientId: "cing_green_beans", qty: 80 },
          { id: g("comp"), ingredientId: "cing_butter", qty: 6 },
          { id: g("comp"), ingredientId: "cing_almonds", qty: 6 },
          { id: g("comp"), ingredientId: "cing_lemon", qty: 2 },
          { id: g("comp"), ingredientId: "cing_kosher_salt", qty: 0.8 },
        ],
      },
      {
        id: "crec_garden_salad", sinceVersion: 1, name: "Garden Salad, Maple Vinaigrette", category: "Salad", menu: "Dinner Cruise",
        portions: 24, menuPrice: 9, targetFoodCostPct: 20, servingsPerWeek: 168,
        prepAhead: true, hold: "chilled", shelfLifeDays: 2, panNote: "Greens in a lined pan, dressing in a quart",
        notes: "Greens and garnish prepped separately. Dressed on the boat, never before.",
        components: [
          { id: g("comp"), ingredientId: "cing_spring_mix", qty: 36 },
          { id: g("comp"), ingredientId: "cing_grape_tomato", qty: 16 },
          { id: g("comp"), ingredientId: "cing_cucumber", qty: 3 },
          { id: g("comp"), ingredientId: "cing_red_onion", qty: 5 },
          { id: g("comp"), ingredientId: "cing_maple_syrup", qty: 4 },
          { id: g("comp"), ingredientId: "cing_dijon", qty: 2 },
          { id: g("comp"), ingredientId: "cing_olive_oil", qty: 8 },
          { id: g("comp"), ingredientId: "cing_balsamic", qty: 4 },
        ],
      },
      {
        id: "crec_roll_butter", sinceVersion: 1, name: "Warm Roll & Maple Butter", category: "Side", menu: "Dinner Cruise",
        portions: 1, menuPrice: 3, targetFoodCostPct: 22, servingsPerWeek: 180,
        prepAhead: false, hold: "ambient", shelfLifeDays: 2, panNote: "",
        notes: "Rolls warm in the galley oven. Butter is whipped at the house and holds a week.",
        components: [
          { id: g("comp"), ingredientId: "cing_dinner_roll", qty: 1 },
          { id: g("comp"), ingredientId: "cing_butter", qty: 0.6 },
          { id: g("comp"), ingredientId: "cing_maple_syrup", qty: 0.15 },
        ],
      },
      {
        id: "crec_pot_de_creme", sinceVersion: 1, name: "Dark Chocolate Pot de Crème", category: "Dessert", menu: "Dessert",
        portions: 18, menuPrice: 10, targetFoodCostPct: 22, servingsPerWeek: 108,
        prepAhead: true, hold: "chilled", shelfLifeDays: 4, panNote: "18 jars, two half pans",
        notes: "Set in jars. Four days chilled, and it ships to any boat without a thought.",
        components: [
          { id: g("comp"), ingredientId: "cing_dark_chocolate", qty: 20 },
          { id: g("comp"), ingredientId: "cing_heavy_cream", qty: 36 },
          { id: g("comp"), ingredientId: "cing_whole_milk", qty: 12 },
          { id: g("comp"), ingredientId: "cing_egg", qty: 8 },
          { id: g("comp"), ingredientId: "cing_sugar", qty: 8 },
        ],
      },
    ];
  }

  // ---- Catering events ----
  // Every piece of food service is an event, including the standing
  // preplanned lunch runs. `locationId` is where it is served; it only
  // decides which fridge is tried first when stock is pulled. `pull` records
  // exactly what was deducted from which location, so it can be undone.
  function seedOrders() {
    const g = CateringCalc.uid;
    const day = (offset) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    return [
      {
        id: "cord_belle_noon", sinceVersion: 1, name: "Belle Noon Tour — Preplanned Lunch", date: day(1),
        serviceType: "Preplanned Lunch", recurring: "Daily, Jun–Sep", status: "confirmed",
        vesselId: "ves_belle", locationId: "loc_belle_galley",
        guestCount: 80, pricingMode: "perGuest", pricePerGuest: 26,
        notes: "The standing lunch run. Boxes are built at the house by 10:00 and on the Belle by 11:15. Guests pick one of three at booking; the split below is what the last four weeks actually ran.",
        lines: [
          { id: g("ln"), recipeId: "crec_chicken_salad", portionsPerGuest: 0.4, overagePct: 10 },
          { id: g("ln"), recipeId: "crec_turkey_wrap", portionsPerGuest: 0.32, overagePct: 10 },
          { id: g("ln"), recipeId: "crec_harvest_bowl", portionsPerGuest: 0.28, overagePct: 10 },
          { id: g("ln"), recipeId: "crec_caprese_orzo", portionsPerGuest: 1, overagePct: 8 },
          { id: g("ln"), recipeId: "crec_lunch_sides", portionsPerGuest: 1, overagePct: 5 },
          { id: g("ln"), recipeId: "crec_lemon_loaf", portionsPerGuest: 1, overagePct: 8 },
        ],
        supplies: [
          { id: g("sup"), ingredientId: "cing_togo_box", qtyPerGuest: 1 },
          { id: g("sup"), ingredientId: "cing_cutlery_kit", qtyPerGuest: 1 },
          { id: g("sup"), ingredientId: "cing_napkin", qtyPerGuest: 2 },
          { id: g("sup"), ingredientId: "cing_label", qtyPerGuest: 1 },
        ],
      },
      {
        id: "cord_duchess_sat", sinceVersion: 1, name: "Saturday Sunset Dinner Cruise", date: day(3),
        serviceType: "Dinner Cruise", recurring: "Weekly, Saturdays", status: "confirmed",
        vesselId: "ves_duchess", locationId: "loc_duchess_galley",
        guestCount: 84, pricingMode: "perGuest", pricePerGuest: 96,
        notes: "Plated three-course. Entrée pre-selected at booking. Package price covers the cruise and service, so food cost reads low against it.",
        lines: [
          { id: g("ln"), recipeId: "crec_garden_salad", portionsPerGuest: 1, overagePct: 6 },
          { id: g("ln"), recipeId: "crec_herb_chicken", portionsPerGuest: 0.55, overagePct: 8 },
          { id: g("ln"), recipeId: "crec_cedar_salmon", portionsPerGuest: 0.45, overagePct: 8 },
          { id: g("ln"), recipeId: "crec_wild_rice", portionsPerGuest: 1, overagePct: 8 },
          { id: g("ln"), recipeId: "crec_green_beans", portionsPerGuest: 1, overagePct: 8 },
          { id: g("ln"), recipeId: "crec_roll_butter", portionsPerGuest: 1.2, overagePct: 5 },
          { id: g("ln"), recipeId: "crec_pot_de_creme", portionsPerGuest: 1, overagePct: 6 },
        ],
        supplies: [
          { id: g("sup"), ingredientId: "cing_napkin", qtyPerGuest: 2 },
          { id: g("sup"), ingredientId: "cing_chafing_fuel", qtyPerGuest: 0.08 },
          { id: g("sup"), ingredientId: "cing_half_pan", qtyPerGuest: 0.12 },
        ],
      },
      {
        id: "cord_hartley_charter", sinceVersion: 1, name: "Hartley Anniversary Charter", date: day(5),
        serviceType: "Private Charter", recurring: "", status: "confirmed",
        vesselId: "ves_clayton", locationId: "loc_clayton_galley",
        guestCount: 28, pricingMode: "perGuest", pricePerGuest: 78,
        notes: "Two hours, passed bites only, no seated course. They asked for extra shrimp and no shellfish at one table — flag it on the board.",
        lines: [
          { id: g("ln"), recipeId: "crec_salmon_blini", portionsPerGuest: 2, overagePct: 12 },
          { id: g("ln"), recipeId: "crec_shrimp_shooter", portionsPerGuest: 1.5, overagePct: 12 },
          { id: g("ln"), recipeId: "crec_scallop_bite", portionsPerGuest: 1.5, overagePct: 12 },
          { id: g("ln"), recipeId: "crec_cheese_board", portionsPerGuest: 0.1, overagePct: 10 },
        ],
        supplies: [
          { id: g("sup"), ingredientId: "cing_napkin", qtyPerGuest: 4 },
          { id: g("sup"), ingredientId: "cing_deli_cup", qtyPerGuest: 0.5 },
        ],
      },
      {
        id: "cord_bnb_breakfast", sinceVersion: 1, name: "B&B Guest Breakfast", date: day(1),
        serviceType: "B&B Breakfast", recurring: "Daily", status: "confirmed",
        vesselId: null, locationId: "loc_kitchen",
        guestCount: 14, pricingMode: "included", pricePerGuest: 0,
        notes: "Included in the room rate, so it books no revenue — but it draws on the same kitchen and the same walk-in as every cruise, which is the only reason it is in here.",
        lines: [
          { id: g("ln"), recipeId: "crec_french_toast", portionsPerGuest: 0.6, overagePct: 15 },
          { id: g("ln"), recipeId: "crec_quiche", portionsPerGuest: 0.5, overagePct: 15 },
        ],
        supplies: [
          { id: g("sup"), ingredientId: "cing_napkin", qtyPerGuest: 2 },
        ],
      },
      {
        id: "cord_chamber_lunch", sinceVersion: 1, name: "Chamber of Commerce Lunch Cruise", date: day(8),
        serviceType: "Preplanned Lunch", recurring: "", status: "quoted",
        vesselId: "ves_duchess", locationId: "loc_duchess_galley",
        guestCount: 110, pricingMode: "perGuest", pricePerGuest: 34,
        notes: "Quoted, not signed. Buffet rather than boxes — they want it served off chafers on the main deck.",
        lines: [
          { id: g("ln"), recipeId: "crec_chicken_salad", portionsPerGuest: 0.5, overagePct: 12 },
          { id: g("ln"), recipeId: "crec_caprese_orzo", portionsPerGuest: 1, overagePct: 10 },
          { id: g("ln"), recipeId: "crec_harvest_bowl", portionsPerGuest: 0.5, overagePct: 12 },
          { id: g("ln"), recipeId: "crec_lemon_loaf", portionsPerGuest: 1, overagePct: 10 },
        ],
        supplies: [
          { id: g("sup"), ingredientId: "cing_napkin", qtyPerGuest: 2 },
          { id: g("sup"), ingredientId: "cing_half_pan", qtyPerGuest: 0.15 },
          { id: g("sup"), ingredientId: "cing_chafing_fuel", qtyPerGuest: 0.06 },
        ],
      },
    ];
  }

  function defaultState() {
    return {
      ingredients: seedIngredients(),
      recipes: seedRecipes(),
      orders: seedOrders(),
      settings: {
        defaultTargetFoodCostPct: 26,
        defaultOveragePct: 10,
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
    mergeNew(s.recipes, seedRecipes());
    mergeNew(s.orders, seedOrders());
    s.seedVersion = SEED_VERSION;
    save(s);
    return s;
  }

  // Fill in anything older saved data may be missing, and repair the shape of
  // the two quantity maps — a hand-edited import is the most likely way one of
  // them arrives as a bare number instead of a map.
  function asQtyMap(v) {
    if (v && typeof v === "object" && !Array.isArray(v)) return v;
    return {};
  }

  function normalize(s) {
    s.settings = s.settings || {};
    if (s.settings.defaultTargetFoodCostPct == null) s.settings.defaultTargetFoodCostPct = 26;
    if (s.settings.defaultOveragePct == null) s.settings.defaultOveragePct = 10;
    // Prepared batches were retired in the redesign; catering now pulls raw
    // stock straight from whichever fridge has it.
    delete s.batches;
    s.orders = s.orders || [];

    s.ingredients.forEach((i) => {
      if (i.yieldPct == null) i.yieldPct = 100;
      i.onHand = asQtyMap(i.onHand);
      i.par = asQtyMap(i.par);
    });
    s.recipes.forEach((r) => {
      if (!r.portions) r.portions = 1;
      if (r.targetFoodCostPct == null) r.targetFoodCostPct = s.settings.defaultTargetFoodCostPct;
      if (r.servingsPerWeek == null) r.servingsPerWeek = 0;
      if (!r.menu) r.menu = MENUS[1];
      if (r.prepAhead == null) r.prepAhead = false;
      if (!r.hold) r.hold = "chilled";
      if (r.shelfLifeDays == null) r.shelfLifeDays = 2;
      r.components = r.components || [];
    });
    s.orders.forEach((o) => {
      o.lines = o.lines || [];
      o.supplies = o.supplies || [];
      if (!o.pricingMode) o.pricingMode = "perGuest";
      if (o.pricePerGuest == null) o.pricePerGuest = 0;
      if (!o.status) o.status = "confirmed";
      // The old prep/delivery states collapse into the simpler set.
      if (o.status === "prepped") o.status = "confirmed";
      if (o.status === "delivered") o.status = "completed";
      if (o.pull === undefined) o.pull = null;
      if (!o.serviceType) o.serviceType = "Catering";
      if (o.vesselId === undefined) o.vesselId = null;
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
      console.warn("Catering data failed to load; using defaults.", e);
      return defaultState();
    }
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Could not save catering data.", e);
    }
  }

  function resetToDefaults() {
    const s = defaultState();
    save(s);
    return s;
  }

  return { load, save, resetToDefaults, defaultState, normalize, isValid, KEY, MENUS, CATEGORIES };
})();
