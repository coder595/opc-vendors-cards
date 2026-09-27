# Permissions-Policy & HSTS (R10, 2026-09-27)

- The app uses `getUserMedia` for QR scanning (`ImportCardScreen.tsx`), which the
  `camera` policy governs, so it needs `camera=(self)`. Photo capture uses
  `<input capture>`, a file picker that no Permissions-Policy feature gates.
  Source: MDN getUserMedia → Security → Permissions Policy; MDN Permissions-Policy header.
- There is no mic (N9 not approved), no geolocation and no payment, so all three are denied with `()`.
- HSTS: production already sends `strict-transport-security: max-age=63072000`
  (curl -I https://www.skhazaen.com, 2026-09-27). Vercel adds it, so it is not
  duplicated in `vercel.json`.
