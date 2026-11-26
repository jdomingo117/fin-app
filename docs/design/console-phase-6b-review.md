# Console Phase 6B · Control Centre notices and actions

| Reproduction field | Value |
| --- | --- |
| Branch | `codex/console-phase-6b` |
| Application commits | `999e945` (notice derivations), `cec8ba4` (Control Centre, Quiet alerts, Rest) |
| Test commit | `bef9c0b` |
| Main base | `b5487ff`, the PR #15 merge |
| Worktree | `/Users/joel/Developer/fin-app` |
| Signed-in entry | [http://127.0.0.1:5320/dashboard](http://127.0.0.1:5320/dashboard) |

```sh
cd /Users/joel/Developer/fin-app/app
VITE_BUDGET_V1_ENABLED=true npm run dev -- --host 127.0.0.1 --port 5320 --strictPort
```

![Control Centre with three notices and the eight quick actions at 1440 × 900](captures/console-phase-6b/1440-centre-three.jpg)

Nothing was listening on 5320, so the suites ran with `CI=1` and started their own Vite listener from this worktree. Captures use the rendered sign-in and the signed-in Console default (`signInForConsole(..., 'fresh')`). The fixture supplies fictional replies at the app's Auth and data API boundary. No request reached a Supabase listener, and the default local database was not touched.

## What changed

| Area | Behaviour | Source |
| --- | --- | --- |
| Notices | The two fixed attention cards become a notice strip. It shows up to three notices in a fixed order: **Budget** checks, **Bills** due in the next 14 days, **Ledger review**, **Transfers**, then **Goals** at their target. If there are more, a line says how many are shown. | `ControlCentre.tsx`, `lib/consoleNotices.ts` |
| Budget notice | Uses the active check count from the Budget session's loaded workspace. Control Centre never starts a Budget read. Until Budget's current period has been opened this session, Budget isn't checked, and the strip says **Budget is checked once you open it.** If the current period is loaded but its checks are missing, Budget counts as a source that couldn't be checked. | `budgetSource()` |
| Bills notice | Active recurring series expected from today through the next 13 days. It shows the count and the soonest bill with its house date, such as **Next: Streaming service, 28 Nov**. It opens Expenses on the **Recurring hub** tab. | `billsDue()` |
| Ledger and Transfers | The existing portfolio counts. Ledger review covers uncategorised and flagged transactions, and opens Ledger on its needs-review list as before. | `portfolio_summary` |
| Goals notice | Active planning goals whose current value has reached the target, using the same value as Strategic projections. It opens Income on the **Strategic projections** tab. | `goalRing()` |
| Reads | Recurring bills and planning goals are read on the first open of Control Centre and kept for the session. Nothing new is read before then. | `useRecurrence`, `usePlanning` |
| Empty and incomplete | With no notices and nothing failed, the strip reads **All caught up**. An unopened Budget is named under it. If a source failed, the strip reads **Nothing to show** and names what couldn't be checked, so a failure is never reported as clear. While any source is loading, it reads **Checking for notices…** | `consoleNotices()`, `noticeGapText()` |
| Quiet alerts | A quick action, pressed or not. While it's on, Console toasts are dropped for this signed-in visit. It turns off on sign-out or reload, and doesn't affect Classic. | `App.tsx`, `useView().quietAlerts` |
| Rest | A quick action shown only while **Show start screen** is on. From Home it brings back the start screen. From a hub it goes Home first, through the normal Back path and its unsaved-changes guard. **Start Halcyon** returns Home with focus restored. | `ConsoleViewport.tsx` |
| Actions layout | Desktop keeps one row, now of seven or eight actions. Phones wrap to rows of four, with labels below. | `control-centre.css` |

**Add transaction** isn't added. Manual entry has no Edge Function path: `upsert-transactions` is only called by CSV ingestion. No new write path, migration or Edge Function is involved.

## Decisions for the owner

1. **Notice order.** The plan asks for a fixed order without setting one. I used: money already at risk (Budget), money about to leave (Bills), the review queues (Ledger, then Transfers), then good news (Goals). The plan's list order would put Goals third.
2. **Goal milestones.** Halcyon keeps no history of when a goal crossed 25%, 50% or 75%, so a crossing can't be detected honestly. The gate uses **target reached** only. Earlier milestones would need recorded progress.
3. **Quiet alerts and error toasts.** Toasts carry no severity, so Quiet alerts drops errors too. For example, a failed callsign save in Settings reports only by toast, and the regression shows it's hidden while Quiet alerts is on. The edit stays open, but the reason isn't shown. Options are to keep this, to let error toasts through (which needs a severity on toasts), or to drop Quiet alerts.
4. **Merging during observation.** If you approve, the merge goes in the [observation log](console-rollout.md#default-switch-observation).

## Captures

All states use fictional data. The 320 and 390 widths use the Phone project, with touch and a coarse pointer. The other widths use Desktop Chrome. The three-notice state turns on **Show start screen**, so Rest appears and the row has eight actions.

| State | 320 | 390 | 768 | 1024 | 1440 |
| --- | --- | --- | --- | --- | --- |
| No notices, Budget not opened | [320](captures/console-phase-6b/320-centre-zero.jpg) | [390](captures/console-phase-6b/390-centre-zero.jpg) | [768](captures/console-phase-6b/768-centre-zero.jpg) | [1024](captures/console-phase-6b/1024-centre-zero.jpg) | [1440](captures/console-phase-6b/1440-centre-zero.jpg) |
| One notice (goal reached) | [320](captures/console-phase-6b/320-centre-one.jpg) | [390](captures/console-phase-6b/390-centre-one.jpg) | [768](captures/console-phase-6b/768-centre-one.jpg) | [1024](captures/console-phase-6b/1024-centre-one.jpg) | [1440](captures/console-phase-6b/1440-centre-one.jpg) |
| Three of five notices, with Rest | [320](captures/console-phase-6b/320-centre-three.jpg) | [390](captures/console-phase-6b/390-centre-three.jpg) | [768](captures/console-phase-6b/768-centre-three.jpg) | [1024](captures/console-phase-6b/1024-centre-three.jpg) | [1440](captures/console-phase-6b/1440-centre-three.jpg) |

## Tests

| Check | Result |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.json`, unused declarations, budget foundation, workspace and concept configs | Pass |
| `npm run test:browser:typecheck` | Pass |
| `npm test` | 748 passed, including 6 new `lib/consoleNotices.test.ts` cases |
| `npm run build` | Pass, with the existing chunk-size advisory |
| Full Console Playwright suite, Desktop and Phone, `CI=1`, three shards | 149 passed, 17 skipped by project or capture-only conditions, 0 failed |
| `console-phase-six-b.spec.ts` with captures | 23 passed, 1 skipped |
| WebKit | **Not run locally.** Only Chromium is installed, and I didn't download WebKit. The WebKit project now includes `console-phase-six-b.spec.ts`, so CI runs the 6B regressions and the owner-fixes focus regression in WebKit. |

The new regressions cover the following:

- **Read discipline.** No planning or recurrence read before the first open, and no Budget read from Control Centre.
- **Two notices.** Ledger review and Transfers, with the unopened-Budget note. Ledger opens its needs-review list.
- **Three of five.** Budget, Bills and Ledger in order, with "Showing 3 of 5 notices." Bills opens Expenses on the Recurring hub tab; Budget opens Budget. This runs with touch taps on the Phone project.
- **One notice.** A reached goal opens Income on Strategic projections.
- **All caught up.** With and without Budget opened.
- **Failure.** A failed goals read reads "Nothing to show … Couldn’t check goals." rather than "All caught up".
- **Keyboard.** Shift+Tab from Close wraps to Sign out. Tab reaches the notices, arrows rove between them, Tab moves on to the quick actions, and Escape returns focus to the opener.
- **Quiet alerts.** Pressed state, a hidden toast while on, and the toast back once off.
- **Rest.** Absent until **Show start screen** is on. Rest from Home and from a hub shows the start screen, and Start returns Home.

The existing gate-three Control Centre test now looks for the **Notices** group and waits for it before tabbing, since notices appear once their reads settle. The owner-fixes focus and Safari wrap regressions passed unchanged in Chromium.

### Rendered leftover audit and axe

[Audit and axe output](captures/console-phase-6b/audit.txt). The leftover audit checked 6 Control Centre states on Desktop and Phone: two notices, three notices, one notice, all caught up with and without Budget opened, and Quiet alerts on. Every issue list was empty. All 12 axe scans of the Control Centre (WCAG 2.0/2.1 A and AA) reported no violations.

## Gate

**Stopped for owner review.** 6B isn't merged, and 6C hasn't started. To finish the gate:

- the decisions above;
- the WebKit result from CI on the PR.
