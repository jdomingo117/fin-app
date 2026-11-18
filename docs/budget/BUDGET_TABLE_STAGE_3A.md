---
tags: [halcyon, budgeting, design, engineering]
type: implementation-checkpoint
status: engineering-complete
project: Halcyon
created: 2026-11-13
updated: 2026-11-13
related:
  - "[[BUDGET_TABLE_STAGE_2]]"
  - "[[BUDGET_TABLE_STAGE_1_PLAN]]"
---

# Budget table — stage 3a: editing amounts in the table

This part of stage 3 covers "Adjust plan" and building your own budget. Step 3 of
"Help me build a budget", with its row-by-row "Your number" labels, is stage 3b.

## What shipped

- `components/budget/BudgetEditTable.tsx` replaces the stacked allowance fields
  inside `BudgetEditor` (`views/Budget.tsx`). It's used both when adjusting an active
  plan and in manual setup.
- The table has the same groups as My plan, and goals are separated using the saved
  items' `config.type`. Each row has a Planned input. Setup adds an editable name, an
  "Already set aside" input for set-asides, and Remove.
- **Adjust plan** shows "Saved $X" under each row and highlights a row as
  "Changed from $X" once its amount differs from the saved allocation.
- Enter moves down the same column, like a spreadsheet, and never submits the form.
- Field labels, validation messages and the setup line model are unchanged. Review,
  scope choice, gap acceptance, Leave editor and the existing `revise`/`save_draft`
  bodies all stay with `BudgetEditor`. Income and existing-cash fields stay where they
  were.
- On phones (below 600px) each row stacks, with small visible labels.

## Verification

- `BudgetEditTable.test.tsx` checks the existing labels, the goal grouping, the
  changed and saved notes, and that only setup can remove or rename rows.
- Disposable candidate project, `--plan-only`:
  - edit-table row count, the "Changed from" label and highlight, and Enter moving
    focus down the Planned column;
  - reverting clears the highlight, with no writes until save;
  - then the existing exact `revise` body, recovery and funding-gap checks.
- Disposable candidate project, `--setup-only`: the fit and accessibility captures
  pass at every width after the phone stacking change. The run used to stop after 241
  checks at the guarded Undo step in `test-budget-task-panel.mjs` (also on `36f2823`,
  before stage 3, so not caused by this change). **Cause:** the Undo itself saved, but
  by that point the run had used up `query-budget`'s 30 reads a minute. The refresh
  after Undo got a 429, so the Overview kept the $30.00 figures marked "may be out of
  date" and wrongly said "We couldn't confirm the result". **Fix (app):** a 429 body
  now carries `retry_after` (browsers can't read `Retry-After` cross-origin), the
  Budget client reports it as a rate limit rather than an unconfirmed save, and a
  rate-limited refresh waits that long (at most 65 s) and reads once more. The test
  allows for that wait and checks that the misleading message is gone.
- In the owner's app, the editor showed the table with real lines (Everyday spending,
  the Snowboard goal), and a temporary unsaved amount showed "Changed from $3,113.15".
  The change was discarded by reloading. No `manage-budget` request was sent, and the
  saved allocation total stayed $3,513.15.
