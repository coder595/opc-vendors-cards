# OPC Vendors Cards — Project Plan

A local-first, offline-capable web app (PWA) for capturing and managing suppliers,
dealers, agents, factories, and other contacts met at trade fairs such as the
**140th Canton Fair (Guangzhou, Autumn 2026)**.

> Target: usable on a phone at the fair by **mid-October 2026**.

---

## 1. Vision

One person walking a trade fair meets dozens of companies per day. Business cards
get lost, photos are unnamed, and quotes are forgotten by the time they get home.
This app turns a phone into a **field notebook for sourcing**: capture a company
in under 60 seconds, attach the card and product photos, record prices and MOQs,
rate the lead, and later share the whole trip's research with colleagues as a
single file or QR code.

It must work **with no internet**, on **any device** the traveller owns, and must
be **reusable** by anyone travelling to any fair in any country.

## 2. Goals and non-goals

### Goals
- Capture a vendor + representatives + products in **under 60 seconds** on a phone.
- Work **fully offline**; installable on Linux, Windows, Android, iOS.
- Store data **on-device** (IndexedDB) with no account, no server, no telemetry.
- **Share** the whole dataset or a single vendor card with colleagues via file
  export/import and QR code.
- Be **generic and publishable**: any fair, any country, any currency.
- Feel like a deliberate field tool, not a generic SaaS dashboard.

### Non-goals (v1)
- No cloud sync, no user accounts, no real-time collaboration.
- No server-side anything (no backend, no database server).
- No AI/OCR business-card extraction (photos are stored, fields typed manually).
- No automatic exchange-rate fetching (rates are entered manually).
- No order management / accounting — this is a research tool, not an ERP.

## 3. Users

| Persona | Device | Need |
|---|---|---|
| **Traveller (primary)** | Android/iOS phone at the fair | Fast capture, camera, offline, find a booth again |
| **Traveller at desk** | Linux/Windows laptop | Bulk review, edit, price comparison, export |
| **Colleague / friend** | Any | Install the same app, import the shared file, browse the trip |

## 4. Scope — MoSCoW

### Must have (v1)
- Company record: name, type (supplier/dealer/agent/factory/trader/other), website,
  description, country/city, address.
- **Multiple representatives per company**: name, position, phone, email, WeChat,
  WhatsApp, business-card photo, primary flag.
- **Multiple products per company**: name, photo, unit, price + currency, MOQ,
  lead time, payment terms, notes.
- Social links: WeChat, WhatsApp, Alibaba, LinkedIn, Instagram, Facebook, other.
- Fair/booth location: fair edition, hall, booth number, map note.
- Meeting notes + tasks (with done flag and due date).
- Certifications: name, number, issuer, expiry.
- Interest rating (1–5) and follow-up status pipeline.
- Multi-currency prices with **manually entered** exchange rates and a base currency.
- Camera capture via native file input; images resized/compressed before storage.
- Full-text search and filters (type, status, rating, country, fair, tag).
- Export / import the whole database as a file; import modes **merge** and **replace**.
- Single-vendor share via QR code + printable share card.
- Installable PWA with offline app shell and offline writes.
- Works on phone (bottom tab bar) and desktop (side rail).

### Should have (v1.1)
- Tag system and saved filter views.
- CSV export of the vendor list (spreadsheet-friendly).
- Duplicate detection on merge (by normalized name + website).
- Dark mode.
- Print stylesheet for a trip summary.

### Could have (v2)
- Optional read-only static catalog build to host on GitHub Pages / Netlify.
- vCard (.vcf) export of representatives.
- Optional OCR (Tesseract.js) behind a feature flag.
- Simplified Chinese UI labels.
- Encrypted export (passphrase) for sensitive quotes.

### Won't have (v1)
- Cloud accounts, real-time sync, LAN sync, OCR, FX APIs, server backend.

## 5. Technology choices

| Concern | Choice | Why |
|---|---|---|
| UI | **React 19 + TypeScript** | Best ecosystem, best design-skill support |
| Build | **Vite** | Fast, tiny config, first-class PWA plugin |
| Offline shell | **vite-plugin-pwa** (Workbox) | Standard, generated service worker |
| Storage | **IndexedDB via Dexie 4** | Handles blobs (photos) + queries; `useLiveQuery` removes need for a state lib |
| Routing | Minimal hash-based view state | A few screens; avoid a router dependency |
| Styling | **Plain CSS with design tokens** (CSS custom properties) | No Tailwind build tax; tokens are the design system |
| Camera | `<input type="file" accept="image/*" capture="environment">` | Native, zero deps |
| Image resize | Canvas API | Native, zero deps |
| Compression for export | `CompressionStream` / `DecompressionStream` | Native gzip, zero deps |
| QR | `qrcode` (single small lib) | Only dependency that earns its place |
| Unit tests | **Vitest + React Testing Library** | Vite-native |
| E2E / offline | **Playwright** | Verify PWA install + offline behaviour |

**Dependency budget: keep production deps ≤ 6.** Justify every addition in the PR.

## 6. Design direction (summary)

Subject: international sourcing, trade documents, inspection stamps, spec sheets.
The app is a **field instrument**, not a marketing dashboard.

- **Concept:** a digital trade ledger. Dense, glanceable "manifest" rows; the vendor
  detail reads like a **spec sheet**; each vendor carries a status **seal/stamp**
  (like an inspection chop) as its one memorable visual device.
- **Palette:** paper white + neutral ink, **Canton vermilion** primary, jade for
  verified, amber for pending. No cream/serif AI default, no dark control-room default.
- **Type:** Archivo (display/headings) + IBM Plex Sans (body) + IBM Plex Mono
  (prices, booth numbers, codes) — an industrial/technical character that matches
  trade specs. Noto Sans SC fallback for Chinese text.
- **Layout:** mobile-first. Bottom tab bar on phones, left rail on desktop.
  Accent spent only on the primary action and active state.

Full tokens and wireframes: `architecture.md` §7.

## 7. Skill, agent & tooling playbook

### 7.0 Installed & verified (2026-09-18)

| Suite | What is installed | Where it surfaces in opencode |
|---|---|---|
| **ECC v2.2.1** | 292 skills, 68 agents, 94 commands | Skills auto-discovered from `~/.config/opencode/skills/`; a curated 17 agents installed as opencode subagents in this repo at `.opencode/agent/` (see `architecture.md` §14) |
| **gstack** | planning, QA, review, ship, security, design skills | Auto-discovered from `~/.claude/skills/gstack/` |
| **Local skills** | `ponytail`, `frontend-design`, `ui-ux-pro-max`, `hallmark`, `impeccable` | Auto-discovered |

No further installation is required. `vibesec` is **not** installed; use ECC's
`security-review` skill + `security-reviewer` agent and gstack `/cso` instead.

### 7.1 ECC subagents (invoke via Task tool or `@name`)

These are installed in `.opencode/agent/` and are project-scoped and shareable.

| Agent | Use in this project | Phase |
|---|---|---|
| `planner` | Break each phase into verifiable steps; no edits | 0–7 |
| `architect` | Validate data model, storage, and sharing design | 0–1 |
| `typescript-reviewer` | Type safety on every TS/TSX diff | all |
| `react-reviewer` | Hooks, render performance, component a11y | 2–6 |
| `code-reviewer` | General pre-commit review | all |
| `tdd-guide` | Tests-first for export/import, currency, dedupe | 1, 4 |
| `e2e-runner` | Playwright: install, offline reload, capture, share | 7 |
| `react-build-resolver` | Minimal fixes for Vite/TS build errors | 0–7 |
| `security-reviewer` | Import validation, XSS, CSP, CSV injection | 5–6 |
| `a11y-architect` | WCAG 2.2 AA audit and fixes | 6 |
| `performance-optimizer` | Bundle size, IndexedDB, search latency | 6–7 |
| `type-design-analyzer` | Review exported types and schema evolution | 1 |
| `silent-failure-hunter` | Find swallowed errors in async/Dexie paths | 3–6 |
| `code-simplifier`, `refactor-cleaner` | Remove over-engineering (with `ponytail`) | 6 |
| `docs-lookup` | Current React/Vite/Dexie docs via Context7 | all |
| `doc-updater` | README, codemaps, docs | 7 |

### 7.2 ECC skills

| Phase | Skill | Use |
|---|---|---|
| Design tokens & visual identity | `frontend-design` | Ground the palette/type in the subject; avoid AI defaults |
| UI system, components, palettes | `ui-ux-pro-max`, `ui-ux-pro-max-design-system` | Component specs, spacing/type scales |
| Anti-AI-slop audit / redesign | `hallmark`, `impeccable` | Critique and refine the built UI |
| Minimalism / anti-over-engineering | `ponytail` | Enforce the ladder; keep dep count ≤ 6 |
| Accessibility | `accessibility`, `frontend-a11y` | WCAG 2.2 AA: focus, labels, contrast, 44px targets |
| Security | `security-review` | Import validation, XSS, CSV injection, CSP |
| Tests | `tdd-workflow`, `react-testing`, `e2e-testing` | Red-green for data logic; Playwright for flows |
| Verification | `verification-loop`, `production-audit` | Gate each phase; pre-ship audit |
| Architecture | `architecture-decision-records` | Record decisions as they land |
| Context hygiene | `strategic-compact`, `context-budget` | Keep long sessions efficient |
| Onboarding | `codebase-onboarding` | Regenerate context for fresh sessions |

### 7.3 gstack skills

| Phase | Skill | Use |
|---|---|---|
| Planning review | `plan-ceo-review`, `plan-eng-review`, `plan-design-review` | Pressure-test the plan before coding |
| PWA / offline QA | `qa`, `qa-only`, `browse` | Real-browser offline + install verification |
| Design QA | `design-review` | Visual audit of the built UI |
| Security | `cso` | Static security audit |
| Performance | `benchmark`, `canary` | Perf regression + post-deploy watch |
| Shipping | `ship`, `review` | PR, pre-landing review, optional static deploy |
| Debugging | `investigate` | Root-cause bugs (no fix without root cause) |
| Session memory | `context-save`, `context-restore`, `learn` | Persist context across sessions |

> Rule: load skills one phase at a time, not all at once. Every agent/skill
> invocation that changes code must be followed by `npm run lint`,
> `npm run typecheck`, and `npm run test`.

## 8. Phases & milestones

### Phase 0 — Scaffold (0.5 day)
- `npm create vite@latest . -- --template react-ts`
- Add PWA plugin, Dexie, Vitest, Playwright, ESLint/Prettier.
- Create token CSS, base layout shell (tab bar / side rail), app manifest + icons.
- **Agents:** `planner` (step breakdown), `architect` (config sanity), `react-build-resolver` (build errors), `frontend-design` + `ui-ux-pro-max` (tokens).
- **Exit:** app installs, shows an empty state, passes lint + typecheck.

### Phase 1 — Data layer (1 day)
- Define TypeScript models and Dexie schema with versioned migration.
- Repositories for vendors, contacts, products, notes, certs, settings, attachments.
- Export/import module (gzip, schema version, merge + replace, dedupe).
- **Agents:** `tdd-guide` (tests-first), `type-design-analyzer` (schema/types), `typescript-reviewer`.
- **Exit:** unit tests cover export→import round-trip, merge dedupe, and version upgrade.

### Phase 2 — Core capture flow (1.5 days)
- Vendor create/edit form (progressive, phone-first).
- Multi-rep and multi-product sub-forms.
- Camera capture + canvas resize + blob storage + thumbnails.
- Validation and required-field rules.
- **Exit:** capture a full vendor with 2 reps, 3 products, and 4 photos offline.

### Phase 3 — Browse & organize (1 day)
- Manifest list with search, filters, sort, status seal.
- Vendor spec-sheet detail page with tabs (Overview / People / Products / Notes / Certs / Files).
- Rating and status pipeline.
- **Exit:** find any vendor in < 10 s; filter by status and country.

### Phase 4 — Prices & currency (0.5 day)
- Product price tiers (MOQ breaks), currency selector, manual rates, base-currency display.
- **Exit:** a CNY quote renders correctly in the base currency and updates when a rate changes.

### Phase 5 — Sharing (1 day)
- Full export file (`.ocv.json.gz`), import with preview + merge/replace choice.
- Single-vendor QR share + printable share card.
- CSV export of vendor list.
- **Exit:** export on phone, import on laptop, all photos and relations intact.

### Phase 6 — Polish, a11y, security (1 day)
- Design-review pass with `hallmark`/`impeccable`/gstack `design-review`; responsive + dark mode.
- WCAG 2.2 AA fixes; keyboard and screen-reader pass.
- Import hardening; CSP; CSV-injection guard.
- **Agents:** `a11y-architect`, `security-reviewer`, `performance-optimizer`, `code-simplifier`/`refactor-cleaner`, gstack `cso`.
- **Exit:** axe clean on key screens; security checklist signed off.

### Phase 7 — Verify & ship (0.5 day)
- Playwright: install, offline reload, capture, export/import.
- Lighthouse PWA + performance check.
- README, LICENSE, deploy docs; optional static host.
- **Agents/skills:** `e2e-runner`, `doc-updater`, gstack `qa`/`review`/`ship`/`benchmark`.
- **Exit:** a colleague can install it and import a shared file unaided.

**Total: ~7 focused days.** Cut from the bottom (Could-have) if time is short.

## 9. Acceptance criteria (v1)

1. Works with airplane mode on after first load, on Android, iOS, Linux, Windows.
2. A vendor with multiple reps, products, certs, notes, and photos can be created offline.
3. Data survives app reload, browser restart, and device reboot.
4. Export file imported on a second device reproduces **all** records and photos.
5. Merge import does not create duplicates for the same company.
6. QR share opens a valid vendor card on a second phone.
7. Search returns results in < 100 ms for 500 vendors.
8. No network requests except loading the app itself; no telemetry.
9. WCAG 2.2 AA: keyboard reachable, 44px touch targets, contrast ≥ 4.5:1.
10. Production dependency count ≤ 6, all justified.

## 10. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| iOS Safari storage eviction | Data loss | Use `navigator.storage.persist()`; prompt regular export; show storage status |
| Photo storage bloat | Slow, quota errors | Resize to max 1600px + JPEG q0.75; warn on large DB; show usage |
| Export file too big for chat apps | Can't share | gzip; QR only for single vendor; split export by fair |
| Chinese text rendering | Unreadable | Noto Sans SC fallback; test with CJK sample data |
| Generic AI-looking UI | Low trust/adoption | Explicit design direction + hallmark/impeccable review gates |
| Scope creep into ERP | Miss the trip date | Non-goals list; MoSCoW cut line; ship by Phase 7 |
| Untrusted import payloads | XSS / corruption | Schema validation, size limits, sanitize strings, no `dangerouslySetInnerHTML` |

## 11. Open questions

- Which **base currency** to default to (USD assumed)?
- Should the app ship **bilingual (EN/中文)** labels in v1? (Currently v2.)
- Should the static read-only catalog build be in scope for this trip? (Currently v2.)
- Any **brand/name** preference for the app? Working name: *OPC Vendors Cards*.
