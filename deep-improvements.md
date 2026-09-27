# OPC Vendors Cards — Deep Review & Improvement Plan

Review date: 2026-09-23 · Reviewed commit: `1dde6a4` (master) · Target: usable at the 140th Canton Fair (mid-October 2026)

This document is the single source of truth for the next round of work. Every issue has an ID (`A1`, `B3`, …). The OpenCode prompt (`opencode-prompt.md`) references these IDs, so keep them stable; mark items done by appending `✅ <commit>` to the heading instead of deleting them.

---

## 0. How this review was done (and what was verified)

The whole repository was read: `plan.md`, `architecture.md`, `AGENTS.md`, `README.md`, all of `src/`, the tests, `vite.config.ts`, `vercel.json` and the CI workflow. The following was actually executed, not assumed:

| Check | Result |
|---|---|
| `tsc -b` (typecheck) | Clean |
| `eslint .` | Clean |
| `vitest run` | 28 files, **177 tests pass** |
| Production JS size | 443 KB raw / **~140 KB gzipped** (under the 200 KB budget) |
| Production deps | 5 of 6 allowed |
| Three throwaway probe tests (not committed) | Reproduced bugs **A1, A2 and A3** below |

Probe results, verbatim: after device B merges two exports of the same vendor (device A edited it in between), B has **2 contacts and 2 products instead of 1 and 1**. A vendor deleted on B **comes back** when B merges an older file. An imported vendor with a *newer* `updatedAt` and status `ordered` is **ignored**; B keeps the stale `lead`.

**Bottom line.** The engineering base is genuinely good: strict TypeScript, transactional writes, a validated import boundary, CSP, formula-guarded CSV, a real test suite, a restrained dependency list and a coherent design idea. The weaknesses are not code quality. They are (1) the *sync protocol* silently corrupts data once two people start exchanging files, which is the app's core promise, and (2) several things that matter most *on the fair floor* (fast capture, not losing a half-typed vendor, reading a business card, finding a booth again, the QR actually opening the app) are either missing or incomplete. Both are fixable before the fair if work starts now and stays scoped.

---

## 1. Project context (for any agent starting cold)

**What it is.** A local-first, offline PWA that turns a phone into a sourcing notebook at trade fairs: company, several representatives, several products with price tiers and MOQ, notes/tasks, certifications, photos, booth location, rating and a pipeline status. No backend, no accounts; IndexedDB is the database; files and QR codes are the sync protocol.

**Stack.** React 19 + TypeScript strict, Vite 7, `vite-plugin-pwa` (Workbox `generateSW`), Dexie 4 with `useLiveQuery`, `qrcode`. Plain CSS with tokens in `src/styles/tokens.css`. Hand-rolled hash router (`src/lib/useHashRoute.ts`). Vitest + fake-indexeddb for units, Playwright + axe for E2E. CI (`.github/workflows/deploy.yml`) runs lint → typecheck → unit tests → Vercel deploy. E2E is **not** in CI.

**Non-negotiables (from `AGENTS.md`, keep them).** No runtime network requests. Production deps ≤ 6. No `dangerouslySetInnerHTML`. Every URL through `safeHref`. Every import through `validate.ts`. Tokens are the only source of colour. Gate every change with `lint → typecheck → test`.

**Key files.**

| Area | File |
|---|---|
| Schema / models | `src/db/schema.ts`, `src/db/models.ts` |
| Atomic capture save | `src/data/bundle.ts` (`saveVendorBundle`) |
| Sync protocol | `src/lib/exportImport.ts`, `src/lib/validate.ts` |
| QR codec | `src/lib/share.ts` |
| Capture UI | `src/features/vendors/VendorForm.tsx`, `formState.ts`, `ContactFields.tsx`, `ProductFields.tsx`, `src/components/PhotoPicker.tsx` |
| Browse | `src/features/vendors/VendorList.tsx`, `vendorQuery.ts`, `VendorDetail.tsx` |
| Sharing | `src/features/sharing/ShareScreen.tsx`, `VendorShare.tsx` |

---

## 2. What to keep (do not "improve" these away)

The transactional `saveVendorBundle` that resolves every id before entering the Dexie transaction; the import validator with size/record caps; the CSP injected only into production HTML plus the header CSP in `vercel.json`; the diacritic-folding search; the rate model (units of C per 1 base, converted at render and never persisted); EXIF-aware resizing to 1600 px + 256 px thumbnails; the Status Seal as the single bold visual device; the spec-sheet detail page; the five-theme axe test. Design skills in particular must *audit* this identity, not replace it (see §6.4).

---

## 3. Priority legend and timeline

| Priority | Meaning | Deadline |
|---|---|---|
| **P0** | Data loss/corruption, or blocks real use at the fair | Merged by **Oct 4** |
| **P1** | Large time saving or trust issue at the fair | Merged by **Oct 9** |
| **P2** | Valuable, but after the fair | Post-fair backlog |

**Oct 10–12**: feature freeze, real-device testing (one Android phone, one iPhone, the Windows laptop you will use for review), a full export → import round-trip between two devices with realistic data (≥ 100 vendors, ≥ 500 photos). **Assumption to confirm:** the fair's first phase opens around Oct 15; if your travel date is earlier, move every deadline back by the difference.

---

## 4. Findings and fixes

Each finding lists the evidence (file and line), why it matters in the field, the fix, and the regression test that must land with it.

### A. Data integrity and the sync protocol

#### A1 · P0 · Editing a vendor regenerates every child id → duplicates on every re-import ✅ 0d81ee3

**Evidence.** `src/data/bundle.ts` lines 59, 75, 90 assign `crypto.randomUUID()` to every attachment, contact and product on *every* save, even though `VendorForm.bundleToDraft` loads the existing ids into the draft `key` fields. On edit, the transaction deletes all children and re-inserts them with new ids. Merge (`exportImport.ts` `upsertChildren`) dedupes children only by id. Reproduced: two merges of the same vendor → 2 contacts, 2 products.

**Why it matters.** Sharing a trip file with a colleague twice (e.g. day 2 and day 5) fills their copy with duplicate people, products and photos. It also rewrites every photo blob on every edit (slow, and wears flash storage on phones).

**Fix.** Make ids stable and saves incremental.

1. Add an optional `id` to `ContactDraft`, `ProductDraft` and `PhotoDraft` (set only when loaded from the DB). `bundleToDraft` sets it; new rows leave it `undefined`.
2. In `saveVendorBundle`, reuse `draft.id` when present, otherwise `crypto.randomUUID()`.
3. Replace "delete all children then insert" with a diff inside the same transaction: load existing child ids for the vendor, `bulkPut` the kept/new rows, `bulkDelete` only the ids that disappeared from the draft. Never delete notes/certs here (they are not part of the form).
4. For attachments that already exist and were not replaced, do not rewrite the blob: `put` only new attachments, `delete` only removed ones.

**Test.** `tests/unit/bundle.test.ts`: create → edit (same content) → assert contact/product/attachment ids unchanged. `tests/unit/importMerge.test.ts`: export, edit, export, merge both into a clean DB → exactly one of each child.

#### A2 · P0 · Merge ignores which side is newer ✅ b662f86

**Evidence.** `exportImport.ts` line 251/372: the default policy `existing-wins` keeps the local vendor regardless of `updatedAt`; `imported-wins` overwrites regardless and stamps `updatedAt: Date.now()` (line 377), destroying the real edit time. Children have no `updatedAt` at all, so no recency decision is possible for them. Reproduced: a newer imported status is dropped.

**Why it matters.** Two people working the same fair will each update statuses, ratings and prices. The current behaviour means "last one to import loses their colleague's newer work", silently.

**Fix.**

1. **Schema v2** (`db.version(2)` with an `upgrade` that sets `updatedAt = createdAt ?? Date.now()` on contacts, products, notes, certs and attachments). Add `updatedAt: number` to those models and have every repository write bump it. Bump `SCHEMA_VERSION` to 2 (the test asserting `SCHEMA_VERSION === db.verno` keeps them honest). `validate.ts` must still accept v1 files and fill `updatedAt` from `createdAt` or from the envelope's `exportedAt`.
2. Add a third policy `newest-wins` and make it the **default**: for every vendor and child matched by id, keep the row with the larger `updatedAt`; ties keep existing. Keep `existing-wins` / `imported-wins` as explicit overrides in the import UI.
3. `imported-wins` must preserve the imported `updatedAt`, not replace it with `Date.now()`.
4. Show the outcome in the import summary: "12 updated from file (newer), 3 kept (yours were newer)".

**Test.** Newer imported vendor wins; older imported vendor loses; child-level recency works independently of the parent; a v1 file still imports.

#### A3 · P0 · Deleting a vendor is impossible in the UI, and deletes would resurrect on merge anyway ✅ 5ef7898

**Evidence.** `deleteVendor` exists in `src/data/vendors.ts` but is not called anywhere in `src/features` — there is no delete button. The model has `deletedAt` (soft delete) and every query filters it, but nothing ever sets it; `deleteVendor` hard-deletes. A hard delete leaves no tombstone, so merging any older file brings the vendor back (reproduced).

**Why it matters.** A test entry, a duplicate, or a company you have ruled out cannot be removed; if a delete is added naively it will not survive sharing.

**Fix.**

1. Add **Delete** to the vendor detail header (behind a confirmation `<dialog>`), implemented as soft delete: set `deletedAt = updatedAt = Date.now()`; leave children in place.
2. Add a **Recently deleted** list in Settings with *Restore* (clear `deletedAt`, bump `updatedAt`) and *Delete permanently* (the existing cascading `deleteVendor`). Auto-purge tombstones older than 90 days on app start, but keep the vendor row itself as a tiny tombstone (id, name, `deletedAt`, `updatedAt`) so merges still know it was deleted.
3. Export includes tombstones. Under `newest-wins`, a tombstone newer than the other side's `updatedAt` wins, and vice versa (an edit made after the delete revives it — that is correct).
4. `previewImport` should report "N will be removed (deleted on the other device)".

**Test.** Delete → merge older file → still deleted. Delete on A, edit later on B → B's edit revives it on A.

#### A4 · P1 · Notes, certs and inline status/rating changes do not bump the vendor ✅ d5225e3

**Evidence.** `src/data/notes.ts` and `certs.ts` write only their own table. Detail-page status/rating changes go through `updateVendor` (which does bump), but adding a note or a cert does not.

**Why it matters.** "Recently updated" sort misses the vendor you just added a follow-up note to; with A2 in place, recency decisions on the parent are wrong.

**Fix.** Wrap each note/cert write in a transaction that also bumps `vendors.updatedAt`. Small helper `touchVendor(vendorId)` in `src/data/vendors.ts`.

#### A5 · P1 · Export and import hold the entire trip in memory as one string ✅ a9c4c2b

**Evidence.** `serializeDb` builds one object with every photo as base64, then `JSON.stringify` makes one string; `importData` decodes every attachment into Blobs before the transaction. `LIMITS.maxJsonChars` is 400 MB.

**Why it matters.** Rough sizing: 150 vendors × 6 photos × ~250 KB ≈ 225 MB of JPEG → ~300 MB of base64 text, plus a second copy during gzip. Mobile Safari and mid-range Android tabs are killed well before that. The day you most need a backup (end of the fair) is the day it fails, and the failure mode is a crashed tab, not an error message.

**Fix (dependency-free).**

1. **Format v2 = gzipped NDJSON.** Line 1 is the envelope header (`schemaVersion`, `exportedAt`, `app`, counts). Every following line is one record `{ "t": "vendor" | "contact" | …, "r": {...} }`. Write it through a `ReadableStream` piped into `CompressionStream('gzip')`, pulling one record at a time (one photo in memory at a time). Where the File System Access API exists, stream straight to disk; otherwise collect the gzip chunks (already compressed, far smaller than the JSON string) into a Blob.
2. **Import v2** streams through `DecompressionStream` + a line splitter, validates each record with the existing per-record validators, and writes in batches of ~50 records per transaction. Atomicity comes from idempotency instead of one giant transaction: once A1/A2 are fixed, re-running a partially failed merge produces the same result. For *replace* mode, write into the live tables only after a full validation pass (first pass counts and validates without writing; second pass writes).
3. Keep reading v1 (`.ocv.json.gz`) files forever via the current code path.
4. Add export options: **without photos** (tiny, WhatsApp-friendly), **selected vendors only**, **one fair edition only**; show an estimated size before exporting (sum of `attachment.bytes` × 1.35).

**Test.** Round-trip v2 with 300 synthetic photos (small random JPEG-like blobs) under the node environment; v1 file still imports; a truncated v2 file fails with a clear error and does not leave partial vendors without their children.

#### A6 · P2 · Import limits are internally inconsistent

`maxFileBytes` is 250 MB while `maxTotalAttachmentBytes` is 300 MB and `maxJsonChars` 400 MB. After A5 these should be re-derived from real device tests; document the chosen limits in `architecture.md` §6.4.

### B. Capture flow on the fair floor

#### B1 · P0 · A half-typed vendor is lost on any accidental navigation ✅ 67fd759

**Evidence.** `VendorForm` keeps the draft in `useReducer` only. Tapping a bottom-nav item, the Android back gesture, a page reload or a service-worker update discards it without warning. There is no `beforeunload` or dirty check anywhere in `src`.

**Why it matters.** At a booth you type while talking, get interrupted, switch to WhatsApp to scan a WeChat QR, come back — and the app may have been reloaded by the OS. Losing a vendor with three photos is the single most damaging UX failure possible here.

**Fix.**

1. New Dexie table `drafts` (schema v2): `{ id: 'new' | vendorId, draft, photos (Blobs), updatedAt }`. Debounced (≈800 ms) autosave of the reducer state from `VendorForm`; delete the draft on successful save or explicit *Discard*.
2. On opening *New vendor* or *Edit* with a draft present: banner "Unsaved vendor from 14:32 — Restore / Discard".
3. When the form is dirty: `beforeunload` handler, and intercept in-app navigation (`hashchange` while dirty → confirm dialog; if the user cancels, restore the previous hash).
4. The home list shows a "1 unsaved vendor" chip linking back to the draft.

**Test.** Unit: reducer state → persisted → restored equals original (including photo blobs). E2E: type a name, add a photo, `page.reload()`, restore, save.

#### B2 · P0 · The service worker can reload the app mid-capture ✅ 67fd759

**Evidence.** `vite.config.ts` line 50: `registerType: 'autoUpdate'`. With the auto-update registration the page reloads when a new service worker takes control.

**Why it matters.** If you deploy a fix during the fair and the phone gets Wi-Fi at the hotel or in the hall, the open form can be wiped (B1 would then save it, but the user still gets a jarring reload).

**Fix.** Switch to `registerType: 'prompt'` and use `virtual:pwa-register` in `main.tsx`: when `onNeedRefresh` fires, show a small non-blocking toast "Update ready — Reload" that is suppressed while on `vendorNew`/`vendorEdit` or while a draft is dirty. Check the exact API with Context7 (`vite-plugin-pwa`, "prompt for update", React) before coding.

#### B3 · P0 · The photo picker forces the camera and blocks the gallery ✅ 67fd759

**Evidence.** `PhotoPicker.tsx` line 59: `capture="environment"` together with `multiple`. On Android, `capture` opens the camera directly and prevents choosing existing images; `multiple` is then meaningless.

**Why it matters.** You will often already have the photo: taken quickly with the native camera, received on WeChat/WhatsApp, or a screenshot of a supplier's catalogue page.

**Fix.** Two buttons per picker: **Take photo** (`capture="environment"`, single) and **Choose photos** (no `capture`, `multiple`). Same processing pipeline. Keep 44 px targets.

#### B4 · P0 · Planned fields have no input at all: tags, social links, fair note, default fair ✅ 67fd759

**Evidence.** `grep` shows `tags`, `socials`, `fair.note`, `settings.defaultFair` and `settings.travellerName` are stored, validated, exported, searched and displayed, but no form control writes them. `plan.md` lists social links as a v1 *Must*; `README.md` advertises tag search.

**Why it matters.** WeChat and WhatsApp are how Chinese suppliers are actually contacted after the fair; tags are how you group "LED panels" vs "PPR fittings" across 100 vendors; typing the fair name on every vendor wastes seconds × hundreds.

**Fix.**

1. **Tags:** chip input with suggestions from existing tags (datalist of all tags across vendors), Enter/comma to add, × to remove; normalise to trimmed lowercase for matching but keep display case.
2. **Social links:** repeater with a platform `<select>` (WeChat, WhatsApp, Alibaba, LinkedIn, Instagram, Facebook, Other) and a value field; reuse `socialHref` for display.
3. **Fair note** field under Booth ("Opposite the escalator, second aisle").
4. **Settings → Current fair:** edition, optional hall list, default quote currency. New vendors are prefilled with the current fair edition and currency. `travellerName` goes into exports (`exportedBy`) so merged data shows who captured what (see new feature N12).

#### B5 · P1 · No quick-capture path; the goal is "under 60 seconds" ✅ 1a88cda

**Evidence.** The form is one long page (Identity, Where, Fair, People, Products, Photos, Notes). After save it navigates to the list (`VendorForm.tsx` line 140), not the new vendor.

**Fix.** A **Quick add** screen (`#/vendors/quick`), reachable from the primary button and a manifest shortcut: company name, hall + booth, *Take card photo*, *Take product photos*, rating stars, one free-text note → **Save & next** (clears the form, keeps the hall) or **Save & open**. Everything else is completed in the evening via Edit. After a full-form save, go to the vendor's detail page. Add a live duplicate hint while typing the name (see N6).

#### B6 · P1 · Business cards and product photos cannot be viewed at full size ✅ e6f2034

**Evidence.** `VendorDetail` renders only `attachment.thumb` (256 px) in People, Products and Files; nothing opens `attachment.blob` (1600 px).

**Why it matters.** A 256 px business card is unreadable. The card photo *is* the source of truth for phone numbers and emails.

**Fix.** Tapping any thumbnail opens a native `<dialog>` viewer with the full blob (object URL revoked on close), pinch-zoom via a scrollable container with `touch-action: pinch-zoom`, previous/next across the vendor's photos, a "Change type" select (business card / product / booth / document) and Delete. Keyboard: Esc closes, arrows navigate; focus returns to the thumbnail.

#### B7 · P1 · Product currency silently defaults to USD ✅ deae78d

**Evidence.** `formValidation.ts` line 91: an empty currency becomes `'USD'`.

**Fix.** Default to Settings → *default quote currency* (B4), falling back to the last currency used in this session, and prefill the field visibly so the user sees what will be stored.

#### B8 · P1 · Notes and certifications cannot be edited, and deletes are instant ✅ 08d267d

**Fix.** Inline edit for notes and certs (tap text → input). Replace instant delete with delete + 5-second **Undo** toast (keep the row in memory and re-add it). Same undo pattern for removing a contact or product in the form.

### C. Browsing and finding things again

#### C1 · P0 · Search cannot find a booth, a phone number or a WeChat ID ✅ 67fd759

**Evidence.** `vendorQuery.ts` line 56: the haystack contains name, type, status, country, city, tags, contact name/position and product name. Not hall, booth, fair edition, fair note, phones, emails, WeChat/WhatsApp, website, product description, notes.

**Why it matters.** "Find a booth again" is a named user need in `plan.md` §3. Searching "11.2" or a WeChat ID someone just added you with should work.

**Fix.** Add those fields to the index. For phone-like input, also index a digits-only copy (`+86 138-0013 8000` → `8613800138000`) and search the digits-only query against it. Keep the < 100 ms at 500 vendors budget (add a perf test with 500 synthetic vendors).

#### C2 · P1 · Search and filters reset every time you open a vendor and come back ✅ 08d267d

**Evidence.** `VendorList` keeps `query` in `useState`; navigating to detail unmounts it.

**Fix.** Store the query in the hash (`#/vendors?q=led&status=quoted&sort=updated`); `parseHash` already strips `?…`, so extend the route type with parsed params and write them with `history.replaceState` (no extra history entries). Restore scroll position on return.

#### C3 · P1 · Missing filters promised by the plan: fair edition, tag, "to revisit" ✅ 29d7884

**Fix.** Add fair and tag filters. Move all filters into a collapsible **Filters (n)** panel on phones so results are not pushed below the fold by six selects. Add a *Revisit* flag (N4) filter.

#### C4 · P1 · Booth order is not numeric-aware ✅ edf6512

**Evidence.** `TripScreen.tsx` line 8: `Intl.Collator(undefined, { sensitivity: 'base' })` sorts "Hall 10" before "Hall 9".

**Fix.** `new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })` wherever hall/booth is sorted.

#### C5 · P2 · Desktop two-pane layout from `architecture.md` §7.4 was never built

At ≥ 1024 px show list and detail side by side (list keeps its state; detail replaces the right pane). Useful for the evening review on the laptop.

#### C6 · P2 · List rows give no visual memory

Add a 40 px thumbnail (business card or first booth photo) and the booth in mono to each manifest row. Load thumbnails lazily (`loading="lazy"` on object-URL images, revoke on unmount).

### D. Sharing, QR and backups

#### D1 · P1 · The QR code does not open the app ✅ fab7d99

**Evidence.** `share.ts` encodes `OCV1.<base64url JSON>`. A phone camera shows it as unusable text; the app has no scanner; the only import path is pasting the text into Sharing (`ShareScreen.tsx` ~line 290).

**Fix.**

1. Encode the QR as a URL to the deployed app: `https://<your-host>/#/import?c=OCV2.<payload>` (host from `location.origin` at share time). A camera scan then opens the installed PWA or the site, which routes to an **Import card** screen: preview → *Add* (reusing `cardToEnvelope` + `importData`, with duplicate detection).
2. Compress the JSON with `CompressionStream('deflate-raw')` before base64url (new prefix `OCV2.`; keep decoding `OCV1.`). This roughly doubles what fits under the 1200-byte density cap.
3. Optional in-app scanner using the native `BarcodeDetector` where available (Chrome on Android), hidden elsewhere; the paste box stays as the universal fallback. Do **not** add a JS QR-decoder dependency for this (ponytail ladder: native platform first).
4. Treat the `c` parameter as untrusted input: length cap before decoding, `decodeVendorCard` validation, no auto-import without the preview step. Run the security reviewer on this diff.

#### D2 · P1 · The printed/QR card leaks internal information ✅ 29d7884

**Evidence.** `buildVendorCard` includes pipeline status, your rating and every product price; `VendorShare` prints status and prices.

**Why it matters.** The card may be shown to the supplier or a third party; your target price and "rating 2/5" should not be on it.

**Fix.** Toggles on the share screen: *Include prices*, *Include status & rating* (both default **off** for print, **on** for colleague QR). Persist the last choice in settings.

#### D3 · P1 · No backup discipline: no "last exported", no storage status ✅ 98ba247

**Evidence.** `requestPersistentStorage` is called only after the first save and its result is ignored; `architecture.md` §8 promised a storage estimate in Settings, but there is no `navigator.storage.estimate()` call in `src`.

**Why it matters.** A phone lost or reset at the fair loses everything; Safari can evict website data that is not installed/persisted.

**Fix.** Settings → **Storage & backup**: persisted yes/no (with a button to request), used/quota from `estimate()`, photo count and size, *last export* date. Save `lastExportAt` and `vendorsSinceExport`. Show a dismissible banner on the list when there are ≥ 20 changes or ≥ 2 days since the last export: "Back up now" → share sheet.

#### D4 · P1 · Mobile export uses `<a download>` first ✅ deae78d

**Evidence.** `ShareScreen` makes *Download export* the primary button and *Share file* secondary.

**Why it matters.** In an installed iOS PWA, blob downloads are unreliable; the share sheet (WhatsApp, Files, AirDrop) is the working path.

**Fix.** If `canShareFiles()` and the file passes `navigator.canShare`, make **Share file** primary and Download secondary; on desktop keep Download primary. Consider naming the file `.ocv.gz` and sharing with MIME `application/gzip`; verify WhatsApp and Telegram accept it on both platforms during device testing.

#### D5 · P1 · CSV mangles international phone numbers ✅ edf6512

**Evidence.** `csv.ts` line 4 guards any cell starting with `+`, so `+86 138 0013 8000` becomes `'+86 138 0013 8000` — Excel and LibreOffice show the apostrophe literally in a CSV.

**Fix.** Exempt values that are purely phone-shaped (`/^\+?[\d\s().-]{6,}$/`) — they cannot form a formula — and keep the guard for everything else. Add a test with a formula payload and a phone number side by side.

#### D6 · P1 · CSV has one row per vendor; price comparison needs one row per product ✅ a88a0f8

Add a **Products CSV**: vendor, booth, product, unit, currency, price, base-currency price, MOQ, tier breaks, lead time, packing fields (N2), tags. This is what gets opened in a spreadsheet for supplier comparison sheets.

### E. PWA, platform and performance

#### E1 · P1 · The brand fonts are never loaded ✅ 98ba247 (files fixed in 2276751: four were HTML error pages)

**Evidence.** `tokens.css` names Archivo, IBM Plex Sans and IBM Plex Mono, but there is no `@font-face` and no font file in `public/`. Every device silently falls back to its system font, so the "industrial spec sheet" typography only exists on machines that happen to have those fonts installed; the README even states no webfonts are shipped.

**Fix.** Self-host latin-subset `woff2` files for Archivo (600, 700), IBM Plex Sans (400, 500) and IBM Plex Mono (400, 500) in `public/fonts/`, declare them with `font-display: swap` in a new `src/styles/fonts.css`, and let Workbox precache them (the glob already includes `woff2`). Budget ≤ 150 KB total. Keep CJK on system fonts (`"PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei"` in the fallback stack) — do not bundle Noto Sans SC. CSP already allows `font-src 'self'`. Update the README privacy line.

#### E2 · P2 · Manifest could do more

Remove `orientation: 'portrait'` (it locks tablets and desktop windows). Add `id`, `categories: ["business","productivity"]`, `shortcuts` (Quick add, Trip), and two `screenshots` (narrow + wide) for the richer Android install sheet. Later: `share_target` so a WhatsApp-received `.ocv.gz` can be opened straight into the importer (requires switching to `injectManifest`; not before the fair).

#### E3 · P2 · Image processing blocks the main thread — won’t fix: the picker already resizes one photo at a time; parallel decode risks iOS memory kills

Resizing several 12-megapixel photos in a row freezes the UI for seconds on mid-range phones. Move `defaultRasterizer` into a module Web Worker using `OffscreenCanvas` + `createImageBitmap` where available (Chrome, Safari 17+), fall back to the current path. Process photos in parallel with a concurrency of 2.

#### E4 · P2 · E2E tests do not run in CI ✅ ff1a5bb

Add a Playwright job (Chromium only, with `npx playwright install --with-deps chromium`) between unit tests and deploy. The offline-reload and export/import specs are exactly what protects A1–A5 from regressions.

### F. Design, UX polish and accessibility

#### F1 · P1 · The phone list screen spends its first screen on filters ✅ 29d7884

Six labelled selects plus search push results off the first screen. Keep search visible; collapse the rest into a **Filters** disclosure with an active-count badge (C3). Consider a sticky search bar.

#### F2 · P1 · New UI must meet the existing bar

Every new dialog (photo viewer, delete confirm, unsaved-changes prompt) uses the native `<dialog>` with `showModal()`, a labelled heading, focus return, Esc to close, and 44 px targets; every new toast is an `aria-live="polite"` region. The existing axe spec must be extended to cover Quick add, the viewer and the import-card screen across all five themes.

#### F3 · P2 · Theme count vs maintenance

Five themes are already tested by axe, so keep them, but any new colour must be added as a token in all five blocks of `tokens.css` in the same commit, or the axe run will catch it late.

### G. Code health and documentation drift

#### G1 · P1 · Documentation no longer matches the code ✅ round 2

`architecture.md` §4 lists files that do not exist (`db/migrations.ts`, `components/Button.tsx`, `Sheet.tsx`, `Confirm.tsx`, `Chip.tsx`, `Rating.tsx`, feature folders for contacts/products/notes/certs); `README.md` claims tag search and social links that cannot be entered. Update both after the P0/P1 work, and record the new decisions (schema v2, `newest-wins`, NDJSON v2 export, QR URL format, prompt-based SW updates) as ADR rows in §12.

#### G2 · P2 · Small cleanups

`TripScreen` and `VendorDetail` each define their own date formatter and `formatDate`; move to `src/lib/format.ts`. `newKey()` lives in `features/vendors/formState.ts` but is imported by Settings; move it to `src/lib`. None of these are urgent — do them only while touching those files.

---

## 5. New features that fit the purpose

Selection rule: each feature must (a) help source products at a fair or decide afterwards, (b) work fully offline, and (c) add **no production dependency** unless stated. Numbering continues the ID scheme (`N1`…).

| ID | Feature | Why it earns its place | Priority | Deps |
|---|---|---|---|---|
| N1 ✅ 3299358 | **Smart paste from card text** | Phones can already read business cards (iOS Live Text, Google Lens → copy text). A "Paste card text" box parses phones, emails, websites, WeChat/WhatsApp IDs and a likely company line into the contact/vendor fields for the user to confirm. OCR speed without shipping OCR. | P1 | none (regex) |
| N2 | **Packing & landed-cost fields** | Per product: pcs per carton, carton size (→ CBM), gross weight, incoterm (EXW/FOB/CIF). Settings: freight % or per-CBM rate, duty %, VAT %. Shows an estimated landed unit cost in the base currency (for OMR books: 3 decimals and 5 % VAT). This is how a quote is actually compared back home. | P1 | none |
| N3 ✅ 52c7bab | **Product comparison view** | Pick a tag (e.g. "led-panel") → table of every product with that tag across vendors: base price, landed cost, MOQ, lead time, rating, booth; sortable; exportable as the Products CSV (D6). The decision screen of the whole trip. | P1 | none |
| N4 ✅ 3299358 | **Revisit list & day plan** | Star a vendor "revisit"; Trip screen groups starred vendors by hall in numeric order (C4) for tomorrow's walking route. | P1 | none |
| N5 ✅ 3299358 | **Save contact to phone (vCard)** | One tap on a representative → `.vcf` (name, company, title, phones, email, notes with booth and WeChat) → the OS contacts app. Planned as a "could" in `plan.md`. | P1 | none |
| N6 ✅ 08d267d | **Duplicate hint while capturing** | As the company name is typed, match against `dedupeKey` and fuzzy name; show "Already met on Oct 16 — open instead?". Prevents two records for one supplier met on two days. | P1 | none |
| N7 ✅ 82c53ae | **Follow-up messages** | From a contact: WhatsApp (`wa.me/<digits>?text=`) or email (`mailto:`) with a prefilled, editable template: "Nice to meet you at <fair>, booth <booth>. Please send the quotation for <products>…". Templates editable in Settings. | P1 | none |
| N8 | **Tasks to calendar (.ics)** | Export open tasks with due dates as an `.ics` file; phone calendars handle the reminders, so no push infrastructure is needed. | P2 | none |
| N9 | **Voice memo per vendor** | `MediaRecorder` → audio attachment (kind `audio`), capped at 60 s, stored like photos, exported like photos. Faster than typing at a noisy booth. | P2 | none |
| N10 | **Encrypted export** | Optional passphrase: PBKDF2 → AES-GCM via WebCrypto over the gzip stream. Quotes and target prices are commercially sensitive when sent over chat apps. | P2 | none |
| N11 | **Trip report** | Printable/PDF (browser print) summary: shortlisted vendors, best offer per tag, open tasks, photos strip. For the debrief after the trip. | P2 | none |
| N12 | **Captured-by attribution** | `createdBy`/`updatedBy` from `travellerName` on each record; merged data shows who met whom; filter by person. Needed as soon as two colleagues share one trip. | P2 | none |
| N13 | **Additional UI languages** | Simplified Chinese labels (for showing the screen to suppliers) and Arabic with RTL if colleagues need it. Plain JSON dictionaries + a tiny `t()` helper; no i18n library. | P2 | none |
| N14 | **Fair presets** | Ship a small static JSON of fair profiles (edition, dates, hall numbering pattern, typical currencies) built at development time from official pages (see FireCrawl use in §6.1). Settings → "Choose fair" prefills B4. | P2 | none |

Deliberately **not** recommended: cloud sync or a backend (breaks the core promise), bundled OCR (Tesseract ≈ several MB and weak on dense Chinese cards; N1 gives most of the value), live exchange rates (no network at runtime; rates stay manual), and any UI component library.

---

## 6. How to use the available tools and skills efficiently

The harness already in the repo (17 ECC agents in `.opencode/agent/`, gstack and the local design skills per `plan.md` §7.0) is powerful but large. With a fast, cheaper model the main risk is **context bloat and conflicting instructions**, not missing capability. Rules of thumb:

1. **One issue ID per task, one skill family per step.** Load a skill when its step starts; do not preload five design skills "just in case".
2. **Docs before code.** Any time an external API is touched (Dexie, vite-plugin-pwa, Workbox, Web Share, BarcodeDetector, CompressionStream), query Context7 first; do not rely on memory of library APIs.
3. **Review in subagents.** Run reviewers (`typescript-reviewer`, `react-reviewer`, `security-reviewer`, `/ponytail-review`) as subagents so their long outputs do not pollute the main context; bring back only the punch list.
4. **The gate is mandatory:** `npm run lint && npm run typecheck && npm run test` after every change; `npm run test:e2e` when touching UI, routing, storage or the service worker.

### 6.1 FireCrawl (web scraping/search) — development-time research only

FireCrawl must **never** become a runtime dependency of the app (no network at runtime is a non-negotiable). Use it to bring accurate outside knowledge into the repo:

| Use | How |
|---|---|
| Platform behaviour you cannot guess | Search then scrape specific pages: iOS PWA storage eviction and install behaviour, `navigator.share` file support per platform, `BarcodeDetector` support, `CompressionStream('deflate-raw')` support. Save conclusions (with URL and date) to `docs/research/*.md`, not raw dumps. |
| Fair presets (N14) | Scrape the official fair's hall/booth numbering and phase dates once; hand-write a small `src/data/fairs.json` from it. |
| Competitive feature scan | Scrape 3–5 product pages of business-card and trade-show lead apps to confirm the feature list in §5; keep a one-paragraph summary. |
| Docs Context7 lacks | Scrape the single page you need (MDN, web.dev) when Context7 has no entry. |

Efficiency rules: prefer `search` with a small result limit, then `scrape` only the one or two best URLs with main-content-only markdown output; use `map` to locate a page on a large site instead of crawling it; never `crawl` a whole site (credit cost and context flood). Summarise into the repo; do not paste scraped pages into the conversation.

### 6.2 Context7 (up-to-date library docs)

Resolve the library id first, then fetch docs **for a narrow topic with a token cap** (a few thousand tokens), e.g. Dexie "version upgrade function", Dexie "transaction with bulkPut and bulkDelete", vite-plugin-pwa "registerType prompt React useRegisterSW", Workbox "navigateFallback", Playwright "setOffline", Vitest "environment node per file". The repo's `docs-lookup` agent is a wrapper for exactly this; use it as a subagent when a lookup would otherwise flood the main context.

### 6.3 gstack

| Skill | When in this project |
|---|---|
| `/plan-eng-review` | Once, on the schema-v2 + sync-protocol design (A1–A3, A5) before coding. |
| `/investigate` | Before fixing A1–A3: reproduce with a failing test, confirm root cause, then fix. |
| `/qa`, `/browse` | Real-browser verification of offline reload, draft restore (B1), SW update prompt (B2), QR URL import (D1), share sheet (D4). |
| `/design-review` | After F1/B5/B6 land: visual QA on phone and desktop widths in all themes. |
| `/cso` | After D1 (new untrusted input via URL) and A5 (new import parser). |
| `/review` | Before every commit that touches `src/lib/exportImport.ts`, `validate.ts`, `share.ts` or `db/schema.ts`. |
| `/benchmark` | After C1 (search on 500 vendors) and A5 (export of 300+ photos). |
| `/ship` | Only after a milestone's exit criteria pass. |
| `/context-save`, `/context-restore` | At the end/start of each working session. |

### 6.4 Design skills — one direction, several auditors

The visual identity is **already decided** (tokens, Status Seal, spec-sheet detail, trade-ledger manifest). Every design skill below is used to **audit and refine**, never to regenerate the UI. When two skills disagree, `src/styles/tokens.css` and `architecture.md` §7 win.

| Order | Skill | Use it for | Do **not** use |
|---|---|---|---|
| 1 | **frontend-design** (Anthropic) | Principles when building new surfaces (Quick add, photo viewer, filters panel, import-card screen) inside the existing language. | As a license to pick a new palette or fonts. |
| 2 | **ui-ux-pro-max** | Look-ups for specific patterns: mobile form ergonomics, bottom-sheet/disclosure filters, touch targets, empty/loading/error states, table-on-mobile for N3. | Its style/palette generator. |
| 3 | **impeccable** | Run `/impeccable init` once to write `PRODUCT.md`, and `/impeccable document` to capture the existing system in `DESIGN.md`. Then per surface: `critique`, `audit`, `harden` (edge cases, long Chinese names, overflow), `adapt` (phone ↔ desktop), `clarify` (UX copy), `polish` as the final pass. Use `npx impeccable detect src/` as a deterministic check. | `bolder`, `overdrive`, `delight`, `colorize` — the brief is a quiet field instrument. Add detector ignores for the deliberate OLED true-black theme. |
| 4 | **hallmark** | `hallmark audit <screen>` for a slop punch list after a surface is built. | `hallmark redesign` (it throws away structure) and the default build verb. |
| 5 | **Taste Skill** | Its `redesign-skill` in audit-first mode, one pass, as a second opinion on the list and detail screens; its `output-skill` to stop placeholder/half-finished output on long tasks. Install with `npx skills add Leonxlnx/taste-skill` if not present. | Its default build flow or style presets (soft/brutalist/minimalist). |
| 6 | gstack `/design-review` | Final visual QA in a real browser. | — |

### 6.5 ECC agents already in `.opencode/agent/`

| Work | Agent |
|---|---|
| Break a milestone into steps | `planner` (no edits) |
| Schema v2 and sync protocol design | `architect`, `type-design-analyzer` |
| A1–A5 (tests first) | `tdd-guide`, then `typescript-reviewer` |
| React surfaces (B1, B5, B6, C2, F1) | `react-reviewer` |
| Swallowed errors in async/Dexie paths (drafts, export streaming) | `silent-failure-hunter` |
| QR URL import, NDJSON import | `security-reviewer` |
| Dialogs, toasts, filters | `a11y-architect` |
| Export streaming, search, image worker | `performance-optimizer` |
| Build/type errors | `react-build-resolver` |
| Playwright coverage | `e2e-runner` |
| Docs at the end (G1) | `doc-updater` |

Useful ECC skills (per `plan.md` §7.2): `tdd-workflow`, `verification-loop`, `production-audit` (before freeze), `architecture-decision-records` (G1), `strategic-compact` / `context-budget` (long sessions).

### 6.6 Ponytail — always on

Keep ponytail at `full`. Before writing any feature, walk its ladder; examples already decided in this plan: native `<dialog>` instead of a modal library, `BarcodeDetector` instead of a QR decoder dependency, `.ics`/`.vcf` strings instead of calendar/contact libraries, regex parsing for N1 instead of OCR, WebCrypto for N10. Run `/ponytail-review` on every diff and `/ponytail-audit` once before the freeze. Ponytail never removes validation, error handling, security or accessibility — those stay.

---

## 7. Execution roadmap

| Milestone | Dates | Scope (IDs) | Exit criteria |
|---|---|---|---|
| **M1 — Data you can trust** | Sep 24 – Oct 1 | A1, A2, A3, A4, schema v2 | Probe scenarios from §0 are permanent tests and pass; v1 files import; delete/restore works; all gates green. |
| **M2 — Safe capture** | Sep 29 – Oct 4 | B1, B2, B3, B4, C1 | Reload mid-form restores the draft (E2E); gallery pick works on Android; tags/socials/fair editable; search finds a booth and a WeChat ID. |
| **M3 — Fair speed** | Oct 3 – Oct 9 | B5, B6, B7, B8, C2, C3, C4, D1, D2, D3, D4, D5, E1, F1, N1, N4, N5, N6 | Quick add < 30 s with card photo on a real phone; QR scan opens the import screen; backup banner appears; fonts load offline; axe clean in all themes. |
| **Freeze & device test** | Oct 10 – Oct 12 | A5 if not done, E4 | Two-device round-trip with ≥ 100 vendors / ≥ 500 photos on the actual phones; offline for a full day; no data loss. |
| **Post-fair** | from Oct 20 | A5 (if deferred), A6, C5, C6, D6, E2, E3, F3, G1, G2, N2, N3, N7–N14 | Driven by what hurt during the fair; write it down in `docs/field-notes.md` every evening at the fair. |

If time runs short, cut from the bottom of M3 first (N6, N5, N4, N1, then E1), never from M1 or M2. A5 is the one P1 that can outrank M3 items: if your realistic photo count is high (several hundred), do A5's "export without photos / by fair" options first — they are small — and the streaming format after the fair.

---

## 8. Assumptions and open questions (please confirm)

1. **Fair dates.** Deadlines assume the first phase opens around **Oct 15, 2026**. Adjust §3/§7 if your travel is earlier.
2. **Deployed host.** D1 assumes the app stays on the current Vercel URL (the QR embeds `location.origin`). If you move to a custom domain before the fair, QR codes printed earlier will point to the old host.
3. **Base currency.** `plan.md` left the default as an open question (USD assumed). For your own use, OMR (3 decimals) with CNY and USD rates is the likely setup; the app should stay generic, so this is a first-run choice, not a hard-coded default.
4. **Who shares data.** A2/A3/N12 assume two or more people exchange files during the same trip. If only you use it, A1–A3 are still P0 (laptop ↔ phone round-trips hit the same bugs), but N12 drops to optional.
5. **Photo volume.** A5's urgency depends on how many photos you realistically take. Estimate ≥ 300 → treat A5's export options as P0.
6. **Tool access.** This plan assumes FireCrawl (with an API key) and Context7 are configured as MCP servers in OpenCode, gstack/ECC/ponytail/ui-ux-pro-max/hallmark/impeccable/frontend-design are installed as described in `plan.md` §7.0, and Taste Skill may still need installing. Tool and command names differ between versions; check each tool's help before relying on a name used here.
7. **Windows testing.** Include an installed-PWA test on the Windows laptop you will use for evening review; offline and file import behave differently from Android.
