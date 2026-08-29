# Game Audit Findings

Severity: Critical (game-breaking) / High (major flow break) / Medium (data or flow corruption) / Low (minor).

## A. Backend state machine

### A-1 [High] Mid-game host disconnect never transfers host
- Location: `backend/server.js` `ensureHost` (601-631), disconnect handler (3416-3426), in-game grace timeout (3504-3546)
- What happens: `ensureHost` returns false while the original host is still in `game.players` (inactive). The disconnect handler sets `player.isHost = false` then calls `ensureHost`, which finds the original host still present and returns false. The 180s grace timeout removes the player but never calls `ensureHost`. Result: `game.host` points to a dead socket forever; no player has `isHost`. Host controls (force-progress, finish-voting, next-round, kick, disband) are unusable for the rest of the game. In classic mode a stuck player permanently stalls the game.
- Repro: host closes tab mid-writing; wait 3+ min; remaining players can never force-advance.
- Proposed fix: in the in-game grace timeout, after `removePlayerFromGame`, call `ensureHost(roomCode)` and emit `host-changed` (mirror the lobby path at 3386-3394).

### A-2 [High] Host disconnects in lobby, game starts without them, host never transferred
- Location: `backend/server.js` `start-game` (869-870), lobby grace timeout (3369-3397)
- What happens: `start-game` sets `game.players = activePlayers`, dropping the disconnected host, but `game.host` still points to their socket id. The lobby grace timeout later finds the player no longer in the array and skips host transfer. Host controls broken for the whole game.
- Repro: host creates room, disconnects, another player starts the game.
- Proposed fix: in `start-game`, after filtering players, if `game.host` is not among active players, call `ensureHost(roomCode)` and emit `host-changed`.

### A-3 [Medium] Stuck in scoreboard when too few players remain
- Location: `backend/server.js` `advanceRound` (2091-2130)
- What happens: `advanceRound` clears `game.scoreboardTimer` first, then if `getPlayingPlayersCount(game) < 3` emits an error and returns. The timer is gone and manual `next-round` hits the same check, so the room is permanently stuck in scoreboard.
- Proposed fix: when returning early, re-arm the scoreboard timer (e.g. 20s) so the check re-runs, or transition to tournament_complete.

### A-4 [Low] Submission flag set before DB write; DB failure blocks resubmission
- Location: `submit-question` (1058), `submit-answer` (1328)
- What happens: `hasSubmittedQuestion`/`hasSubmittedAnswer` are set true before the awaited DB insert. If the insert throws, the player is permanently blocked (question path also has no try/catch → unhandled rejection).
- Proposed fix: set the flag only after the DB write succeeds; wrap question DB write in try/catch like submit-answer.

### A-5 [Low] `disbandIfBelowMinimum` ignores voting phase
- Location: `backend/server.js` (635-661)
- What happens: if all players disconnect during tournament voting, the room survives with 0 active players until timers finish; nothing cleans it up.
- Proposed fix: add a voting-phase check (minimum 1) or disband when active count is 0 in any phase.

### A-6 [Low] `reading-complete` has no double-fire guard
- Location: `backend/server.js` (1863-1898)
- What happens: two rapid clicks (or two devices) increment `currentReaderIndex` twice, skipping a turn.
- Proposed fix: track `game.lastAdvancedTurn` and ignore duplicate advances for the same index.

## B. Player lifecycle & reconnection

### B-1 [Medium] Reconnect sets submission flags before migrating state
- Location: `backend/server.js` `reconnect-player` (2939-2941 vs 2953-2971)
- What happens: `player.hasSubmittedQuestion = !!game.questions[socket.id]` runs before the old-socket-id state is migrated to the new id, so the flag is always false after reconnect. A reconnected player can submit a second question/answer, overwriting `game.questions[socket.id]` and inserting duplicate DB rows (orphaned old rows, duplicate qa_pairs).
- Proposed fix: move the flag restoration after the migration block (after line 2971).

### B-2 [Low] Room capacity counts inactive players
- Location: `backend/server.js` `join-room` (793)
- What happens: `game.players.length >= 15` includes players in their 180s grace window, blocking new joins.
- Proposed fix: count only `p.isActive` players.

## C. Voting & scoring

### C-1 [Medium] Summary pairs matched by text, not id
- Location: `backend/server.js` `buildGameSummary` (1417-1419, 1462-1463)
- What happens: `game.questions`/`game.answers` lookups use `q.text === turn.question`. Two players submitting identical text can pair the wrong author's dbId, misattributing qa_pairs rows and Best Of authors.
- Proposed fix: store and use `questionDbId`/`actualAnswerDbId`/`pairedAnswerDbId` from `turnLog` (already present) instead of text matching.

### C-2 [Low] `closeVotingAndTally` has no error handling
- Location: `backend/server.js` (1954-2088)
- What happens: a DB error mid-tally leaves `game.phase = 'tallying'` forever; no timer or host action can recover.
- Proposed fix: wrap in try/catch; on error, restore phase to 'voting' and re-arm the timer, or emit an error and end the round.

### C-3 [Low] Classic-mode votes have no phase guard
- Location: `backend/server.js` `submit-vote` (2298-2304)
- What happens: the phase guard only applies when tournament is enabled. In classic mode a client can vote during writing/answering/performing, inflating Best Of counts.
- Proposed fix: require `game.phase === 'ended'` when no tournament is active.

## D. Persistence & data

### D-1 [Low] `lastInsertRowid` is a shared mutable field on the wrapper
- Location: `backend/database.js` (6, 15-23, 41-47)
- What happens: `DbWrapper` instances share module-level `lastInsertRowid`; two concurrent inserts (e.g. question + answer) can read each other's rowid via `SELECT last_insert_rowid()`. Turso is single-writer per connection but the wrapper is recreated per call, so interleaving is possible.
- Proposed fix: make `lastInsertRowid` an instance field on `DbWrapper`.

## E. Frontend state sync

### E-1 [Low] `game-ended` payload lacks `anonymousMode`; fallback always false
- Location: `backend/server.js` (1730-1739), `frontend/src/hooks/useSocketEvents.js` (351)
- What happens: `applySummaryData` is called with `false`, but per-pair `anonymousMode` from the summary covers the UI. Only affects the fallback when pairs lack the field.
- Proposed fix: include `anonymousMode` in the `game-ended` payload.

### E-2 [Low] `scoreboard` handler overwrites tournament state
- Location: `frontend/src/hooks/useSocketEvents.js` (410-414)
- What happens: `setTournament({ enabled, currentRound, targetRounds })` drops `votingDeadlineAt`/`serverNow`; harmless today but fragile.
- Proposed fix: merge with previous state.

## F. Security

### F-1 [Low] Admin key comparison is not constant-time
- Location: `backend/server.js` `requireAdmin` (37)
- What happens: `!==` comparison leaks timing; low practical risk on Render.
- Proposed fix: use `crypto.timingSafeEqual` on hashed buffers.

### F-2 [Low] Connection rate limit keyed by socket id
- Location: `backend/server.js` (707, 772)
- What happens: a new socket id per reconnect bypasses the 3s create/join cooldown.
- Proposed fix: key by IP (`socket.handshake.address`) instead.

### F-3 [Info] No XSS sinks found
- `dangerouslySetInnerHTML`/`innerHTML` are absent from `frontend/src`; React escapes all player content. No action needed.

## G. Mobile / PWA

### G-1 [Info] No game-breaking mobile issues found
- Safe-area insets, `h-dvh`, wake lock, and visibility-based presence revalidation are present. Sound uses Web Audio with resume-on-gesture handling. No action needed.

## H. Custom domain (playfluke.com) audit

### H-1 [High risk — verify on Render dashboard] `CORS_ORIGIN` must include the custom domain on the RUNNING service
- Location: `backend/server.js` `corsOriginCallback` (20-25), Socket.IO CORS (467-471), `render.yaml` (11-12)
- What happens: both Express and Socket.IO reject any request whose `Origin` header is not in `CORS_ORIGIN`. Browsers send `Origin: https://playfluke.com` even for same-origin WebSocket handshakes. If the custom domain was added in the Render dashboard but the `CORS_ORIGIN` env var on the running service was not updated (render.yaml only applies on Blueprint deploys), every socket connection and API call from playfluke.com fails with a CORS error. Symptom: page loads (static files are same-origin) but the app shows "Not connected to server" and nothing works.
- Action: in the Render dashboard, set `CORS_ORIGIN` to `https://playfluke.com,https://www.playfluke.com` (render.yaml updated accordingly). Optionally keep `https://what-if-game-v2.onrender.com` if the old URL should still work.

### H-2 [Medium] `www.playfluke.com` was not in CORS_ORIGIN
- If Render serves the www subdomain (or users type it), the Origin header is `https://www.playfluke.com` and every request is rejected. Fixed in `render.yaml`; sync the dashboard env var.

### H-3 [Low] Old onrender.com origin removed from CORS_ORIGIN
- Anyone using the old `https://what-if-game-v2.onrender.com` URL now gets CORS rejections. Intentional if the custom domain replaces it; add it back to the list if both should work.

### H-4 [Info] Frontend socket URL follows the domain automatically
- `SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin` (`frontend/src/App.jsx:35`). The Render build does not set `VITE_SOCKET_URL`, so the custom domain works without a rebuild. `frontend/.env.example:5` has a stale commented example; harmless.

### H-5 [Low] `og:image` is relative in `frontend/index.html:19`
- Social scrapers (Facebook/Twitter) need absolute image URLs; sharing from playfluke.com shows no preview image. Change to `https://playfluke.com/hero-chaos-v3.png`.

### H-6 [Info] No service worker, PWA manifest uses relative paths
- No caching pitfalls on the custom domain. `trust proxy = 1` is correct behind Render's proxy, so rate limiting still keys on real client IPs.

## Priority order for fixes
1. A-1, A-2 (host transfer) — High — FIXED
2. B-1 (reconnect submission flags) — Medium — FIXED
3. H-1/H-2 (CORS_ORIGIN on running service) — High risk — verify dashboard
4. A-3 (stuck scoreboard) — Medium
5. C-1 (text-matched pairs) — Medium
6. A-4, A-5, A-6, B-2, C-2, C-3, D-1, E-1, E-2, F-1, F-2, H-3, H-5 — Low
