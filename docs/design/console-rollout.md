# Console component and screen plan

Phase 1 proposal · 22 November 2026

Start on Dashboard. A user can focus Income, see the existing 30-day inflow and open the Income analyzer. Expenses can show the existing spending figure and carry the selected period or category into the analyzer. Accounts can show holdings. This first slice exercises focus, dwell, data presentation and return navigation using information Dashboard already owns. The [audit](console-audit.md) records the choices awaiting confirmation before the numeric spec.

## Component boundaries

Proposed props describe ownership. The existing router identifies destinations. A section ID identifies a visual selection. They can differ while someone browses the home row.

| Primitive | Inputs and events | States and responsibilities |
| --- | --- | --- |
| Appearance and effects preferences | Appearance, saved classic light/dark choice, OS motion preference, app motion, reduce effects, sound opt-in, mute, volume, music opt-in | Own the runtime flag, first-paint preference and effective settings above the keyed routes. Default to the existing appearance. On exit release console listeners, timers, animations and audio nodes. Persist presentation preferences only. |
| FocusRing | `kind` (section, activity, control), `active`, native focus-visible, disabled, effective motion | Style the actual button or link, with decorative layers excluded from interaction and accessibility. Rest, focused, pressed, disabled, static/reduced and forced-colours states. Assign scale to a visual child so the hit target and layout slot remain stable. |
| FocusRow | `kind`, labelled ordered items with stable IDs, active ID, `onFocusChange(id)`, `onActivate(id)`, return ID | Own a row-local roving tab stop and input modality. Scope horizontal arrows to the row. Tab exits. Suppress activation after a touch pan. Distinguish hover, DOM focus, pointer activation and committed preview. Preserve one visible focus anchor when changing modality. Single-action cards open on first activation. |
| AmbientBackground | Committed section hue, effective effects, page visibility, covering overlay, input capability | Render the outgoing/incoming section layers and use opacity to mix their pre-rendered backgrounds. Active, cross-fading, suspended and static. Coalesce pointer input into one frame update. Give touch a stable centre. Clear pending work on section changes, theme exit and unmount. |
| GlassSurface | `kind` (hub, activity, sheet), children, effective effects | Compose the existing glass family. Keep decorative layers separate from content, pick a legible opaque fallback and protect redacted values. Delegate interaction to a real control. |
| ControlCentre | Open state, opener or fallback ref, existing actions, available notices, `onClose` | Labelled modal with one focus owner. Support button and C, Tab/Shift+Tab, Escape, return focus and safe-area scrolling. Suspend the ambient scene while open. Ignore editable targets, composition, modifiers and key repeat, and defer to an existing modal. Provide a way to disable the single-character shortcut. Preserve independent primary navigation. |
| SoundEngine | `unlockFromGesture()`, `play(cue, position?)`, effective sound/music settings, `setMuted`, `setVolume`, `suspend`, `dispose` | Uncreated, running, muted, suspended, unavailable. One master path and reverb send. Throttle hover at the engine boundary. Cancel tails/music on mute, theme exit or sign-out. Never create a context from an effect on reload. Explicitly opting in can override the OS sound default. |
| Motion presets | Token-backed recipe, sibling index, effective motion, cancellable animation owner | Rise, title, overlay, sheet and reverse transitions; static or reduced variants. Keep a single source for times, easing and geometry. Stop superseded work during rapid reversal. Only the committed presentational child receives a new key. |

Use a standalone fictional-data demo following the existing Vite concept-entry pattern. Each primitive commit adds its full, reduced and applicable disabled, interrupted, empty and error states to that demo. A controlled clock, stable focus ID and frozen ambient scene make screenshots repeatable. Audio demos require a real activation and show the selected cue in text.

## Delivery order

| Phase and commit unit | Visible result | Evidence in the commit note |
| --- | --- | --- |
| 2 · appearance and token foundation | Live switch and effective preferences | First visit, reload, blocked storage, light → console → light and dark → console → dark, including a form with unsaved state. |
| 2 · one commit per primitive | Motion presets, FocusRing, FocusRow, GlassSurface, AmbientBackground, SoundEngine, then ControlCentre | Each commit names the demo state, keyboard/touch path and reduced-effects result. Include the navigation trace for motion-bearing changes and note which target was measured. Establish chart parity first if a dependency upgrade is approved. |
| 3 · Dashboard | Section row, keyed figures and activity cards above the existing detail affordances | Test rapid browsing, open during dwell, Back to the same tile, screen reader order, redaction, empty/error results and recent-transaction editing. Compare report requests before/after focus movement. |
| 4.1 · Accounts | Balances and holdings hub | Account selection, balance history, activity, add/edit and provider connection dialogs. Restore the initiating control after a dialog closes. |
| 4.2 · Income | Income summary and projection entry | Date/account filters, analyzer/projections tabs, keyboard chart alternatives and saved planning edits retain their state while appearance changes. |
| 4.3 · Expenses | Spending summary and recurring entry | Category and time filters, recurring directory, calendar and drill-through still agree. Escape dismisses a picker before any hub navigation. |
| 4.4 · Budget | Console shell around its existing task workspace | Verify flag-off and owner/member access, draft and interrupted-save recovery, native modal focus and its docked appearance control. |
| 4.5 · Ledger | Console chrome around the transaction workspace | Type C in search, select multiple rows, page, open a full-parent drawer, close and restore focus. Keep a visible ring around the active control within the table. |
| 4.6 · Ingestion | Quiet console chrome around statement import | Operate file input, mapping, staging and error recovery. Keep progress text, native inputs and the current staged work visible during appearance changes. |
| 4.7 · Transfers | Quiet console chrome around review queues | Preserve group selection, queue position, batch confirmation and keyboard operation. |
| 4.8 · Settings | Appearance, sound/volume, reduce effects and shortcut controls in the existing form | Connect final settings presentation to the Phase 2 preference owner. Test native interaction, independent music/mute, OS preference changes and persistence. |
| 4.9 · Landing | Coordinate the existing hero transition with optional signed-in start entry if approved | Verify Enter, click, first audio gesture, return home, deep link, sign-out and reduced motion. |
| 5 · cross-screen qualification | Reference comparison, accessibility and performance evidence | Use the matrix below. |

Login, onboarding, callback, password reset and the internal concept route get direct-entry and keyboard regression checks. Their functional forms and recovery routes are unaffected by the home-screen treatment. A section without existing Dashboard data can expose a labelled route action. Hovering it must never query a specialist screen or display a fabricated zero.

## Acceptance evidence

- **Appearance and layout.** Capture the same fictional state at 320, 390, 768, 1024 and 1440px. Compare matching classic light and dark captures against their baselines, then compare console against the supplied target. Include the first and last tile, long names, ring edges, an open overlay, and 200% zoom. Check focus-induced layout shift independently of the intended track transform.
- **Input and accessibility.** Use Playwright and axe on real states, then operate each row and dialog using keyboard and touch. Inspect accessible names, focus restoration, visible labels, sign and contrast against both gradient extremes, forced colours and native controls. Verify that navigation works while the entrance is playing.
- **Effects and sound.** Test fresh/off, explicit opt-in, persisted opt-in before/after a gesture, muted, zero volume, music off/on, unavailable Web Audio, OS reduce and explicit override. Combine OS reduce and in-app Reduce effects separately and together. Verify no ambient movement when reduced or obscured, no decorative blur/particles with Reduce effects, 150ms reduced entrances and visible feedback for every cue.
- **Performance.** Record the chosen device/browser, build, viewport, refresh rate and effects settings. Trace rapid focus changes, dwell, section open/Back, overlay open/close and a hidden/visible cycle at normal speed. Record frame intervals against 60fps, navigation tasks over 50ms, ambient work against 2ms per frame, and focus-induced layout shift against zero. Profile rendering/compositing as well as script. Attach the trace or its artifact link to the commit note. An emulated viewport establishes layout coverage only.
- **Regression scope.** Inspect both CSS animations and JS targets for layout properties, animated shadows and tracking. Log the screen or primitive, what changed, fixture, checks run, artifacts and any unverified targets in each commit. New product components and views also trigger the repository's index update rule.
