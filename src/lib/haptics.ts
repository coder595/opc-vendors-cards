/**
 * Short vibration cues for actions done in a busy hall, phone in one hand. No-op where
 * `navigator.vibrate` is missing (iOS Safari, desktop) and when the user asks for reduced
 * motion. Never throws.
 */
const PATTERNS = {
  /** Saved, deleted, scanned. */
  success: 20,
  /** A save that did not go through: two short buzzes. */
  error: [30, 60, 30],
} satisfies Record<string, VibratePattern>

export type Haptic = keyof typeof PATTERNS

export function haptic(kind: Haptic): void {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    navigator.vibrate(PATTERNS[kind])
  } catch {
    // Some browsers throw when vibrate is blocked (no user activation, iframe policy).
  }
}
