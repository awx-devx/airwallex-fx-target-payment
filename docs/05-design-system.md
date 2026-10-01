# 05 — Design System

**Direction:** a *glowing, dark, premium trading terminal*. Near-black surfaces, layered depth, and a **molten orange** accent that glows. Motion is used to show that data is live. Every number is tabular and precise. The screen should feel calm until something happens; then orange light draws the eye to the event.

Tune the orange hue to Airwallex brand guidance before the demo, if it is available. All values below are tokens and can be changed in one place.

---

## 1. Principles

1. **Data first, chrome second.** The chart and the numbers are the hero. Borders are hairlines and panels recede.
2. **Glow means attention.** Glow is rationed. It is used only for the target line, the active selection, live and pending states, and primary actions. If everything glows, nothing does.
3. **Colour has meaning.** Orange marks the brand and the target/action, green means favourable, red means adverse, and amber means a deadline or warning. Colour is never decoration alone.
4. **Always show "live".** Ticks flash, countdowns count, connection status is visible, and stale data is visibly stale.
5. **Keyboard-first.** It is a terminal, so every primary action has a shortcut.

---

## 2. Colour tokens

Defined as CSS variables in `src/ui/tokens/tokens.css` and exposed to Tailwind v4 via `@theme`.

### Surfaces (dark, slightly warm)

| Token | Value | Use |
| --- | --- | --- |
| `--bg-0` | `#07070A` | App background |
| `--bg-1` | `#0C0C11` | Panels |
| `--bg-2` | `#121219` | Raised: cards, table header, inputs |
| `--bg-3` | `#1A1A23` | Hover, active rows |
| `--bg-overlay` | `rgba(7,7,10,0.72)` + `backdrop-blur(12px)` | Modals, drawers |
| `--line-1` | `rgba(255,255,255,0.06)` | Hairline borders |
| `--line-2` | `rgba(255,255,255,0.10)` | Input borders, dividers |
| `--line-3` | `rgba(255,255,255,0.16)` | Focus-adjacent, hover borders |

### Text

| Token | Value |
| --- | --- |
| `--fg-1` | `#F4F4F6` (primary) |
| `--fg-2` | `#A6A6B3` (secondary) |
| `--fg-3` | `#6B6B78` (tertiary / labels) |
| `--fg-4` | `#45454F` (disabled) |

### Accent: molten orange

| Token | Value | Use |
| --- | --- | --- |
| `--orange-300` | `#FFB27A` | Text on dark for links, highlights |
| `--orange-400` | `#FF914D` | Hover |
| `--orange-500` | `#FF6A1A` | **Primary accent**: target line, primary button |
| `--orange-600` | `#E5520A` | Pressed |
| `--orange-glow` | `rgba(255,106,26,0.45)` | Glow shadow colour |
| `--orange-wash` | `rgba(255,106,26,0.08)` | Selected rows, target zone fill |

### Semantic

| Token | Value | Meaning |
| --- | --- | --- |
| `--up` | `#2BD9A0` | Favourable (price down = cheaper bill, savings > 0) |
| `--up-wash` | `rgba(43,217,160,0.10)` | |
| `--down` | `#FF4D6A` | Adverse |
| `--down-wash` | `rgba(255,77,106,0.10)` | |
| `--warn` | `#FFC24B` | Deadline window, near miss, stale |
| `--warn-wash` | `rgba(255,194,75,0.10)` | |
| `--info` | `#6EA8FF` | Reference data, entry line |
| `--muted` | `#6B6B78` | Paused, draft |

> ⚠️ **Direction semantics:** in this product a price **decrease** is **good** (the bill gets cheaper). Every price-change colour is computed through `favorable(delta)`, never through `delta > 0`. The UI kit has a dedicated story that shows this, to prevent regressions.

### Gradients

- `--grad-accent`: `linear-gradient(135deg, #FF8A3D 0%, #FF6A1A 45%, #E0410B 100%)` for the primary button fill and hero numbers.
- `--grad-border`: `linear-gradient(180deg, rgba(255,106,26,0.55), rgba(255,106,26,0) 60%)` for glowing card borders (masked border technique).
- `--grad-ambient`: two radial orange blooms, very low alpha (≤ 0.06), fixed behind the chart area for depth.
- Noise: a 2% opacity SVG noise overlay on `--bg-0` to avoid banding.

---

## 3. Glow & elevation

| Token | Value | Use |
| --- | --- | --- |
| `--glow-sm` | `0 0 0 1px rgba(255,106,26,0.35), 0 0 12px -2px var(--orange-glow)` | Focus ring, selected chip |
| `--glow-md` | `0 0 0 1px rgba(255,106,26,0.45), 0 0 24px -4px var(--orange-glow)` | Primary button hover, active bill card |
| `--glow-lg` | `0 0 0 1px rgba(255,106,26,0.55), 0 0 48px -6px var(--orange-glow)` | Target-hit card, approval modal |
| `--glow-up` | same shape with `--up` | Paid / favourable events |
| `--glow-warn` | same shape with `--warn` | Final-day state |
| `--shadow-panel` | `0 1px 0 rgba(255,255,255,0.03) inset, 0 20px 40px -20px rgba(0,0,0,0.8)` | Panels |

**Pulse:** `@keyframes glow-pulse` animates the glow opacity between 0.55 and 1 over 2.4 s ease-in-out. It is used only for `WATCHING` (subtle) and `TARGET_HIT` (strong). It is disabled under `prefers-reduced-motion`.

---

## 4. Typography

| Role | Font | Size / line | Weight |
| --- | --- | --- | --- |
| UI | **Inter** (variable), `font-feature-settings: "cv11","ss01"` | 13/18 default | 400/500/600 |
| Numbers | **JetBrains Mono** or **Geist Mono**, `font-variant-numeric: tabular-nums slashed-zero` | inherits | 500 |
| Display (hero price) | Inter Display / Inter tight tracking `-0.02em` | 32/36, 44/48 | 600 |
| Label | Inter uppercase, tracking `0.06em` | 11/14 | 500, `--fg-3` |

Rules:
- **Every number uses the mono stack with tabular figures.** This includes prices, amounts, percentages and countdowns.
- Prices show significant digits consistently per pair (default 5 decimals, 3 for JPY-quoted pairs). The **last two digits are emphasised** (brighter and slightly larger), like a pip display.
- Currency amounts: group separators, currency code suffix in `--fg-3` (`250,000.00 EUR`).

---

## 5. Spacing, radius, layout

- Spacing scale (px): 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 56.
- Radius: `--r-xs 4`, `--r-sm 6`, `--r-md 10`, `--r-lg 14`, `--r-xl 20`, `--r-pill 999`.
- Density: the default is **compact** (row height 36, input height 32). A **comfortable** variant (row 44, input 40) is used for modals and forms.
- Terminal grid (≥ 1440 px): left rail 280 px (bills), centre flexible (chart + bottom panel), right rail 360 px (ticket). Minimum supported width is 1280 px; below that the right rail collapses to a drawer.

---

## 6. Motion

All animation runs through **Motion** (`motion` on npm, formerly Framer Motion; D-11a). CSS handles the few things that are purely decorative (`glow-pulse`, skeleton shimmer); everything stateful — numbers, layout, enter/exit, gestures — is a Motion component so it shares one timing system and honours reduced motion automatically.

Rules:
- Durations and easings come from the tokens below; components never hardcode timings.
- Only animate `transform` and `opacity`. Width, height and colour animations are reserved for the tokenised patterns below (tick flash, glow border).
- `MotionConfig reducedMotion="user"` wraps the app: under `prefers-reduced-motion` (and the kit's reduced-motion toggle) there is no pulse, odometer, flash or layout animation; colour changes are instant.
- `src/ui/**` imports `motion/react` directly. No fetching and no stores inside animated components.

| Token | Value | Use |
| --- | --- | --- |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Entrances |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Layout |
| `--dur-1` | 120 ms | Hover, press |
| `--dur-2` | 200 ms | Popovers, tabs |
| `--dur-3` | 320 ms | Drawers, modals |
| `--dur-tick` | 600 ms | Price flash decay |

Patterns:
- **Tick flash:** on a price change, flash the background with `--up-wash` or `--down-wash` according to `favorable()`, decaying over `--dur-tick`. The digits roll with a vertical odometer only on the hero price.
- **Number tween:** savings and cost tween over 300 ms.
- **State change:** badges crossfade. On a transition to `TARGET_HIT`, the card border animates into `--glow-lg` and the target line on the chart brightens briefly (one pulse).
- **Countdown:** in the final 60 s the chip turns `--warn` and ticks with a subtle scale of 1 → 1.03.
- **Enter/exit:** lists, toasts, popovers, drawers and modals use `AnimatePresence` (fade + 8 px rise, `--dur-2`/`--dur-3`).
- **Layout:** bill selection and rail collapse use `layout` transitions on `--ease-in-out` so panels glide instead of snapping.
- **Reduced motion:** there is no pulse, odometer, flash or layout animation; colour changes are instant.

---

## 7. Chart styling (Lightweight Charts)

| Element | Style |
| --- | --- |
| Background | transparent over `--bg-1` with ambient bloom |
| Grid | `rgba(255,255,255,0.04)`, vertical grid off by default |
| Price series (area) | line `--fg-1` at 1.5 px; area gradient from `rgba(255,255,255,0.10)` to `0` |
| Reference history | line `--info` at 40% opacity, dashed 2/4, labelled "Reference (ECB)" |
| **Entry line** | horizontal, `--info`, solid 1 px, right label chip "ENTRY 1.08412" |
| **Target line** | horizontal, `--orange-500`, dashed 6/4 at 1.5 px **with a glow** (drawn twice: 6 px blurred at 30% opacity + crisp line), label chip filled orange "TARGET 1.07500" |
| **Target zone** | fill between the target line and the bottom of the pane with `--orange-wash` (the "favourable zone") |
| **Max-cost line** | when in `MAX_COST` mode, the target line label reads "MAX COST ≙ 1.07500 · 268,750 USD" |
| **Quote band** | when a quote is locked: a horizontal band at the quote price from `valid_from` to `valid_to`, in `--up` at 15% (or `--warn` on deadline day), with a label showing the countdown |
| **Execution deadline** | vertical line, `--warn`, solid 1 px; label "EXECUTE BY · Oct 14"; the area after it is hatched at 4% |
| **Due date** | vertical line, `--down` at 70%, dashed; label "DUE · Oct 16" |
| **Now line** | vertical, `--fg-3`, dotted |
| Markers | circles at the price: armed (info), near miss (hollow warn), target hit (orange filled + glow), approved (up), rejected (muted ×), executed (up ✓), auto-settle (warn ⚡) |
| Crosshair | `--line-3`; tooltip card shows the price, the Δ vs entry, the Δ vs target and the cost at that price |
| Last-price label | pill on the right axis in `favorable()` colour |

Implementation notes: horizontal lines use the built-in price lines (`createPriceLine`). Vertical lines, zones, bands and hatching use **series primitives** (custom plugins) in `src/ui/chart/primitives/`. The time axis extends into the future up to the due date + 10%, so the deadline lines are always visible. Use whitespace data points to extend the time scale.

---

## 8. Iconography & illustration

- **Lucide** icons at a 1.5 px stroke, 16 px default and 14 px in dense tables.
- Currency flags: circular 16/20 px SVG set (e.g. `circle-flags`), shown as a stacked pair for `F/H`.
- Empty states: a minimal line-art chart with an orange glow dot, no mascots.

---

## 9. Accessibility

- Text contrast is ≥ 4.5:1 for `--fg-1` and `--fg-2` on `--bg-1`. `--fg-3` is used for labels only.
- Favourable and adverse colours are always paired with a sign or an arrow (▲/▼, +/−). Meaning never depends on colour alone.
- Focus is always visible (`--glow-sm`). All dialogs are Radix with focus trapping.
- Live regions: approval requests and target hits are announced via `aria-live="assertive"`, and ticks are **not** announced.
