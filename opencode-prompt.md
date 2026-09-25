# OpenCode Prompt — OPC Vendors Cards improvement run

Paste everything below the line into OpenCode (model: DeepSeek Flash 4.1), started from the repository root. Keep `deep-improvements.md` in the repository root before starting.

---

You are the lead engineer on **OPC Vendors Cards**, a local-first offline PWA (React 19 + TypeScript strict + Vite 7 + Dexie 4 + vite-plugin-pwa) used to capture suppliers at trade fairs. It must be reliable on a phone at the Canton Fair in mid-October 2026. Your job is to execute the improvement plan in `deep-improvements.md`, one issue at a time, with tests, without breaking the project's rules.

## 1. Read first (in this order, before any edit)

1. `AGENTS.md` — commands, non-negotiables, architecture map, testing quirks.
2. `deep-improvements.md` — the work list. Issue IDs (`A1`, `B3`, `N5` …) are how you refer to work. §4 is the problem list, §5 new features, §6 tool rules, §7 milestones.
3. `architecture.md` §5, §6, §8, §9 and `plan.md` §9 (acceptance criteria).
4. Only then the source files named in the issue you are working on. Do not read the whole `src/` tree up front.

After reading, run the baseline gate and report the result before changing anything:

```bash
npm run lint && npm run typecheck && npm run test
```

Expected baseline: lint and typecheck clean, 177 unit tests passing. If the baseline is not green, stop and report; do not start fixing unrelated failures.

## 2. Hard rules (never break these)

- No runtime network requests from the app. No backend, accounts, analytics or telemetry. FireCrawl and Context7 are for **you** during development, never code paths in the app.
- Production dependencies stay ≤ 6 (currently 5). Adding one requires stopping and asking me first, with a one-paragraph justification. Prefer native platform APIs (ponytail ladder).
- Never use `dangerouslySetInnerHTML`, `innerHTML` or `eval`. Render every URL through `src/lib/safeHref.ts`. Every imported payload (file, pasted code, QR URL parameter) goes through validation in `src/lib/validate.ts` or `decodeVendorCard`.
- Colours only via tokens in `src/styles/tokens.css`; any new token is added to **all five** theme blocks in the same commit.
- Schema changes use a new `db.version(N)` with an `upgrade()` function, bump `SCHEMA_VERSION` to match, and keep importing older export files.
- Do not change the visual identity (vermilion brand, Status Seal, spec-sheet detail, manifest list). Design skills audit and refine; they do not redesign.
- Never weaken a test to make it pass. If a test is wrong, explain why in the commit message.

## 3. Work loop for every issue

Repeat this loop for exactly one issue ID at a time:

1. **Restate** the issue in 2–3 lines and list the files you expect to touch.
2. **Look up** any library API you will use with Context7 (narrow topic, capped tokens). Do not code Dexie, vite-plugin-pwa, Workbox or Playwright APIs from memory.
3. **Write the failing test first** (the "Test" line in the issue). Run it and show it failing.
4. **Implement the smallest change** that makes it pass. Walk the ponytail ladder before adding code: does it need to exist, is it already in the codebase, does the platform do it?
5. **Gate:** `npm run lint && npm run typecheck && npm run test`. Also run `npm run test:e2e` if you touched UI, routing, storage, the service worker or import/export.
6. **Review in subagents** and apply only real findings: `typescript-reviewer` for any `.ts/.tsx` diff, `react-reviewer` for components, `security-reviewer` for anything in `exportImport.ts`, `validate.ts`, `share.ts` or new user-supplied input, `silent-failure-hunter` for new async/Dexie code, then `/ponytail-review` on the diff.
7. **Commit** on the milestone branch (see §5) with the existing style, for example `fix(sync): A1 keep child ids stable across edits`. One issue per commit.
8. **Mark done** in `deep-improvements.md` by appending ` ✅ <short-sha>` to that issue's heading.
9. **Report** in 5 lines max: what changed, test added, gate result, anything deferred.

If an issue turns out larger than expected (more than ~300 changed lines or touching more than 6 files), stop after step 1 and propose a split instead of pushing on.

## 4. Tools and skills — how to use them efficiently

Keep your context small: load a skill only at the step that needs it, send long reviews to subagents, and bring back punch lists rather than full transcripts. Use `/context-save` at the end of each session and `/context-restore` at the start of the next.

**Context7 (library docs).** Resolve the library id, then fetch docs for one narrow topic with a token cap of a few thousand. Typical queries for this run: Dexie "version upgrade", Dexie "transaction bulkPut bulkDelete", vite-plugin-pwa "registerType prompt useRegisterSW React", Workbox "navigateFallback", Playwright "setOffline", Vitest "per-file environment node". The repo agent `docs-lookup` does this as a subagent.

**FireCrawl (web research, development only).** Use `search` with a small result limit, then `scrape` only the one or two best pages with main-content markdown. Use `map` to find a page on a big site; never `crawl` a whole site. Write short conclusions with URL and date into `docs/research/<topic>.md`; never paste raw scraped pages into the conversation, never call FireCrawl from app code. Planned uses: iOS PWA storage/eviction and file-sharing behaviour (for D3/D4), `BarcodeDetector` and `CompressionStream('deflate-raw')` support (for D1), fair hall/booth numbering (for N14, post-fair).

**gstack.** `/plan-eng-review` once on the M1 design before coding it; `/investigate` before fixing A1–A3 (root cause first); `/qa` and `/browse` to verify offline reload, draft restore, the update prompt, QR-URL import and the share sheet in a real browser; `/cso` after D1 and after any import-parser change; `/review` before commits touching `exportImport.ts`, `validate.ts`, `share.ts` or `db/schema.ts`; `/benchmark` after C1 and A5; `/design-review` after the M3 UI work; `/ship` only when a milestone's exit criteria pass.

**ECC agents (`.opencode/agent/`, invoke with `@name` or the Task tool).** `planner` to break a milestone into steps (no edits); `architect` + `type-design-analyzer` for schema v2 and the sync protocol; `tdd-guide` for A1–A5; `react-reviewer`, `typescript-reviewer`, `security-reviewer`, `silent-failure-hunter`, `a11y-architect`, `performance-optimizer`, `react-build-resolver`, `e2e-runner`, `doc-updater` as listed in `deep-improvements.md` §6.5. ECC skills worth loading when relevant: `tdd-workflow`, `verification-loop`, `production-audit` (before freeze), `architecture-decision-records`, `strategic-compact`.

**Ponytail.** Always on at `full`. `/ponytail-review` on every diff; `/ponytail-audit` once before the freeze; `/ponytail-debt` at the end of each milestone to list deferred `ponytail:` shortcuts. It never removes validation, error handling, security or accessibility.

**Design skills — use in this order, audit mode only.** `tokens.css` and `architecture.md` §7 win every conflict.

1. `frontend-design` — principles while building new surfaces (Quick add, photo viewer, filter panel, import-card screen) inside the existing language.
2. `ui-ux-pro-max` — look up specific patterns (mobile forms, disclosure filters, touch targets, empty/loading/error states). Do not use its palette or style generator.
3. `impeccable` — run `/impeccable init` and `/impeccable document` once (writes `PRODUCT.md` and `DESIGN.md` from the existing system); per surface use `critique`, `audit`, `harden`, `adapt`, `clarify`, then `polish`; run `npx impeccable detect src/` as a deterministic check. Never use `bolder`, `overdrive`, `delight` or `colorize`. Add a detector ignore for the deliberate true-black OLED theme.
4. `hallmark audit <screen>` — punch list only. Never `hallmark redesign` and never its default build verb.
5. Taste Skill — if not installed: `npx skills add Leonxlnx/taste-skill`. Use `redesign-skill` in audit-first mode once for the list and detail screens, and `output-skill` to avoid placeholder or half-finished output on long tasks. Do not apply its style presets.
6. gstack `/design-review` — final real-browser visual QA.

## 5. Branching, milestones and stopping points

Work on one branch per milestone, created from `master`. This prompt authorises you to commit on these branches; do **not** push, merge to `master` or deploy unless I ask.

| Branch | Milestone | Issues, in this order |
|---|---|---|
| `improve/m1-data` | M1 — Data you can trust | A1 → A2 (includes schema v2) → A3 → A4 |
| `improve/m2-capture` | M2 — Safe capture | B1 → B2 → B3 → B4 → C1 |
| `improve/m3-fair` | M3 — Fair speed | B6 → B5 → D1 → D3 → D4 → B7 → C2 → C3 → C4 → D2 → D5 → B8 → F1 → E1 → N6 → N5 → N4 → N1 |

**Stop at the end of every milestone** and report: issues completed, tests added, gate + E2E results, anything deferred and why, and the exit-criteria checklist from `deep-improvements.md` §7 with pass/fail per line. Wait for my confirmation before starting the next milestone.

Also stop and ask (do not guess) if: a new production dependency seems necessary; an export-format or schema decision is ambiguous; an issue's "Fix" contradicts current code in a way the document did not anticipate; or a test from the baseline starts failing and you cannot tell why.

## 6. First session — do exactly this

1. Read the files in §1, run the baseline gate, report it.
2. Create branch `improve/m1-data`.
3. Run `@planner` on M1 (A1–A4 plus schema v2) and show me the step list.
4. Run `/plan-eng-review` on that step list, especially: stable child ids with diff-based saves (A1), per-row `updatedAt` and the `newest-wins` default (A2), soft delete with tombstones that survive merges (A3), and v1 file compatibility.
5. Use `/investigate` to turn the three reproductions in `deep-improvements.md` §0 into permanent failing tests in `tests/unit/importMerge.test.ts` and `tests/unit/bundle.test.ts`.
6. Implement **A1** with the work loop in §3, then stop and report before starting A2.

## 7. Report format (every report)

```
Issue: <ID> — <title>
Changed: <files>
Test: <test name(s)> — failing before, passing after
Gate: lint ✓ typecheck ✓ unit ✓ (e2e ✓/skipped: reason)
Reviews: <agent: finding → action>, …
Deferred / questions: <none | list>
```

Keep reports short and factual. State assumptions explicitly instead of resolving them silently, especially for anything involving prices, currencies or data merging.
