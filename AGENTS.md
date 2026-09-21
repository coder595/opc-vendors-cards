# AGENTS.md

## What this repo is

**OPC Vendors Cards** — a local-first, offline PWA (React 19 + Vite 7 + Dexie 4) for
capturing suppliers, dealers, agents, and factories met at trade fairs. No backend;
data lives in IndexedDB.

Source of truth: **`plan.md`** (scope, phases) and **`architecture.md`** (stack, data
model, design, security). Read both before coding. Phases 0–7 are built; People/Trip
screens and an error boundary were added after Phase 7.

## Commands

- `npm run dev` | `build` | `preview`
- `npm run lint` | `typecheck` | `test` | `test:e2e` | `format` | `format:check`
- Gate before every commit: **`lint` → `typecheck` → `test`**. Run `test:e2e` when
  touching UI, routing, storage, or the SW.
- Single unit: `npx vitest run tests/unit/<file>`; single e2e:
  `npx playwright test tests/e2e/<file>`.
- `test:e2e` = `npm run build && playwright test` (not bare `playwright test`).
  The webserver config in `playwright.config.ts` serves `vite preview` on port 4173.
- CI: `.github/workflows/deploy.yml` runs `lint → typecheck → test` on push to
  `master`, then deploys to Vercel. E2E is not run in CI. If the Vercel token expires,
  refresh `VERCEL_TOKEN` as a GitHub secret.

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
  injection (`= + - @`, tab, CR/LF) — see `src/lib/csv.ts`.
- `src/styles/tokens.css` is the visual source of truth. No colors outside the tokens.

## Architecture map (non-obvious)

- Entry: `src/main.tsx` → `ErrorBoundary` → `src/App.tsx`. Theme init (`initTheme`)
  runs synchronously before React render, reading `localStorage["opc.theme"]`.
- Routing: hand-rolled hash router in `src/lib/useHashRoute.ts`. Routes:
  `#/vendors`, `#/vendors/new`, `#/vendors/:id` (detail), `#/vendors/:id/edit`,
  `#/vendors/:id/share`, `#/share`, `#/people`, `#/trip`, `#/me` (settings).
- `src/db/` — Dexie v1 schema. `SCHEMA_VERSION` must equal `db.verno` (asserted in
  tests). A new store/field needs a version bump + migration.
- `src/data/` — repositories own all writes. `saveVendorBundle` (`bundle.ts`) is the
  atomic capture transaction; `deleteVendor` cascades in one transaction.
- `src/lib/exportImport.ts` — file sync protocol (gzip → `.ocv.json.gz`; merge/replace
  in one transaction). `src/lib/share.ts` — single-vendor QR codec + download/Web Share.
- Money: `src/lib/currency.ts`. Rates are **units of C per 1 base**, so
  `convertToBase(amount, C, base) = amount / rate`. Converted values computed at
  render, never persisted.
- Images: `src/lib/images.ts` resizes at pick time (EXIF-aware, max 1600px JPEG q0.75 +
  256px thumb). `bytes` is the resized blob size.
- `__APP_VERSION__` injected by Vite `define` (declared in `src/vite-env.d.ts`).
- CSP injected into production HTML only by a `vite.config.ts` plugin (a static meta
  breaks Vite dev HMR). `vercel.json` adds headers a meta CSP cannot:
  `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`.

## Testing quirks

- Vitest + jsdom by default; `tests/unit/setup.ts` wires `fake-indexeddb` and a
  `crypto.randomUUID` fallback.
- Data/lib tests that need gzip/Blob use a per-file **`// @vitest-environment node`**
  (jsdom lacks `CompressionStream`).
- Isolate the DB with `resetDb()` (`tests/unit/helpers/db.ts`) in `beforeEach`/
  `afterEach`. Fixtures in `tests/unit/helpers/fixtures.ts`.
- E2E fixtures in `tests/e2e/fixtures/`; E2E drives real IndexedDB and offline via
  `context.setOffline(true)`. The seed helper (`tests/e2e/helpers/seed.ts`) writes raw
  IndexedDB — specs must `reload()` after seeding before asserting.
- `tests/e2e/a11y.spec.ts` runs axe (WCAG 2.2 AA tags) across all 5 themes.
- `.prettierignore` excludes `*.md`, `.opencode/`, `scripts/`, `public/icons`.
  `npm run format` will not touch `plan.md`/`architecture.md`.

## Harness

- `.opencode/agent/` — ECC subagents (17) project-scoped. Invoke via Task or `@name`.
  Regenerate with `python3 scripts/install-ecc-agents.py`.
- Skills: `ponytail` (full), `frontend-design` before UI work.

## Working agreement

1. Execute one phase at a time from `plan.md` §8. Stop at exit criteria; do not start
   the next without confirmation.
2. Any agent/skill change to code must be followed by `lint` → `typecheck` → `test`.
3. Do not commit unless asked. Match existing commit style
   (`feat(scope): Phase N …` or scoped like `feat(nav): …`, `ci(deploy): …`).

## Environment gotchas

- Vite 7 requires Node `^20.19` or `>=22.12` (CI uses Node 22).
- npm 11 blocks install scripts by default; `package.json` pins
  `allowScripts: { "esbuild@0.28.2": true }`. If a fresh install breaks esbuild:
  `npm install-scripts approve esbuild && npm rebuild esbuild`.