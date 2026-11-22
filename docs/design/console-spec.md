# Halcyon console appearance

Phase 1 · 22 November 2026 · Approved with changes

On Dashboard, a user can move from net worth to spending, see the 30-day spending figure immediately, and open Expenses with its existing data and filters. Returning brings keyboard focus back to Expenses. The section row, readouts and ambient background have separate state so quick navigation can follow the user without repeatedly repainting the scene or fetching reports.

The owner confirmed the local HTML export as the reference, §4 as the authority where values differ, immediate figure/card updates, the 380ms background dwell, and a Dashboard spike before primitive hardening. The component interfaces, commit order and acceptance matrix accompany this spec. [Reference export](../../prototypes/Home%20%E2%80%94%20console%20UI-html/Main.dc.html) · [Audit](console-audit.md) · [Rollout](console-rollout.md)

## Appearance and token ownership

Extend the appearance state above the pathname-keyed route tree. Expose `theme="console"` to the shell and apply it as `html[data-theme="console"]` for portals and first paint. Keep the existing `halcyon-theme` light/dark preference. Use a separate `halcyon-appearance` preference for classic/console. Keep the existing Classic fallback during the flagged spikes. Console is the future default. Freeze Classic and remove it after Phase 5. Settings and the existing appearance control can switch live while the fallback is available. Switching appearance keeps the current route, active tenant, provider state and balance redaction. The switch remounts the shell. If a mounted editor reports unsaved changes through the existing departure guard, Halcyon asks for confirmation before switching. Cancel keeps the draft in place. Confirm discards the view’s transient state. This limitation is accepted while Classic is available.

The names below are proposed house tokens. Braces expand to individual CSS properties, in the order shown. Define visual values in the scoped Console token sheet and shared material styles. The typed motion presets own duration and easing and generate the CSS custom properties at the Console viewport. Framer Motion 11 uses the same values, converting milliseconds to seconds in the preset adapter. Anime.js v3 retains chart ownership. Evaluate v4 as a separate follow-up. Keep synthesis values as typed SoundEngine presets. Scoped animations must cancel on interruption and dispose on unmount. [House tokens](../../app/src/index.css) · [Console tokens](../../app/src/components/console/console-tokens.css) · [Console motion presets](../../app/src/components/console/motion.ts) · [Current chart adapter](../../app/src/hooks/useChartReveal.ts)

## §4.1 · Motion

| Tokens or recipe | Target value | Where to apply it |
| --- | --- | --- |
| `--ease-{settle,glide,fade}` | cubic-bezier(.16,.9,.2,1), cubic-bezier(.2,.8,.2,1), cubic-bezier(.4,0,.2,1) | Focus/track/entrances, secondary movement, opacity cross-fades respectively |
| `--dur-{micro,press,focus,track,enter,title,bg,dwell,reduced}` | 250, 200, 420, 550, 800, 1000, 1400, 380, 150ms | Hover/icon scale, press, tile scale, row translation, rise, title, background opacity, focus dwell, accessible fade |
| `--stagger-{tile,side,card,icon}` | 60, 70, 80, 35ms | Tile siblings, hub side cards, activity cards, Control Centre icons |
| `rise` | Opacity 0→1, Y 26→0px, 800ms settle | Focused section content. Reference delays for copy, figures, action and activities heading are 140, 200, 260 and 280ms. Activity cards begin at 320ms + index × 80ms. Expose each as a named delay in the preset. |
| `titleIn` | Opacity 0→1, Y 18→0px, blur 8→0px, tracking +.04em→0 relative to resting type, 1000ms settle, 50ms delay | Cross-fade two fixed tracking treatments in the same reserved box. Expose one accessible heading. |
| `tileIn / labelIn` | Tile X 60→0px in 700ms. Label X −14→0px and opacity 0→1 in 500ms after 80ms | Initial row entrance and newly selected label. Use a separate child for an entrance and a parent for track translation. |
| `hubIn / hubOut` | Opacity 0→1, scale 1.08→1, blur 10→0px in 600ms settle. Reverse endpoints on Back. | Apply to the hub presentation. Keyboard and navigation work from activation. |
| `sheetUp` | Cards Y 60→0px in 550ms after 50ms. Bar Y 60→0px in 500ms. Icons Y 24→0px, scale .8→1, opacity 0→1 in 450ms, starting at 60ms + index × 35ms | Control Centre. Scrim opacity 0→1 in 400ms. Reverse the sheet from its current position on dismissal. |

Each recipe field with a time, offset, scale, filter or colour is a named preset value. Components supply only intent, section ID and sibling index. CSS and JS may animate transform, opacity and filter. Set final layout dimensions and shadows in static styles. For console pages that inherit a legacy width, dash or bar-height reveal, use the existing chart final-state path or a transform-only presentation. The shared chart adapter stays on anime.js v3.

## §4.2–4.3 · Focus and geometry

| Primitive field or token | Value and contract |
| --- | --- |
| `FocusRing.gap / edge` | Fixed dark inner 3px rgba(6,8,16,.85), then white #fff to 6px **total**. Draw at the final visual size so scaling the tile cannot thicken the 3px strokes. |
| `FocusRing.glowLow / glowHigh / period` | Static white shadows of 26px blur / 6px spread / .28 alpha and 46px / 14px / .42. Cross-fade decorative layers over 2800ms ease-in-out, low→high→low. Keep the crisp ring independent. |
| `FocusRing.sweep` | 110° gradient, transparent at 38%, white/.55 at 50%, transparent at 62%. Traverse X −120%→120% over the first 30% of a 3600ms cycle on the focused tile, with 500ms initial delay. On card focus or hover, one 1400ms pass after 100ms. Reset on exit. |
| `FocusRow.tile` | 96×96px rest, 152×152px focus, scale 152/96. Fixed silhouettes with visual radii 13 and 18px. Opacity .78→1. Icons 40→62px via a visual child. Reserve the 56px expansion and label space once outside the moving slots. Use left-centred transform origin. |
| `FocusRow.track / label` | Gap 18px. Position X = −index × (96px + 18px). Keep the left anchor invariant at the first and last item. Label gap 26px, name 28px/300, subtitle 13px. Allow text wrap and a stacked label at constrained widths. |
| `FocusRow.activity` | 300px wide, aspect 16:10, 16px radius, 20px gap, 14px focus padding, hidden scrollbar, native horizontal scroll/snap. Focus scale 1.06, z-index 2. Preserve normal pan and scroll focused items into view. Reserve space for outline at row ends and paint any extending glow in an unclipped decoration layer. |
| `Button.consolePrimary / topIcon / centreIcon` | Primary 56px high, 12px radius, white fill, #0a0d16 text, leading 18px icon. Top bar 46px circle, Control Centre 60px circle. Keep native button/link labels and at least the house 44px target for standalone controls. |
| `--space-console-{gutter,section,compact,wide}` | clamp(20px, 4vw, 72px), 34px, 28px, 40px. Section uses 34px by default, compact for adjacent groups and wide for separated readouts. |

A row has one active item and one tab stop. Use genuine buttons or links, a labelled toolbar where arrows are enabled, and one ordinary Tab exit in either direction. Pointer hover and keyboard focus use the same visual primitive. Pointer preview must not move DOM focus away from someone typing. When the user moves into a card row, the section label and ambient hue preserve their meaning while the active card owns the bright ring. Native tables, charts, multi-select lists, settings and forms retain their own interaction model and visible focus; focus on these controls has a static ring. In forced colours, use a system-colour outline which survives shadow suppression.

## §4.4–4.5 · Type, figures and colour

| Token or role | Values |
| --- | --- |
| `--font-display / --font-body` | Retain Archivo for display and Hanken Grotesk for body and figures. Load real 200/300 weights for their console roles alongside the current weights. |
| `type.hero / hub / tab / sectionName` | Hero clamp(48px, 6.4vw, 96px), 200, line height .98, tracking −.025em. Hub 46px/200/−.02em. Tabs 30px/300, active weight 400. Section name 28px/300. |
| `type.figure.{preview,hub,activity}` | 28/30/34px, all weight 200, tracking −.015em for readouts and −.02em for cards. Large display figures may use −.035em. All figures tabular. Show whole dollars at hero scale on Home and in expanded hubs, with the exact amount in accessible text. Keep cents in compact headers, strips, cards and modules. Preserve integer cents and format with the existing formatter for the surface. |
| `type.body / label` | 16px body, 18px introductory copy, weight 300, intro leading 1.55. Labels 13px, white alpha .75 (metric), .78 (subtitle), .85 (activity), .88 (section label). Intro copy white/.84. |
| `section.hue` | Reference equivalents are Overview 255°, Accounts 200°, Expenses/Spending 35°, Budget 295°. Income uses 85°. Other routes can inherit the neutral shell until assigned a hub. The section palette is independent of chart and category hues. |
| `paint.tile(h)` | 145° linear gradient at 0/55/100%, L .66/.46/.30, **C .15 at every stop**, hues h/h+18/h+30. |
| `paint.activity(h,j)` | 160° linear base from L .42, C .12, hue h+10j to L .22, C .07, hue h+30. Radial 90%×90% at 100% 0%, L .56 C .15 hue h+14j / .90 → transparent at 65%. j is the zero-based index. |
| `paint.background(h)` | Back base 175°, L .24 C .08 → L .11 C .04, hue h. Foremost radial 90%×75% at 80% 12%, L .52 C .16 h / .95 → transparent 60%. Middle 60%×60% at 4% 96%, L .36 C .14 h+40 / .90 → transparent 70%. Rear 45%×35% at 45% 55%, L .32 C .10 h−30 / .55 → transparent 80%. Keep one static gradient per enabled section mounted. Only opacity changes at section handoff. |
| `--color-console-{pos,neg}` | oklch(.87 .14 150), oklch(.82 .12 25). Preserve explicit +/− for signed monetary quantities, plus the existing labels for financial meaning. A decrease in expenditure can be favourable. |
| `GlassSurface.textScrim` | Require ≥4.5:1 at the brightest and darkest composited points behind every label, also during a sweep or cross-fade. First reposition or cap the glow behind text and measure again. If needed, add a soft local gradient behind the affected text and record the lowest passing opacity with the capture. Keep dense data on its flat reading surface. |

Console links, selected states and highlights use white or the current section hue. Reserve green and red for signed monetary figures and keep the sign visible. Write insight sentences in neutral text, including sentences with unsigned ratios or review counts. Use sentence case for labels. A compact header uses an opaque material beneath its text across the full width, with the fade starting below the reading area.

## §4.6 · Material stack

The production CSS supplies glass, hairlines, a wash and a canvas. These six slots describe console paint order. Each ambient surface is decorative, pointer-transparent and hidden from the accessibility tree.

| Slot and preset | Paint and movement |
| --- | --- |
| 1 · `ambient.section` | Render the section gradients with 4% overscan. Normalise pointer x/y to [−1,1], translate opposite the pointer by 10px/8px at full displacement. Use the export's 1200ms glide for parallax settling. |
| 2 · `ambient.light` | Conic rays rotate −6°→+6°→−6° over 70s linear. A soft beam at 18° with 38px blur breathes opacity .55→.95→.55 over 9s ease-in-out. Both use screen blending and the background parallax. |
| 3 · `ambient.ribbons` | Ribbons and nine soft circles move 26px/18px. Four ribbon cycles take 18/23/29/35s. Circles drift 30px right and 46px up with opacity .25→.60. Cache their positions for the lifetime of the scene. |
| 4 · `ambient.particles` | Default 55, clamp to [0,120], size 1.5–4px. Translate group 48px/30px. Per-particle upward drift ends at (60,−360)px, lasts 11s + (index mod 7) × 2.6s. Twinkle over 2.2s by changing opacity on a static halo. |
| 5 · `ambient.finish` | Vignette with .70 dark radial edge and .25/.45 top/bottom darkening. Static grain at 6% opacity. |
| 6 · `glass.console` | Reuse glass structure. Backdrop blur 24px, saturation 150%, 7.5% white fill, 1px white hairline at 14%. Provide an opaque dark fallback for unavailable backdrop filter, Reduce effects and dense reading areas. |

One scene owns pointer sampling. Coalesce writes into one animation frame, centre the field for touch, and freeze both animation progress and frame scheduling on document hidden or when a covering modal opens. Resume only while visible, uncovered and effects-enabled. Keep vignette and page colour visible while paused. Release listeners on theme exit and route unmount where applicable.

## §4.7 · Input and navigation

| Event | Visual, state and audio response |
| --- | --- |
| Focus a different section | At 0ms play move if enabled, start 420ms tile focus and 550ms track travel together, change the label, and remount the presentation keyed by section ID. Start the 380ms timer from this input. If still selected at expiry, commit the ambient ID and cross-fade for 1400ms. Initialise ambient ID before the first move. On rapid reversal, start from current visual opacity and cancel the stale timer. |
| Arrow or pointer preview | Left/Right move within the current row, stopping at the ends. Mouse hover previews and one click opens. Touch tap selects and previews an unarmed tile, and the next tap on that tile opens it. Left/Right keys preview and Enter opens. Native Space activation also opens. A pan cancels pending tap activation. Latch the preview ID while the pointer is stationary during track travel. Resolve activation against the button where pointer-down began; cancel a click if its target moved away before release. An explicit Open action always opens the current preview. |
| Activate a card or explicit action | First activation opens immediately with select cue. Optional supplementary card hover/focus details use the same cancelable 380ms dwell. The visible figure, primary action and accessible name are available immediately. |
| Open hub / Back | Play select, cancel dwell and navigate to the existing destination. Carry a return section ID in history state. Back/Escape from a hub opened here plays back, transitions out and restores focus to that tile after the row mounts. Browser Back has the same return semantics. A direct link has an explicit Dashboard action. A picker, drawer or dialog consumes Escape before a route handler. |
| Open Control Centre | Signed-in shell button or C opens a labelled modal with `role="dialog"`, `aria-modal="true"`, inert background, focus trap and initial focus inside. Open cue, dim gradient black/.25→.70 with 14px backdrop blur and brightness .8, then sheet/bar entrances. Focused icons reveal their labels 14px above. Notifications use existing review counts and provider status. |
| Close Control Centre | Escape, C, dismiss button or backdrop closes the top sheet with reverse whoosh. Restore focus to the opener or a surviving shell control. Ignore repeats, modifier shortcuts, composition and editable targets for C; offer a disable-shortcut setting. Prevent click-through while closing. |
| Toggle | Show the new filled icon plus accessible pressed/checked state. Play rising/falling pair when audio is permitted. Muting takes effect immediately and always has visible feedback. |
| Optional start screen | Off by default. Show once per signed-in home entry session when enabled. Halcyon wordmark tracking .9em→.42em via two fixed renderings, blur 10→0px over 2200ms glide. Prompt pulses opacity .35↔1 over 2400ms after 1200ms. Real button accepts click or Enter. Unlock opted-in audio from the gesture, play startup, dissolve for 1100ms to opacity 0, blur 14px and brightness 2. In reduced mode show a stable prompt and use the reduced fade. Deep links, login, recovery and onboarding retain direct entry. |

Keep focus ownership separate from financial state. Re-key only copy, summary and activity presentation. The report hooks, transaction parent lookup, chart controls and drawers keep their existing owners. Overspending and loss copy keeps its period and sign even if a neighbouring section uses a similar hue.


### Dashboard sections and actions

| Home tile | Preview source | Open action |
| --- | --- | --- |
| Dashboard overview | Current portfolio/net worth and latest activity | Reveal the full Dashboard detail on the same route using a history entry and the existing report owners. Back returns to the row. |
| Accounts | Existing account directory and balances | Open Accounts. |
| Income | Dashboard's 30-day inflow | Open Income. |
| Expenses | Dashboard's 30-day spending and available category observation | Open Expenses, carrying an existing period/category scope when applicable. |
| Budget, when enabled | Labelled Budget entry until the user opens its workspace | Open the existing permission-gated Budget route. Keep unavailable or loading amounts explicitly labelled. |

Control Centre actions can open Dashboard, Ledger review, Transfer review, Ingestion and Settings, plus the local effects/audio controls. Build the notifications row from available attention counts and sync status, including empty, loading and unavailable states. Console exposes the existing destinations through the section row and Control Centre. Keep the Classic rail usable while the fallback ships.

## §4.8 · SoundEngine presets

Use Web Audio synthesis. Signals feed a dry bus and a parallel generated stereo impulse (2.8s, decay exponent 2.6, return gain .32). Sum into master gain, then compressor −18dB threshold, ratio 3:1, then output. Volume is a native 0–100% control. The approved initial value is 55%, effective only after opt-in. Instantiate or resume the context in a trusted user action. Persist consent, volume and mute separately. A reload can restore consent while audio awaits a gesture.

| Preset | Synthesis and event timing |
| --- | --- |
| `bell(f,d,g)` | Sine fundamental plus 2.76f and 5.4f. Relative amplitudes 1/.32/.12, durations d/.45d/.18d, attacks 2/1/1ms, exponential decay to .0001. |
| `cue.move(position)` | f = 2093 × 2^((position mod 5)/24) Hz, zero to +4 quarter-tones. Sine 55ms at gain .13 plus octave for 25ms at **25%** of fundamental gain. Add 20ms band-passed noise 6→9kHz, gain .02, Q 3. |
| `cue.hover` | 3136Hz sine, 30ms, gain .04, 1ms attack. At most once per 55ms across controls. Deduplicate move and hover for a single tile change. |
| `cue.select / back` | Select bells 1318.5Hz (500ms/.14) then 1975.5Hz at +50ms (700ms/.11). Back 1174.7Hz (280ms/.10) then 880Hz at +60ms (400ms/.08). |
| `cue.tab` | Triangle 1568Hz, 90ms/.08, plus sine 2349Hz at +30ms, 120ms/.05. Apply to section tab changes. |
| `cue.open / close` | Open noise sweep 260→3200Hz, 450ms/.09, Q .9, bells 988Hz at +160ms and 1480Hz at +220ms. Close reverses the sweep, 3200→260Hz over 450ms, gain .07, Q .9 (§4 precedence over the export’s shorter downward sweep). |
| `cue.toggleOn / toggleOff` | On 1760→2637Hz bells, 250/350ms at .09/.07. Off 2093→1396.9Hz, 220/300ms at .08/.06. Second note starts at +60ms. |
| `cue.start` | Saw chord 146.83/220/293.66/329.63/440Hz, paired detune ±6 cents plus voice index. Low pass 250→3200→900Hz at 0/2.2/4.5s, Q 2. Swell to .11 at 1.8s. Original export arpeggio 659.25/880/1108.73/1318.51Hz from +1.75s in 170ms steps. |
| `music.ambient` | Chord roots and voicings from export's four-entry `startMusic()` sequence. Paired ±7-cent saws through 520Hz low pass, Q .8, .08Hz LFO with 260Hz depth. One chord every 8s, overlapping 11s voices with **3.5s in and out**. On alternate chords use quiet 880/1318.5/1174.7Hz bells at +2s then 2.4s apart, gain .018. Route bells and chords through the music bus so music mute stops both. |

First visit is silent. The top-bar mute affects all buses including reverb tails. Music requires its own opt-in. Reduced motion defaults audio to silent unless the person explicitly enables audio under that preference. Prevent stale queued cues on resume, and suspend music when hidden. Blocked storage or unavailable Web Audio leaves every action, notice and visible toggle usable.

## §4.9 · Effects and verification

| Condition | Expected presentation |
| --- | --- |
| OS reduced motion or existing app motion off | No ambient loops, parallax, sweep, breathing, scale interpolation, blur reveal or row travel animation. Layout immediately settles at its destination. Entrances use opacity only for 150ms, without stagger. Keep a static focus ring. Add a scoped reduced fade rule that takes precedence over the current universal 0.001ms CSS duration. |
| In-app Reduce effects | Same motion policy, plus zero particles and zero decorative blur, including backdrop and sheet blur. Use opaque surfaces and preserve redacted balances with an explicit masked display if blur would be removed. Respond to toggles while mounted. |
| Hidden tab or covered scene | Zero scheduled scene frames or running ambient animations. Resume from the committed section when visible. |
| Keyboard, touch and contrast | Native controls have a visible or accessible name. Verify both ends of every row, touch scrolling, focus restoration, 200% zoom, editable C, forced colours, meaningful loading/error states and signed figures. For each section, check both signed-figure colours against its own backdrop at gradient extrema and intermediate transitions. Inspect Expenses/Spending (35°) with the negative figure hue (25°), and verify that signs stay identifiable in monochrome. Record any required glow cap or local gradient. |
| Performance | 60fps target at 60Hz (16.67ms frame budget), zero focus-induced layout shift, no navigation main-thread task >50ms, ambient work ≤2ms per frame. Use Safari on a physical 2020 M1 MacBook Air and Chrome on a physical Pixel 6a at 60Hz. At the ends of Phases 3 and 5, collect frame, main-thread, style/paint and compositor tracks using each platform’s profiler. Use a Chrome DevTools trace on the local Mac for each implementation commit. Include a static-scene comparison to isolate ambient work. |

After the Phase 2c feel review, run the applicable Console checks against a deterministic fictional-data fixture. Smoke-check that the Classic fallback renders, navigates and reports no browser console errors. Check runtime switching without reload, tokens in CSS and Framer Motion targets, keyboard reachability, both effect reductions, and fresh/persisted/muted sound. Record screen and device evidence with each commit. Phase 5 adds Console Playwright captures, axe, manual interaction and the end-to-end sound matrix. The component demos provide coverage before Dashboard integration. [Screen and verification plan](console-rollout.md)


## Phase 2a review gate

Build a Dashboard-only spike behind the appearance flag with the rough section row, ambient colour handoff and keyed previews using the current Dashboard data. Leave native navigation available. Capture a local Chrome DevTools trace and stop for the owner to judge the feel. Automated test coverage and primitive hardening begin after that review.

Use fixed-layer cross-fades for title tracking and tile silhouettes. Draw the ring outside the clipped artwork. Compare the committed export with matched fictional Dashboard states during qualification. [Reference export](../../prototypes/Home%20%E2%80%94%20console%20UI-html/Main.dc.html)


## Phase 2b viewport spike

Home fills 100dvh with horizontal activity overflow and a full-bleed ambient scene behind the transparent header. The header holds the Halcyon home action, Console toggle, Control Centre button, Settings, avatar and clock. Sections and Control Centre provide navigation in Console. Classic owns its numbered rail.

The Phase 2b spike opens each section on its existing route in the persistent viewport frame. Overview uses `/dashboard?hub=overview`, Income uses `/income`, and the other destinations use their existing routes. The spike uses an ambient backdrop and an opaque, independently scrollable reading surface. Phase 2c replaces that surface with individual modules. Back or Escape reverses the zoom and restores the initiating tile on Home. The rough modal Control Centre provides Ledger review, Transfers, Ingestion, Settings and Sign out. Review counts come from the portfolio report.

The hero displays the headline amount in tabular 200-weight type at clamp(48px, 6.4vw, 96px). The label names the figure and the period. Secondary values use 28px. The orb uses existing monthly net worth or daily flow buckets, with the graph marked decorative and a text equivalent for available series. Cards use the existing 300px width, a category icon and visually truncated titles with accessible full names. Mask and fade tiles as they pass the anchor. The row omits step buttons.

Income and Expenses retain the inclusive 30-day reporting window and show its dates and latest available transaction date. Activity comes from the bounded recent list filtered to matching dates and reporting classifications. The zero state names the empty period. Income stays at 85° and Spending at 35°. For Income, tile L is .74/.60/.42 and C .17. For Spending, L is .73/.57/.39 and C .17. Compensated card and ambient tokens also lift the warm palettes. Review the signed figure contrast against each adjusted section in hardening.


## Phase 2c hub design language

Home’s direction is approved. The first review compares two static Income layouts using identical fictional data at 1440 × 900 and 390 × 844. Both remain design studies until the owner selects a direction. The selected layout will be applied to Income and Overview behind the flag as a second spike. [Direction captures and rollout](console-rollout.md#phase-2c--income-hub-directions)

Restyle shared components in place for Console. The implementation may replace their old styling while preserving their data and behaviour.

| Surface | Console treatment |
| --- | --- |
| Hub modules | Individual 16px-radius surfaces. Reveal ambient light in the gaps. Give each dense table, long list or form an opaque surface sized around that content and its own existing controls. |
| Figures and labels | Display figures use weights 200–300 with tabular numerals. Keep 13px labels in sentence case by default. Use whole dollars in expanded hub and Home heroes, with exact cents in accessible text. Show cents in compact headers, secondary strips, activity cards and module values. |
| Charts | Use white or near-white strokes with a soft section-hued glow. Keep gridlines at or below 8% white. Tint areas softly with the section hue. Keep data, chart semantics, tooltip interaction and keyboard alternatives. Use stroke style and labels to distinguish series. |
| Controls and focus | Restyle tabs, filters and date pickers as pills or rounded rectangles with a white-on-glass selection state. Reuse the tile focus ring. Arrow keys traverse card rows and Tab moves between rows and into workflow controls. Tables and forms retain their native keys and focus order. |

### Home follow-up in the implementation spike

- Move the focused tile glow outside the track’s clipping and fade layers.
- Plot cumulative inflow and cumulative gross outflow from the existing daily buckets for the monotonic Home key art. Label gross outflow as such when the headline is net spending, so refunds and reimbursements cannot make one read as the other.
- Show Accounts cards with their balance, type and available institution. Use available holdings for the key art and a designed empty state when there is no eligible data.
- Reserve space for the hero number and art from 320px up. Stack or reduce the art on narrow displays. Display whole dollars in the Home hero and expose the exact cents in its accessible name.
- Place a horizontal row of real attention cards over a bottom bar of round Control Centre actions. Reveal action labels on focus.

### Selected hub composition

Use the game-hub entry with the analysis workspace body. Home and the expanded hub share Framer Motion layout IDs for the amount, label and artwork. The spike projects their captured Home bounds with Framer Motion when the destination introduces its own scroll container. Opening a hub preserves the ambient scene and begins the module rise and stagger. Income opens on the Home preview’s 30-day window. The hero ring gives the retained share of inflow. Its inline strip shows spending, net after spending and average daily inflow for the initial 30-day period. For a wider date range the average follows the existing report aggregation. The chart shows cumulative inflow as a solid near-white stroke and cumulative net as a dashed stroke. Period balance and Recent deposits sit alongside. Income sources and Inflow by day follow below.

Overview keeps net worth and 30-day movement portfolio-wide. Its ring uses monthly net-worth history. The main chart, allocation and holdings lead, followed by spending insights and recent activity. Overview’s date and account controls explicitly scope spending insights since the net-worth valuation history is portfolio-wide.

The hub scroll container drives opacity and transform for the expanded and compact silhouettes. The sticky control row stays mounted while the header changes. Reduced motion snaps at the collapse threshold. Phone reading order is hero, strip, chart, companions, secondary modules.

| Initial hero | Hubs |
| --- | --- |
| Expanded | Overview, Income, Expenses, Accounts |
| Compact | Ledger, Budget, Ingestion, Transfers, Settings |

Phase 2c implements the selected composition in Overview and Income. The remaining routes declare their mode for rollout. This is a spike with a review gate before primitive hardening or automated coverage.
