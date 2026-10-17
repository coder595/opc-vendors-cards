# AGENTS.md

## What this repo is

**OPC Vendors Cards** — a local-first, offline PWA (React 19 + Vite 7 + Dexie 4) for
capturing suppliers, dealers, agents, and factories met at trade fairs. No backend;
data lives in IndexedDB. Files and QR codes are the sync protocol.

Source of truth: **`plan.md`** (scope, phases), **`architecture.md`** (stack, data
model, design, security), **`deep-improvements.md`** (improvement plan, round 1) and
**`improvement-plan-r2.md`** (round 2, `R1…` items, done). Phases 0–7, milestones M1–M3
and N1–N7 are implemented. Improvement work is tracked by item ID (A1–G2, N1–N14, R1…);
commits tag the ID, e.g. `feat(export): A5 …`, and done items carry `✅ <commit>` in
deep-improvements.md.

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
- `tsc -b` is incremental (`node_modules/.tmp/*.tsbuildinfo`) and can pass on stale info. Use
  `npx tsc -b --force` to see what a clean CI checkout sees. The test project
  (`tsconfig.test.json`, adds Node types) type-checks any `src` file a test imports.

## Non-negotiables

- Offline-first: **no backend, cloud, accounts, telemetry, or runtime external
  requests**. User data in IndexedDB, never in the SW cache. **One exception:** live FX
  rates from `openexchangerates.org` (see Money), only when the user has entered an API key.
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
- Buttons: `btn--primary` (one main action per screen), `btn--ghost` (secondary), `btn--danger`
  (destructive trigger, outlined), `btn--danger-solid` (the confirm step in a `<dialog className="dialog">`).
  Hovers use `color-mix` on tokens. Motion uses `--ease-out` and `--dur-1..3`; the seal stamp
  (keyed on status) is the one authored animation. `applyTheme` sets `data-theme-switching` so
  theme changes skip colour transitions; the a11y spec waits for `document.getAnimations()`.

## Architecture map (non-obvious)

- Entry: `src/main.tsx` → `ErrorBoundary` → `src/App.tsx`. `initTheme()` runs
  synchronously before React render, reading `localStorage["opc.theme"]`.
- Routing: hand-rolled hash router in `src/lib/useHashRoute.ts`. Routes:
  `#/vendors`, `#/vendors/new`, `#/vendors/quick`, `#/vendors/:id` (detail),
  `#/vendors/:id/edit`, `#/vendors/:id/share`, `#/import`, `#/share`, `#/people`,
  `#/trip`, `#/rates`, `#/me`. Vendor-list filter state lives in hash query params:
  `q, status, country, type, minRating, fair, tag, sort`. Settings, Rates, Trip, Import and
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
- Live rates: `src/lib/fx.ts`. The free plan quotes USD only, so `rebase()` computes
  `usd[C] / usd[base]` (6 significant digits). The API key and last-fetch time live in
  **localStorage** (`opc.fxKey`, `opc.fxFetchedAt`), never in IndexedDB, because exports
  serialize the whole settings row. All of it lives on the **Rates tab**
  (`src/features/rates/RatesScreen.tsx`, not Settings): base currency, rate rows, API key,
  "Fetch live rates" (fills listed codes + OMR + CNY for the user to save with "Save rates"),
  and a converter (default OMR → CNY, pair remembered in localStorage `opc.ratesPair`,
  via `crossRate` in `currency.ts`). With a key set, opening Rates online auto-refreshes and
  saves once per 24 h, which overwrites hand edits for those codes. Settings saves only
  theme, landed cost and profile, never rates.
  CSP `connect-src` allows `https://openexchangerates.org`.
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
- Order totals (`orderTotals` in `landedCost.ts`): quantity is the product's optional
  `orderQty`, else `moq`; the unit price is the highest price break at or below it. The
  Products tab shows the total in the product currency and the base, plus the landed total
  (converted back to the product currency at the saved rate). `orderQty` is optional and
  unindexed like the N2 fields (no schema bump). It travels in exports, the QR card
  (`VendorCardData.products[].orderQty`) and the products CSV (`Order qty` after `MOQ`).
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
  is a floating `.fab` and the top-bar copy is hidden. The bottom nav uses `grid-auto-flow: column`, so it fits
  any number of tabs (5 now). E2E runs at desktop width, so it sees
  the top-bar one. The seed's `v-cn` vendor is tagged `led-panel` and has a priced
  product, so the Trip compare table renders for axe.
- `tests/e2e/a11y.spec.ts` runs axe (WCAG 2.2 AA tags) across all 5 themes.
- To seed realistic data or produce a real export file, run `npx vite` and, in Playwright,
  `page.evaluate(() => import('/src/data/bundle.ts'))` (also `/src/lib/images.ts` `resizePhoto`,
  `/src/lib/exportImport.ts` `exportNdjsonStream`/`parseImport`). Vite dev serves `src` modules,
  so you get the real repositories, photo pipeline and exporter; the built app cannot do this.
- `.prettierignore` excludes `*.md`, `.opencode/`, `scripts/`, `public/icons`, so
  `npm run format` never touches `plan.md`/`architecture.md`.

## Deploy

- Workflow: branch `improve/<slug>` → commit (tag the item ID when there is one) →
  `git merge --no-ff` into `master`. **Pushing `master` deploys to production**, so push only
  when the user asks.
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
- Manual update: Settings → "Update app" (`src/lib/appUpdate.ts`) calls `registration.update()`,
  then posts `SKIP_WAITING` to the new worker and reloads on `controllerchange`; it answers
  "already on the latest version" when nothing is waiting. It only swaps the SW precache;
  IndexedDB and localStorage are untouched. `__APP_BUILT_AT__` (build time, set in
  `vite.config.ts`) is the shown version because `package.json` stays `0.0.0`.
  `tests/e2e/update.spec.ts` runs its own no-cache server over `dist/` to publish a changed
  `sw.js` (Playwright routing cannot intercept the browser's SW update check).
- SW uses `registerType: 'prompt'` (not autoUpdate). The update toast
  (`src/components/UpdateToast.tsx`, via `virtual:pwa-register/react`) is suppressed on
  vendor form routes (`#/vendors/new`, `*/edit`).

## Agent harness

- `.opencode/agent/` holds 17 project-scoped ECC subagents (invoke via Task or `@name`).
  Regenerate with `python3 scripts/install-ecc-agents.py`; `scripts/` is not
  Prettier-formatted.

## Open items (2026-10-17)

- All pre-fair code work is merged and deployed (last: Rates tab, Update app button, `130b1fa`).
  The FX, order-totals, Rates and update work has no plan-doc item IDs.
- **Real-device testing before the fair:** use the checklist in `docs/field-notes.md`
  (Android, iPhone, Windows laptop, 100-vendor/500-photo round-trip, QR scan, and one
  landed-cost quote checked by hand). Also paste the rates key on each device (it is
  device-local), check one OMR→CNY fetch, and press Me → Update app once on the installed app.
- Sample data: `docs/sample-data-prompt.md` describes the Canton Fair 140th demo file (20 fictional
  vendors, `sample` tag). Import it at `opc-vendors-cards.vercel.app`, never `www.skhazaen.com`
  (real data; each origin has its own IndexedDB).
- Post-fair backlog: A6 (import limits, needs device data), C5 (desktop two-pane), E2 leftovers
  (manifest screenshots, `share_target`), N8–N14. E3 is won't-fix.
- About 28 `.ts`/`.tsx` files in `src` already fail `prettier --check`. Leave existing formatting alone in
  feature commits; reformat in a separate commit if wanted.
