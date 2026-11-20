# Halcyon — agent orientation

Personal finance webapp. Vite + React + TypeScript SPA in `app/`, Supabase (Postgres + Auth + RLS
+ Deno Edge Functions) backend in `supabase/`. No Next.js, no other server. Local dev stack via
`npx supabase@2 start` (from repo root; the CLI is pinned to v2 because v3 rejects this config) + `npx supabase@2 functions serve --no-verify-jwt --env-file
supabase/.env.local` (separate shell) + `cd app && npm run dev`.

This file is short on purpose — it orients and points, it doesn't explain. Read the linked doc
before touching that area; don't guess from this file alone.

## Where to look

| Need | Read |
|---|---|
| Frontend conventions, testing, animation rules | [app/CLAUDE.md](app/CLAUDE.md) |
| Backend conventions, RLS/migration patterns, the "Laws" | [supabase/CLAUDE.md](supabase/CLAUDE.md) |
| Current resume point, operational data state, next-work options | [CURRENT_STATUS.md](CURRENT_STATUS.md) — **read this first** when resuming work |
| File-by-file system map, current known bugs | [INDEX.md](INDEX.md) — read before changing an unfamiliar architectural area |
| Full history, rationale, dated diary of past fixes | [CONTEXT.md](CONTEXT.md) — historical background, not the live backlog |
| Design tokens, components, motion spec | [Halcyon_DesignSystem.md](Halcyon_DesignSystem.md) — reference only, load when doing UI/visual work |
| Full product vision + security model | [System requirements - SRD.md](System%20requirements%20-%20SRD.md) |
| What's in scope now vs. deferred | [MVP_SCOPE.md](MVP_SCOPE.md) |
| Database safety, backups, validation and recovery | [SYSTEM_INTEGRITY.md](SYSTEM_INTEGRITY.md) — **mandatory before any migration, live integration test, Supabase reset, fixture cleanup or recovery work** |

## Verification from `app/`

| Check | Command |
|---|---|
| Frontend types | `npx tsc --noEmit -p tsconfig.json` |
| Unused declarations | `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` |
| Browser test types | `npm run test:browser:typecheck` |
| Budget foundation types | `npx tsc --noEmit -p tsconfig.budget-foundation.json` |
| Budget workspace types | `npx tsc --noEmit -p tsconfig.budget-workspace.json` |
| Budget concept types | `npx tsc --noEmit -p tsconfig.budget-concept.json` |
| Production build | `npm run build` |
| Offline unit and contract tests | `npm test` |

The app has no configured lint script. Live CSV ingestion has a separate entry point,
`npm run test:csv:live`. It provisions a disposable project and uses private sample
statements and live categorization. Read [SYSTEM_INTEGRITY.md](SYSTEM_INTEGRITY.md)
before running any live suite.

## Rules that apply everywhere

- **The default local database is persistent user data, never a disposable test target.** Do not
  run `supabase db reset`, discard its Docker volume, broadly delete fixtures, or restore over it.
  Read and follow [SYSTEM_INTEGRITY.md](SYSTEM_INTEGRITY.md). Destructive database validation is
  permitted only on an explicitly isolated project with a positively verified target.

- **Money is always integer cents**, end to end — DB columns, `DataContext`, every analytics lib.
  Convert to dollars in exactly one place per surface (`fmt()`/`fmtCents()` in `app/src/data.ts`).
  This bug has recurred *five times* from inline formatting — see `CONTEXT.md`'s 2026-08-05 entry.
- **Sign convention:** transaction `amount` is positive = inflow, negative = outflow. Never invert
  this per-view; if a view needs "spend" as a positive number, negate at display time only.
- **RLS is never optional.** Every table needs a policy keyed on tenant membership
  (`is_tenant_member`/`has_tenant_role`), not `auth.uid() = user_id` — this app is multi-tenant
  even though each user currently owns exactly one personal tenant. See `supabase/CLAUDE.md`.
- **Application-data mutations never go directly from the browser to PostgREST or an RPC.** They
  must use a Zod-validated Edge Function (`_shared/withAuth.ts`); direct reads remain RLS-scoped.
  The sole client-side mutation exception is `supabase.auth.*` for GoTrue identity/session lifecycle
  (sign-in, password/email changes, OAuth/OTP exchange, and sign-out), not Halcyon application data.
- **Aggregates in SQL, matching in O(N).** Don't `.reduce()` over thousands of fetched rows for a
  total; don't nest loops when matching/deduping — see `supabase/CLAUDE.md` Laws 2–3.

## Keeping docs current — read this before ending a task

If you added a table, migration, Edge Function, top-level component/view, or changed the schema:
**update [INDEX.md](INDEX.md)'s relevant section before concluding the task.** This is the one
step that has actually gone missing before — `INDEX.md` and two spec docs described the
transfer-linker as unbuilt "Phase 4" work for a while after it shipped, because the update
instruction used to live in a file (`.agents/rules/maintain_index.md`) nothing ever loaded. It
lives here now specifically so it's actually read.

Also append one line to **Recent changes** below (date + what shipped, one line, no detail — the
detail belongs in `INDEX.md` or `CONTEXT.md`). Keep this log capped at 10 entries; when adding an
11th, drop the oldest. It exists so an agent gets a cheap "what's new since I last worked here"
signal without re-reading `CONTEXT.md`'s full diary.

If you're not sure whether the docs are in sync with the code at all — not just after your own
task, but in general — run `/docs-audit`. It's the automated version of what a human had to do by
hand to find the transfer-linker gap.

## Recent changes

- 2026-11-20 — Wave 3C.1 adds tenant-scoped portfolio, cash-flow, movement history and split-safe ledger SQL read contracts.

- 2026-11-20 — DataProvider clears session data on identity changes and drops superseded refresh and sync results.

- 2026-11-20 — Provider sync preserves manual edits on read failure and reconciles provider anchors atomically across the full ledger.

- 2026-11-20 — Strategic projection readouts and calculation breakdown now live in components/projections/.

- 2026-11-20 — Transfer review panels and cards now live beside the OskoLinker controller in components/transfers/.

- 2026-11-19 — Default unit tests run offline; live CSV ingestion uses a verified disposable project.

- 2026-11-18 — Budget Look back shows up to 12 budgets month by month (migration 20261118000000, query-budget `months`).

- 2026-11-13 — Budget auto-build review lists every draft line with where its amount came from; edits relabel only that row.

- 2026-11-13 — Rate-limited Budget refreshes wait out the server's retry_after and read again, so Undo no longer leaves stale "may be out of date" figures.

- 2026-11-13 — Budget plan editor and manual setup edit amounts in a table that shows what changed.
