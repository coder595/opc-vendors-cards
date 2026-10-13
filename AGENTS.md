# AGENTS.md

## What this repo is

**OPC Vendors Cards** — a local-first, offline PWA (React 19 + Vite 7 + Dexie 4) for
capturing suppliers, dealers, agents, and factories met at trade fairs. No backend;
data lives in IndexedDB. Files and QR codes are the sync protocol.

Source of truth: **`plan.md`** (scope, phases), **`architecture.md`** (stack, data
model, design, security), **`deep-improvements.md`** (improvement plan). Phases 0–7 and
milestones M1–M3 (deep-improvements.md §3) are implemented. Improvement work is tracked
by item ID (A1–G2, N1–N6); commits tag the ID, e.g. `feat(export): A5 …` (the doc's ✅
markers can lag the code).

## Commands

- `npm run dev` | `build` | `preview`
- `npm run lint` | `typecheck` | `test` | `test:e2e` | `format` | `format:check`
- Gate before every commit: **`lint` → `typecheck` → `test`**. Run `test:e2e` when
  touching UI, routing, storage, the SW, or import/export.
- Single unit: `npx vitest run tests/unit/<file>`; single e2e:
  `npx playwright test tests/e2e/<file>`.
- `test:e2e` = `npm run build && playwright test` (not bare `playwright test`).
  `playwright.config.ts` serves `vite preview` on port 4173 and only reuses an
  existing server outside `CI`.

## Non-negotiables

- Offline-first: **no backend, cloud, accounts, telemetry, or runtime external
  requests**. User data in IndexedDB, never in the SW cache.
- Production deps **≤ 6** (currently 5: `react`, `react-dom`, `dexie`,
  `dexie-react-hooks`, `qrcode`). No router lib, no state lib, no Tailwind — use
  native APIs (camera input, Canvas, `CompressionStream`) and Dexie `useLiveQuery`.
  `@axe-core/playwright` is dev-only a11y tooling, not a production dep.
- **Never** `dangerouslySetInnerHTML` (ESLint bans it plus `innerHTML`/`eval`). Render
  every URL field through `src/lib/safeHref.ts`; build `mailto:`/`tel:`/`wa.me` schemes
  before calling it.
- Validate all imported payloads (`src/lib/validate.ts`). CSV export guards formula
  injection (`= + - @`, tab, CR/LF) — exempts phone-shaped values — see `src/lib/csv.ts`.
- `src/styles/tokens.css` is the visual source of truth. No colors outside the tokens.
  New tokens go in **all five** theme blocks (`:root`, dark, gruvbox, oled, sepia) in
  the same commit.

## Architecture map (non-obvious)

- Entry: `src/main.tsx` → `ErrorBoundary` → `src/App.tsx`. `initTheme()` runs
  synchronously before React render, reading `localStorage["opc.theme"]`.
- Routing: hand-rolled hash router in `src/lib/useHashRoute.ts`. Routes:
  `#/vendors`, `#/vendors/new`, `#/vendors/quick`, `#/vendors/:id` (detail),
  `#/vendors/:id/edit`, `#/vendors/:id/share`, `#/import`, `#/share`, `#/people`,
  `#/trip`, `#/me`. Vendor-list filter state lives in hash query params:
  `q, status, country, type, minRating, fair, tag, sort`. Settings, Trip, Import and
  VendorShare are `React.lazy` chunks behind one `<Suspense>` in `App.tsx`; `qrcode` is a
  dynamic import in `renderQrToCanvas`. The Workbox glob precaches every chunk, so they
  work offline.
- `src/db/schema.ts` — Dexie v3 (SCHEMA_VERSION=3, asserted == db.verno in tests).
  8 tables: `vendors`, `contacts`, `products`, `notes`, `certs`, `attachments`,
  `settings`, `drafts`. A new store/field needs a version bump + `upgrade()`.
- `src/data/` — repositories own all writes. `saveVendorBundle` (`bundle.ts`) is the
  atomic capture transaction with **diff-based child saves** (stable IDs; only
  `bulkDelete`s removed children). `deleteVendor` hard-cascade deletes; `softDeleteVendor`
  sets `deletedAt` and leaves children in place. `drafts.ts` persists form state for
  crash recovery.
- `src/lib/exportImport.ts` — sync protocol. **Two export formats**: v1 (JSON+gzip) and
  v2 (NDJSON streamed through `CompressionStream`, default). Import auto-detects.
  Default merge policy **`newest-wins`** (per-row `updatedAt`); `imported-wins` /
  `existing-wins` are explicit overrides. Tombstones are exported and matched by id.
- `src/lib/share.ts` — single-vendor QR codec. QR encodes
  `https://<origin>/#/import?c=OCV2.<base64url(deflate-raw)>`; the paste code is
  `OCV1.<base64url(json)>`. Decode handles both prefixes. QR scanning uses the native
  `BarcodeDetector` (Chrome Android only).
- `src/lib/cardParser.ts` — regex business-card text parser. `src/lib/vcard.ts` — .vcf
  generator for contacts (RFC 6350-escaped). `src/lib/followUp.ts` — prefilled
  WhatsApp/mailto follow-up links (N7). `src/lib/csv.ts` — vendor CSV and one-row-per-product
  CSV (`buildProductCsv`, D6). `src/features/trip/compare.ts` — tag-based product
  comparison on the Trip screen (N3).
- Downloads go through `downloadBlob` in `src/lib/share.ts`, which revokes the object URL
  after a timeout (Safari). Do not hand-roll `<a download>` + an immediate revoke.
- Decode caps: NDJSON import enforces `LIMITS.maxTotalAttachmentBytes` per line; QR inflate is
  capped at 64 KB (`MAX_INFLATED_BYTES`), and decoded cards are length-checked against `LIMITS`.
- Money: `src/lib/currency.ts`. Rates are **units of C per 1 base**, so
  `convertToBase(amount, C, base) = amount / rate`. Converted values are computed at
  render, never persisted.
- Landed cost (N2, `src/lib/landedCost.ts`): product packing fields (`incoterm` EXW/FOB/CIF,
  `pcsPerCarton`, `cartonLengthCm/WidthCm/HeightCm`, `cartonGrossKg`) plus
  `Settings.landed` (`freightMode` `percent`|`perCbm`, `freight`, `dutyPercent`, `vatPercent`).
  Formula, all in base currency: `unit = convertToBase(price)`; freight = `unit × freight%`
  or `(cartonCbm / pcsPerCarton) × perCbmRate`, and **0 for CIF**; `customs = unit + freight`;
  `duty = customs × duty%`; `VAT = (customs + duty) × VAT%`; landed = sum. Null when the price,
  rate, settings or (per-CBM) packing is missing. **EXW is treated like FOB** (no inland or
  port fees); a `ponytail:` comment marks it. The landed column/sort on Trip appears only when
  `Settings.landed` is set. Settings stay device-local: import copies them only with
  `importSettings`.
- **No schema bump for N2.** The new fields are optional and unindexed, so Dexie needs no
  migration, older exports import unchanged, and phones on an older app version still
  accept new exports. This deliberately departs from the "new field → version bump" rule
  above; bump only when an index or a data migration is needed.
- Images: `src/lib/images.ts` resizes at pick time (EXIF-aware, max 1600px JPEG q0.75
  + 256px thumb). `bytes` is the resized blob size.
- `__APP_VERSION__` injected by Vite `define` (declared in `src/vite-env.d.ts`).
- CSP is injected into production HTML only, by a `vite.config.ts` plugin (a static
  meta CSP breaks Vite dev HMR). `vercel.json` adds the headers a meta CSP cannot:
  `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`,
  `Permissions-Policy` (camera self-only for the QR scanner). HSTS is added by Vercel itself;
  see `docs/research/permissions-policy.md`.
- Fonts: `public/fonts/*.woff2` are Fontsource latin subsets. Check a new font file starts
  with `wOF2`. The E1 originals were HTML error pages that nobody noticed.

## Testing quirks

- Vitest + jsdom by default on the **`vmThreads` pool** (one jsdom per worker, still
  isolated per file). Do not switch to `isolate: false`, because the Dexie singleton and
  fake-indexeddb would leak between files. `tests/unit/setup.ts` wires `fake-indexeddb`
  and a `crypto.randomUUID` fallback.
- Data/lib tests that need gzip/Blob use a per-file **`// @vitest-environment node`**
  (jsdom lacks `CompressionStream`).
- Isolate the DB with `resetDb()` (`tests/unit/helpers/db.ts`) in `beforeEach`/
  `afterEach`; fixtures in `tests/unit/helpers/fixtures.ts`.
- E2E drives real IndexedDB and offline via `context.setOffline(true)`. The seed helper
  (`tests/e2e/helpers/seed.ts`) writes raw IndexedDB — specs must `reload()` after
  seeding before asserting.
- E2E selectors are coupled to accessible labels/testids, so renaming one breaks specs.
  Examples: the photo picker is two inputs, `vendor-photo-input-camera` (`capture`,
  single) and `vendor-photo-input-gallery` (multiple); list filters are hidden behind a
  `Filters` toggle button (the panel stays mounted with `hidden`). Below 1024px, "Quick add"
  is a floating `.fab` and the top-bar copy is hidden. E2E runs at desktop width, so it sees
  the top-bar one. The seed's `v-cn` vendor is tagged `led-panel` and has a priced
  product, so the Trip compare table renders for axe.
- `tests/e2e/a11y.spec.ts` runs axe (WCAG 2.2 AA tags) across all 5 themes.
- `.prettierignore` excludes `*.md`, `.opencode/`, `scripts/`, `public/icons`, so
  `npm run format` never touches `plan.md`/`architecture.md`.

## Deploy

- CI (`.github/workflows/deploy.yml`) on push to `master`: `verify` (lint → typecheck →
  test) → `test-e2e` → `deploy`. The deploy job needs `VERCEL_TOKEN`, `VERCEL_ORG_ID`,
  `VERCEL_PROJECT_ID` secrets; if the token expires the job fails.
- Production: `https://www.skhazaen.com` (aliases `opc-vendors-cards.vercel.app`,
  `opc-vendors-cards-sama-khazaen.vercel.app`).
- Vercel blocks a deployment whose commit author has no seat on the team. That is why
  the workflow `rm -rf .git` before `vercel deploy`; a manual `vercel deploy` from the
  repo root lands as **Blocked**. Deploy a clean copy with no `.git` instead.
- `.vercelignore` excludes `node_modules`, `dist`, `dev-dist`, `coverage`,
  `test-results`, `playwright-report`, `*.log`.

## Environment gotchas

- Vite 7 requires Node `^20.19` or `>=22.12` (CI uses Node 22).
- npm 11 blocks install scripts by default; `package.json` pins
  `allowScripts: { "esbuild@0.28.2": true }`. If a fresh install breaks esbuild:
  `npm install-scripts approve esbuild && npm rebuild esbuild`.
- SW uses `registerType: 'prompt'` (not autoUpdate). The update toast
  (`src/components/UpdateToast.tsx`, via `virtual:pwa-register/react`) is suppressed on
  vendor form routes (`#/vendors/new`, `*/edit`).

## Agent harness

- `.opencode/agent/` holds 17 project-scoped ECC subagents (invoke via Task or `@name`).
  Regenerate with `python3 scripts/install-ecc-agents.py`; `scripts/` is not
  Prettier-formatted.
## Open items (2026-10-12)

- **Real-device testing before the fair:** use the checklist in `docs/field-notes.md`
  (Android, iPhone, Windows laptop, 100-vendor/500-photo round-trip, QR scan).
- Post-fair backlog: A6 (import limits, needs device data), C5 (desktop two-pane), E2 leftovers
  (manifest screenshots, `share_target`), N8–N14.
- About 24 files in `src` already fail `prettier --check`. Leave existing formatting alone in
  feature commits; reformat in a separate commit if wanted.
