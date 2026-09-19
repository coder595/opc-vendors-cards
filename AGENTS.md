# AGENTS.md

## What this repo is

**OPC Vendors Cards** — a local-first, offline PWA (React 19 + Vite 7 + Dexie 4) for
capturing suppliers, dealers, agents, and factories met at trade fairs. There is no
backend; data lives in IndexedDB.

Source of truth: **`plan.md`** (scope, phases, acceptance criteria) and
**`architecture.md`** (stack, data model, design, security). Read both before coding;
do not invent a different architecture. Phases 0–7 are built (Phase 7 = verify & ship:
README/LICENSE, installability E2E, Lighthouse PWA 100 / perf 98). Next candidates per
`plan.md` §4 "Could have (v2)": native QR scanner/deep-link, FS Access save picker,
encrypted export, deep-linkable filters.

## Commands

- `npm run dev` | `build` | `preview`
- `npm run lint` | `typecheck` | `test` | `test:e2e`
- `npm run format` | `format:check`
- Gate before every commit: **`lint` → `typecheck` → `test`**.
- Single unit test: `npx vitest run tests/unit/<file>`; single e2e:
  `npx playwright test tests/e2e/<file>`.
- `test:e2e` = `npm run build && playwright test`; Playwright serves `vite preview` on
  port 4173 (`playwright.config.ts`). Run `npm run test:e2e` (not bare `playwright test`)
  so the production build is current.
- No CI — the gates above are the only checks.

## Non-negotiables (easy to violate)

- Offline-first: **no backend, cloud, accounts, telemetry, or runtime external
  requests**. User data lives in IndexedDB, never in the service-worker cache.
- Production deps **≤ 6** (currently 5: `react`, `react-dom`, `dexie`,
  `dexie-react-hooks`, `qrcode`). **No router lib, no state lib, no Tailwind** — use
  native APIs (camera input, Canvas, `CompressionStream`) and Dexie `useLiveQuery`.
- **Never** `dangerouslySetInnerHTML` (ESLint bans it plus `innerHTML`/`eval`). Render
  every URL field through `src/lib/safeHref.ts`; build `mailto:`/`tel:`/`wa.me` schemes
  *before* calling it.
- Validate all imported payloads (`src/lib/validate.ts`). CSV export guards formula
  injection (`= + - @`, tab, CR/LF) — see `src/lib/csv.ts`.
- `src/styles/tokens.css` is the visual source of truth (`architecture.md` §7). No
  colors outside the tokens.

## Architecture map (non-obvious)

- Entry `src/main.tsx` → `src/App.tsx`. Routing is a hand-rolled hash router in
  `src/lib/useHashRoute.ts`. Routes: `#/vendors`, `#/vendors/new`, `#/vendors/:id`
  (detail), `#/vendors/:id/edit`, `#/vendors/:id/share`, `#/share`, `#/people`,
  `#/trip`, `#/me` (settings).
- `src/db/` = models + Dexie v1 schema. `SCHEMA_VERSION` (`src/db/schema.ts`) must equal
  `db.verno` (asserted in tests); a new store/field needs a version bump + migration.
- `src/data/` repositories own all writes. `saveVendorBundle` (`src/data/bundle.ts`) is
  the atomic capture transaction (vendor + reps + products + photos); `deleteVendor`
  cascades in one transaction.
- `src/lib/exportImport.ts` is the file sync protocol (`serializeDb`/`buildExportBlob`
  gzip → `.ocv.json.gz`; `parseImport`/`previewImport`/`importData` merge/replace in one
  transaction). `src/lib/share.ts` is the single-vendor QR codec + download/Web Share.
- Money: `src/lib/currency.ts`. Rates are **units of C per 1 base**, so
  `convertToBase(amount, C, base) = amount / rate`. Converted values are computed at
  render and **never persisted**.
- Images: `src/lib/images.ts` resizes at pick time (EXIF-aware, max 1600px JPEG q0.75 +
  256px thumb); stored `bytes` is the resized blob size, not the original file size.
- `__APP_VERSION__` is injected by Vite `define` (declared in `src/vite-env.d.ts`).
- The CSP is injected into the **production build only** by a `vite.config.ts` plugin
  (a static meta breaks Vite dev HMR). Do not add a CSP meta to `index.html`.

## Testing quirks

- Vitest + jsdom by default; `tests/unit/setup.ts` wires `fake-indexeddb` and a
  `crypto.randomUUID` fallback.
- Data/lib tests that need gzip/Blob use a per-file **`// @vitest-environment node`**
  (jsdom lacks `CompressionStream`). Follow this for new data-layer tests.
- Isolate the DB with `resetDb()` (`tests/unit/helpers/db.ts`) in `beforeEach`/
  `afterEach`; fixtures live in `tests/unit/helpers/fixtures.ts`.
- E2E fixtures in `tests/e2e/fixtures/` (a 2000×1200 JPEG exercises the resize path);
  E2E drives real IndexedDB and offline via `context.setOffline(true)`.
- `.prettierignore` excludes `*.md`, `.opencode/`, `scripts/`, `public/icons`.
  `npm run format` will not touch `plan.md`/`architecture.md` — leave them as-is.

## Harness

- 17 ECC subagents in `.opencode/agent/` (invoke with `@name` or Task): `planner`,
  `architect`, `code-reviewer`, `typescript-reviewer`, `react-reviewer`, `tdd-guide`,
  `e2e-runner`, `security-reviewer`, `a11y-architect`, `react-build-resolver`, and more.
  Routing table: `architecture.md` §13.3. Regenerate with
  `python3 scripts/install-ecc-agents.py`.
- Skills: `ponytail` (full) and `frontend-design` before UI work; gstack `/qa`,
  `/review`, `/cso`, `/design-review`, `/plan-eng-review`.

## Working agreement

1. Execute **one phase at a time** from `plan.md` §8. Stop at each phase's exit criteria
   and report; do not start the next phase without user confirmation.
2. Any agent/skill change to code must be followed by `lint` → `typecheck` → `test`.
3. Do not commit unless asked. When asked, match the existing
   `feat(scope): Phase N …` commit style.

## Environment gotchas

- npm 11 blocks install scripts by default; `package.json` pins
  `allowScripts: { "esbuild@0.28.2": true }`. If a fresh install breaks esbuild:
  `npm install-scripts approve esbuild && npm rebuild esbuild`.
