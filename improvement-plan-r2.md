# OPC Vendors Cards — Improvement Plan, Round 2

Status: **EXECUTED on branch `round2` (2026-09-27).** See the outcomes below.
Date: 2026-09-26 · Baseline: `8f584af` · Gates at baseline: lint ✅ typecheck ✅ unit ✅

Round 1 (`deep-improvements.md`) is mostly done: M1–M3, A5, E4 all landed. This round has two parts.
The first is new findings from a fresh audit by 4 parallel ECC agents (security-reviewer, react-reviewer,
a11y-architect, performance-optimizer), which I spot-checked by hand. The second is the round-1 items
still open. IDs continue the existing scheme: new items are `R1…`; open round-1 IDs are kept.

Rules still apply: offline-first, ≤ 6 prod deps, tokens-only colors, gate `lint → typecheck → test`
(+ `test:e2e` for UI/storage/SW/import-export), one commit per ID.

---

## Phase 1 — Fix now (small, real bugs) · ~½ day

| ID | Sev | Where | Problem | Fix | Verified |
|---|---|---|---|---|---|
| R1 | High | `src/features/vendors/vendorQuery.ts:89` | Leftover `console.log` + `JSON.stringify` runs once per vendor on every DB write | Delete the line | ✅ by hand |
| R2 | High | `src/lib/vcard.ts` | No RFC 6350 escaping. A contact that came in by QR or paste code can inject vCard lines through `\n`, `;` or `,` | `esc()` helper: `\`→`\\`, `,`/`;` escaped, CR/LF → `\n`. Unit test with a hostile name | ✅ by hand |
| R3 | Med | `src/lib/exportImport.ts` `ndjsonToEnvelope` | The v2 (default) import skips the `maxTotalAttachmentBytes` check that the v1 path does | Add up decoded bytes per line and fail fast. Test | agent |
| R4 | Low | `src/lib/share.ts` `inflateRaw` | No output-size cap on deflate (a small QR can decompress to a very large payload) | Reuse the byte-cap pattern from `streamToText` | agent |
| R5 | Med | `src/features/settings/SettingsScreen.tsx:28` | The form keeps stale values after an import changes settings | `key={settings.updatedAt}` on `<SettingsForm>` | agent |
| R6 | Med | `src/features/sharing/ShareScreen.tsx:37` | Size-estimate race: an older estimate can overwrite a newer one | `cancelled` flag in the effect | agent |
| R7 | Med | `src/features/vendors/VendorForm.tsx:165` | Draft-restore effect has no `active` guard, so object URLs leak on a fast unmount | Copy the `active` pattern from the edit effect | agent |
| R8 | Med | `src/features/vendors/VendorDetail.tsx:162` | `revokeObjectURL` runs right after `click()`, which can break the .vcf download on Safari | `setTimeout(() => revoke, 0)`. Check whether `share.ts` already has a download helper and reuse it | ✅ by hand |
| R9 | Med | ShareScreen / VendorForm catches | Errors are swallowed with no `console.error`, so there is nothing to debug offline | `console.error(err)` in each catch (no logger module) | agent |

## Phase 2 — Hardening & a11y · ~½ day

| ID | Where | Fix |
|---|---|---|
| R10 | `vercel.json` | Add `Strict-Transport-Security` and `Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=()`. If N9 (voice memo) is approved, use `microphone=(self)` |
| R11 | `src/lib/share.ts` `validateParsed` | Array and string length caps as defense in depth (reuse `LIMITS`) |
| R12 | `VendorList.tsx:156` | `aria-controls` + `id` on the filters panel |
| R13 | `PhotoViewer.tsx` | `aria-live="polite"` on the counter; replace the window Esc listener with the dialog `cancel` event (fixes a possible double `onClose`) |
| R14 | Delete dialog in `VendorDetail.tsx:687` (and other dialogs) | `aria-labelledby` → the `<h2>` id |
| R15 | `PhotoPicker.tsx:105` | Point `aria-describedby` from the buttons to the error |
| R16 | sepia `--muted` in `tokens.css` | Measure against `--paper`. If it is below 4.5:1 for small text, darken it (in the sepia block only) |

## Phase 3 — Performance & UX · ~1 day

| ID | Change | Notes |
|---|---|---|
| R17 | `React.lazy` for VendorShare, ImportCardScreen, TripScreen, SettingsScreen | Takes `qrcode` out of the entry chunk (currently one 152.8 KB gzip bundle). Make sure the SW still precaches the lazy chunks so they work offline (they are in `dist/assets`, so the glob covers them; verify with an offline e2e) |
| R18 | Thumb-zone "Add" action at the bottom of the phone layout | a11y agent: the main capture action is at the top while navigation is at the bottom. One-handed use at the fair |
| R19 | Vendor list "Show more" (render the first 100) | Only if field data shows 300+ vendors. `ponytail:` skip until then |
| R20 | Test speed: run `vitest doctor` (Context7) and apply the recommended pool | 28 jsdom environments take about 48% of test time |
| E3 | Resize photos with bounded concurrency (skip the worker for now) | 2–5 photos per pick, low priority |

Deliberately skipped: Dexie `.where()` prefilters (the in-memory filter is fine at the scale of one person's trip), extracting a draft-persistence hook from VendorForm (a refactor with no bug behind it), the `getElementById`→`ref` change (cosmetic), and a logger module.

## Phase 4 — Open round-1 features (choose which ones)

From `deep-improvements.md` §5, all with zero new dependencies:

| ID | Feature | My recommendation |
|---|---|---|
| D6 | Products CSV, one row per product | **Do.** Small, and N3 needs it |
| N3 | Product comparison by tag | **Do.** It is where the buying decision happens |
| N2 | Packing & landed-cost fields | **Do** if you compare landed cost. Needs a schema v4 bump |
| N7 | Follow-up WhatsApp/email templates | **Do.** Small |
| N8 | Tasks → .ics | Maybe |
| N10 | Encrypted export (WebCrypto) | Maybe. Quotes are sensitive |
| N9, N11–N14, C5, C6, E2, F3, A6, G2 | Voice memo, trip report, attribution, i18n, fair presets, desktop two-pane… | After the fair, based on field notes |
| G1 | Docs drift: mark round-1 ✅ in `deep-improvements.md`, update AGENTS.md | **Do**, at the end |

## Tooling: who does what

| Step | Tool |
|---|---|
| Phase 1 fixes (TDD for R2–R4) | `ecc:tdd-guide`, then `ecc:typescript-reviewer` on the diff |
| React fixes R5–R9, R17 | `ecc:react-reviewer` after the change |
| Security R2–R4, R10–R11 | `ecc:security-reviewer` / gstack `/cso` re-check |
| a11y R12–R16, R18 | `ecc:a11y-architect`; axe e2e across all 5 themes |
| R18 visual | `ui-ux-pro-max` (thumb-zone pattern lookup) → `impeccable` audit → `hallmark audit`. Audit only: the design language is already fixed |
| Real-device/browser checks (offline, lazy chunks, .vcf download) | gstack `/qa` / `/browse` (per your CLAUDE.md, instead of claude-in-chrome); BrowserUse cloud only if a second real browser is needed |
| API docs (vite-plugin-pwa precache of lazy chunks, Vitest pools, Dexie) | Context7 |
| Platform facts (Safari blob-download timing, `Permissions-Policy` support) | FireCrawl search → one scrape. Conclusions go to `docs/research/`, never into the app at runtime |
| Over-engineering check on every diff | `/ponytail-review` |
| Build breaks | `ecc:react-build-resolver` |
| Docs (G1) | `ecc:doc-updater` |

## Execution order & exit criteria

1. **Phase 1**: one commit per ID (`fix(vcard): R2 …`). Exit: gates green, new unit tests for R2–R4.
2. **Phase 2**: exit: axe e2e clean in all themes; headers check on the preview deploy.
3. **Phase 3**: exit: entry chunk smaller (record before/after sizes), offline e2e passes with lazy routes.
4. **Phase 4**: only the items you choose.
5. G1 docs pass, then `/review` and push to master (CI deploys).

## Questions for you

1. Approve Phases 1–3 as written?
2. Which Phase 4 features (default: D6, N3, N7, G1)?
3. Should I commit as I go, or leave the changes uncommitted for you to review?

---

## Outcomes (2026-09-27)

| ID | Result |
|---|---|
| R1–R4, R6–R9 | Done, one commit each. R2–R4 were written test-first |
| R5 | **Dropped.** `Settings` has no `updatedAt`. The bug needs two open tabs, and keying on content would reset the form after every save |
| R10 | Permissions-Policy added. HSTS was already sent by Vercel (`docs/research/permissions-policy.md`) |
| R11–R16 | Done. R12 was reworked after the a11y review: the panel stays mounted so `aria-controls` resolves. Sepia `--muted` went from 3.65 to 5.49:1 |
| R17 | Entry 153.10 → 137.44 KB gzip. The offline e2e opens lazy routes |
| R18 | Audited (`docs/research/r18-thumb-zone-audit.md`), then built: a phone FAB for Quick add and an active-tab rule |
| R19, E3 | Skipped (scale / already sequential) |
| R20 | `vmThreads` pool, about 8.5 s → 5.5 s |
| Extra | Import default is now newest-wins as documented. The corrupt woff2 fonts were replaced |
| D6, N3, N7, G1 | Done |
