# 🛒 PROJECT "MINI MART EVOLVED" — MASTER BUILD PROMPT
### A 1,000× rebuild of YouTube Playables' *My Mini Mart*
**Document type:** Direct build instruction / engineering + art spec for an autonomous coding agent
**Version:** 1.0
**Target agent:** Arena Agent Mode (or equivalent), with hard-coding primary, optional local Blender, internet model sourcing, Google Drive as cloud storage, and full connector access.

---

## 0. HOW TO READ THIS DOCUMENT (AGENT: READ FIRST)

You are building a **complete, shippable, browser-native 3D store-management tycoon game**. You are not prototyping. You are not making a demo. You are shipping a finished product that must be **better than the reference game in every measurable dimension**: graphics, animation, systems depth, level count, content volume, UX polish, accessibility, performance and replayability.

Read the whole document before writing a line of code. Then:

1. Confirm the plan back to the user in a short bullet summary (max 15 lines).
2. Execute the milestones in **§16 Build Order**, in order. Do not skip ahead.
3. After each milestone, run its **Acceptance Test** in §18 and report pass/fail.
4. Commit to Git at every milestone boundary (see §14).
5. Never ask "should I continue" — keep building. Only stop to ask if you must make an irreversible, user-visible art-direction decision that is not already answered below.

**Absolute priority order when rules conflict:**
`Performance & Playables certification` → `Correct, bug-free simulation` → `Feel & juice` → `Content volume` → `Graphical fidelity`.

---

## 1. REFERENCE GAME TEARDOWN — WHAT WE ARE BEATING (100% INVENTORY)

`https://www.youtube.com/playables/Ugkxto-OwJZo4rm8Xl2Nj3K403nHlYThf-sr`
**My Mini Mart** — Supersonic Studios (original codebase `com.KisekiGames.smart`). Simulation genre. ~61M plays, ranked #15 of ~2,012 Playables titles. This is the benchmark.

### 1.1 The reference's core loop (verbatim behaviour)
1. Player is a single stickman-ish 3D character in an isometric/perspective fixed-camera store.
2. **All interaction is automatic on proximity.** Walk near a tomato plant → you pick a tomato. Walk near a shelf → you auto-deposit. Walk near the till → you serve the queue. There is no interact button. Ever.
3. Carrying is a **stack on the character's head**, hard-capped by an upgradeable capacity (starts at ~3–4 items).
4. Shelves have discrete slots. Customers walk to a shelf, take an item, walk to the checkout, queue, get served, pay, and leave.
5. Money appears as **physical cash on the counter**. The player must physically walk over it to collect it. Uncollected cash is a risk object.
6. Money buys: locked floor areas (white-framed ghost plots with price tags), machines, animals, crops, and upgrades.
7. A **thief** spawns if cash sits too long. Player switches to a net, chases, and must line up an aim marker to capture him before he escapes.
8. **Workers** (cashier, shelver/loader, chef) automate steps. Player upgrades each worker's speed and carry capacity separately.
9. Progression is "unlock node → production chain gets longer → hire more staff → unlock next node."

### 1.2 Reference content chains
| Chain | Raw source | Processing | Output |
|---|---|---|---|
| Produce | Tomato plant | — | Tomato |
| Produce | Apple tree | — | Apple |
| Grain | Wheat field | Mill → Flour → Oven → Dough/Bread | Bread |
| Dairy | Cow (needs hay) | — | Milk |
| Dairy | Cow + machine | Churn | Cheese/Butter |
| Poultry | Hen (needs feed) | — | Egg |
| Preserves | Tomato + Blender | Blend | Jar/preserve |
| Coffee | Coffee beans | Coffee machine | Coffee |
| Sweet | Sugar | — | Sugar |

### 1.3 Reference shop/mart progression
- **YouTube Playables build: 2 marts only — "Pizza Mart" and "Cafe Mart". No ending.**
- Mobile app build: **14 marts.**
- Each mart re-skins the same loop with one or two new machines (pizza oven in Pizza Mart; two chefs and coffee/bakery in Cafe Mart).
- Money never truly matters late-game in the Playables build because of a cash-injection on load, so tension evaporates.
- No pause button. No save-scumming protection. No chapter select. No goals beyond "buy the next plot."

### 1.4 Reference UX / interface inventory (recreate the intent, then surpass it)
- Fixed 3/4 view camera, no rotation, no zoom on the Playables build.
- Persistent money count top-centre; a settings gear; an upgrade icon cluster.
- Ghost-plot purchase prompts rendered in-world as `$PRICE` above a translucent white frame.
- Floating `+$N` text on sale. Coin/cash pickup magnet radius zero (must touch).
- Minimal audio: short ASMR pops, coin clinks, a light loop.
- No HUD for staff; a separate modal lists employees and stations, **and this modal does not match what is actually on the floor** (a real, documented bug).

### 1.5 Every documented flaw in the reference — these are our feature list
| # | Reference flaw | Our mandate |
|---|---|---|
| F1 | Employees get stuck on counters | Flow-field nav + collision-aware avoidance, no static blockers |
| F2 | All workers pile onto one station, ignoring others | Contract-net job auction with claim/reservation locks |
| F3 | Workers insist on filling full carry capacity before leaving, so they idle | **No-wait rule**: take what exists, leave immediately |
| F4 | Staff list UI desyncs from the floor | Single source of truth: the ECS is the UI |
| F5 | Buying an upgrade sometimes charges twice and grants nothing | Transactional purchases, idempotent, with an atomic receipt |
| F6 | Upgrade costs (~$1,200) massively out of proportion to income ($20–30/customer) | Economy retuned; see §8.3 |
| F7 | Only 2 marts on Playables, no ending | **20 marts + endless prestige mode** |
| F8 | Cash-on-load exploit breaks the economy | No free money; offline income is capped, earned, and shown as a breakdown |
| F9 | No pause | Instant pause, full save/load, mid-run resume |
| F10 | Grindy late game | Rubber-banding difficulty + automation depth |
| F11 | Only one character archetype, static-ish | 6 staff classes, 3 tiers each, visible tools + unique walk cycles |
| F12 | Camera locked | Orbit + zoom + tilt-to-plan, plus a "manager cam" top-down mode |
| F13 | No accessibility | Full dynamic-type, colour-blind palettes, motion reduction, one-switch mode |
| F14 | No goals/objectives | Per-mart 3-star goals + daily challenge contracts |

### 1.6 Reference technical envelope (for calibration)
Isometric-ish 3D, low-poly, flat-bright lighting, unlit-ish shading, one texture atlas, ~one screen of geometry, single scene per mart. **That is our floor, not our ceiling.**

---

## 2. DESIGN PILLARS (NON-NEGOTIABLE)

**P1 — "One thumb, zero menus during play."** Movement is the only input, ever, exactly like the reference. Everything else is automatic, contextual, or ambient. Menus exist only at deliberate rest points (shop, staff, map).

**P2 — "The floor tells you everything."** No HUD panel should be required to understand store state. Empty shelf slots glow. An impatient customer visibly fidgets. A jammed machine emits smoke and a wrench icon. A worker with no task stands idle-scratching his head near the break room.

**P3 — Automation is the reward, not the chore.** Every purchase visibly removes *one* tedious trip. By mart 6 the player should be *designing* a flow rather than *being* the flow.

**P4 — Generous by default.** This must be **easier** than the reference. More customers, cheaper and earlier helpers, softer failure, faster early ramp. Difficulty comes from *optimisation ceiling*, not from *starvation floor*.

**P5 — Professional, not clip-art.** Stylised-realistic toy-store look: soft global illumination, real contact shadows, PBR-ish materials, depth of field on the UI focus, tasteful bloom. Every screen must look like it shipped from a premium studio.

**P6 — Bulletproof.** 60fps on a 4-year-old mid-range Android, instant load, never crashes, never corrupts a save.

---

## 3. WHAT "1,000× BETTER" MEANS — CONCRETE SCORECARD

The agent must be able to tick every row at the end. This table is the definition of done.

| Dimension | Reference | Ours (must hit) |
|---|---|---|
| Marts / levels | 2 | **20 + Endless Prestige** |
| Distinct products | ~9 | **48** |
| Processing machines | ~4 | **22** |
| Staff classes | 3 | **6 classes × 3 tiers = 18 staff types** |
| Staff AI | Pile-up, stuck | Auction-based, reserve-locked, **0 stuck events in 30-min soak test** |
| Player upgrades | 2 (speed, capacity) | **14 tracks**, each 12 levels |
| Camera | Fixed | Orbit, zoom, tilt, manager top-down, cinematic intro sweep |
| Lighting | Flat | Realtime GI-lite (light probes + SSAO + contact shadows + soft shadows) |
| Post FX | None | ACES tonemap, bloom, DOF, vignette, subtle chromatic aberration, motion-blur-free (mobile) |
| Animation | Basic | Full skeletal-free **procedural rig** (spine/limb springs, squash-stretch, IK feet, head-look, blink, carry-lean) |
| Audio | Basic SFX | 8-layer procedural ASMR mix + 4 adaptive music stems + spatial bus |
| Accessibility | None | **9 accessibility features** (§10.5) |
| Save | Fragile | Versioned, checksummed, migratable, cloud+local, <300 KB |
| Localisation | EN | EN, ES, PT-BR, ID, HI, UR, JA, KO, TR, DE, FR (11) |
| Monetisation | Ads | **Zero ads, zero IAP** in v1 |
| Bundle | — | < 8 MiB initial, < 25 MiB total |
| Time-to-interactive | — | < 3.5s on 4G |

---

## 4. TECHNICAL STACK & HARD CONSTRAINTS

### 4.1 Stack (use exactly this unless a hard blocker appears — then justify in a comment)
- **Rendering:** **Three.js r16x+** (`three`) with `WebGL2`, custom `ShaderMaterial` only where needed. *Alternative permitted:* PlayCanvas. **Do not** use Unity WebGL or Godot HTML5 (bundle bloat, cert risk).
- **Language:** **TypeScript**, `strict: true`, `noUncheckedIndexedAccess: true`.
- **Bundler:** **Vite** (`vite build --target es2020`), Brotli + Gzip output.
- **State:** hand-rolled ECS (SoA typed arrays) — **no** state library.
- **Audio:** **Web Audio API, 100% procedural.** Zero audio files in the bundle.
- **Assets:** **Procedurally generated at runtime and/or build time.** See §13.
- **SDK:** YouTube Playables SDK (`https://www.youtube.com/game_api/v1`) with a **shim** so the game runs standalone too.
- **Testing:** Vitest for sim logic, Playwright for smoke + perf.
- **Hosting:** Vercel (preview deploys per milestone).
- **DB (optional, for leaderboards/telemetry):** Supabase.
- **Repo:** GitHub. **Cloud storage:** the user's **Google Drive**.

### 4.2 Runtime hard rules
- 🔴 **Zero network requests at runtime.** No CDN, no fonts from Google, no remote JSON, no analytics beacons. Everything bundled. Assets on Google Drive are *build-time only*.
- 🔴 **No external font files.** Bundle a subsetted WOFF2 (≤ 60 KB) or draw UI text with an MSDF atlas generated at build time.
- 🔴 **All 3D content generated by code or loaded from bundled files.** Never `fetch()` a `.glb` from a URL.
- 🔴 **No `eval`, no dynamic `import()` of unbundled code.**
- 🔴 **Deterministic simulation** with a seeded PRNG (`mulberry32`). Same seed + same inputs = same result. No `Math.random()` anywhere in sim code.
- 🔴 **Fixed timestep** sim at 60 Hz with accumulator; render decoupled and interpolated.
- 🔴 **Object pooling** for every transient: cash notes, particles, floating text, customers, crates.
- 🔴 **No per-frame allocations** in the hot loop (no `new Vector3()` in `update`; use a scratch pool).
- 🔴 **Pause correctness:** on `onPause`, halt sim + suspend `AudioContext`; on `onResume`, re-arm with a 300ms grace.

### 4.3 Certification budgets (Playables)
| Metric | MUST | SHOULD (our target) |
|---|---|---|
| Initial bundle | < 30 MiB | **< 8 MiB** |
| Total bundle | < 250 MiB | **< 25 MiB** |
| Single file | < 30 MiB | **< 512 KiB** |
| Saved data | < 3 MiB | **< 300 KiB** |
| JS heap peak | < 512 MB | **< 180 MB** |
| File count | ≤ 8,000 | **< 250** |
| Time to interactive | < 5s | **< 3.5s** |
| Portrait | Required | **Portrait-first, landscape supported** |

---

## 5. ART DIRECTION — "PREMIUM TOY STORE"

The reference is bright, flat and cartoonish with a stickman hero. **Change the graphics meaningfully, but keep the instant readability that made it a 61M-play hit.**

### 5.1 The look in one sentence
> A **soft-lit, chunky, toy-diorama supermarket** — rounded bevels, matte-plastic and brushed-aluminium materials, warm honeyed key light, cool teal fill, drifting dust motes, and lush animated produce — rendered like a Pixar short set on a tabletop.

### 5.2 Camera language
- Default: **3/4 perspective, 38° FOV**, dollied to frame the whole mart, character always in lower third.
- **Orbit:** drag empty space → yaw ±35°, pitch 25°–65°. Auto-returns to framing after 4s idle.
- **Zoom:** pinch / wheel, 0.75×–1.6×.
- **Manager Cam:** tap a button → smooth 800ms `easeInOutCubic` sweep to a 72° top-down schematic view that overlays **flow arrows** (goods paths, staff routes, congestion heat). This is a headline feature the reference has nothing like.
- **Cinematic intro:** on mart load, a 2.5s curved dolly from above the roof down to the hero — skippable by any input.

### 5.3 Character design (replacing the stickman)
- **Chunky rounded proportions:** head 1.4× body width, mitten hands, no visible fingers, oversized shoes.
- **Procedural rig — no skinning files.** Build each character from ~18 primitives (capsules, rounded boxes, spheres) parented in a bone-like hierarchy. Animate with code:
  - **Legs:** 2-bone IK planted on the floor; footstep lattice driven by distance travelled, not time.
  - **Spine:** spring-damped lean opposite to acceleration + carry weight.
  - **Arms:** IK to carry-stack anchor; elbows bend under load.
  - **Head:** look-at nearest salient stimulus (customer, cash, jammed machine) with a 12°/s slew, max ±40°.
  - **Blink:** Poisson-distributed, 90–140ms, tied to mood.
  - **Squash/stretch:** on pickup, drop, bump, and sale.
- **Six staff archetypes**, each readable at 1/8 screen size by **silhouette alone**:
  1. **Cashier** — visor cap + apron, holds scanner
  2. **Stocker/Loader** — backwards cap, stack of crates on back
  3. **Farmer** — straw hat, watering can
  4. **Chef** — toque, towel over shoulder, rolling pin
  5. **Barista** — half-apron, milk jug
  6. **Guard** — peaked cap, flashlight (anti-thief)
- **Tiers:** Junior (neon-bright uniform), Senior (adds gold trim + tool), Manager (adds sash + floating crown-ish halo of tiny stars). Visible tier = instant legibility.

### 5.4 Materials & shading
- **Matcap-free, PBR-lite:** `MeshStandardMaterial` with carefully authored roughness maps generated procedurally (noise-based).
- **Rounded-bevel geometry** everywhere: build with a `roundedBox()` helper (extruded rounded rect + bevel) — this single choice does 60% of the "professional" work.
- **Material families:** MattePlastic (r=0.62), GlossPlastic (r=0.18), BrushedMetal (r=0.34, metalness 0.9), Wood (procedural grain shader), Fresh produce (r=0.4, subtle SSS fake via rim term), Glass (transmission-lite, faked with fresnel + env).
- **Motion-off surfaces:** floors get a procedurally generated tiled checker/terrazzo texture with grout lines, generated once to a 512² `CanvasTexture` and reused.

### 5.5 Lighting rig
1. **Key:** warm directional `#FFE9C8`, intensity 2.2, 15° elevation, casts soft shadows (PCFSoft, 2048² cascade on desktop / 1024² mobile, 3 cascades).
2. **Fill:** cool hemisphere `#8FB8D9` / ground `#4A3F35`, intensity 0.55.
3. **Bounce:** subtle point light near the ceiling `#FFF2DD`, intensity 0.4, no shadow.
4. **Practical lights:** every shelf gets a warm strip emissive; the till gets a small glow; vending machines glow cyan.
5. **Contact shadows:** cheap screen-space AO (custom 8-tap, quarter-res) + a baked-in dark radial blob under every dynamic object — this sells grounding more than any other trick.
6. **Light probe:** 16 hand-placed probes sampled into a tiny 3-band SH volume for ambient tint variation across the mart (adds real production value for ~2 KB).

### 5.6 Post-processing chain (mobile-budgeted)
`Render → Bloom (threshold 0.82, strength 0.28) → SSAO (quarter-res) → ACES tonemap → Vignette (0.18) → FXAA`
DOF is **desktop-only** and only during menu/manager-cam. **Motion blur: never.** All togglable from Settings → Graphics (Low / Balanced / High / Ultra).

### 5.7 Palette (use these exact values as the base)
```
Cream       #FFF6E9   Sugar       #F4E4CE   Honey      #FFC65C
Tomato      #E8503A   Leaf        #4FA85C   Berry      #8E5BC9
Teal        #2E9E9B   DeepTeal    #1C5F63   Navy       #23324A
Wood        #B07C4A   Metal       #C8CED6   Ink        #16181D
Gold        #F2B33D   Mint        #A8E6C1   Coral      #FF8B6B
```
- **Semantic tokens:** `money=Gold`, `success=Leaf`, `warning=Honey`, `danger=Tomato`, `locked=Ink@40%`, `premium=Berry`.
- **Colour-blind-safe variant** available in Settings: swap Tomato↔Berry for danger/premium, add shape glyphs to all status icons.

### 5.8 Environment dressing (cheap, huge payoff — generate all procedurally)
Ceiling trusses, hanging pendant lamps with warm bulbs, price-tag bunting, potted herbs, a scuffed mop bucket, cardboard boxes with procedural label decals, a cork bulletin board with pinned notes, steam from the coffee machine, frost on the freezer glass, a ceiling fan with slow rotation, a scooter poster on the wall, wall clock with real-time hands, and **dust motes** (a 400-point GPU particle system drifting in the key light).

---

## 6. CORE ARCHITECTURE

### 6.1 Module map (create these files)
```
src/
  core/       rng.ts  loop.ts  ecs.ts  pool.ts  events.ts  save.ts  shim-playables.ts
  sim/        world.ts  grid.ts  flowfield.ts  jobs.ts  economy.ts  customers.ts
              staff.ts  machines.ts  crops.ts  animals.ts  checkout.ts  thief.ts
              progression.ts  objectives.ts  weather.ts
  render/     renderer.ts  camera.ts  materials.ts  geometry-helpers.ts
              instancing.ts  post.ts  probes.ts  sprite-atlas.ts
  characters/ rig.ts  animator.ts  archetypes.ts
  ui/         hud.ts  shop.ts  staff-panel.ts  map.ts  settings.ts  toast.ts
              a11y.ts  i18n/  styles.ts
  audio/      engine.ts  synth.ts  music.ts  mix.ts
  content/    marts.ts  products.ts  upgrades.ts  staff-defs.ts  goals.ts  tuning.ts
  main.ts
```
**Rule:** `sim/` must not import from `render/` or `ui/`. Ever. The sim publishes events; render and UI subscribe. This is what makes it testable and bug-free.

### 6.2 The world tick (fixed 60 Hz)
```
1. Input intent → player desired velocity
2. Player move + collide + IK
3. Crop/animals tick (growth timers, hunger)
4. Machine tick (input consumption, progress, output spawn)
5. Shelf tick (slot occupancy)
6. Job board rebuild (dirty-flag driven, ≤1×/tick)
7. Staff AI: bid → claim → path → act → release
8. Customer spawn (arrival curve), then per-customer FSM
9. Checkout tick (queue advance, transaction, cash spawn)
10. Cash pickup, thief timer, security
11. Economy + objective evaluation + progression checks
12. Emit events (rate-limited) → render/audio/UI consume
```

### 6.3 Single source of truth
The ECS state **is** the UI state. The staff panel, the shop prices, the goal tracker — all read live from the sim. **F4 (UI desync) is impossible by construction.** Enforce with a code-review comment on every UI file: `// READS FROM SIM ONLY — never cache authoritative values`.

---

## 7. SIMULATION SYSTEMS — FULL SPECIFICATION

### 7.1 Movement & navigation (kills F1, F2, the "stuck on counters" bug)
- World is a **2D nav grid**, 0.25 m cells, generated from the mart layout at build of the scene. Static obstacles rasterised with a 0.28 m inflation radius.
- **Flow field** recomputed with a **budgeted Dijkstra** (max 4 ms/frame slice) to each *goal group* (each shelf, each machine input, each till, each crop). Goals are grouped — 40 shelves do NOT mean 40 fields.
- **Local avoidance:** ORCA-lite — a 6-vector velocity-obstacle sample, not a full RVO solve. Agents never touch (0.34 m personal space).
- **No static blockers:** any counter, machine or plot edge is excluded from navmesh *and* from `reservedTile`s; a reservation that has not been released after 8s triggers an auto-release + a debug counter increment (must stay at 0).
- **Stuck detector:** if an agent's position delta < 0.02 m over 1.2 s while it has a target, it re-paths once, then teleports-in-place-to-nearest-free-tile (invisible to player, logged in dev builds).
- **Spatial hash** for all neighbour queries (cell 1 m). No O(n²) anywhere.

### 7.2 Staff AI — Contract-Net Auction (kills F2 and F3)
This is the single most important system upgrade over the reference. Do **not** use "nearest task" logic.

```
Every 250 ms, the JobBroker rebuilds open jobs.
A Job = { id, type, targetTile, requiredRole, priority, payload, claim:null }

For each idle staff member:
  1. FILTER jobs by capability tag (cashier can't farm; but Manager can do all).
  2. SCORE each remaining job:
       score =  basePriority
              + urgencyBonus        // shelf slots <25% full → +40
              - distance / 12
              + affinityBonus       // same-class-multiple-times-was-assigned-to
              - claimedByOthersScore// if claimed, ×0 (hard filter)
              - congestionPenalty   // other agents within 1.6m of target → -25 each
  3. Staff places a bid; the broker runs a global greedy assignment
     (sort all bids desc, assign if job unclaimed and staff unassigned).
  4. Winner CLAIMS the job: sets reservation on target tile + machine.
  5. On completion or failure → release. Never longer than 12s without progress.
```
- **The No-Wait Rule (F3 fix):** a staff member picking up from a batch source (`tomatoes`, `eggs`, `milk`) takes **min(available, freeCarrySlots)** and **departs immediately**. It never waits to fill up. Add an explicit unit test asserting departure when available < capacity.
- **Anti-pile-up:** each shelf/machine exposes `maxConcurrentWorkers` (default 2). Claims beyond that are refused at the broker level, so 5 stockers can never converge on one shelf.
- **Personality:** each staff instance gets `{ diligence, chattiness, tidiness }` in 0–1; multiplies bid priority slightly so the crew feels individual without breaking logic.
- **Off-shift behaviour:** idle staff walk to the break room, drink coffee, stretch, chat in pairs (procedural bubble icons). Store never has a dead-looking floor.

### 7.3 Carrying & stacking
- Player and staff carry a **vertical stack** anchored above the head, up to `carryCapacity`.
- Stack rendering: items are individual instanced meshes, oriented by a spring, with a max of **1° sway per item** compounding (looks alive, reads clearly).
- Capacity is **type-agnostic** (like the reference) — simplicity is the point. But **output matching** is enforced: a stocker carrying tomatoes cannot fill the bread shelf; the broker filters this.
- Upgrades: capacity 3 → 30 across 12 levels.

### 7.4 Shelves
- A shelf is `{ shelfId, accepts: ProductId, slots: Slot[], capacityPerSlot }`.
- Slot visual states: `EMPTY` (dark, faint pulsing outline in `warning`), `PARTIAL`, `FULL` (item mesh + count decal).
- When a customer takes the last unit, the shelf emits `SHELF_LOW` → the broker spawns a high-priority restock job within 1 tick. **This is how the player always knows what's wrong without reading a HUD.**
- Auto-restock aura: with the `Smart Shelf` upgrade, staff path to the shelf proactively at 40% instead of waiting for empty.

### 7.5 Machines (22 total — see §8.2)
- State machine: `IDLE → WAITING_INPUT → PROCESSING → OUTPUT_READY → BLOCKED_OUTPUT`.
- `PROCESSING` shows a **progress ring on the machine chassis** (an emissive shader arc) plus physical animation (conveyor, rotation, steam, bubbles).
- Throughput upgrades reduce `processTime`; capacity upgrades raise `maxQueue`.
- **Jam mechanic (soft):** if output is not collected for 45s, the machine blinks `warning` and shows a wrench icon → a `REPAIR` job spawns. Player or any staff can clear it in 1.2s. Jams are *recoverable*, never run-ending (P4).
- Every machine has a **unique silhouette AND a unique sound** so the mart becomes an audible orchestra.

### 7.6 Crops
- `plant → grow (staged 4-phase visual: sprout, leaf, flower, ripe) → harvestable → regrows`.
- Growth is `dt`-based with a light "water" flourish: with the Irrigation upgrade, plots auto-water (particles).
- Overripe state after 3× growth time: the crop turns dull and drops in value 20% — creates a *gentle* reason to keep moving, never a punishing one.
- Yields: `baseYield + floor(upgradeLevel / 3)`.

### 7.7 Animals
- Hen: needs `feed` in the trough → lays eggs on a timer → egg appears in nest → collect.
- Cow: needs `hay` → produces milk → milk can sits on the pad → collect.
- Animals have **procedural idle animation**: head bob, tail swish, occasional hop, blink, and a heart bubble when fed. Feeding them should feel *nice*.
- **Welfare bonus (new, ours):** keeping animals fed continuously for 60s grants a +15% output buff with a visible golden glow. Rewards good management instead of just preventing decay.

### 7.8 Customers (the "easier / more clients" mandate)
- **Arrival rate:** `λ(t) = baseRate × martMultiplier × (1 + 0.08 × unlockedProducts) × marketingBuff`.
  - `baseRate` starts at **0.55 customers/sec** (the reference feels ~0.2–0.3). More traffic = more money = easier.
- **Population cap:** `min(28, 6 + 2 × unlockedProducts)`. Queue overflow is fine — customers shop in parallel.
- **Customer FSM:** `ENTER → SHOPPING (pick 1–4 items) → QUEUE → PAYING → EXIT` with two failure branches `IMPATIENT_EXIT` (no item in stock >12s) and `ANGRY_EXIT` (queue wait > patience).
- **Patience:** `18s + 4s × checkoutUpgradeLevel`, shown as a shrinking arc above the head that only appears in the last 45%.
- **Baskets are visual:** each customer holds a small basket; purchased items physically appear in it. When served, the cashier scans each with a beep + a little hop. **This single animation loop is the game's heartbeat — do it beautifully.**
- **Variety:** 12 procedural customer archetypes (toddler-on-shoulders, hurried businessperson, elderly couple, delivery courier, kid with a lollipop, tourist with a camera…) with different walk speed, patience multiplier and basket capacity. All generated from the same procedural rig with different proportions + accessory props. Zero extra art cost, enormous perceived richness.
- **Never-block rule:** a customer who cannot path to their target item re-targets to any available product after 2s. Customers cannot deadlock.

### 7.9 Checkout & cash
- Queue is a physical spline with ordered markers, real personal-space spacing, and a serpentine layout in later marts.
- Serving time `1.1s - 0.03 × cashierUpgradeLevel` (floor 0.35s) per customer per cashier.
- **Cash spawns physically** (like the reference) as a stack of notes on the counter. But:
  - Collection radius is **1.1 m** (the reference is ~0.3 m) so it feels magnetic and fair.
  - With the `Cash Magnet` upgrade it auto-collects within 4 m.
  - **Uncollected cash never disappears.** It only triggers a thief (§7.10).
- Every sale produces `+$N` floating text in `Gold`, a coin-clink, and a tiny scale-pop on the money counter.

### 7.10 Thief & security (de-fanged, per P4)
- **Do not** copy the punishing net-chase as the only defence. Instead:
  - A thief spawns **only** if cash on a counter exceeds `$80 + $40 × martIndex` **and** sits 20s.
  - A **6-second telegraph** (a shifty silhouette at the door, a subtle music sting, a `!` marker) — always fair.
  - Player can (a) reach the cash to secure it, (b) tap the thief to point at him so a Guard intercepts, or (c) chase with the net as in the reference (net is a fun optional mini-game, with a generous aim assist cone).
  - Loss is capped at **25% of the pile**, never the whole thing.
- Hiring a **Guard** disables the mechanic entirely at that store. Progression = the player can *retire* the annoyance. This is the correct fix.

### 7.11 Offline / idle earnings
- On resume, `earn = Σ(marts' effectiveRate × offlineSeconds × 0.35)` capped at **4 hours**.
- Presented as a friendly "While you were away" card with a per-mart breakdown and a `2× for watching (optional, SDK rewarded ad — if unavailable, skip silently)` button. **No dark patterns: state that the bonus never changes progression, only accelerates it.**

---

## 8. ECONOMY, CONTENT & TUNING (exact numbers — do not wing it)

### 8.1 Product catalogue (48 items)
| Tier | Product | Base sale $ | Unlock mart |
|---|---|---|---|
| 1 | Tomato | 8 | 1 |
| 1 | Apple | 10 | 1 |
| 1 | Cucumber | 9 | 2 |
| 1 | Bread | 26 | 2 |
| 1 | Egg | 14 | 1 |
| 1 | Milk | 18 | 2 |
| 1 | Flour | 16 | 2 |
| 2 | Cheese | 42 | 3 |
| 2 | Butter | 36 | 3 |
| 2 | Yogurt | 30 | 3 |
| 2 | Dough | 34 | 4 |
| 2 | Tomato Preserve | 60 | 3 |
| 2 | Apple Juice | 44 | 4 |
| 2 | Coffee Bean | 22 | 3 |
| 2 | Coffee | 55 | 5 |
| 2 | Latte | 95 | 6 |
| 2 | Cappuccino | 88 | 6 |
| 2 | Croissant | 70 | 5 |
| 2 | Donut | 64 | 6 |
| 2 | Bagel | 58 | 5 |
| 3 | Pizza Slice | 85 | 7 |
| 3 | Whole Pizza | 190 | 7 |
| 3 | Burger | 110 | 8 |
| 3 | Fries | 52 | 8 |
| 3 | Milkshake | 100 | 8 |
| 3 | Sushi Roll (8pc) | 165 | 9 |
| 3 | Nigiri | 90 | 9 |
| 3 | Ramen Bowl | 145 | 10 |
| 3 | Dumplings (6) | 120 | 10 |
| 3 | Taco | 96 | 11 |
| 3 | Burrito | 135 | 11 |
| 3 | Nachos | 88 | 11 |
| 3 | Popsicle | 68 | 12 |
| 3 | Ice Cream Cone | 78 | 12 |
| 3 | Sundae | 130 | 12 |
| 3 | Fruit Smoothie | 118 | 13 |
| 3 | Bubble Tea | 126 | 13 |
| 4 | Cake Slice | 140 | 14 |
| 4 | Whole Cake | 420 | 14 |
| 4 | Chocolate Bar | 74 | 14 |
| 4 | Pet Kibble | 82 | 15 |
| 4 | Pet Toy | 108 | 15 |
| 4 | Vitamin Pack | 96 | 16 |
| 4 | Phone Case | 155 | 17 |
| 4 | Earbuds | 290 | 17 |
| 4 | Bouquet | 175 | 18 |
| 4 | Potted Herb | 92 | 18 |
| 5 | Popcorn Bucket | 115 | 19 |
| 5 | Cinema Combo | 260 | 19 |
| 5 | Duty-Free Gift Box | 380 | 20 |
| 5 | Signature Mart Box | 600 | 20 |

### 8.2 Machines (22)
`Mill, Oven, Churn, Blender, Coffee Machine, Espresso Machine, Fryer, Griddle, Grill, Sushi Roller, Noodle Boiler, Steamer, Ice Cream Churn, Freezer, Smoothie Blender, Bubble Tea Sealer, Cake Oven, Decorating Station, Packing Station, Kibble Dispenser, Electronics Assembler, Florist Wrapping Station`
Each has: `inputProducts[]`, `processTime`, `maxQueue`, `outputProduct`, `powerDraw` (flavour only), `upgradeTrack`.

### 8.3 Economy formulas — use these verbatim
```
salePrice(item)   = baseValue × (1 + 0.045 × martIndex) × (1 + 0.02 × productUpgradeLevel)
upgradeCost(track, level) = ceil( baseCost(track) × growth(track) ^ level )
hireCost(role, n) = ceil( baseHire(role) × 1.55 ^ (n - 1) )      # CHEAP by design
wagePerMin(role, tier) = baseWage(role) × (1 + 0.8 × (tier - 1))
```
| Track | baseCost | growth | effect per level |
|---|---|---|---|
| Player speed | 120 | 1.28 | +6% move speed (cap 2.4×) |
| Carry capacity | 180 | 1.30 | +1 slot every level to 30 |
| Checkout speed | 200 | 1.32 | −0.03s serve time |
| Walk-in rate (Marketing) | 260 | 1.34 | +7% customer arrivals |
| Shelf capacity | 240 | 1.30 | +2 per slot |
| Machine speed (global) | 320 | 1.30 | −5% process time |
| Animal output | 300 | 1.32 | +8% yield |
| Crop yield | 300 | 1.32 | +8% yield |
| Staff speed | 280 | 1.28 | +6% staff move |
| Staff capacity | 300 | 1.30 | +1 staff carry slot |
| Cash magnet | 160 | 1.26 | +0.7 m radius |
| Patience | 220 | 1.30 | +4s customer patience |
| Smart Shelf | 420 | 1.36 | proactive restock at 60%→40% |
| Auto-Hire | 500 | 1.40 | unlocks + tiers the auto-hire assistant |

**Income sanity check:** with 8 products live and λ≈1.1 cust/s at a $40 average basket, gross ≈ $44/s. A $1,200 upgrade therefore costs ~27 s of play. **The reference's core complaint (F6) is gone.**

### 8.4 Staff roster & costs
| Role | baseHire | baseWage/min | Capability |
|---|---|---|---|
| Cashier | **$90** | $6 | Serve checkout queues |
| Stocker | **$90** | $6 | Shelf restock from any source |
| Farmer | $110 | $7 | Harvest crops, feed animals, collect eggs/milk |
| Chef | $150 | $9 | Operate machines (feed input, collect output) |
| Barista | $170 | $10 | Coffee-class machines + counter |
| Guard | $220 | $12 | Intercept thieves, +8% patience aura |

> **P4 note:** the first Cashier and first Stocker are **granted free** as tutorial rewards, and `hireCost` starts at just $90. This is deliberately ~4× cheaper than the reference's early economy. **Easier hiring is a requirement, not a suggestion.**

### 8.5 Staff upgrades (per staff instance)
Each staff member has 4 tracks × 8 levels: `Speed`, `Carry`, `Efficiency` (task duration), `Stamina` (rarely tires — cosmetic bonus +8% output).
Tier promotion at levels 4 and 8 → visual upgrade in uniform + silhouette prop (P6/§5.3 legibility).

### 8.6 Auto-Hire (the flagship "more helpers easily" feature)
Once unlocked, a persistent assistant (a little floating clipboard robot, procedurally built, with an idle bob and blink — it should feel *adorable*) offers:
- **"Hire what's needed"** — instantly buys the role with the worst bottleneck, at 1.0× cost.
- **"Auto-assign"** — re-balances idle staff to the highest-urgency job group every 5s.
- **"Auto-upgrade cheapest"** — optional toggle, buys the lowest-cost upgrade whenever affordable.
All three are player-controlled toggles. **Automation must never feel like the game playing itself** — keep the Manager Cam and layout decisions manual.

### 8.7 Difficulty curve (a *welcoming* curve)
| Mart | Time to clear (target) | New mechanic | Challenge |
|---|---|---|---|
| 1 | 4–6 min | Basics | None — tutorial |
| 2 | 6–8 min | 2nd production chain | Light |
| 3 | 8–10 min | Animals | Light |
| 4 | 9–12 min | Machine jams | Medium |
| 5 | 10–13 min | 2nd checkout | Medium |
| 6 | 12–15 min | Staff tiers | Medium |
| 7–10 | 14–20 min | Multi-building layout, weather | Medium+ |
| 11–15 | 18–25 min | Cross-building logistics, events | Hard |
| 16–20 | 22–30 min | Full automation puzzle | Hard |
| Prestige | endless | All systems, modifier runs | Optimisation |

**Early ramp rule:** the first 90 seconds must hand the player money 3 times. If a playtester hasn't earned $500 by t=90s, the tuning is wrong.

---

## 9. LEVELS — 20 MARTS + ENDLESS

Each mart is a **hand-authored layout in a data file** (`content/marts.ts`), not a random generator, and features **one new verb**, **one new visual theme**, and **one signature prop**.

| # | Mart | Theme / palette | New verb | Signature |
|---|---|---|---|---|
| 1 | **Corner Mart** | Warm wood, morning sun | Harvest & sell | Rolling green door |
| 2 | **Farmers' Market** | Canvas awnings, straw | Stock a mixed stand | Hand-painted price boards |
| 3 | **Bakery Mart** | Cream & wheat, flour dust | Feed the oven | Rotating bread carousel |
| 4 | **Dairy Mart** | Cool blue, frosted glass | Milk the cow | Cheese wheel stack |
| 5 | **Pizza Mart** *(reference level)* | Terracotta, hot orange | Build a pizza (multi-input) | Brick wood-fired dome |
| 6 | **Cafe Mart** *(reference level)* | Walnut & brass, warm lamps | Latte art mini-step | Chalkboard menu, espresso hiss |
| 7 | **Burger Mart** | Chrome & ketchup red | Assemble a burger | Neon "OPEN" sign |
| 8 | **Sushi Mart** | Pale cedar, indigo | Rice timing (window) | Conveyor belt |
| 9 | **Noodle House** | Steam & lanterns | Broth boil timing | Bamboo steamers |
| 10 | **Juice Bar** | Citrus & mint | Blend 2 inputs | Fruit pyramid display |
| 11 | **Donut Mart** | Pink glaze & sprinkles | Glaze & decorate | Rotating donut wall |
| 12 | **Ice Cream Parlour** | Pastel, candy stripes | Freeze (temperature) | Walk-in freezer |
| 13 | **Taco Mart** | Sunset orange, papel picado | Grill timing | Taco al pastor spit |
| 14 | **Cake Boutique** | Blush & gold | Decorate (aim & place) | Glass display case |
| 15 | **Pet Mart** | Lime & sky | Feed & care (welfare) | Aquarium wall |
| 16 | **Pharmacy Mart** | Clinical white & mint | Sort & label | Cross-aisle queue rail |
| 17 | **Tech Mart** | Charcoal & cyan | Assemble & test | Server rack hum |
| 18 | **Florist Mart** | Lavender & sage | Arrange a bouquet | Flower cooler mist |
| 19 | **Cinema Snack Bar** | Plum & marquee gold | Rush hour (burst) | Popcorn machine |
| 20 | **Mega Mart** | Full-spectrum, polished | **Everything at once** | Two floors + escalator |

**Unlock rule:** clearing a mart's 3 goals unlocks the next. Stars: ★1 reach revenue target, ★2 serve N customers without an angry exit, ★3 do it under a time target. **No star is ever required to progress** (P4) — only ★1.

**Endless Prestige:** after mart 20, loop marts with a random `Modifier` (e.g. `Double Traffic / Half Patience`, `Only 2 Staff`, `No Machines`, `Reverse Layout`) and carry a permanent ×1.12 income multiplier per loop. Scoreboard via Supabase.

---

## 10. UI / UX SPECIFICATION

### 10.1 Layout (portrait-first)
```
┌──────────────────────────────┐
│  $ 12,480   ★★☆   Mart 5/20  │  ← top bar, 8% height, frosted glass
│                              │
│                              │
│        [ 3D WORLD ]          │  ← 76% height
│                              │
│  ┌────────────────────────┐  │
│  │ ⬆ Upgrade  👥 Staff    │  │  ← bottom dock, thumb-reachable
│  │ 🗺 Map      ⚙ Settings │  │
│  └────────────────────────┘  │
└──────────────────────────────┘
```
- Everything is **thumb-reachable in the bottom 30%**.
- Top bar auto-dims to 30% opacity after 6s of no input; any tap restores it. **Maximises the world.**

### 10.2 Interaction map
| Input | Action |
|---|---|
| Drag anywhere on the world | Move hero (with a **virtual stick that forms where you touch**, + a faint on-floor ripple) |
| WASD / Arrows | Move (desktop) |
| Tap an object | Contextual focus (shelf contents, machine queue, staff card) |
| Two-finger drag | Orbit |
| Pinch / wheel | Zoom |
| Tap `Manager Cam` | 800ms sweep to schematic |
| Long-press anywhere | Radial "point at this" command — assigns the nearest idle staff |
| `P` / pause icon (in Settings) | Pause |

**The hero must never be the only way to move.** But it *is* the only means of transportation — this preserves the reference's feel.

### 10.3 Selling moments (where the money feeling lives)
These deserve disproportionate polish. Each must be a satisfying ~250ms beat:
1. **Cashier scans** — scale-pop + `beep` pitched to a pentatonic ladder (so a rush sounds like music).
2. **Cash stack appears** — notes flutter up then settle with a spring.
3. **Pickup** — notes flow into the money counter along a bezier, counter digits roll (per-digit odometer, ≤ 220 ms).
4. **Purchase** — a satisfying *thunk*, screen dip 1.5px, gold sparkle from the receipt card.
5. **Milestone** — brief time-dilation to 0.6× for 400 ms + confetti + a toast.

### 10.4 Screens
- **Shop / Upgrade** — a horizontally paged card deck, one card per track, live preview of the effect (`12 → 14 slots`), affordability state, and a 3-second "what it does" micro-animation on each card. **No walls of text.**
- **Staff Panel** — roster grid, live task label per staff ("→ Shelf 3"), fatigue ring, promote button, wage line, and a **live minimap dot** showing exactly where each is. *This is the direct answer to F4.*
- **Mart Map** — a horizontal carousel of mart "postcards" (procedural 3D thumbnails rendered once to a texture at build), with star state and a big `PLAY`.
- **Goals** — 3 pills in the world, floating near their relevant station, not a modal.
- **Settings** — Audio, Graphics (Low/Balanced/High/Ultra), Haptics, Language, Accessibility, Cloud Save status, Credits, and **Pause/Restart/Exit** (fixes F9).

### 10.5 Accessibility (all 9 required)
1. Dynamic type 80%–160%.
2. Reduce motion (disables camera springs, parallax, dust, screen shake).
3. Colour-blind palettes ×3 (deuteranopia, protanopia, tritanopia) + shape glyphs on every status.
4. High-contrast UI mode.
5. Full remappable keys + one-switch scan mode.
6. Subtitles/captions for all non-diegetic sounds (e.g. `[cash register]`).
7. Screen-reader labels on every UI control and live-region announcements for purchases/goals.
8. Difficulty assists: `+50% patience`, `+25% income`, `no thief` — all rewards-independent, no penalty, no badge shaming.
9. Photosensitivity-safe: no flashes > 3 Hz anywhere.

### 10.6 Localisation
Ship EN + 10 locales (§3). All strings in `content/i18n/*.json`, keys only, no concatenation, RTL supported for `ar`/`ur` (mirror the entire layout).

---

## 11. AUDIO — 100% PROCEDURAL (zero audio files)

### 11.1 Synthesis engine
One `AudioEngine` on the Web Audio API with a **master bus → compressor → limiter** and 4 sub-buses: `SFX`, `ASMR`, `MUSIC`, `UI`. All sound is generated from oscillators + noise + filters + convolution IRs built from code (impulse = decaying noise burst).

### 11.2 The ASMR layer (this is the game's soul — the reference is literally played as ASMR)
8 concurrent, distance-attenuated loops, each spatialised by `PannerNode` at the source's world position:
| Layer | Synthesis |
|---|---|
| Shelf restock | short filtered noise `thwip` + item clack, pitch by product tier |
| Register beep | sine + 3rd harmonic, pentatonic ladder, 90 ms |
| Coin clink | 3-partial additive bell, 1.2 kHz base, 180 ms decay |
| Machine hum | sawtooth 60 Hz + LFO 0.4 Hz + lowpass, gain by machine count |
| Oven/sizzle | band-passed white noise, 2–6 kHz, amplitude-modulated by a 7 Hz random walk |
| Steamer hiss | high-passed noise burst, 400 ms |
| Footsteps | filtered impulse, pitch by surface (tile/wood/mat) |
| Crowd murmur | 3 detuned formant filters over pink noise, gentle |

### 11.3 Adaptive music
4 stems, all procedural (no samples): `Bass`, `Pluck Arp`, `Pad`, `Percussion`. Intensity = f(customer count, queue length). Crossfade over 2 bars between:
`Calm (0 customers) → Busy → Rush → Panic (queue > 6)`.
Key: D major pentatonic. Tempo 92 BPM, +4 BPM per intensity tier. **The music must never loop audibly** — use a weighted Markov chain over 8 chord movements.

### 11.4 Rules
- 🔴 Respect `isAudioEnabled()` / `onAudioEnabledChange()` from the SDK.
- 🔴 **No audio before first user gesture.** Show a muted-speaker affordance until then.
- 🔴 Suspend `AudioContext` on pause/`visibilitychange`.
- 🔴 Volume sliders for all 4 buses, persisted.
- Voice count cap: **32 concurrent sources**, steal the quietest.

---

## 12. JUICE / GAME FEEL CHECKLIST (the "thousand times better" texture)

Every item below is required. The reference does maybe 4 of them.

- [ ] **Squash & stretch** on the hero for every pickup, drop, bump, jump-off.
- [ ] **Anticipation** — 100ms wind-up before every grab.
- [ ] **Follow-through** — carried stack overshoots and settles.
- [ ] **Screen dip** 1.5px on every purchase; 3px on a level-up.
- [ ] **Hit-stop** 60ms when a star objective completes.
- [ ] **Floating text** with per-character stagger and a 12% overshoot.
- [ ] **Coin/particle burst** with a 4-colour `Gold/Honey/Cream/White` palette, gravity + drag.
- [ ] **Particles are pooled** — 600 max, instanced `Points`.
- [ ] **Footprint decals** in flour/dust in Bakery, wet prints in Dairy (fade in 6s).
- [ ] **Ripple ring** at every tap point on the floor.
- [ ] **Camera micro-shake** ±0.8px on machine completion.
- [ ] **Ambient dust motes** in the key light (400 instanced points).
- [ ] **Currency counter occlusion** — money text pushes in from the right, never jumps.
- [ ] **Empty-state warmth** — a shelf that's been empty 10s gets a tiny worried face on its price tag.
- [ ] **Celebration** on mart completion: 1.2s of camera orbit, confetti, staff jumping, music key change.
- [ ] **Haptics** on mobile: 12ms tick on sale, 25ms on purchase (respect the setting).

---

## 13. ASSET PIPELINE — PROCEDURAL FIRST, BLENDER OPTIONAL

**Read this section twice. It defines how you produce everything.**

### 13.1 The prime directive
> **The shipped build must be 100% self-sufficient and 100% code-originated or bundled.** Nothing may be fetched at runtime. Nothing may depend on Blender being installed.

### 13.2 Tier 0 — Pure procedural code (this is 90% of everything)
Generate at *runtime* or at *build time*, then cache:
- **Geometry:** write a `geometry-helpers.ts` library: `roundedBox(w,h,d,radius,segments)`, `capsule`, `superellipsoid`, `lathe(profile)`, `extrudePath`, `torusRing`, `bevelPolygon`. Every prop — crates, shelves, machines, plants, animals, registers — is a **composed set of these**, merged with `BufferGeometryUtils.mergeGeometries` and drawn with **instancing** or a single merged mesh per prop type.
- **Textures:** generate every texture to a `CanvasTexture` or via a fragment shader at load: wood grain, terrazzo floor, cardboard, brushed metal, frost, chalk, price tags, labels, produce skin variation. **Zero image files.**
- **Characters:** the procedural rig in §5.3 — primitives + code animation. **Zero skinned meshes.**
- **UI:** all UI is DOM+CSS (fast, accessible, crisp text) with an SVG icon set you author inline.
- **Audio:** 100% synthesis (§11).

**Why this is the right call:** it gives us < 8 MiB initial bundle, zero licensing risk, infinite variety (procedural variation per mart), and it makes the whole game reproducible from source.

### 13.3 Tier 1 — Blender, used sparingly and optionally
The agent has its own Blender installation and **may** use it, but only for these narrow, high-value jobs. Every Blender asset must be **optional**: if the `.glb` is absent, the game falls back to the Tier 0 procedural version and still looks shippable.

Permitted Blender uses (max ~8 assets):
1. **Hero character base mesh** — one clean topology, exported as ~600-tri `.glb` → then re-skinned/re-rigged in code OR exported with 6 baked animations (`idle`, `walk`, `carry_idle`, `carry_walk`, `grab`, `celebrate`). Budget: **< 120 KB gzipped.**
2. **Signature props per theme** — the wood-fired pizza dome, espresso machine, sushi conveyor. Decimate to < 900 tris each, bake an 256² albedo+AO, export `.glb`, **< 40 KB each.**
3. **Baked normal/AO maps** for the hero props only.
4. **Mart "postcard" thumbnails** for the map screen — render 20 × 512×288 PNG (→ compress to WebP, < 18 KB each).

**Blender rules:**
- Use `bpy` scripting only — headless (`blender --background --python scripts/build_prop.py`). No hand-clicking. Everything reproducible from a script committed to the repo.
- Apply **triangulation, decimation, and a strict 4096-texel/m triangle budget** before export.
- Export with `+Y up`, `-Z forward`, `apply modifiers`, `draco` compression off (Playables-safe), `glTF separate` off.
- Run `gltf-transform optimize --compress false --texture-compress false` and record final sizes in `ASSET_MANIFEST.md`.

### 13.4 Tier 2 — Ready-made models from the internet
You may download models from reputable CC0/CC-BY sources and use them. **Rules:**
- **Allowed sources:** Kenney.nl (CC0), Poly Pizza (CC0/CC-BY), Quaternius (CC0), Poly Haven (CC0), Sketchfab **CC0 filter only**, Google Poly archives, OpenGameArt CC0.
- 🔴 **Never** use assets with NC, ND, or unknown licences. If a licence is ambiguous, do not use it — build it procedurally instead.
- Every downloaded asset **must** get an entry in `CREDITS.md` with: name, author, source URL, licence, and the local path. Non-negotiable.
- Every downloaded asset **must** be optimised through a pipeline script: `gltf-transform optimize` → decimate to budget → strip unused → re-bake textures to ≤ 512² → convert to WebP → verify final file < 512 KiB.
- Prefer downloading **textures and reference material** over whole models. A great procedural mesh beats a mediocre downloaded one. Use downloads to *study* the reference's proportions, then rebuild in code.

### 13.5 Asset budget per class
| Class | Max tris | Max texture | Max file |
|---|---|---|---|
| Hero character | 800 | procedural | 120 KB |
| Staff archetype | 600 | procedural | — |
| Customer | 450 | procedural | — |
| Machine | 900 | 256² | 40 KB |
| Shelf | 300 | 128² | 12 KB |
| Crop/plant | 150 | 64² | 4 KB |
| Animal | 500 | 128² | 10 KB |
| Environment prop | 200 | 64² | 6 KB |
| **Whole mart (visible)** | **≤ 90,000** | — | — |

### 13.6 Google Drive as cloud storage (mandatory)
The user's **Google Drive** is the cloud storage layer for all non-shipping assets. Set it up like this:

**Folder structure:**
```
My Drive/
└── MiniMart-Evolved/
    ├── 00_Docs/            # this prompt, GDD, art bible, changelogs
    ├── 01_Reference/       # screenshots & video frames of My Mini Mart
    ├── 02_Source/          # .blend files, .psd, .kra, raw recordings
    ├── 03_Downloads/       # raw downloaded models + their licence files
    ├── 04_Exports/         # optimised .glb / .webp ready to bundle
    ├── 05_Builds/          # dist/*.zip per milestone (v0.1.0 … v1.0.0)
    ├── 06_Design/          # Figma exports, palette swatches, UI mocks
    ├── 07_QA/              # soak-test logs, perf traces, cert checklists
    └── 08_Manifest/
        ├── ASSET_MANIFEST.md   # every asset: path, size, source, licence
        ├── CREDITS.md
        └── sync-log.json
```
**Protocol the agent must follow:**
1. Use the **Google Drive connector** (or `rclone` with the user's OAuth) — never ask the user to manually upload anything you can place yourself.
2. After every milestone: upload `05_Builds/vX.Y.Z/<project>.zip`, the perf report to `07_QA/`, and update `08_Manifest/ASSET_MANIFEST.md`.
3. Keep **`04_Exports/` as the single sync point** between Drive and the repo. The repo has a `scripts/pull-assets.mjs` that pulls `04_Exports/` into `public/assets/` with a SHA-256 manifest check. If a hash mismatches, fail the build loudly.
4. **Never** point the runtime at a Drive URL. Drive is build-time only.
5. Keep total Drive usage tidy; zip old builds and prune beyond the last 10.

### 13.7 Your other connections — use them all
| Connection | Required use |
|---|---|
| **Google Drive** | Cloud storage of all source/export/build/QA artefacts (above) |
| **GitHub** | Private repo `mini-mart-evolved`; commit per milestone; tag `v0.x`; keep `main` always deployable |
| **Vercel** | Deploy `main` + every PR preview; share the preview URL after each milestone so the user can play it |
| **Supabase** | (Optional, phase 2) leaderboard table `prestige_scores`, `player_id`, `mart`, `score`, `created_at`; RLS on; **anonymous only, no PII** |
| **Google Sheets** | Live economy tuning sheet — export to `content/tuning.ts` via a script; the sheet is the designer's control panel |
| **Google Docs** | Human-readable GDD mirror + changelog, auto-generated from this prompt + the repo |
| **Google Slides** | A 10-slide pitch/press deck generated at v1.0 |
| **Notion** | Project wiki: decisions log, open questions, art bible, milestone board |
| **Linear** | One issue per milestone + one per bug found in soak testing; close them as you go |
| **Dropbox** | Mirror of `05_Builds/` as a backup target |
| **Gmail** | Send the user a one-paragraph milestone summary + the Vercel link at each milestone |

**Rule:** if a connection is unavailable, continue and note it in the milestone summary. Never block the build on a connector.

---

## 14. BUILD ORDER — 12 MILESTONES (do them in order)

| # | Milestone | Deliverable | Done when |
|---|---|---|---|
| **M1** | Skeleton & loop | Vite+TS+Three scaffold, fixed-timestep loop, seeded RNG, ECS, Playables SDK shim, Vercel deploy | A spinning rounded box at 60fps on a deployed URL |
| **M2** | Procedural art kit | `geometry-helpers`, `materials`, palette, lighting rig, post chain | A static, beautifully lit test mart with 0 image files |
| **M3** | Player & nav | Grid, flow fields, ORCA-lite avoidance, hero rig + walk/carry/idle | Hero runs anywhere, never clips a counter, feet IK |
| **M4** | Core loop v1 | 1 crop → 1 shelf → 1 till → cash → collect; customers FSM | 5 minutes of genuinely fun manual play |
| **M5** | Economy & shop | 14 upgrade tracks, transactional purchase, odometer counter, shop UI | Buy/upgrade works, no double-charge, no desync |
| **M6** | Staff & the auction | JobBroker, 6 classes, no-wait rule, claims, staff panel, break room | **30-min soak: 0 stuck agents, 0 pile-ups, 0 UI desync** |
| **M7** | Depth | Machines (all 22), animals, crops, jams, thief + guard | Full production chains playable |
| **M8** | Content: 8 marts | Data-driven marts 1–8, goals, stars, map screen, unlock flow | 8 distinct, themed, finished levels |
| **M9** | Content: 20 marts + prestige | Marts 9–20, modifiers, endless loop, balance pass | 20 levels + prestige, curve holds |
| **M10** | Audio & juice | Full procedural audio, adaptive music, all 18 juice items | Mute it and it feels empty; unmute and it sings |
| **M11** | Polish & a11y | 9 a11y features, 11 locales, RTL, onboarding, settings, haptics, save-migration | All a11y toggles verifiably work |
| **M12** | Cert & ship | Perf budget pass, bundle analysis, Playables checklist, soak tests, Drive upload, deck | **Every row of §3 and §18 passes** |

---

## 15. PERFORMANCE ENGINEERING (do this continuously, not at the end)

- **Draw calls < 90.** Merge aggressively; instance everything repeating; one material per family.
- **Triangles < 120k** visible; frustum + occlusion cull; LOD by distance for customers/props.
- **One shadow-casting light only.** Everything else is unshadowed or baked.
- **Textures:** max 512², `NearestMipmapLinear` where appropriate, all generated, all reused.
- **Update budget:** sim 4 ms, render 8 ms, audio 1 ms per frame at 60 Hz on a Snapdragon 720G-class device.
- **GC:** zero allocations in the hot loop; profile with Chrome DevTools memory timeline; heap stays flat over a 10-minute session.
- **Startup:** measure to `gameReady` on a throttled "Slow 4G + 4× CPU" profile; must be < 3.5s.
- **Adaptive quality:** auto-drop to Low if the rolling 3s average frame time exceeds 22 ms, and back up after 10s of headroom. Show a one-time toast when it happens.
- Add an in-game **perf overlay** (hidden, `~` key / 5-finger tap): FPS, frame time, draw calls, tris, heap, agent count, job count.

---

## 16. SAVE, STATE & ROBUSTNESS

```ts
interface SaveV3 {
  schema: 3;
  seed: number;
  createdAt: number;  savedAt: number;
  progress: { martIndex: number; stars: Record<number, 1|2|3>; prestige: number };
  wallets: { cash: number; gems?: 0 };
  upgrades: Record<UpgradeTrack, number>;
  staff: Array<{ id: string; role: Role; tier: 1|2|3; levels: Record<string, number>; personality: [number,number,number] }>;
  marts: Record<number, { plots: string[]; shelfState: ...; machineState: ... }>;
  settings: { audio: {...}; graphics: 'low'|'balanced'|'high'|'ultra'; a11y: {...}; locale: string };
  checksum: string; // FNV-1a over the stable-stringified body
}
```
- **Save** on: mart complete, any purchase, every 20s of play, and on `onPause`/`visibilitychange`.
- **Load order:** Playables cloud → localStorage → fresh.
- **Migration:** `migrate(save)` chain `v1→v2→v3`; unknown/newer schema → keep a backup key and start fresh **without deleting the old data**.
- **Corruption:** checksum mismatch → restore the previous snapshot (keep 2 rolling snapshots) → toast the player honestly.
- **Size:** must stay **< 300 KB** for a full 20-mart save (round numbers, index arrays, no floats with 17 decimals).

---

## 17. ONBOARDING (first 90 seconds — write it exactly this way)

| t | Beat |
|---|---|
| 0.0s | Cinematic sweep down into the Corner Mart. Hero blinks. |
| 1.5s | A glowing tomato plant pulses. Ripple hint: `drag`. |
| 3.0s | Player picks a tomato → **squash + pluck**, `+1` pop. |
| 6.0s | Shelf pulses. Deposit → the shelf's empty slot lights up, then a customer appears immediately. |
| 10.0s | Till glows. Serve → `beep`, cash appears, `+$8`. |
| 14.0s | Second customer, second sale, `+$8`. **First $16 earned. Three dopamine hits by 14s.** |
| 18.0s | **FREE CASHIER** walks in with a name tag and waves. "Meet Mia — she'll run the till." |
| 26.0s | **FREE STOCKER** arrives. "And Sam stocks shelves." |
| 34.0s | The hero is now *only* farming. The player feels the automation payoff inside 35 seconds. |
| 40.0s | Upgrade card slides up: **Carry Capacity +1** — affordable. Buy it. |
| 50.0s | Goal pill appears: `Serve 20 customers ★`. |
| 90.0s | Player has ≥ $500, 2 staff, 1 upgrade. Tutorial complete. |

Skip button always present. Never block input for a tooltip longer than 1.5s. Never move the camera against the player's drag.

---

## 18. ACCEPTANCE TESTS (agent: run and report these verbatim)

| # | Test | Pass criteria |
|---|---|---|
| T1 | Boot | Interactive < 3.5s on throttled Slow-4G + 4× CPU |
| T2 | Bundle | Initial < 8 MiB, total < 25 MiB, no file > 512 KiB, < 250 files |
| T3 | Frame rate | ≥ 55 fps avg over 5 min at 1080p on the reference mid-range device profile |
| T4 | Heap | Flat over a 10-min session, peak < 180 MB |
| T5 | Draw calls | < 90 in the busiest mart (Mega Mart) |
| T6 | **Staff soak** | 30-min unattended run, 18 staff, 48 products: **0 stuck, 0 pile-ups, 0 unreleased reservations** |
| T7 | **No-wait rule** | Unit test: staff with capacity 10 and 1 available item departs immediately |
| T8 | Purchase integrity | 1,000 random purchases: 0 double-charges, 0 no-ops, wallet always consistent |
| T9 | UI truth | Staff panel name/role/task matches the ECS for 10,000 random samples |
| T10 | Save round-trip | 1,000 save→load cycles: byte-identical sim state; size < 300 KB |
| T11 | Save corruption | Corrupt the checksum → recovers from snapshot, no crash, no data wipe |
| T12 | Pause | Pause on `onPause`, audio suspends, 0 sim frames advance, resume is seamless |
| T13 | Pathing | 10,000 random start→goal pairs across all 20 marts: 100% success, 0 corridors dead |
| T14 | Determinism | Same seed + same scripted input = identical final state hash |
| T15 | Levels | All 20 marts completable to ★★★; time-to-★1 within the §8.7 targets ±30% |
| T16 | Economy | By t=90s in Mart 1, an average player has ≥ $500 |
| T17 | Onboarding | A first-time player completes tutorial without reading any text longer than 12 words |
| T18 | A11y | Every one of the 9 features demonstrably changes behaviour |
| T19 | Localisation | All 11 locales render with 0 missing keys, 0 overflow, RTL mirrors correctly |
| T20 | Network | DevTools shows **0 network requests** after initial load |
| T21 | Playables SDK | `gameReady`, `onPause`, `onResume`, `isAudioEnabled`, `saveData`/`loadData` all exercised |
| T22 | Licences | Every bundled third-party asset appears in `CREDITS.md` with a verified permissive licence |

---

## 19. ANTI-PATTERNS — DO NOT DO THESE

- ❌ Don't ship an ad, an IAP, a timer, an energy system, or a "watch this to continue." The reference has ads; we are the ad-free alternative. **This is a differentiator, say it on the title screen.**
- ❌ Don't add a crafting tree, a tech tree, or a research menu. Depth comes from *layout and staffing*, not from menus.
- ❌ Don't gate the fun behind 10 minutes of tutorial.
- ❌ Don't use pixel-art or voxel style — it abandons the reference's accessible look and undercuts "professional graphics."
- ❌ Don't generate levels randomly. Every mart is authored.
- ❌ Don't let workers wait to fill capacity. (F3.)
- ❌ Don't cache authoritative UI state. (F4.)
- ❌ Don't use `Math.random()` in sim code.
- ❌ Don't add a dependency you can write in 80 lines. Target ≤ 6 runtime deps (`three` + build tooling).
- ❌ Don't put the pause button in a submenu — it's in Settings, one tap from the HUD grip.
- ❌ Don't make the thief punishing. Losing money in a relaxing game is a bug, not a feature.
- ❌ Don't leave `console.log` in production. Strip in the Vite build.

---

## 20. FINAL DEFINITION OF DONE

Ship it when **all** of these are true:

1. ✅ All 22 acceptance tests pass, with the raw output pasted into `07_QA/`.
2. ✅ Every row of the §3 scorecard is met and ticked.
3. ✅ 20 authored marts + endless prestige, all ★★★-able, all themed and distinct.
4. ✅ 48 products, 22 machines, 18 staff types, 14 upgrade tracks — all wired and balanced.
5. ✅ Automated enough that a player at mart 10 can stand still for 60s and the store still runs.
6. ✅ Zero ads, zero IAP, zero network calls, zero external asset dependencies.
7. ✅ It looks like a premium 2026 release: rounded bevels, soft GI, real contact shadows, blooming emitters, beautiful type.
8. ✅ It is **easier and friendlier** than the reference: cheaper staff, more customers, softer failure, faster early ramp.
9. ✅ Every third-party asset credited and licence-verified in `CREDITS.md`.
10. ✅ `v1.0.0` zip uploaded to Google Drive `05_Builds/`, deployed on Vercel, tagged on GitHub, summarised in Notion, issues closed in Linear, and a 10-slide deck in Google Slides.
11. ✅ The user has a playable URL and a one-paragraph summary in their inbox.

---

## 21. APPENDIX A — ONE-PARAGRAPH KICKOFF (paste this to start)

> Build **"Mini Mart Evolved"**, a complete, shippable browser game that is a 1,000× better version of YouTube Playables' *My Mini Mart*. It is a 3D store-management tycoon: the player moves one chunky cartoon character around a diorama supermarket; interaction is automatic on proximity; goods flow harvest → process → shelf → checkout → cash → reinvest. Use **hard coding as the primary tool**: Three.js + TypeScript, 100% procedural geometry, textures, characters, animation and audio — zero image or audio files in the bundle. You may use **your own Blender** for at most ~8 optional hero assets, exported headlessly via `bpy` scripts, and you may **download ready-made CC0 models** from Kenney/Poly Pizza/Quaternius/Poly Haven for reference and reuse — all credited and licence-verified. Use **my Google Drive** as cloud storage for all sources, exports, builds and QA, and use **all my other connections** (GitHub, Vercel, Supabase, Google Sheets/Docs/Slides, Notion, Linear, Dropbox, Gmail) to build, deploy, tune, document and report. Beat the reference on every axis in §3: **20 marts instead of 2**, 48 products, 22 machines, 18 staff types with auction-based AI that never piles up or gets stuck, 14 upgrade tracks, a manager camera, real lighting and post-processing, procedural ASMR audio and adaptive music, full accessibility, 11 locales, no ads — and make it **easier and more generous**: more customers from the start and helpers that are cheap and arrive within the first 35 seconds. Follow the 12 milestones in §14 and pass all 22 tests in §18 before you call it done.

---

## 22. APPENDIX B — REFERENCE LINKS

- Reference game: <https://www.youtube.com/playables/Ugkxto-OwJZo4rm8Xl2Nj3K403nHlYThf-sr> (YouTube Playables, sign-in required)
- Playables stability & performance requirements: <https://developers.google.com/youtube/gaming/playables/certification/requirements_stability>
- Playables design requirements: <https://developers.google.com/youtube/gaming/playables/certification/requirements_design>
- Playables SDK: `https://www.youtube.com/game_api/v1`
- Phaser Playables template (SDK integration reference even though we use Three.js): <https://github.com/phaserjs/template-youtube-playables>
- CC0 model sources: <https://kenney.nl> · <https://poly.pizza> · <https://quaternius.com> · <https://polyhaven.com>
- `gltf-transform` optimisation CLI: <https://gltf-transform.dev>

---

*End of document. Agent: begin at §14, Milestone 1. Report back with the plan, then build.*
