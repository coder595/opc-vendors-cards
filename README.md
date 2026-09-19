# OPC Vendors Cards

A local-first, offline web app (PWA) for capturing and managing suppliers, dealers,
agents, factories, and other contacts met at trade fairs — built for the 140th Canton
Fair (Guangzhou, Autumn 2026) and generic to any fair, country, or currency.

One person walking a fair meets dozens of companies a day. This turns a phone into a
**field notebook for sourcing**: capture a company in under 60 seconds, attach card and
product photos, record prices, MOQs, and rates, rate the lead, then share the whole
trip as a single file or a QR code.

## Highlights

- **Works fully offline.** Install it once, then use it in airplane mode. All writes
  work offline; only loading the app shell ever touches the network.
- **No backend, no account, no cloud, no telemetry.** Data lives in IndexedDB on your
  device. There is no server to trust and nothing is sent anywhere.
- **Multi-currency prices** with manually entered rates and a chosen base currency.
- **Rich records**: company, multiple representatives, multiple products with MOQ
  price breaks, notes/tasks, certifications, photos, fair/booth location, socials.
- **Search and filter** by name, person, product, tag, status, country, type, rating.
- **Share out-of-band**: full database export/import (`.ocv.json.gz`), CSV for
  spreadsheets, and a self-contained single-vendor QR card.
- **Installable PWA** on Linux, Windows, Android, and iOS.

## Privacy and security

- No backend, no accounts, no analytics, no runtime external requests. No webfonts
  are downloaded (system font fallbacks); the only network activity is the service
  worker fetching the app shell.
- User data is stored in IndexedDB and is **never** placed in the service-worker cache.
- React escapes all rendered text; the app never uses `dangerouslySetInnerHTML`, and
  every rendered URL is scheme-checked to `http(s)`/`mailto`/`tel`.
- Imported files are validated (shape, size, record caps, MIME/base64 allowlist) and
  applied transactionally, so a bad file cannot corrupt the database.
- CSV export guards spreadsheet formula injection.
- The production build ships a strict Content-Security-Policy. A meta CSP cannot
  enforce `frame-ancestors`; if your host supports headers, add
  `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY`.

## Stack

React 19 + TypeScript (strict) + Vite 7 + Dexie 4 (IndexedDB) + `qrcode`, with
`vite-plugin-pwa` for the offline shell. Plain CSS with design tokens — no router
library, no state library, no CSS framework. Production dependencies: **5**.

## Getting started

Requires Node 20.19+ or 22.12+ (developed on Node 26) and npm.

```bash
npm install
npm run dev        # local development at http://localhost:5173
```

Other scripts:

```bash
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build locally
npm run lint       # ESLint
npm run typecheck  # tsc -b
npm run test       # Vitest unit tests
npm run test:e2e   # build + Playwright (PWA, offline, capture, share, a11y)
npm run format     # Prettier
```

Gate before every commit: `npm run lint` → `npm run typecheck` → `npm run test`.

Single test runs:

```bash
npx vitest run tests/unit/<file>
npx playwright test tests/e2e/<file>
```

## Deploy

The build is a static site in `dist/` and can be hosted anywhere. Hosting only serves
the app shell; **no data is ever sent there.**

- **Netlify / Cloudflare Pages / Vercel**: build command `npm run build`, publish
  directory `dist`.
- **GitHub Pages**: publish `dist/`. `base` is `./`, so the app works from a project
  subpath.
- **Any static server on the same Wi-Fi** (useful at a fair): `npm run build` then
  serve `dist/` with any file server.

For installability, the site must be served over **HTTPS** (or `localhost`). If the
host supports custom headers, add the framing headers noted above.

## Sharing and backup

- **Export**: Sharing & data → Download export produces
  `opc-vendors-YYYY-MM-DD.ocv.json.gz` containing every record and photo. Import it on
  another device and choose **Merge** or **Replace**.
- **CSV**: export the vendor list for spreadsheets.
- **Single vendor**: open a vendor → Share to get a QR code and a paste-code, plus an
  A6 printable card. Paste the code on another device to add the vendor.
- Photos are only on your device until you choose to export them. Export regularly as
  a backup — browser storage can be evicted by the OS under pressure.

## Project docs

- `plan.md` — scope, phases, acceptance criteria (source of truth)
- `architecture.md` — stack, data model, design system, security, ADRs
- `AGENTS.md` — repository conventions and agent harness notes

## License

MIT — see `LICENSE`.
