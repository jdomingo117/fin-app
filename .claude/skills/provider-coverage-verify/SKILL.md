---
name: provider-coverage-verify
description: Check that Up Bank sync never marks history as verified while a transaction is missing. Use before finishing any change to supabase/functions/sync-provider/, the Up page client, the budget_provider_coverage_base/extend SQL, the coverage_walk_* columns, or the triggers that revoke account_activity_coverage, and when a sync bug report mentions Budget history coverage.
---

# Up history coverage check

## What it protects

**Property.** When Halcyon records a `verified_provider` coverage range for an Up account, every Up transaction dated inside that range is in the ledger.

**Harm if broken.** Budget treats a verified range as complete history. A missing transaction inside one quietly skews its forecasts, assistance and readiness. Nothing on screen tells the owner a row is missing.

The check runs the real `sync-provider` handler and explores every sequence of Up events and sync calls, up to a bound. Within each call, it also tries every way the call can stop early. Tests only cover the orders someone thought to write; this covers all of them within the bound.

It reports two properties:

- **WalkBeforeBase.** `budget_provider_coverage_base` records a range only after a walk reached its last page, where the walk began at the recorded `coverage_walk_started_at`.
- **CoverageSound.** Every Up transaction dated inside a live verified range is in `transactions`. A range that already fails WalkBeforeBase is reported there and not checked again here.

## Run it

From `app/`:

```bash
npm run verify:provider-coverage
```

It prints one line such as `[provider-coverage] bounds {...}: N states, M handler runs, Ts` and passes, or prints each failing property with its shortest trace. The default bound explores about 128,000 distinct states (about 470,000 handler runs) in about two and a half minutes on an Apple-silicon laptop. `COVERAGE_FAULTS=deadline,kill` drops request failures and takes about a minute. It needs no database, no network and no credentials, and never touches the persistent local stack.

Widen the search when a change touches ordering, retries or paging. Each variable is a whole number:

| Variable | Default | Meaning |
|---|---|---|
| `COVERAGE_STEPS` | 6 | Up events plus sync calls in one trace |
| `COVERAGE_CALLS` | 4 | Sync calls in one trace |
| `COVERAGE_FAULTY` | 2 | Calls in one trace that stop early |
| `COVERAGE_TX` | 1 | New Up transactions per trace (two exist at the start) |
| `COVERAGE_TICKS` | 1 | Jumps of one or eight days per trace |
| `COVERAGE_FAULTS` | `deadline,kill,error` | Which ways a call can stop early |

For example, `COVERAGE_STEPS=7 COVERAGE_FAULTS=deadline,kill npm run verify:provider-coverage` goes one step deeper with only deadlines and kills.

To check a change before you make it, or to confirm the check catches a break, copy the handler to `supabase/functions/sync-provider/index.<name>.ts` (git ignores these copies), edit the copy, and run with `COVERAGE_HANDLER=index.<name>.ts`. Delete the copy afterwards. Don't put a deliberate break in `index.ts` itself.

## Does my change touch the verified code?

Rerun the check if your diff touches any of these:

| Covered code | What the check relies on |
|---|---|
| `supabase/functions/sync-provider/index.ts` (whole handler, `toRow`) | Runs as is |
| `supabase/functions/sync-provider/merchantRules.ts` | Runs as is |
| `supabase/functions/_shared/dedupe.ts`, `normalizeMerchant.ts`, `upCategoryMap.ts`, `transferMatch.ts`, `classification.ts` | Run as is, through `toRow` |
| `supabase/functions/_shared/upClient.ts` | Faked: `filter[since]` filters on `createdAt`, pages run newest first, and `next` is a stable cursor |
| `budget_provider_coverage_base`, `budget_provider_coverage_extend` in `supabase/migrations/20261110020000_budget_provider_coverage.sql` | Ported line for line into `database()` in the check |
| `budget_invalidate_source` in `supabase/migrations/20261109010000_preserve_budget_coverage_on_reconciliation.sql` | Its coverage revocations are ported |
| `reconcile_provider_anchor` (`20261120000000`) | Modelled as a no-op: it only replaces a system adjustment, which never counts for coverage |
| The partial unique index on running `sync_runs` | Modelled: a second running sync gets `23505` |

**Last confirmed in step with the code at commit `0abd850`.** To list what changed in covered code since then:

```bash
git diff 0abd850 -- supabase/functions/sync-provider supabase/functions/_shared/upClient.ts supabase/functions/_shared/dedupe.ts supabase/migrations
```

A new migration that redefines either coverage function, or `budget_invalidate_source`, needs its port updated in the check before a pass means anything.

## Reading a result

**Pass.** Every trace within the bound kept both properties. Say which bound you ran.

**The sanity test fails** (`a clean first sync backfills the account and records verified coverage`). The fakes no longer match the handler, perhaps because the handler now calls a builder method, table or RPC the fake doesn't support. The search proves nothing until you fix the fake. The error usually names the method or table.

**A property fails.** The output gives the property, the transaction or range, and the shortest trace, with times in Sydney time (+10:00). Then:

1. Replay the trace by reading `sync-provider/index.ts` step by step. Each deadline check is a `Date.now() > deadline` line, counted from the top of the call. The first `Date.now()` sets the deadline and the second is the stale-run cutoff, so deadline faults start at check #2. Writes and requests are counted in the order the handler sends them, Up calls included.
2. **A real bug** is one where every step in the trace can happen in production. Up returns the data the fake returned, an Edge invocation can stop at that point, and the SQL does what the port does. Report it with the trace in plain words. Don't weaken the property or the fake to make it pass, and don't change product code unless the owner asks.
3. **A modelling error** is one where a step can't happen. For example, the fake Up API returns something Up can't, or the port differs from the current migration. Fix the check, then rerun.

## When a change is intended

- **Changing the sync engine.** Rerun at the default bound and once at a wider bound. If the change adds a builder method, table or RPC, extend `client()` or `database()` to match.
- **Changing the coverage SQL.** Update the port in `database()` to the new definition and cite the new migration in its comment.
- **Changing what "covered" means.** Update `violations()` and the property text in this skill together.

After you've confirmed the check describes the code at a new commit, and only then, replace `0abd850` above with that commit.

## What it does not cover

- Bounds: two starting Up transactions (one settled, one held) on a single account, plus `COVERAGE_TX` new ones. Each Up page holds one transaction, so a few transactions span several pages. That stands in for many transactions per page in production.
- Time: one fixed +10:00 offset for both Up timestamps and the SQL's `Australia/Sydney` dates. Daylight-saving changes are not modelled. Calls are at least 15 minutes apart, so two calls never overlap, and the only jumps are one day and eight days.
- Up is assumed to show a transaction as soon as it's created, and to filter `filter[since]` on `createdAt`. Up's documentation should be rechecked if either is in doubt.
- Not modelled: other Edge Functions (`extend-provider-history`, `map-provider-accounts`, `disconnect-provider`, manual deletes); several accounts sharing one deadline; database lock timeouts beyond a failed RPC; and reconnecting after a call marks the connection `error`.
- CoverageSound asks whether a transaction is recorded. It doesn't check that a recorded row's amount or date matches Up after settlement.
- A pass covers the explored traces within the bound, not every possible history.
