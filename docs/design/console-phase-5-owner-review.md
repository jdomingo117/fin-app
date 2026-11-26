# Console Phase 5 · Owner Safari Review (Redacted)

> **Prominent hardware notice:** This review ran on a **MacBook Pro (`Mac15,6`, Apple M3 Pro, 11-core CPU, 14-core GPU, 18 GB)** — **not** the **2020 M1 MacBook Air**. All Safari interaction, layout, accessibility, and real-data findings below come from the owner's real local account in Safari, **but the final smoothness verdict remains with the owner on the physical 2020 M1 MacBook Air**.

## Environment

| Field | Value |
| --- | --- |
| Base branch / commit | `main` @ `e6b9b4df4259db2d31371a6709ffd2aed68d1733` |
| Review branch | `codex/console-phase-5-owner-review` |
| Worktree & dev server | `app/` · `CHOKIDAR_USEPOLLING=1 VITE_BUDGET_V1_ENABLED=true npm run dev -- --host 127.0.0.1 --port 5320 --strictPort --force` |
| Entry URL | `http://127.0.0.1:5320/dashboard` (owner's real signed-in account, read-only) |
| Mac | MacBook Pro (`Mac15,6`, Apple M3 Pro, 18 GB) |
| macOS / Safari | macOS `26.6.2` (`25G83`) · Safari `26.6.2` (`21624.5.1.11.3`), default `WebKitTabToLinksPreferenceKey` unset (`AppleKeyboardUIMode = 0`) |
| Display & viewports | Rows 1–12: External 120.00 Hz display (`3440×1440`, DPR `1`, viewport `1739×1084` at 100%). Row 13 + recordings/Timelines: Built-in Liquid Retina XDR (`3024×1964`, ProMotion 120 Hz, DPR `2`, viewport `1512×801` at 100% / `756×400` at 200%) |
| Effective effects tier | `full` (`Automatic (Full)`) |
| OS Reduce Motion | `false` (off) |
| Original preferences | Restored verbatim (`Console`, `dark`, sound/music on at 60%, `Automatic`, `C` shortcut on, start screen on, redaction off, 100% zoom) |

## Checklist Results

| Screen | Result | Redacted summary |
| --- | --- | --- |
| **Start** | **Issue** | Initial wordmark settle (`wide → settled`), `Return` entry to Overview with visible rounded FocusRing, and direct `/income` new-tab entry passed. However, a mid-session token refresh burst (~10 min in) caused `Start Halcyon` to re-appear over Home without a page reload (`can continue`). |
| **Home** | **Pass** | Tile arrow traversal (`Overview → Accounts → Income → Expenses → Budget → Overview`) had zero track shift; hero showed whole dollars with `.sr-only` exact cents; Budget showed `"Open to see this period"`; Income/Expenses rendered the quiet-period state; activity and account cards traversed cleanly without clipping the 6px FocusRing (`8.39px` clearance); opening a hub and pressing `Escape` restored focus to the originating tile. |
| **Overview** | **Issue** | Net worth, 30-day movement, orb, allocation, holdings, Spending insights (date/account controls clearly scoped inside the Spending insights panel), Recent activity, `View chart values`, and opaque compact dock header all passed. Missing-history/holdings state `not observed` (real portfolio populated). Shares the expanded-hub mid-scroll header overlap (`can continue`). |
| **Accounts** | **Issue** | Short, long, sparse, and investment accounts loaded cleanly; transaction detail `Escape` closed without saving and restored focus to the originating row button. Issues: (1) an investment account with a positive balance displayed `"Holdings appear here when accounts have a cash or investment balance."` in the hero art slot (`can continue`, data-dependent) plus Classic all-caps card labels (`cosmetic`); (2) `Category` select stretched taller beside `Subcategory` inside the detail drawer (`cosmetic`, data-dependent); (3) mid-scroll hero/dock overlap (`can continue`). |
| **Income** | **Issue** | Empty 30-day period and wider `3M` active range reconciled across pacing chart, deposits, sources, and weekly inflow; missing-source case `not observed`; `Strategic projections` loaded a full 6-month baseline (insufficient-history message `not observed`, Classic all-caps labels `cosmetic`). Issues: (1) date range popover clipped off left viewport edge (`can continue`); (2) mid-scroll hero/dock overlap (`can continue`). |
| **Expenses** | **Issue** | Quiet vs active `3M` periods, long categories/merchants, negative figure readability on 35° backdrop, and `Escape` closing an open date picker before exiting the hub all passed. Recurring hub loaded active/dormant commitments (empty state `not observed`, Classic all-caps labels `cosmetic`). Issues: (1) `Category outflow` ReactFlow Controls rendered white-on-white (`can continue`); (2) `Recurring hub` active `all` filter chips rendered solid white (`can continue`); (3) same left-clipped date picker and mid-scroll header overlap (`can continue`). |
| **Budget** | **Issue** | Without local Edge Functions running, Budget failed with `name resolution failed`. With Edge Functions temporarily served read-only, `query-budget` returned HTTP `403` `denied` (backend feature-gating mismatch vs frontend flag), blocking review of current/historical periods, estimates, bills, and funding (`blocks review` on this local stack). On `403`, Budget shows misleading save-recovery copy (`"We couldn’t confirm the result. Your edits are still here."`) and a lone off-center `Refresh` text button. |
| **Ledger** | **Pass** | Opened via Control Centre. Verified that the Ledger views and dock counts match the review labels. Long merchant wrapped cleanly in detail sheet (`h2` ellipsised, original description wrapped), and `Escape` closed sheet and restored exact FocusRing to the originating row button. |
| **Ingestion** | **Pass** | 4-step indicator, missing-account/file instructions, and native `<select>` displaying every option, including long labels, without clipping all worked without staging any file. |
| **Transfers** | **Pass** | Cleared queue (`All reconciled` ring, `Scan` button, `How decisions work`) and read-only disclosure expansion passed without triggering scans or links. Suggested pair queue `not observed`. |
| **Control Centre** | **Issue** | Button and `C` shortcut opened `<dialog class="console-centre">`, paused ambient scene, showed review counts and revealed quick-action labels above icons, and `Escape` restored focus to opener. Issue: under Safari's default keyboard mode (`WebKitTabToLinksPreferenceKey` unset), plain `Tab` skips all 6 bottom quick-action buttons after the first attention card and drops focus to `document.body` outside the dialog (`Option+Tab` traverses all 8 controls inside the trap) (`can continue`). |
| **Settings** | **Issue** | Top-bar speaker mute reflected `"Muted by the top-bar speaker."`; `Reduce effects` disabled `Ambient motion` with `"Reduce effects turns off ambient motion."`; sound/music/volume label text matched at `13px` (`51px`/`51px`/`70px` row heights); `Option+Tab` showed focus rings on switches and `<select>`. Issue: `Master volume` `<input type="range">` receives `:focus-visible` with zero visible focus ring in Safari (`can continue`). |
| **Zoom and motion** | **Issue** | Control Centre, Settings, and Overview adapted cleanly at **200% Safari zoom** (`756×400`), while **Home** collapsed `.console-hero` to `0px`, overlapping the headline/figure with `Recent activity`, occluding digits behind cards, and clipping bottom cards without scroll (`blocks review` at 200% zoom). **OS Reduce Motion:** `not observed` (off). **5 s real Background Tab:** Passed cleanly (`visibilityState` hidden for `5.302 s`, `hiddenRafCount = 0`, `data-paused` toggled cleanly, zero jump/replay/stale cross-fade on return). |

## Redacted Issue Log

| # | Screen & route | Action | Observed | Expected | Impact | Data-dependent |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Home (`/dashboard`) | Zoom Safari to 200% (`756×400` from `1512×801`) | `.console-hero` collapses (`height: 0`); headline and hero figure collide with `Recent activity`, occlude behind cards, and clip bottom cards with no scroll (overlap begins at 150% `1008×534`) | Hero and activity row remain readable without overlap or clipped controls at 200% zoom | `blocks review` (at 200% zoom on 14" display; `can continue` at 100%) | No |
| 2 | Budget (`/budget`) | Open Budget; then serve local Edge Functions and click `Refresh` | Initially `name resolution failed`; with functions served, `query-budget` returns HTTP `403` `denied`, displaying `"We couldn’t confirm the result. Your edits are still here. No Budget figures could be loaded..."` and an off-center `Refresh` text button | Budget workspace loads or displays an accurate read-only unavailable/disabled explanation (never claiming unsaved edits) | `blocks review` (Budget review blocked on local stack) | No |
| 3 | Income (`/income`) & Expenses (`/expenses`) | Click date-range filter pill in `.console-hub-filters` | Popover aligns right of the trigger (`left: -90.36px`), clipping presets and the `From` date input off the left viewport edge | Popover aligns within viewport bounds so all presets and date inputs remain visible | `can continue` | No |
| 4 | Expanded hubs (`/dashboard?hub=overview`, `/accounts`, `/income`, `/expenses`) | Scroll `.console-designed-scroll` partway (`~30–160px`) | `.console-dock-material` remains transparent (`opacity: 0` up to `progress = 0.30`) while hero text is still opaque, overlapping sticky `<- Home` and filter controls | Sticky dock backdrop shields controls or hero clears before entering dock bounds | `can continue` | No |
| 5 | Expenses (`/expenses`) | Scroll to `Category outflow` in an active period | Bottom-left `.react-flow__controls` renders white icons on a solid white bar (`rgb(254,254,254)` / `rgb(255,255,255)`) | Graph zoom/fit controls contrast clearly in Console dark surfaces | `can continue` | Yes |
| 6 | Expenses (`/expenses`, `Recurring hub`) | Open `Recurring hub` → `Commitments directory` | Active `all` chips under `Status` and `Type` render solid white with invisible white text | Active filter chips use readable dark ink on white fill | `can continue` | No |
| 7 | Control Centre (`<dialog class="console-centre">`) | Press plain `Tab` repeatedly under default Safari settings | Focus moves `Close` → attention card → `document.body` outside dialog, skipping all 6 bottom quick actions (`Option+Tab` traps cleanly) | Plain `Tab` stays trapped inside Control Centre and reaches quick actions | `can continue` | No |
| 8 | Settings (`/settings`) | Focus `Master volume` range slider via keyboard | Matches `:focus-visible` with `boxShadow: "none"` and no visible focus ring in Safari | Visible Console focus ring appears around the slider control/thumb | `can continue` | No |
| 9 | Start / Home (`/dashboard`) | Keep signed-in tab open through ~10-min Supabase token refresh burst | `Start Halcyon` re-appears over Home without a page reload (`startEntrySeen` reset on session bounce) | Start screen only gates initial signed-in entry once per browser session | `can continue` | No |
| 10 | Accounts (`/accounts`) | Select an investment account with positive balance | Hero art slot shows `"Holdings appear here when accounts have a cash or investment balance."` beside positive balance; investment summary uses Classic all-caps labels (also seen on Projections and Recurring cards) | Show investment art/trend or omit zero-balance copy; use sentence case in Console cards | `can continue` (copy) / `cosmetic` (caps) | Yes |
| 11 | Accounts (`/accounts`) | Open transaction detail drawer | `Category` select box stretches taller and misaligns beside `Subcategory` select | Adjacent selects share matching height and baseline | `cosmetic` | Yes |

*(Also noted without screenshot: Settings `Master volume` row height is `70px` vs `51px` for `Console sound` and `Ambient music` rows while sharing `13px` label typography — `cosmetic`.)*

## Smoothness Verdict & Evidence

- **Machine caveat:** Recorded on an **M3 Pro MacBook Pro (`Mac15,6`)**, **not** the **2020 M1 MacBook Air**; the M1 Air smoothness verdict remains with the owner.
- **Walkthrough recording (`smoothness.mov`, private):** 38.01 s (`1512×801` @ 120 Hz ProMotion, `full` tier) across all 5 Home tiles, Income open/scroll-to-compact/return, and Control Centre open/close ran smoothly with zero visible stutter on the M3 Pro.
- **Safari Web Inspector Timelines (detached, `1512×801`, active audio/music preferences):**
  - **Full tier (`5.803 s` idle Home):** `12` main-thread rendering commits (`~2.07 commits/s`; inter-commit mean `482.47 ms`, p95 `501.96 ms`, max `506.42 ms` — CSS drift/glow/beam animations ran on GPU/CoreAnimation compositor). Zero long script tasks (`Script >8.33 ms: 0`; total Script `4.09 ms`, max `1.31 ms`; `0` Layout events; Paint/Composite max `0.088 ms`). WebKit `Main Thread` CPU mean `10.60%` (max `13.50%`); total WebContent CPU mean `14.25%` (p95 `17.00%`, including Web Audio `0.72%` mean). Hardware compositor presentation rate is `unavailable` in Safari Timelines export.
  - **Reduce effects (`5.452 s` idle Home):** `20` main-thread rendering commits (`~3.67 commits/s`; mean `271.98 ms`, p95 `202.77 ms`, max `1,781.53 ms`). Frame 1 at `t=0` captured one `43.27 ms` `message` event + `9.89 ms` paint as post-navigation state settled; Frames 2–20 had `≤0.52 ms` Script, `0` Layout, `≤0.093 ms` Paint. WebKit `Main Thread` CPU mean `8.68%` (max `16.00%`); total WebContent CPU mean `16.05%` (p95 `21.30%`, including Web Audio `1.41%` mean).
  - **Idle main-thread delta (Full vs Reduce):** `+1.92%` of one core (`10.60%` vs `8.68%`) on the M3 Pro.

## Background Tab (5 s Real Safari Tab Switch)

- **Pass:** Switched Safari from Home (Tab 1, `full` tier) to Tab 2 for `5.302 s` and returned (verified both settled and 100 ms mid-dwell). `document.visibilityState` transitioned `visible → hidden → visible`, `requestAnimationFrame` callback count while hidden was `0`, and `data-paused` toggled `true → false`. On return, there was zero jump, zero animation replay, and zero stale colour cross-fade.

## Ledger Label Verdict

- **Pass:** Against real data, the labels clearly distinguish the three states and match the **Review counts** explanations:
  - **Never categorised** covers uncategorised transactions with no recorded category source.
  - **All uncategorised** also includes uncategorised transactions with a recorded source.
  - **Needs attention** includes all uncategorised transactions and separately flagged categorised transactions.

## Particles Behind Text

- Drifting particles visibly pass behind figures and text across the ambient viewport (while blurred behind glass surfaces). Against large whole-dollar Home headlines they are faint and do not impair legibility; however, on **Accounts** (`28px` weight `200` strip), a brighter particle visibly intersected the trailing digits of a `Net cash flow` figure, creating a slight visual distraction.

## Rollout Recommendation

**Hold** — do not execute the Console default switch yet:
1. Resolve the Safari & real-data findings before switching the default — specifically: Home 200% zoom hero/activity collapse (`756×400`), Budget backend gating / misleading 403 `"Your edits are still here"` error state, left-clipped DateRangePicker (`Income`/`Expenses`), white-on-white ReactFlow Controls & Recurring `all` filter chips (`Expenses`), expanded-hub mid-scroll dock overlap, Control Centre plain-`Tab` trap escape in Safari default mode, `Master volume` missing focus ring in Safari, mid-session Start screen re-entry, and Invest hero art empty-holdings copy.
2. Complete the smoothness check on the physical **2020 M1 MacBook Air** (which decides whether the desktop Automatic default should stay `Full` or switch to `Balanced`).

## Read-Only & Preference Audit

- **Zero user writes occurred:** Passive fetch monitoring recorded only read-only PostgREST `GET` / `rpc/*` calls, GoTrue `/auth/v1/token` refreshes, read-only `query-budget` fetches (`403`), and automatic app-boot hooks (`record-user-session`, stale `sync-investment-prices` while Edge Functions were stopped). No Save, Apply, Confirm, Import, Upload, Sync, Scan, Rescan, Delete, or Sign out action was triggered.
- **Preferences restored:** Original appearance, theme, sound/music/volume, effects tier, start screen, shortcut, redaction state, Safari 100% zoom, and original tabs were verified restored.
