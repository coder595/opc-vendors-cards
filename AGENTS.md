# AGENTS.md

## What this repo is

Greenfield planning repo for **OPC Vendors Cards** — a local-first, offline PWA
for capturing suppliers, dealers, agents, and factories met at trade fairs
(first target: the 140th Canton Fair, Guangzhou, October 2026).

**No app code exists yet.** The repo currently contains only:

- `plan.md` — vision, MoSCoW scope, phases, acceptance criteria (**source of truth**)
- `architecture.md` — stack, data model, storage, design tokens, security, ADRs (**source of truth**)
- `.opencode/agent/` — 17 project-scoped ECC subagents
- `scripts/install-ecc-agents.py` — regenerates those agents

There is no `package.json`, README, lockfile, or CI. The `npm run *` scripts
described in `architecture.md` §11 do not exist until Phase 0 is scaffolded.

## Start here

1. Read `plan.md` and `architecture.md` in full before writing code. Do not
   invent a different architecture.
2. Execute **one phase at a time** from `plan.md` §8. Stop at each phase's exit
   criteria and report; do not start the next phase without user confirmation.
3. Load `ponytail` (full) and `frontend-design` before UI work.

## Non-negotiable constraints (easy to violate)

- Local-first and offline-first: **no backend, cloud, accounts, telemetry, or
  runtime external requests**. User data lives in IndexedDB, never in the
  service-worker cache.
- Production dependencies **≤ 6**, each justified. No router library, no state
  library, no Tailwind. Use native platform APIs (camera file input, Canvas,
  `CompressionStream`) and Dexie `useLiveQuery`.
- **Never** use `dangerouslySetInnerHTML`. Validate all imported JSON (shape,
  size, record counts). CSV export must guard against formula injection (`= + - @`).
- `src/styles/tokens.css` is the visual source of truth; follow
  `architecture.md` §7. Avoid generic AI-default design.

## Harness

- 17 ECC subagents are installed in `.opencode/agent/` — e.g. `planner`,
  `architect`, `typescript-reviewer`, `react-reviewer`, `tdd-guide`,
  `e2e-runner`, `security-reviewer`, `a11y-architect`, `react-build-resolver`.
  Invoke with `@name` or the Task tool. Routing table: `architecture.md` §13.3.
- Regenerate agents with `python3 scripts/install-ecc-agents.py` (requires ECC
  at `~/.claude/plugins/marketplaces/ecc`). Generated agent files are committed.
- gstack skills are available: `/qa`, `/review`, `/ship`, `/cso`,
  `/design-review`, `/plan-eng-review`.

## Commands (exist after Phase 0 scaffolds the app)

`npm run dev | build | preview | lint | typecheck | test | test:e2e`

Run `lint` → `typecheck` → `test` before every commit. Playwright E2E covers
PWA install, offline reload, capture, and export/import.
