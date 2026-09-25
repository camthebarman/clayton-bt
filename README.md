# Clayton Boat Tours — Provisioning

One browser page for provisioning a small fleet. No build step, no server, no
account: open `index.html` and it runs. Everything is saved in the browser's
own `localStorage`, so each device keeps its own copy of the numbers.

## The strip across the top

Every page carries the same four live numbers:

| | |
| --- | --- |
| **Food cost** | What the food menus cost to plate as a % of what they sell for, weighted by each dish's weekly mix, against a target you set. |
| **Bar cost** | The same for the bar menu. |
| **Inventory** | What's sitting in every fridge, store room and bar, split food / bar. |
| **Below par** | How many items are under par anywhere they're carried. |

Each one opens the page that explains it.

## Pages

| Page | What it does |
| --- | --- |
| **Inventory** | The main page. Master count first, then filter to a boat or a single place. Food / Bar / All, search, category, low-stock only, and an order sheet for whatever view you're in. |
| **Food** | Menu costing: plate cost, price, food cost % and margin per dish, a tile per menu, and the recipe editor. |
| **Bar** | The same for drinks, plus house preps (syrups, shrubs, batched bases) costed from their own recipes. |
| **Catering** | The event calculator, the pull list, the shopping list, and one-tap deduct. |
| **Locations** | The boats and the places stock sits. |

## Inventory

Every quantity is a map of `locationId -> quantity`, and every total is a sum
over that map. The rail at the top picks which locations are summed:

- **Master**: every item once, with its fleet total and a chip for each place
  it sits. Click a row to edit the item and its counts everywhere.
- **A boat (or Shore)**: one column per place aboard, each a count you type
  straight into.
- **A place**: that one fridge, bar or store room as a count sheet, with on
  hand, par and a "count up to par" button. It shows what the place carries
  first; the rest of the catalogue is one click away.

Typing a count updates the totals, the rail and the top strip as you go.
**Enter** moves down the column, the way a count sheet is filled in.

**Below par only means something where a par is set.** A place with no par on
an item is never flagged for it.

## Catering

An event is a guest count and a menu. From those two things you get:

- **The numbers**: portions per dish (per guest × guests, plus overage, rounded
  up), cost, cost per guest, revenue, food cost % and profit.
- **Grab from**: which fridge to pull each ingredient and supply from, grouped
  by place so it can be walked. It doesn't matter which kitchen is "yours". If
  one place can cover an item in a single trip, you're sent there. The
  event's own serving location is tried first. An item is only split across
  places when no single one has enough. Stock is pulled from shore locations
  and the event's own boat, never from another boat's galley.
- **Shopping list**: whatever no fridge has, in whole packs, with the bill.
  Copy or download it.

**Deduct from inventory** takes exactly what the pull list shows out of exactly
those places. The event remembers what it took, so **Undo pull** puts it all
back. If the menu or guest count changes after a pull, the page says so.

There are no transfers and no tickets to receive: deducting is the whole
workflow.

## Data

Each program keeps its own key, so resetting one never touches another:

| | localStorage key |
| --- | --- |
| Food and catering events | `ctb.catering.v1` |
| Bar | `ctb.bar.v1` |
| Boats and locations | `ctb.fleet.v1` |
| Which filters were last open | `ctb.ui.v2` |

Saved data from the previous version loads as-is. Its prepared batches and
transfers are dropped, since neither exists any more.

**The seeded prices are plausible foodservice figures, not quoted invoices.**
Overwrite them with what this operation actually pays. **Reset everything** on
the Locations page puts all of it back to the sample set.

## Branding

The whole identity lives in two files. Nothing else in the app carries a
colour or a company name:

| File | Holds |
| --- | --- |
| `css/brand.css` | Every colour, the type stack, and the `--mark-*` colours the logo is drawn from. Cyan is the house, green is Food, amber is Bar. |
| `js/brand.js` | The name, the tagline, the browser title, and the mark (drawn as inline SVG, also used as the favicon). |

## Layout

```
index.html            the shell: rail, KPI strip, page container, modal, toast
css/brand.css         the identity: every colour, the type stack, the mark
css/styles.css        one design system, stated entirely in brand.css's tokens
js/brand.js           the name, the tagline, the logo, the favicon
js/core.js            DOM building, the modal, the toast, file download, clipboard
js/fleet/storage.js   boats and locations. Loads first: every quantity is keyed by them
js/catering/          calc.js (pure math, incl. planPull) · storage.js (state + seed)
js/bar/               calc.js · storage.js
js/ui/store.js        one door into all three stores: costing, menu cost %, inventory rows
js/ui/widgets.js      icons, stat tiles, meters, pills, fields
js/ui/inventory.js    the Inventory page
js/ui/menu.js         the Food and Bar pages (one factory, two configs)
js/ui/catering.js     the Catering page
js/ui/locations.js    the Locations page
js/ui/shell.js        the rail, the KPI strip, hash routing
```
