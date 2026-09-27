# R18 thumb-zone audit (hallmark audit, 2026-09-27)

Scope: phone layout (< desktop breakpoint), the primary capture action and the bottom nav.
Audit only. No code or `tokens.css` changes.

## Major

- **Primary action outside the thumb zone.** `src/App.tsx` (appbar `form-head__actions`)
  and `src/styles/base.css` (`.appbar`, sticky top). "Add vendor" and "Quick add" sit in the
  top-right corner, the hardest one-handed reach on a 6"+ phone. The bottom bar
  (`.nav`, fixed, 4 columns) holds navigation only. At a fair the capture action is used
  far more often than navigation.
  *Fix:* anchor one capture action at the bottom right, above `.nav` (a floating button
  offset by `var(--tap)` + `env(safe-area-inset-bottom)`, reusing `.btn--primary` tokens),
  or as a centre slot in `.nav`. Keep the appbar buttons on the desktop layout only.
  *Decision needed:* which action goes there. Quick add is the fair-speed flow (M3) and
  arguably the one people reach for most.

## Minor

- **Colour-only active tab.** `.nav__item[aria-current='page']` changes only `color`.
  `aria-current` covers screen readers, but sighted users get no second cue (WCAG 1.4.1).
  *Fix:* add weight or a top rule using an existing token.
- **Crowded appbar at 320 px.** The wordmark and its subline sit next to two buttons in a 56 px
  bar, so the button labels risk wrapping to two lines (slop gate 49). *Fix:* this goes away once
  the capture action moves down. Otherwise verify at 320 px.

## Holds up

- The appbar actions are hidden on form routes, so there is no competing CTA mid-capture.
- The nav respects `safe-area-inset-bottom`, and `.main` bottom padding clears the fixed bar.
- Tap targets use `--tap`. The design language and tokens need no change.

0 critical · 1 major · 2 minor
