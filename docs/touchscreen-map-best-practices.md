# Touchscreen Map Best Practices — Indoor Wayfinding on Mobile + Kiosk

A design-spec checklist for a touchscreen wayfinding product delivered on both handheld
phones and large standing kiosks. Compiled from a multi-source deep-research pass that
adversarially fact-checked every claim (2-of-3 verifier votes to keep a claim; 4 claims
were killed and are listed at the end).

**How to read the confidence tiers:**
- 🟢 **HARD SPEC** — primary-source-backed and unanimous. Treat as requirements.
- 🟡 **CORROBORATED** — industry guidance backed by academic HCI or standards. Strong defaults.
- 🔵 **ESTABLISHED PRACTICE (lower verification)** — widely used, but this research pass did
  not surface a durable verified claim. Use, but sanity-check against a primary source.
- ⛔ **REFUTED / DO NOT CITE** — killed in verification; don't treat as fact without independent sourcing.

---

## 1. Touch interaction & gestures

🟢 **Honor standard gestures; never make a custom gesture the only path to an action.** Users
expect tap/swipe/drag to behave consistently everywhere. Don't repurpose a familiar gesture
for a unique action, or invent a unique gesture for a standard action. Any shortcut swipe must
sit *alongside* a visible control (e.g. a Back button), never replace it. — Apple HIG (primary).

🟢 **Use the conventional map gesture set:** one-finger drag = pan; two-finger pinch = zoom
(apart in / together out); two-finger rotate = bearing; one-finger double-tap = zoom in one
level toward the tap; two-finger single-tap = zoom out one level. These are the discoverable
conventions users already know from Google/Apple Maps. — Mapbox iOS SDK (primary).

🟢 **WCAG 2.5.1 (Level A): any pinch-zoom MUST have a single-finger alternative** — on-screen
zoom +/- buttons or double-tap. Google Maps, Mapbox, Leaflet, and Esri all ship visible zoom
controls for exactly this reason. This is the single most-cited compliance gap in map UIs. —
W3C / MN.gov Interactive Web Maps guide (primary).

🔵 **No hover-dependent UI.** Hover doesn't exist on touch. Anything revealed only on hover
(labels, action links, tooltips) is invisible on a touchscreen — the classic "Hide and Hover"
anti-pattern. Show affordances up front; hover is enhancement only.

🔵 **Guard against accidental input** — momentum/inertia on pan, debounce, and forgiving hit
areas; on kiosks, ignore stray multi-touch (leaning hands, sleeves).

---

## 2. Touch target sizing & reachability

🟢 **Size to the strictest standard that applies, and space per the WCAG formula:**
- WCAG 2.5.8 (AA, minimum): **24×24 CSS px**
- WCAG 2.5.5 (AAA): **44×44 CSS px**
- Apple HIG: **44×44 pt**
- Material Design 3: **48×48 dp**
- Spacing for undersized targets: minimum edge gap = **24px − target size** (two 20px targets
  need ≥4px between them). — W3C / Apple / Google (primary).

Practical rule for this product: **≥48px everywhere**, larger on kiosks (arm's-length hits,
Fitts's Law — target size should grow with interaction distance). 🔵

🟢 **Kiosk hardware must meet ADA 2010 physical-access standards:**
- All operable controls & displays within **15–48 in** reach (unobstructed forward/side).
- **30×48 in** minimum clear floor space for approach.
- Operable **one-handed, no tight grasp/pinch/twist, under 5 lbf** (flat touchscreens pass trivially).
- Knee/toe clearance; usable from a seated position; tactile mounting 48–60 in.
- ⚠️ **Caveat:** 15–48 in is the *unobstructed* envelope — an obstructed/over-counter reach
  drops the max to ~44–46 in. There is **no dedicated ADA rule for self-service/wayfinding
  kiosks yet** (the US Access Board is still writing one); today's obligations are extrapolated
  from ATM/fare-machine standards + Section 508 + WCAG. **Do a jurisdiction check before
  finalizing hardware.** — Access Board / ADA 2010 (primary).

---

## 3. Map UX patterns

🟢 **Fixed kiosks: use heading-up (forward-up) orientation** so "up" on screen matches the
direction the viewer physically faces — this eliminates error-prone mental rotation. A
bolted-down kiosk faces a known direction, so you set alignment correctly once. (Levine's
"alignment principle," 1982; corroborated McKenzie & Klippel 2015.) Forward-up wins for
egocentric wayfinding — the kiosk's job. North-up is only better for geocentric/overview tasks.

🟡 **Offer both 2D and 3D and let users toggle.** 3D is engaging but costs GPU and can hinder
users with cognitive/visual impairments; 2D is the accessible, low-power fallback. (Mappedin.)

🔵 **"You are here" must be accurate and prominent** — a wrong/ambiguous start point is the
top wayfinding failure. On kiosks it's the kiosk's fixed location; on mobile it needs reliable
positioning or an explicit "set start" step.

🔵 **Declutter labels / POI density.** Show a legible subset by zoom; prioritize anchors and
the user's destination; simplify geometry at low zoom. Turn-by-turn should be one clear
instruction at a time.

🔵 **Search + directory** should be first-class (type-ahead, categories) — most visitors know
*what* they want, not *where* it is.

---

## 4. Kiosk-specific

🟡 **Attract/idle loop + auto-reset.** Run an attract screen when idle; an idle timer (industry
norm ~30–90s) resets the session to attract for the next user. **Show a countdown warning
first** ("Still there? Resetting in 30s…") so it never resets on someone still present.
Reset-to-attract also clears any prior user's session for privacy. (Kiosk industry, widely
implemented — same as ATMs/self-checkout.)

🟢 **Build assistive technology *into* the machine ("closed functionality").** Users can't bring
their own screen reader to a shared kiosk, so the device must contain: tactile input, built-in
screen reader / speech output, magnification & high-contrast mode, headphone jack + volume
control. Mandated by Section 508 Ch.4 and EN 301 549 Ch.11. (Multilingual support is best
practice, not a strict legal mandate.) A real reference product: JAWS for Kiosk (Vispero).

🔵 **Physical environment (established practice, verify per site):** high-brightness display for
glare/sunlight; anti-glare/anti-microbial surface; rugged/anti-vandal housing; placement at
decision points (entrances, atria, junctions) with clear sightlines.

---

## 5. Mobile-specific 🔵 (established practice; not verified in this pass)

- **Thumb zones / one-handed reach:** keep primary actions in the bottom third; top corners are
  hard to reach one-handed. (Hoober's thumb-zone research is the usual reference.)
- **Bottom-sheet pattern** for search/route/details on phones — reachable, dismissible, layers
  over the map.
- **Portrait-first**; controls reflow, never overflow.
- **Offline / caching** for the venue map; **battery/perf**: cap frame rate and effects on mobile.

---

## 6. Visual, legibility & accessibility

🔵 **Legibility:** high contrast; font size scaled to *viewing distance* (kiosks are viewed from
farther than phones); avoid tiny fixed px.

⛔ **Do NOT cite specific numbers from this research set:** the claims that maps must hit WCAG
1.4.3 contrast ratios of **4.5:1 / 3:1** and that "WCAG sets font-size/zoom rules for wayfinding"
were **refuted** in verification (weak sourcing, over-broad). Those contrast ratios *are* the real
WCAG 1.4.3 values — but confirm them directly from W3C before writing them into a spec, rather
than relying on this pass.

🔵 **Color:** don't encode meaning by color alone (color-blind safety); routes/markers need a
non-color cue (shape, label, animation). Support localization / RTL for multilingual venues.

⛔ Also refuted: a blanket "touchscreens are inaccessible to blind users without a tactile keypad"
and an over-specific "Braille labeling of controls is required" — built-in AT (speech + tactile
input) is the standards-based path, and Braille-on-controls is not a blanket mandate.

---

## 7. Performance 🔵 (established practice)

- Simplify geometry / drop non-essential vertices at low zoom; budget draw calls. (Mapbox GL.)
- For 3D/WebGL on modest kiosk & mobile GPUs: **degrade gracefully** — cap devicePixelRatio,
  lower reflection/shadow resolution, reduce post-processing on weak hardware; target 60fps.

---

## 8. Product checklist — Palladium wayfinder (mobile + kiosk)

| # | Requirement | Tier | In current build? |
|---|---|---|---|
| 1 | Standard gestures; no custom-gesture-only actions | 🟢 | ✅ 1-finger orbit, 2-finger pinch/pan (OrbitControls) |
| 2 | **Single-finger zoom alternative to pinch (WCAG 2.5.1)** | 🟢 | ⚠️ **2D has +/- buttons; 3D does not — add zoom buttons to 3D** |
| 3 | ≥48px touch targets, generous spacing | 🟢 | ✅ controls 44–48px (Fable) |
| 4 | No hover-only interactions | 🔵 | ✅ roof labels + tap-to-route (hover is enhancement) |
| 5 | Heading-up orientation on kiosks | 🟢 | ⚠️ free-orbit hero view; **lock/orient to kiosk facing for kiosk deploy** |
| 6 | 2D + 3D toggle | 🟡 | ✅ present |
| 7 | Accurate, prominent "you are here" / set-start | 🔵 | ⚠️ entrances exist; add explicit start on mobile |
| 8 | Attract loop + idle auto-reset with countdown | 🟡 | ❌ not built (needed for kiosk) |
| 9 | Built-in AT: speech, magnification, high-contrast, headphone jack | 🟢 | ❌ not built (needed for kiosk ADA/508) |
| 10 | High-brightness / anti-glare / rugged housing | 🔵 | n/a (hardware) |
| 11 | Graceful perf degradation on weak GPUs | 🔵 | ✅ LOW_PERF profile (Fable) |
| 12 | Color not sole cue; localization/RTL | 🔵 | ⚠️ route is gold-only; add non-color cue; i18n later |
| 13 | Jurisdiction/ADA hardware check before install | 🟢 | ☐ pre-deployment gate |

**Top 3 to close first:** (2) single-finger zoom in 3D — a real WCAG Level-A gap; (5) heading-up
lock for kiosks; (8/9) kiosk session-reset + built-in AT before any kiosk pilot.

---

## Verification notes & caveats

- **Killed claims (do not cite as fact from this set):** WCAG 4.5:1/3:1 contrast for maps (0-3);
  "WCAG sets font/zoom rules for wayfinding" (0-3); "kiosks require Braille labeling + specific
  AT checklist" (1-2); "touchscreens inaccessible to blind without tactile keypad" (0-3).
- **Softer-sourced (industry blogs, corroborated):** heading-up, attract/idle loops, built-in-AT
  enumeration, decluttering — corroborated by academic HCI (Levine 1982; McKenzie & Klippel 2015)
  or Section 508 / EN 301 549, but not all from primary standards text.
- **Regulatory gap:** no dedicated ADA self-service/wayfinding-kiosk rule yet — extrapolated from
  ATM/fare-machine standards + 508 + WCAG. Jurisdiction check required.

## Key sources
- Apple HIG — Touchscreen gestures (primary)
- Mapbox iOS Maps SDK — Gestures; Mapbox GL performance (primary)
- W3C WCAG 2.2 — 2.5.1 Pointer Gestures, 2.5.5/2.5.8 Target Size (primary)
- US Access Board / ADA 2010 Standards (primary)
- Section 508 Ch.4, EN 301 549 Ch.11 — closed functionality / built-in AT
- MN.gov — Accessibility Guide for Interactive Web Maps (primary)
- Ariadne, Mappedin, 3D Wayfinder, Visioglobe — indoor wayfinding UX (industry)
- Kiosk Marketplace / Kiosk Industry / AVIXA — kiosk UX & idle-timeout (industry)
- Levine (1982), McKenzie & Klippel (2015) — map alignment principle (academic HCI)
