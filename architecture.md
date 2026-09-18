# OPC Vendors Cards — Architecture

Companion to `plan.md`. Describes the system, data model, storage, key flows,
design system, security, testing, and build/deploy.

---

## 1. Architectural principles

1. **Local-first.** The device is the source of truth. No server exists.
2. **Offline by default.** Every feature works with the network off; the network
   is only ever used to *load the app shell*.
3. **Fewest moving parts.** No state library, no router library, no backend, no
   ORM beyond IndexedDB access. Production dependencies ≤ 6.
4. **Files are the sync protocol.** Export/import is the interoperability layer —
   any two installs of the app can exchange data.
5. **Schema is versioned and forward-compatible.** Exports carry a schema version
   and every migration is tested.

## 2. System context

```
┌────────────────────────── Device (any OS) ──────────────────────────┐
│                                                                     │
│   Browser / installed PWA                                          │
│   ┌───────────────┐   ┌───────────────┐   ┌─────────────────────┐  │
│   │  React UI     │──▶│  Repositories │──▶│  IndexedDB (Dexie)  │  │
│   │  (views)      │◀──│  (domain)     │◀──│  vendors, photos... │  │
│   └───────┬───────┘   └───────┬───────┘   └─────────────────────┘  │
│           │                   │                                     │
│           │           ┌───────▼────────┐   ┌───────────────────┐  │
│           │           │ Export/Import  │──▶│ .ocv.json.gz file │  │
│           │           │  (gzip + JSON) │◀──│ or QR payload     │  │
│           │           └────────────────┘   └───────────────────┘  │
│   ┌───────▼───────┐                                                │
│   │ Service Worker│  caches app shell for offline use              │
│   └───────────────┘                                                │
└─────────────────────────────────────────────────────────────────────┘
                 ▲                                   ▲
                 │ install (PWA)                     │ file / QR
        Linux / Windows / Android / iOS        colleague's device
```

There is **no backend, no API, no cloud**. Sharing happens out-of-band (WhatsApp,
email, AirDrop, USB) using exported files or QR codes.

## 3. Tech stack

| Layer | Choice | Version target |
|---|---|---|
| Language | TypeScript (strict) | 5.x |
| UI | React | 19 |
| Build/dev | Vite | 7.x |
| PWA | vite-plugin-pwa (Workbox) | latest |
| Persistence | Dexie | 4.x |
| QR | `qrcode` | latest |
| Unit tests | Vitest + @testing-library/react | latest |
| E2E | Playwright | latest |
| Lint/format | ESLint + Prettier | latest |

**Production dependencies (budget ≤ 6):** `react`, `react-dom`, `dexie`,
`dexie-react-hooks`, `qrcode`. That is 5. Everything else is dev-only or native
platform APIs (Canvas, CompressionStream, File APIs, Web Share).

### Rejected alternatives (and why)
- **Redux/Zustand** — Dexie `useLiveQuery` + local `useState` cover all state.
- **React Router** — 6 screens; a ~40-line hash hook is enough.
- **Tailwind** — design tokens in plain CSS are the design system; avoids a build
  dependency and class soup.
- **idb** — Dexie's query + live-query ergonomics justify one small dependency.
- **A zip library** — native `CompressionStream` gzips the export instead.
- **OCR library** — deferred to v2 behind a flag (Tesseract is ~2 MB+).

## 4. Repository structure

```
opc-vendors-cards/
├─ public/
│  ├─ icons/                     # PWA icons (192, 512, maskable)
│  └─ manifest.webmanifest
├─ src/
│  ├─ main.tsx
│  ├─ App.tsx                    # shell: tab bar / side rail + view switch
│  ├─ db/
│  │  ├─ schema.ts               # Dexie database + versioned stores
│  │  ├─ models.ts               # TypeScript interfaces + enums
│  │  └─ migrations.ts           # Dexie version upgrades
│  ├─ data/
│  │  ├─ vendors.ts              # repository functions
│  │  ├─ contacts.ts
│  │  ├─ products.ts
│  │  ├─ notes.ts
│  │  ├─ certs.ts
│  │  ├─ attachments.ts
│  │  └─ settings.ts
│  ├─ lib/
│  │  ├─ currency.ts             # conversion + formatting
│  │  ├─ exportImport.ts         # serialize, gzip, validate, merge
│  │  ├─ images.ts               # canvas resize + thumbnail
│  │  ├─ share.ts                # QR + Web Share + file download
│  │  ├─ csv.ts                  # CSV export (with injection guard)
│  │  ├─ validate.ts             # import payload validation
│  │  └─ useHashRoute.ts         # tiny hash router
│  ├─ features/
│  │  ├─ vendors/                # list, detail, form
│  │  ├─ contacts/
│  │  ├─ products/
│  │  ├─ notes/
│  │  ├─ certs/
│  │  ├─ sharing/                # export/import UI, QR card
│  │  └─ settings/               # base currency, rates, storage
│  ├─ components/                # shared UI primitives
│  │  ├─ Button.tsx  Field.tsx  Sheet.tsx  StatusSeal.tsx
│  │  ├─ PhotoPicker.tsx  EmptyState.tsx  Confirm.tsx
│  │  └─ Tabs.tsx  Rating.tsx  Chip.tsx
│  └─ styles/
│     ├─ tokens.css              # design tokens (source of truth)
│     ├─ base.css                # reset, typography, layout
│     └─ print.css               # share card / trip summary
├─ tests/
│  ├─ unit/                      # vitest: export/import, currency, images
│  └─ e2e/                       # playwright: install, offline, capture, share
├─ .opencode/
│  └─ agent/                     # ECC subagents (planner, architect, reviewers…)
│                                #   auto-discovered by opencode; project-scoped
├─ scripts/
│  └─ install-ecc-agents.py      # regenerate .opencode/agent from ECC
├─ index.html
├─ vite.config.ts
├─ tsconfig.json
├─ package.json
├─ plan.md
└─ architecture.md
```

## 5. Data model

All records use string UUIDs (`crypto.randomUUID()`), `createdAt`/`updatedAt`
epoch ms, and an optional `deletedAt` for soft delete.

```ts
type VendorType = 'supplier' | 'dealer' | 'agent' | 'factory' | 'trader' | 'other';
type PipelineStatus =
  | 'lead' | 'contacted' | 'met' | 'quoted'
  | 'sample' | 'negotiating' | 'ordered' | 'archived';

interface Vendor {
  id: string;
  name: string;                 // indexed
  type: VendorType;
  status: PipelineStatus;       // indexed
  rating: 1 | 2 | 3 | 4 | 5;
  country?: string;             // indexed
  city?: string;
  address?: string;
  website?: string;
  description?: string;
  socials: SocialLink[];        // { platform, handleOrUrl }
  tags: string[];               // multiEntry index
  fair: FairRef;                // { edition, hall, booth, note }
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

interface SocialLink { platform: 'wechat'|'whatsapp'|'alibaba'|'linkedin'|'instagram'|'facebook'|'other'; value: string; }

interface FairRef { edition?: string; hall?: string; booth?: string; note?: string; }

interface Contact {             // representative
  id: string;
  vendorId: string;             // indexed
  name: string;
  position?: string;
  phone?: string;
  email?: string;
  wechat?: string;
  whatsapp?: string;
  isPrimary: boolean;
  cardAttachmentId?: string;    // business-card photo
}

interface PriceTier { minQty: number; unitPrice: number; }

interface Product {
  id: string;
  vendorId: string;             // indexed
  name: string;
  description?: string;
  unit?: string;
  currency: string;             // ISO 4217
  price?: number;
  moq?: number;
  tiers: PriceTier[];
  leadTimeDays?: number;
  paymentTerms?: string;
  photoAttachmentIds: string[];
  createdAt: number;
}

interface Note {
  id: string;
  vendorId: string;             // indexed
  text: string;
  isTask: boolean;
  done: boolean;
  dueDate?: number;
  createdAt: number;
}

interface Certification {
  id: string;
  vendorId: string;             // indexed
  name: string;
  number?: string;
  issuer?: string;
  expiry?: number;
}

interface Attachment {
  id: string;
  vendorId: string;             // indexed
  kind: 'business_card' | 'product' | 'booth' | 'document' | 'other';
  blob: Blob;                   // full-size, resized
  thumb: Blob;                  // small preview
  width: number;
  height: number;
  bytes: number;
  createdAt: number;
}

interface Settings {
  id: 'app';                    // singleton
  baseCurrency: string;         // default 'USD'
  rates: Record<string, number>; // currency -> units per 1 base
  travellerName?: string;
  defaultFair?: FairRef;
  theme: 'light' | 'dark' | 'system';
}
```

### Indexes (Dexie)
- `vendors`: `id, name, status, country, *tags, updatedAt`
- `contacts`: `id, vendorId`
- `products`: `id, vendorId, name`
- `notes`: `id, vendorId, done, dueDate`
- `certs`: `id, vendorId, expiry`
- `attachments`: `id, vendorId, kind`
- `settings`: `id`

Relations are **by `vendorId`**, resolved in repositories. Dexie cannot do joins;
`useLiveQuery` composes them per view. Deleting a vendor cascades to its children
and attachments in a single transaction.

## 6. Key flows

### 6.1 Capture (phone, offline)
1. `+` opens the vendor form. Fields are progressive (name first; details later).
2. "Add person" / "Add product" open sub-forms; multiple allowed.
3. Photo picker uses `<input capture="environment">`; `lib/images.ts` draws to a
   canvas at max 1600px / JPEG q0.75 and generates a 256px thumbnail.
4. Save writes vendor + children + attachment blobs in one Dexie transaction.
5. No network call is ever made.

### 6.2 Browse
- `useLiveQuery` on vendors; filter/sort done in memory for < 1000 rows
  (`ponytail:` linear filter is fine at this scale; move to indexed queries if the
  dataset passes ~5,000 rows).
- Search matches name, rep names, product names, tags (case/diacritic-folded).
- Status **seal** component renders the pipeline state as a stamp.

### 6.3 Export
1. Gather all stores into a payload `{ schemaVersion, exportedAt, app, data }`.
2. Serialize to JSON, `new CompressionStream('gzip')` → `Blob`.
3. Save via File System Access API when available, else `<a download>`.
4. Filename: `opc-vendors-YYYY-MM-DD.ocv.json.gz`.

Attachments are inlined as base64 inside the JSON before gzip. This trades a
larger file for a single self-contained artifact — the right call for WhatsApp
sharing. (`ponytail:` base64 inflates ~33% pre-gzip; revisit with a zip container
only if export size becomes a real problem.)

### 6.4 Import
1. User picks a file; detect gzip by magic bytes, decompress.
2. **Validate** against `schemaVersion` and shape (`lib/validate.ts`): reject
   unknown top-level shape, cap file size (e.g. 250 MB), cap record counts.
3. Show a **preview**: N vendors, M products, X photos, conflicts.
4. User chooses **Merge** or **Replace**.
   - Merge: dedupe key = normalized `name` + normalized `website` (or same id).
     Existing wins by default; user may choose "keep imported".
   - Replace: wipe stores, then insert.
5. Run inside a transaction so a failure leaves the DB unchanged.

### 6.5 Share a single vendor (QR)
1. Build a compact payload for one vendor (no attachments, or one small thumb).
2. Encode as QR with `qrcode`; render to canvas.
3. Also offer **Web Share API** (`navigator.share` with the file) and a print
   stylesheet for a paper share card.

## 7. Design system

Grounded in the subject (trade, sourcing, spec sheets, inspection stamps) and
deliberately avoiding the common AI defaults (cream+serif, dark+acid accent,
identical rounded-card grids, ALL-CAPS eyebrows, `A · B · C` meta strings).

### 7.1 Tokens (`src/styles/tokens.css`)

```css
:root {
  /* Base */
  --paper:        #FFFFFF;
  --surface:      #F5F6F8;
  --surface-2:    #ECEEF1;
  --ink:          #17171A;   /* neutral near-black, not warm-tinted */
  --ink-2:        #3C4149;
  --muted:        #6B7280;
  --line:         #D9DCE1;

  /* Brand — Canton vermilion */
  --brand:        #D8321F;
  --brand-ink:    #FFFFFF;
  --brand-soft:   #FBE7E3;

  /* Status */
  --jade:         #0E7C66;   /* verified / ordered */
  --amber:        #B7791F;   /* quoted / pending */
  --slate:        #5B6470;   /* lead / archived */

  /* Type */
  --font-display: "Archivo", "Noto Sans SC", system-ui, sans-serif;
  --font-body:    "IBM Plex Sans", "Noto Sans SC", system-ui, sans-serif;
  --font-mono:    "IBM Plex Mono", ui-monospace, monospace;

  /* Scale (1.25 minor third) */
  --fs-xs: 0.75rem; --fs-sm: 0.875rem; --fs-base: 1rem;
  --fs-lg: 1.25rem; --fs-xl: 1.563rem; --fs-2xl: 1.953rem; --fs-3xl: 2.441rem;

  /* Space (4px base) */
  --sp-1: 4px;  --sp-2: 8px;  --sp-3: 12px; --sp-4: 16px;
  --sp-5: 24px; --sp-6: 32px; --sp-7: 48px; --sp-8: 64px;

  /* Shape — restrained, intentional radius */
  --r-sm: 4px; --r-md: 8px; --r-lg: 14px; --r-pill: 999px;
  --shadow-1: 0 1px 2px rgba(17,17,26,.06);
  --shadow-2: 0 6px 20px rgba(17,17,26,.10);

  --tap: 44px;   /* minimum touch target */
}
```

### 7.2 Typography rules
- Display/headings in **Archivo** (600–700), tight tracking.
- Body in **IBM Plex Sans** (400/500), line length < 80ch.
- Prices, MOQs, booth numbers, cert numbers, currencies in **IBM Plex Mono** —
  because they are data, not prose.
- Sentence case everywhere. No ALL-CAPS eyebrow labels. No `A · B · C` meta rows.

### 7.3 The one bold device — the Status Seal
A circular, slightly rotated stamp rendered with CSS/SVG showing the pipeline
status and rating. It is the memorable element; everything around it stays quiet.
It encodes real information (status), not decoration. Used on list rows, detail
headers, and the printed share card.

### 7.4 Layout
Mobile (≤ 640px) — bottom tab bar, single column:

```
┌─────────────────────────────┐
│  Vendors            [ + ]   │  app bar + primary action
│  [search.................]  │
│  ┌───────────────────────┐  │
│  │ ● ACME Tools     (seal)│  │  manifest row: name, type,
│  │   Factory · ¥ · ★★★★  │  │  mono data, seal
│  └───────────────────────┘  │
│  ...                        │
├─────────────────────────────┤
│ Vendors  People  Trip  Me   │  tab bar
└─────────────────────────────┘
```

Desktop (≥ 1024px) — left rail + two-pane list/detail:

```
┌──────┬───────────────┬────────────────────────────┐
│ rail │  vendor list  │  spec-sheet detail         │
│ ○ ○  │  (manifest)   │  ┌──────┐  fields + tabs   │
│ ○    │               │  │ seal │  People/Products  │
│      │               │  └──────┘  Notes/Certs/Files │
└──────┴───────────────┴────────────────────────────┘
```

Vendor detail is a **spec sheet**: labeled rows, tabular data, photo strip —
not a stack of identical rounded cards.

### 7.5 Motion
One orchestrated page-load reveal per screen; state changes animate only to show
what changed (seal stamping, list reorder). `prefers-reduced-motion` respected.
No hover-transition-on-every-card, no scattered fade-slide-ups.

## 8. PWA & offline

- `vite-plugin-pwa` `generateSW` with `registerType: 'autoUpdate'`.
- Precache the app shell (HTML/JS/CSS/fonts/icons); **never** cache user data
  (it lives in IndexedDB, not the network).
- `manifest.webmanifest`: name, short_name, `display: standalone`,
  `theme_color: #D8321F`, `background_color: #FFFFFF`, 192/512 + maskable icons.
- Request `navigator.storage.persist()` on first save; show storage estimate in
  Settings so the user knows when to export.
- No `fetch` to any origin in app code. Runtime caching is unnecessary; the only
  network activity is the SW fetching the shell.

## 9. Security & privacy

- **No server, no telemetry, no analytics, no external fonts fetched at runtime**
  (fonts are bundled/self-hosted or system fallbacks).
- **Untrusted import:** validate shape, cap size and counts, reject unknown
  fields, never `eval`. Treat imported strings as plain text.
- **XSS:** React escapes by default; **never** use `dangerouslySetInnerHTML`.
  URLs rendered in `<a>` are scheme-checked (allow `http(s)`, `mailto`, `tel`).
- **CSV injection:** prefix cells starting with `= + - @` with `'` on export.
- **CSP** meta: `default-src 'self'; img-src 'self' blob: data:;
  style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'`.
- **Blob URLs** are revoked after use; no secrets or keys exist in the app.
- Photos are stored only on-device; the user decides what to export.
- **Review gates:** the `security-reviewer` ECC agent reviews all import/export
  code, and gstack `/cso` runs a static audit in Phase 6. `security-review` is
  the relevant ECC skill (`vibesec` is not installed).

## 10. Testing strategy

| Level | Tool | Covers |
|---|---|---|
| Unit | Vitest | export→import round-trip, gzip, schema migration, merge dedupe, currency conversion, image resize dimensions, CSV injection guard, validators |
| Component | RTL | form validation, list filtering, seal rendering, empty/error states |
| E2E | Playwright | install PWA, go offline + reload, create vendor with photos, export then import into a clean context, QR render |
| Manual | Lighthouse + axe | PWA installable, perf budget, WCAG 2.2 AA |

Ponytail rule: every non-trivial logic path (money, parsing, merge) leaves **one
runnable check** behind. No framework ceremony beyond that.

Performance budgets: app shell < 200 KB gzipped JS (excl. fonts), first
interactive < 2 s on a mid-range phone, search < 100 ms at 500 vendors.

## 11. Build & deploy

- `npm run dev` — local dev.
- `npm run build` — static output in `dist/`, deployable to any static host.
- `npm run preview` — serve the production build locally.
- `npm run test` / `npm run test:e2e` / `npm run lint` / `npm run typecheck`.

Deployment is **optional**: the app is installable from any static URL (GitHub
Pages, Netlify, Cloudflare Pages, or a local file server on the same Wi-Fi). No
data is ever sent there — hosting only serves the shell. Document a one-command
deploy in the README.

## 12. Decisions log (ADR-style)

| # | Decision | Rationale |
|---|---|---|
| 1 | Local-first PWA, no backend | Chosen sharing model is file/QR; offline is mandatory at the fair |
| 2 | IndexedDB via Dexie | Photos are blobs; need queries + live updates |
| 3 | No router / no state library | 6 screens; Dexie live queries + `useState` suffice |
| 4 | Native camera, canvas, gzip | Zero dependencies where the platform already does the job |
| 5 | `qrcode` as the only real dep beyond React/Dexie | Single-vendor sharing genuinely needs it |
| 6 | Design tokens in plain CSS | Tokens are the design system; avoids a styling build dependency |
| 7 | Base64 photos inside gzipped JSON | One self-contained shareable file beats a multi-file zip for WhatsApp |
| 8 | Manual FX rates | Offline requirement; no external rate API |
| 9 | Generic, publishable app | Must serve any fair/country and be shareable with others |
| 10 | ECC agents vendored into `.opencode/agent/` | Project-scoped, travel with the repo, no global-config mutation |

## 13. Agent & tooling harness

### 13.1 Installed suites (verified 2026-09-18)

| Suite | Install location | How opencode uses it |
|---|---|---|
| ECC v2.2.1 | `~/.claude/plugins/marketplaces/ecc` (Claude plugin) | 292 skills discovered via `~/.config/opencode/skills/` |
| ECC agents | this repo `.opencode/agent/*.md` | 17 project-scoped opencode subagents |
| gstack | `~/.claude/skills/gstack` | skills auto-discovered (qa, review, ship, cso, design-review, …) |
| Local design skills | `~/.config/opencode/skills/` | `ponytail`, `frontend-design`, `ui-ux-pro-max`, `hallmark`, `impeccable` |

### 13.2 Why agents are vendored project-locally

ECC's 68 agents are Claude Code subagents. opencode discovers agents from
`.opencode/agent/<name>.md`. The 17 agents in `.opencode/agent/` were converted
from ECC's canonical definitions (frontmatter → opencode frontmatter; `model`
omitted so subagents inherit the primary model; `tools` → `permission`). Being in
the repo means they travel with it — clone the repo and the harness comes along.

Re-generate or add more with `scripts/install-ecc-agents.py` (reads
`ecc/agents/<name>.md`, strips frontmatter, emits `description` +
`mode: subagent` + `permission`, appends body). Edit the `AGENTS` map there to
change the set, then run `python3 scripts/install-ecc-agents.py`.

### 13.3 Agent routing for this project

| Work | Agent |
|---|---|
| Plan a phase | `planner`, `architect` |
| Write data/money/parse logic | `tdd-guide` then `typescript-reviewer` |
| Build React UI | `react-reviewer` |
| Fix build/type errors | `react-build-resolver` |
| Find hidden failures | `silent-failure-hunter` |
| Harden imports/security | `security-reviewer` + gstack `/cso` |
| Accessibility | `a11y-architect` |
| Performance | `performance-optimizer` |
| Simplify / remove dead code | `code-simplifier`, `refactor-cleaner` (with `ponytail`) |
| E2E flows | `e2e-runner` + gstack `/qa` |
| Docs | `doc-updater`, `docs-lookup` |

### 13.4 Skill routing (non-agent)

- Design: `frontend-design` → `ui-ux-pro-max`/`ui-ux-pro-max-design-system` → build → `hallmark`/`impeccable` → gstack `/design-review`.
- Plan pressure-test: gstack `/plan-eng-review`, `/plan-design-review`.
- Verification: ECC `verification-loop`, `production-audit`; gstack `/review`, `/ship`.
- Context: ECC `strategic-compact`, `context-budget`; gstack `/context-save`, `/context-restore`.

## 14. First-session checklist

1. Run `/init` in the repo to generate project context (`AGENTS.md`).
2. Read `plan.md` and `architecture.md` fully before writing code.
3. Load `ponytail` (full) and `frontend-design`; note the ECC agents available via `@`.
4. Execute **Phase 0** of `plan.md`; use `planner` for the step breakdown and
   `react-build-resolver` for any build/type errors.
5. Run `npm run lint`, `npm run typecheck`, and `npm run test` before every commit.
