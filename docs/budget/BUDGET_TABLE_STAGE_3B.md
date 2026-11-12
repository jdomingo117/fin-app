---
tags: [halcyon, budgeting, design, engineering]
type: implementation-checkpoint
status: engineering-complete
project: Halcyon
created: 2026-11-13
updated: 2026-11-13
related:
  - "[[BUDGET_TABLE_STAGE_3A]]"
  - "[[BUDGET_TABLE_STAGE_1_PLAN]]"
---

# Budget table — stage 3b: auto-build review and row-by-row sources

This stage builds on the owner's decision: edited auto-build suggestions are relabelled
**row by row**.

## What shipped

- **Step 3 of "Help me build a budget"** keeps its summary of totals and adds
  `BudgetDraftTable`. It lists every line of the reviewed draft (before any optional
  change), its planned amount and "Where it came from". A note explains that the
  optional change is applied when the draft is used.
- **`assistedLineSources(setup, currentSource)`** in `lib/budgetAssistance.ts` derives
  each line's source:
  - Everyday comes from its `provenance.everyday` value: "From your history" (the
    history median), "Your number" (the owner's own amount) or "Kept as it was".
  - Bills and set-asides come from their reviewed costs: "Detected bill" (a recurring
    series) or "Checked by you" while the row is still confirmed, and "Your number"
    once it has been edited.
  - Other lines are "Kept as it was"; the protected goal line is "Your goal".
  - History labels add "· older history" once the draft's `source_revision` no longer
    matches the current one.
- **`convertAssistanceToManual(setup, previous?)`**: given the draft from just before
  an edit, it relabels only the provenance parts that changed (income, everyday or the
  goal line). Costs were already tracked row by row through `reviewed_inputs`. Without
  `previous`, the old behaviour stays: every part is relabelled. That path is used by
  "Keep as manual estimates" and the existing tests.
  - The draft-level `manual` flag is still set on any edit, so the server's staleness
    and review checks are unchanged.
  - No migration was needed: the server only checks that provenance values are short
    strings.
- **The setup editor table** shows each row's source in its note, for example
  "Everyday spending · From your history". Rows the owner changes switch to
  "Your number".

## Verification

- Unit tests: `budgetAssistanceReview.test.ts` covers the per-row labels, editing one
  row, editing everyday, "older history", and the unchanged path without `previous`.
  `BudgetEditTable.test.tsx` covers the source notes and the draft table. 674 tests pass.
- `--plan-only` on a disposable candidate project: 133 checks pass.
- `--assistance-ui-only` on a disposable candidate project:
  - The new check "the review step lists every draft line with a source" passes.
  - Three existing checks had to be brought up to date first:
    - assistance-only runs now skip the R09 coverage pre-checks, which hit the
      query rate limit (429);
    - the "Select all" step clears the 11 Nov spending-account pre-selection first;
    - the what-if wording expected "Everyday changes from" and now expects
      "Everyday spending goes from".
  - The run then stops at an **existing** axe violation, `label-content-name-mismatch`,
    on the detected-bill button `aria-label="Add Shop as a bill"` at 320px. That
    button comes from the 11 Nov detected-bills work, not this stage. Its visible
    text doesn't match its accessible name. The checks after it didn't run.
- **Follow-up, 13 Nov:** `--assistance-ui-only` on a disposable candidate project
  (`--candidate-alternate`, ports 57721/57800) now passes end to end: 273 checks, no
  failures, disposable resources removed. Changes:
  - Detected-bill button: its accessible name is now "Add as a bill: Shop", which starts
    with the visible text, so `label-content-name-mismatch` is gone.
  - Product fix: re-choosing the same "Have your income, bills or regular spending
    changed recently?" answer used to clear the reviewed amounts without the inputs panel
    re-sending them. Choosing "Enter my own amounts" then gave a blank editor, and the
    new goal was lost. Only a real change of answer clears them now, so the existing
    "manual conversion" check passes without being changed.
  - The tests were brought up to date with the 11–12 Nov assistance changes, without
    loosening any checks:
    - the per-item "I checked the income" tick is gone, and the single "I’ve checked
      these amounts" tick covers income;
    - the assistance dialog lists accounts directly, without an "Accounts & timezone"
      disclosure;
    - take-home pay entered and confirmed in the review is applied: the owner's 750
      replaces the draft's 700, and the test still asserts the exact value;
    - the fortnightly eligibility copy is now "2 of 6 months ready … Suggestions need 3."
  - New shared helper `selectAssistanceAccount` (`scripts/lib/budgetAssistanceUI.mjs`)
    keeps trying to tick the account until it stays ticked. Spending-account pre-selection
    loads in the background and could land in the middle of a Playwright click, unticking
    the account again.
  - Unit tests: 596 pass, 32 skipped; the type check is clean.

## Limits

- Sources apply to drafts only. An activated plan doesn't keep `assistance`, so My plan
  doesn't show them, as noted in [[BUDGET_TABLE_STAGE_1_PLAN]].
- Pay isn't a table row, so its source isn't shown.
