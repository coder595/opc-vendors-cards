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
  existing server outside `CI`. When several worktrees run e2e at once, use `CI=1 npm run test:e2e`
  so a spec doesn't hit another worktree's server on 4173.
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
  New colour tokens go in **all five** theme blocks (`:root`, dark, gruvbox, oled, sepia) in
  the same commit; size tokens (`--tap`, `--nav-h`) live only in `:root`.
  In the **light** theme `--brand` (#d8321f) is 4.42:1 as small text on `--surface` — fails AA.
  Use the brand as a background, border or icon, not as text on a light surface (e.g. the toast
  "Undo" uses `--ink` with a brand border).
- Buttons: `btn--primary` (one main action per screen), `btn--ghost` (secondary), `btn--danger`
  (destructive trigger, outlined), `btn--danger-solid` (the confirm step in a `<dialog className="dialog">`).
  Hovers use `color-mix` on tokens. Motion uses `--ease-out` and `--dur-1..4`; the seal stamp
  (keyed on status) is the one authored animation. `applyTheme` sets `data-theme-switching` so
  theme changes skip colour transitions; the a11y spec waits for `document.getAnimations()`.
  The global `prefers-reduced-motion: reduce` block zeroes `animation-*` but **not** transitions,
  so gate every new transition or animation on `prefers-reduced-motion: no-preference` yourself.
- Microinteractions (keep them subtle: transform/opacity, ≤ `--dur-2`):
  - Async buttons render their text through `ActionLabel` (`src/components/ActionLabel.tsx`). It stacks
    every label (idle/busy/done) in one grid cell, so the button never changes width. Set
    `aria-busy` while working. `useMutation` returns `status` (`idle`/`busy`/`done`; `done` lasts
    `DONE_MS` = 1.5 s). For those 1.5 s the button's accessible name is the done label (e.g. "Saved ✓").
  - Vibrate only via `haptic('success' | 'error')` in `src/lib/haptics.ts`. It is a no-op on iOS
    and under reduced motion.
  - New repeatable rows in the vendor form fade in via `@starting-style` under
    `.vendor-form[data-live]` (forms.css). `data-live` is set on the first pointer/key event, so
    loading a vendor doesn't animate every row. To animate a new row type, add its class to that
    `:is(…)` list.
  - `PhotoPicker` prefixes its label with "Take " / "Choose ", so pass a lowercase noun
    (`label="product photo"`), not "Add photo".
- Vendor form Save/Cancel live in the sticky `.form-bar` at the **end** of the form, not the
  form head. On phones it sits on the tab bar via `bottom: var(--nav-h)`, and `--nav-h` is also
  the `.nav` min-height, so change both together. A failed save focuses the first visible
  `[aria-invalid]` field, else the error summary. Quick add keeps its own layout.

## Architecture map (non-obvious)

- Entry: `src/main.tsx` → `ErrorBoundary` → `src/App.tsx`. `initTheme()` runs
  synchronously before React render, reading `localStorage["opc.theme"]`; once the IndexedDB
  settings row loads, `App.tsx` re-applies **its** theme, so writing only localStorage does not
  stick past first paint.
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
- Tags: `src/lib/tags.ts` `tagKey` ignores case, spaces, `-` and `_`. The vendor form offers every
  known tag (collected from `db.vendors.toArray()`, which deliberately includes soft-deleted
  vendors) as one-click chips, and `resolveTag` stores an existing spelling instead of a
  near-duplicate. Existing duplicates are not merged (no rename/merge tool).
- Incoterm `<select>` labels come from `INCOTERM_NAMES` (`landedCost.ts`), e.g. "FOB (Free On
  Board)"; the stored value stays the bare code.
- Downloads go through `downloadBlob` in `src/lib/share.ts`, which revokes the object URL
  after a timeout (Safari). Do not hand-roll `<a download>` + an immediate revoke. The photo
  viewer's Share button sends the photo through `navigator.share({ files })` and falls back to
  `downloadBlob`. The vendor QR card never carries photos.
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
  Examples: the photo picker is two inputs, `vendor-photo-input-camera` (`capture`, single)
  and `vendor-photo-input-gallery` (multiple); the list filters sit behind a `Filters` toggle
  whose panel stays mounted (animates open/closed with `grid-template-rows`, `inert` while
  collapsed so its controls leave the tab order); below 1024px "Quick add" is a floating `.fab`
  and the top-bar copy is hidden (E2E runs at desktop width, so it sees the top bar). The bottom
  nav uses `grid-auto-flow: column` and fits any number of tabs (5 now). The seed's `v-cn` vendor
  is tagged `led-panel` and has a priced product, so the Trip compare table renders for axe.
- `tests/e2e/a11y.spec.ts` runs axe (WCAG 2.2 AA tags) across all 5 themes. To check a theme
  in an ad-hoc spec, copy its `setTheme` (sets `data-theme` after load); setting
  `localStorage["opc.theme"]` and reloading gets overwritten by the settings row (see Entry).
  The file is heavy (the vendor-detail tab sweep alone does 30 scans) and sets
  `test.describe.configure({ timeout: 60_000 })`; ~28s runs under parallel load are expected.
- **iOS Safari IndexedDB** ("UnknownError: Unable to open cursor"): never open a unique key
  cursor on a multi-entry index (`orderBy('tags').uniqueKeys()` crashed Add vendor on iPhone);
  read rows and dedupe in JS. Separately, iOS can drop the IDB connection after backgrounding;
  `ErrorBoundary` auto-reloads once on that error (10 s guard in sessionStorage
  `opc.idbReloadAt`). E2E runs Chromium only, and Playwright WebKit cannot launch on the dev
  machine (missing system libs), so iOS-only bugs need the real device.
- jsdom has no `scrollIntoView`; call it as `el.scrollIntoView?.(…)` in components that unit tests render.
- jsdom's `<dialog>` lacks a working `showModal`. Stub it to `setAttribute('open', '')`, otherwise
  `getByRole` treats the dialog's buttons as hidden (see `tests/unit/photoViewer.test.tsx`).
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
  `VERCEL_PROJECT_ID` secrets. An expired token fails as "Could not retrieve Project Settings";
  the user sets a new one with `gh secret set VERCEL_TOKEN` (pasting at the prompt, never in
  chat), then `gh run rerun <id> --failed`.
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
- Manual update: Me tab (Settings screen) → "Update app" (`src/lib/appUpdate.ts`) calls `registration.update()`,
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

## Open items (2026-10-24)

- All pre-fair code work is merged and deployed. The FX, order-totals, Rates, update, tag,
  form-bar, UI-polish, accessibility/contrast, photo-share and microinteraction work has no
  plan-doc item IDs.
- Known small gaps: removing a form row has no exit animation. The tag remove "×" is 26px, below
  `--tap`. The "Draft saved" indicator appears on edit before any change, because the form
  writes its draft right after it loads.
- **Real-device testing before the fair:** use the checklist in `docs/field-notes.md`
  (Android, iPhone, Windows laptop, 100-vendor/500-photo round-trip, QR scan, and one
  landed-cost quote checked by hand). Also paste the rates key on each device (it is
  device-local), check one OMR→CNY fetch, and press Me → Update app once on the installed app.
- Sample data: `docs/sample-data-prompt.md` describes the Canton Fair 140th demo file (20 fictional
  vendors, `sample` tag; the doc is untracked, local only). Import it at `opc-vendors-cards.vercel.app`, never `www.skhazaen.com`
  (real data; each origin has its own IndexedDB).
- Post-fair backlog: A6 (import limits, needs device data), C5 (desktop two-pane), E2 leftovers
  (manifest screenshots, `share_target`), N8–N14. E3 is won't-fix.
- ~22 `src` files (plus a css file and a few tests) already fail `prettier --check` — pre-existing
  drift, not from your change. Leave unrelated formatting alone in feature commits; if you want it
  clean, reformat in a separate commit.
