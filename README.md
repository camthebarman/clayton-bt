# Clayton Boat Tours — Provisioning

One browser page for provisioning a small fleet. No build step, no server, no
account: open `index.html` and it runs. Everything is saved in the browser's
own `localStorage`, so each device keeps its own copy of the numbers.

Built on the same framework as [86'd](https://github.com/camthebarman/86d),
with one structural change that reaches into everything: **there is more than
one place to put things.**

| Section | What it does |
| --- | --- |
| **Dashboard** | The operation at a glance — what it all adds up to, what has to be thrown out, cooked, driven to a boat or ordered, pulled live from the three tools below it. |
| **Catering** | Ingredient costing, recipes and portion costs, the **Prepared** board, per-location count sheets, catering orders, and usage projections. |
| **Bar** | Ingredients, house preps, glassware, drinks and pour costs, and a count sheet for each of the five bars. |
| **Fleet** | The boats, every place stock can sit, the transfers moving between them, and the **master roll-up**. |
| **Ask** | A question box over all of it — what's going off, what's on the Belle, what's short and where. |

## The one idea everything else follows from

86'd tracked one kitchen and one bar, so an ingredient could carry a single
`onHandQty`. Here the same case of lemons is split between the commissary, the
kitchen and three bars, and the number that matters to an order is the total
across all of them.

So **every quantity in the program is a map of `locationId -> quantity`**, and
every roll-up is a sum over that map. `fleet/storage.js` owns the list of
places those keys refer to. Catering and Bar each know how to hold quantities
per location and how to move some on request; neither knows anything about the
other, and neither owns the ledger.

Two properties of a location do most of the work:

- **What it holds** — food, beverage, or both. This decides which count sheets
  a place appears on.
- **Whether it can cook.** The B&B kitchen can. A boat galley holds, finishes
  and plates; it cannot turn raw chicken into chicken salad mid-river. That one
  flag is why the Prepared tab exists.

The seeded operation is a commissary, a kitchen, a shore bar, and three boats
carrying a galley and one or two bars each — ten locations, five of them bars.
All of it is editable on the Fleet tab.

## Prepared

The tab that exists because this is a B&B, not a line kitchen. Food is produced
hours or days before anyone eats it, then split across a walk-in and three
boats. So the unit of inventory here is a **batch**: one production run, with a
date, a hold (chilled, frozen, hot, ambient), a shelf life, and a map of where
its portions currently sit.

That changes what "can we serve this" means. At a location that cannot cook,
the only servings that exist are the prepared ones already there — the raw
stock in a boat galley is bread and garnish, not a dish. At the kitchen, or
across the fleet, prepared portions and raw capacity both count. The Recipes
tab reads `18 prepped + 41 cookable` for exactly this reason.

At the top of the tab is the **prep list**: what the booked orders need that no
live batch covers yet, in portions and in whole batches, with each dish's pan
note beside it. It is derived, never stored, so it is right the moment an order
changes or a batch is logged.

Logging a batch draws its ingredients out of raw stock — the kitchen first,
then the commissary. Without that, the operation would look richer every time
it cooked: prepared food on the board and the raw chicken still in the walk-in.
You can turn the draw-down off for a batch you have already counted down
yourself, and if the counts come up short the app says which ones rather than
quietly going negative.

## Catering orders

Cruises, charters, breakfasts and the standing **preplanned lunch** runs are
all the same shape — a guest count, dishes with a per-guest take rate and an
overage %, and a supplies list. A preplanned lunch is an ordinary order with a
service type and a recurrence; there is no second system for it, which is the
point. Duplicating one copies a whole standing run in a click.

Each order gives you:

- **Prep plan** — per dish, how many portions it needs, how many exist
  fleet-wide, how many are already at the service location, and how many the
  kitchen still owes it.
- **Shopping list** — measured against every location's stock, because an order
  is provisioned from wherever the food is. The shortfall is the purveyor order,
  in whole packs.
- **Load-out** — turns the order into a transfer: the prepared portions and
  supplies that still have to physically reach that boat, drawn from the
  kitchen, with anything the kitchen can't cover named before you commit.
- **Prep sheet** — a plain-text checklist to print.

A B&B breakfast books no revenue and says so; it is in here because it draws on
the same kitchen and the same walk-in as every cruise.

## Transfers

Three states and one rule:

```
draft      being built, nothing has left
sent       loaded and gone — still counted at the origin
received   checked in, and only now does stock actually move
```

Keeping the move on receipt is what makes the count sheets honest. If a
transfer moved stock the moment it was written, a runner's clipboard and the
walk-in would disagree all afternoon.

Receiving asks each program to move its own lines and report what it could
really move, so a ticket written against a stale count lands honestly rather
than inventing stock. Prepared portions move **oldest first** — if two batches
of chicken salad are in the walk-in, the one that expires tomorrow is the one
that goes on the boat.

Transfers can be built by hand, or proposed for you: **Restock From Commissary**
on any count sheet, and **Build Load-Out** on any catering order.

## Counting

Each tab is read either for one location or for all of them at once, and the
chip strip at the top is the only thing that changes it.

- **A location** gives you that place's count sheet, in the unit it counts in,
  with what it carries first and the rest of the catalogue folded away. A boat
  galley stocks a dozen things out of sixty; showing all sixty makes the sheet
  useless, hiding the rest makes it impossible to start carrying something new.
- **Master** gives you one row per item with a column per location and the
  total beside them — which is the view that answers "do we have enough
  anywhere", as opposed to "is this boat short". Both are editable.

**Below par only means something where a par is set.** A location with no par
on an item is never flagged for it, which is what keeps a five-bar program from
crying wolf.

The bar takes that one step further: a drink is **offered** at a bar when that
bar carries a par on every component it needs. So the single well on Miss
Clayton reads *not on this bar* for a spritz it never poured, and 86'd only for
something it actually ran out of. The same logic covers house preps: the
commissary can batch a syrup, so an empty bottle there isn't 86'd if the ginger
and sugar are in. A bar on the upper deck of the Duchess, thirty minutes into a
sunset cruise, cannot — there, an empty bottle is 86'd until a runner reaches
it.

## Ask

One input box, two answer sources.

**The built-in engine** needs no key, no network and no account. It matches the
question against what somebody running this operation actually asks, then
computes the answer from the same live data the tabs are showing. It handles:
what's below par and where, what's 86'd at a given bar or galley, what's
prepped and what's going off, what still has to be produced for what's booked,
how many of something you can serve or pour and at which location, what a dish,
drink or whole order costs and earns, what's in a recipe, what's in transit,
what's on the books, and what the operation is worth. Nearly every answer names
a location — across a commissary, a kitchen and three boats, "we have twelve"
is a trap.

Ask it something outside that and it says so rather than guessing.

**Claude** picks up everything else — open-ended questions the engine has no
rule for. It is off until someone connects a key under **Connect Claude**, and
the engine still answers first on anything it recognises, so a connected key
costs nothing on the common questions.

### About the API key

This site is static files. There is no server to keep a secret in, so a
connected key is stored in that browser's `localStorage` and sent directly from
the page to `api.anthropic.com` — the path Anthropic gates behind an explicit
`anthropic-dangerous-direct-browser-access` header. Anyone who can use that
browser profile, or run script on this origin, can read the key.

That is a reasonable trade for an operations tool on the owner's own device,
and a bad one for a page the public can reach. Use a key you are willing to
rotate, put it only on the devices your managers use, and remove it from the
same dialog when a device changes hands. If you would rather no key existed
anywhere, the built-in engine alone is a complete, useful tab.

Answers use `claude-opus-5`, streamed so they appear as they are written. Each
question sends a snapshot of the current catering, bar and fleet data along with
it; nothing is stored anywhere but the browser, and the transcript is
deliberately not persisted — yesterday's answers about yesterday's counts would
only mislead.

## Branding

The whole identity lives in two files, and **nothing else in the app carries a
colour or a company name**:

| File | Holds |
| --- | --- |
| `css/brand.css` | Every colour, the type stack, the shape tokens, and the three `--mark-*` colours the logo is drawn from. `styles.css` states no colour of its own — it works entirely in these tokens. |
| `js/brand.js` | The name, the tagline, the browser title, the module glyphs, the place and the water, and the one-sentence brief the Ask tab hands to Claude. |

Swapping those two files re-skins every tab, the pills, the masthead mark, the
favicon, the front page's opening line and the assistant's own introduction
together. There is no third place to remember.

### Where the palette comes from

Clayton sits on the St. Lawrence at the head of the Thousand Islands, and it is
the home of the Antique Boat Museum. So the source material is not generic
nautical navy — it is a varnished mahogany hull with brass hardware, on
green-blue river water, against a white transom and the pink-grey granite of
the Frontenac Arch.

That gives the interface its one structural idea: **cool surfaces, warm
accents.** The paper is river haze; the money, the metal and the wood are warm.
Each tool takes its colour from the same dock:

| | |
| --- | --- |
| House | `#0f4a5f` — the St. Lawrence channel |
| Catering | `#2b6a52` — island pine |
| Bar | `#8a4523` — varnished mahogany |
| Fleet | `#0f4a5f` — the river; the fleet is the spine, so it carries the house colour |
| Ask | `#41566b` — Frontenac granite |
| Accent | `#8f6724` — brass hardware |

Every foreground/background pair meets WCAG AA (4.5:1) on text, including the
status pills, the hold badges and the softened row washes. The measured ratios
are in the comments in `brand.css`; if you change a colour, re-check it.

### The mark

A launch hull with a brass sheer stripe, on her own wake. It is drawn as inline
SVG by `brand.js` from the `--mark-*` tokens, so it re-colours with the palette
instead of going stale, and it serves as both the masthead mark and the
favicon. A hull stays legible at 16px in a browser tab; a castle or a
lighthouse would not.

## Data

Each tool keeps its own key, so resetting one never touches another:

| Tool | localStorage key |
| --- | --- |
| Catering | `ctb.catering.v1` |
| Bar | `ctb.bar.v1` |
| Fleet | `ctb.fleet.v1` |

Each ships with a seeded starting set so the page shows what it does before
anyone has typed anything. Seed items carry fixed ids and a `sinceVersion` tag,
so items added in a later version merge into saved data without clobbering
edits. Each tool's **Reset Data** button puts that one tool back to its seed.

**The seeded prices are plausible foodservice figures, not quoted invoices.**
They exist so the app has something to show. Overwrite them with what this
operation actually pays — the costing is only as good as what you put in.
Prepared batch dates are relative to when you open the page, so the board
always reads as a live week.

## Layout

```
index.html            the shell: masthead, section bar, every panel's container
css/brand.css         the identity: every colour, the type stack, the mark
css/styles.css        one design system, stated entirely in brand.css's tokens
js/brand.js           the name, the tagline, the glyphs, the logo, the favicon
js/core.js            shared helpers: DOM building, the one modal, the one toast
js/fleet/storage.js   locations, boats and transfers — loads first, because every
                      quantity map in the app is keyed by the locations it defines
js/fleet/app.js       the master roll-up, the locations, the transfer ledger
js/catering/          calc.js (pure math) · storage.js (state + seed) · app.js (render)
js/bar/               same three
js/agent/             engine.js (offline answers) · claude.js (API) · app.js (chat)
js/shell.js           section switching and the front page
```

Each tool's `app.js` scopes every DOM lookup to its own `#mod-*` subtree, so
they can share class names without colliding. The modal and the toast are the
house's, borrowed from `Core`.

### The contract between the tools

Fleet moves things between locations but must not know how the other two store
them. Three calls are the whole interface, and both Catering and Bar implement
them identically:

```js
transferCatalog()                  // what can travel
availableAt(kind, itemId, locId)   // how much is there
moveStock(line, from, to, qty)     // move some, report what actually moved
```

The front page is the same idea one level up: it never reaches into a tool's
state, it reads each tool's `summary()`.
