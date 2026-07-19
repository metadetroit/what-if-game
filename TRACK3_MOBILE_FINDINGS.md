# Track 3 Phase 1 — Mobile UX Audit Findings

**Date:** 2026-07-19
**Auditor:** Cascade
**Scope:** Frontend mobile user experience (smartphones + tablets, iOS Safari and Android Chrome)
**Method:** Code review of relevant React components, CSS, hooks, PWA manifest, and HTML meta tags; build and unit-test baseline; no live device screenshots because no device-emulation environment is available in this workspace.

## Baseline (passing)

- `npx vitest run` — **14/14 tests pass**
- `npm run build` — **production build succeeds** (no errors/warnings in build output)
- Backend tests and live health check are not in scope for this frontend/mobile audit.

## Overall Assessment

The codebase already contains substantial mobile-aware infrastructure: viewport meta tags, `dvh`/`svh` viewport units, `env(safe-area-inset-*)`, `touch-action` rules, `clamp()`-based fluid typography for active game screens, and PWA install detection for both iOS and Android. However, several **tap targets, PWA manifest details, input ergonomics, and fallback behaviors** are likely to cause real mobile friction. The issues below are ranked by estimated impact.

## High-Priority Issues

### 1. PWA manifest is missing required icon sizes for Android, and the maskable icon is not separated

**File:** `frontend/public/manifest.json`

The manifest only declares a single 512x512 icon and marks its `purpose` as `"any maskable"`. This means Android Chrome will use the same asset as both a non-maskable launcher icon and a maskable adaptive icon. A maskable icon must have its key content (logo) within a centered 80% safe zone so that Android's dynamic shapes (circle, rounded square, teardrop, etc.) do not clip it. Because `hero-chaos-v3.png` is the same file for both purposes, there is a risk that non-essential artwork or text near the edges will be clipped by the system mask. This is a missing-icon-variant issue, not a confirmed "renders incorrectly" bug — the current asset might render fine on some devices and be clipped on others.

**Recommended fix:**
- Add a 192x192 icon entry for Android launcher/splash screens.
- Split the icon declarations into two entries:
  - `purpose: "any"` for the 512×512 (or 192×192) standard icon.
  - `purpose: "maskable"` for a dedicated maskable icon whose safe zone is verified.
- If a true maskable variant cannot be generated, change the existing entry to `purpose: "any"` only, which is safe but non-adaptive.
- Validate the manifest with a real Android Chrome install prompt check.

### 2. Active-phase textarea may be too short when the mobile keyboard is open

**Files:** `frontend/src/index.css` (`.active-textarea-height`), `frontend/src/components/WritingPhase.jsx`, `frontend/src/components/AnsweringPhase.jsx`

`.active-textarea-height` is `clamp(120px, 22dvh, 180px)`. When the on-screen keyboard opens, `dvh` shrinks, so the textarea can compress toward 120px. On a phone in landscape, this leaves very little room to see what the user is typing, and the submit button may be pushed below the visible area.

**Recommended fix:**
- Use `svh`/`dvh` flex layout with the textarea flexing to available space rather than a fixed `clamp()` height.
- Ensure the submit button remains visible (e.g., fixed bottom bar) or easily reachable without scrolling while the keyboard is open.
- Test on iPhone SE / small Android devices with the keyboard raised.

### 3. Several interactive elements fall below the 44×44 CSS pixel minimum on mobile

**Files:** `frontend/src/index.css` and several components

The following tap targets measure below 44×44 CSS pixels on mobile viewports (< 768px):

| Element | Current size | Location | Measurement basis |
|---------|--------------|----------|-------------------|
| `.lobby-icon-btn` | **40×40 px** | `index.css` (mobile rule) and `LobbyView.jsx` | `w-10 h-10` = 2.5rem × 2.5rem |
| `.lobby-drawer__close` | **44×40 px** (min-width forces width ≥44, but height is 40) | `index.css` | `w-10 h-10` + `min-width: 44px` |
| `.summary-fastest__icon` | **40×40 px** | `index.css` | `w-10 h-10` before `md:w-16` |
| `.summary-slowest__icon` | **40×40 px** | `index.css` | `w-10 h-10` before `md:w-16` |
| `.summary-mvp__icon` | **40×40 px** | `index.css` | `w-10 h-10` before `md:w-16` |
| `.summary-leader__icon` | **40×40 px** | `index.css` | `w-10 h-10` before `md:w-16` |
| `.host-nudge button` | **~32–36 px tall** (no `min-height`) | `index.css` and `WritingPhase.jsx` / `AnsweringPhase.jsx` | `px-3 py-2 text-xs`; height ≈ text line + 0.5rem vertical padding |
| `ScoreboardView.jsx` "Show all players" | **~28–32 px tall** | `ScoreboardView.jsx` | `text-sm py-1 underline`, no `min-h` |
| `ScoreboardView.jsx` "Show Scoring History" | **~28–32 px tall** | `ScoreboardView.jsx` | `text-sm py-1`, no `min-h` |
| `BestOfView.jsx` "← Back" | **~28–32 px tall** | `BestOfView.jsx` | `text-sm` flex link, no `min-h` |

Note: Best-of admin action buttons (`SFW`, `NSFW`, `Delete`, `Reject`) already have `min-h-[44px]` in their JSX, so they are not sub-44.

**Recommended fix:**
- Increase `.lobby-icon-btn`, `.lobby-drawer__close`, and `.summary-*__icon` to `w-11 h-11` (44×44) on mobile, or add `min-h-[44px] min-w-[44px]`.
- Add `min-h-[44px]` to `.host-nudge button` and increase its horizontal padding.
- Add `min-h-[44px]` to Scoreboard disclosure toggles and BestOfView "← Back".
- Ensure all affected elements remain visually balanced after size increases.

### 4. No explicit mobile keyboard action/return-key behavior on inputs

**Files:** `frontend/src/components/WritingPhase.jsx`, `frontend/src/components/AnsweringPhase.jsx`

Both textareas listen for `Enter` to submit, but there is no `inputMode` hint and no clear focus management. On mobile, pressing the virtual "Go" key can sometimes insert a newline rather than submit because the element is a `<textarea>`, and the submit button may be off-screen.

**Recommended fix:**
- Add `enterKeyHint="send"` to both textareas so the virtual keyboard shows a send/go action key.
- Verify that pressing the action key triggers the same handler as `keydown` Enter.
- Consider auto-focusing the textarea when the phase mounts (with `autoFocus`) and managing focus into the error toast on validation failure.

### 5. iOS Wake Lock fallback — not an active bug, scheduled for Phase 4 verification

**File:** `frontend/src/App.jsx` lines 749–784

The wake-lock code already guards the request (`"wakeLock" in navigator`) and `.catch()` failures, and releases the lock when active phases end. No crash or broken behavior was observed during Phase 1 code review. The finding is that this fallback has not yet been exercised on iOS versions below 16.4 (where the API is unsupported) and has not been documented. It is a **test-coverage/note** item, not a confirmed bug. Per the plan, it belongs in Phase 4 (Regression & Verification), not Phase 2.

**Recommended action (Phase 4):**
- Verify on iOS < 16.4 (or by deleting `navigator.wakeLock` in DevTools) that the app continues normally with no user-facing error.
- Document whether a "mid-session API disappearance" test is realistic. If it cannot be simulated, state that explicitly in the Phase 4 report.

## Medium-Priority Issues

### 6. `IOSInstallHelp` instructions may be slightly outdated for iOS 17+

**File:** `frontend/src/components/IOSInstallHelp.jsx`

The modal says: "Tap the Share button in Safari, then choose Add to Home Screen." This is still correct for iOS Safari, but iOS 17+ also supports adding to Home Screen from the "⋮"/actions menu in some contexts. The instructions are acceptable; this is a low risk, but a real-device test should confirm the modal renders correctly and the button is easy to tap.

### 7. Reduced-motion preference is respected, but some animations may still cause discomfort

**File:** `frontend/src/index.css`

A `@media (prefers-reduced-motion: reduce)` block exists and sets animation durations to 0.01ms. This is good. However, `animate-bounce` on the trophy in `TournamentCompleteView.jsx` and `pop-wiggle` on rainbow text are not inside the `.essential-reduced-motion` class set. This means users who prefer reduced motion will still see them unless the media query catches all keyframe usages. Verify that `prefers-reduced-motion` actually disables the trophy bounce and rainbow wiggle.

### 8. `BestOfView` / `UncutBestOfView` admin action buttons are likely too small on mobile

**Files:** `frontend/src/components/BestOfView.jsx`, `frontend/src/components/UncutBestOfView.jsx`

The pending/approved pair cards use small inline text buttons for "SFW", "NSFW", "Delete", "Reject". These need `min-h-[44px]` and adequate spacing to be reliable on touchscreens.

### 9. Social share URL in `LandingPage` points to `playfluke.com`, not the Render domain

**File:** `frontend/src/LandingPage.jsx`

`SHARE_URL = "https://www.playfluke.com"`. If this domain is not configured or is the intended production domain, the share preview/invite may be wrong for the current deployment. This is not purely mobile, but mobile users are most likely to share via the native share sheet.

### 10. Long player names truncate abruptly in the performance phase

**File:** `frontend/src/components/PerformancePhase.jsx`

Reader/watcher name labels use `truncate`, which can cut off long names on narrow screens. Consider a `max-width` or `break-words` strategy with full name available via `title` attribute.

## Low-Priority / Polish

### 11. Missing `inputMode` hints on name and room-code inputs

**File:** `frontend/src/LandingPage.jsx` and `frontend/src/components/LobbyView.jsx`

Player name and room code inputs should have `inputMode="text"` and `autoCapitalize` / `autoComplete` set consistently. Room codes are typically uppercase; consider auto-capitalizing room code input on mobile.

### 12. `lobby-drawer` swipe threshold is one-direction-only

**File:** `frontend/src/components/LobbyView.jsx`

The settings drawer only closes on a downward swipe of >60px. This is acceptable; a left-edge swipe to close (common Android gesture) is not implemented. No fix required unless user feedback indicates confusion.

### 13. `fluke-2024-admin` and other keys are not mobile-specific

The `x-admin-key` prompt on mobile uses the browser's `window.prompt()`, which is functional but basic. No issue found, but a custom modal with larger tap targets would be friendlier if admin use on mobile becomes common.

## Files to Modify in Phase 2 (Confirmed Scope)

1. `frontend/public/manifest.json` — add 192×192 icon entry and split `purpose` into `"any"` and `"maskable"` (or remove `maskable` if no verified maskable asset).
2. `frontend/src/index.css` — increase mobile tap targets for `.lobby-icon-btn`, `.lobby-drawer__close`, `.summary-*__icon`, `.host-nudge button`.
3. `frontend/src/components/WritingPhase.jsx` — add `enterKeyHint="send"` to textarea, increase `.host-nudge` tap target.
4. `frontend/src/components/AnsweringPhase.jsx` — add `enterKeyHint="send"` to textarea, increase `.host-nudge` tap target.
5. `frontend/src/components/ScoreboardView.jsx` — add `min-h-[44px]` to "Show all players" and "Show Scoring History" toggles.
6. `frontend/src/components/BestOfView.jsx` and `UncutBestOfView.jsx` — add `min-h-[44px]` to "← Back" and any admin action buttons missing it.
7. `frontend/src/index.css` — improve `.active-textarea-height` / `.input-field-shell` behavior so the textarea does not collapse when the mobile keyboard opens.

**Not in Phase 2 (Phase 4):** Wake Lock API fallback verification.

## Phase 1 Acceptance Status

The audit is complete and the project is ready to proceed to **Phase 2: Fix Critical Layout & Input Issues**. No code was changed during this phase; the build and tests remain green.

## Note on Device Emulation

No physical devices or browser-based DevTools device emulators were available in this workspace. The findings above are derived from static code analysis plus a passing build/test baseline. Phase 4 should include real-device or BrowserStack verification to confirm the visual and interaction fixes.
