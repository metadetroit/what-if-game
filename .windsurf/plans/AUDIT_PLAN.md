# Fluke! — Comprehensive Game Audit Plan

> **Purpose:** This document specifies how every element of the game **should** work. Another LLM should use this as a reference to audit the current implementation and identify deviations or bugs.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Public Pages](#2-public-pages)
3. [Lobby Phase](#3-lobby-phase)
4. [Writing Phase](#4-writing-phase)
5. [Answering Phase](#5-answering-phase)
6. [Performance Phase](#6-performance-phase)
7. [Summary / Ended Phase (Classic Mode)](#7-summary--ended-phase-classic-mode)
8. [Tournament Mode](#8-tournament-mode)
9. [Scoring Engine](#9-scoring-engine)
10. [Voting System](#10-voting-system)
11. [Reactions](#11-reactions)
12. [Reconnection & Disconnect Logic](#12-reconnection--disconnect-logic)
13. [Host Controls & Admin Tools](#13-host-controls--admin-tools)
14. [Database Schema & Persistence](#14-database-schema--persistence)
15. [Best Of Content Pipeline](#15-best-of-content-pipeline)
16. [Weekly Best Of Job](#16-weekly-best-of-job)
17. [Socket.IO Event Reference](#17-socketio-event-reference)
18. [REST API Reference](#18-rest-api-reference)
19. [Rate Limiting](#19-rate-limiting)
20. [Frontend State Management](#20-frontend-state-management)

---

## 1. Architecture Overview

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React + Vite + Tailwind CSS | SPA, served from `frontend/dist` |
| Backend | Express + Socket.IO + Node.js | Single `server.js` file (~3380 lines) |
| Database | Turso (libSQL) in prod, in-memory SQLite in tests | Abstraction in `database.js` |
| Real-time | Socket.IO | All game state sync via events |
| Game State | In-memory `games` object | Keyed by 4-digit room code |

### Key Files

| File | Purpose |
|------|---------|
| `backend/server.js` | Express server, Socket.IO handlers, all game logic |
| `backend/tournament.js` | Pure scoring functions (`calculateRoundPoints`, `mergeRoundScores`, `resolveStandings`) |
| `backend/database.js` | DB init, schema, connection abstraction |
| `backend/weekly-best-of.js` | Standalone CLI script for weekly content summaries |
| `frontend/src/App.jsx` | Main React component, state management, phase routing |
| `frontend/src/hooks/useSocketEvents.js` | Centralized Socket.IO event handlers |
| `frontend/src/components/LobbyView.jsx` | Lobby UI with settings drawer |
| `frontend/src/components/WritingPhase.jsx` | Phase 1 UI |
| `frontend/src/components/AnsweringPhase.jsx` | Phase 2 UI |
| `frontend/src/components/PerformancePhase.jsx` | Phase 3 UI |
| `frontend/src/components/SummaryPhase.jsx` | End-of-game summary (classic + tournament voting) |
| `frontend/src/components/ScoreboardView.jsx` | Tournament round scoreboard |
| `frontend/src/components/TournamentCompleteView.jsx` | Tournament final standings |
| `frontend/src/components/BestOfView.jsx` | Best Of public page |
| `frontend/src/components/UncutBestOfView.jsx` | Uncut Best Of (SFW + NSFW) page |
| `frontend/src/LandingPage.jsx` | Welcome/landing page with "Fluke It" button |

### Game Phase State Machine

```
lobby → writing → answering → performing → ended (classic)
                                      ↓ (tournament)
                                    voting → tallying → scoreboard → (next round | tournament_complete)
```

**Phase minimums (active playing players):**
- `writing`: 3
- `answering`: 2
- `performing`: 2
- Below minimum → `game-disbanded` event, room deleted

---

## 2. Public Pages

### 2.1 Landing Page (`LandingPage.jsx`)

| Element | Expected Behavior |
|---------|-------------------|
| Name input | Text field, max 20 chars (truncated server-side) |
| Room code input | 4-digit numeric code |
| "Create Game" button | Emits `create-room` with playerName, receives roomCode, transitions to lobby |
| "Join Game" button | Emits `join-room` with roomCode + playerName, transitions to lobby |
| "Fluke It" button | Fetches `/api/random-pairs?count=8`, displays random Q&A pairs from approved SFW content |
| Banner image | Loads `/hero-chaos-v3.png` with fallback |
| PWA install | Shows install link if PWA installable; iOS shows special instructions |
| URL param `?room=XXXX` | Auto-fills room code input |
| Scroll sections | "live" and "play" sections with IntersectionObserver reveal animations |

### 2.2 Best Of Page (`BestOfView.jsx`)

| Element | Expected Behavior |
|---------|-------------------|
| Data source | `GET /api/best-of` — returns approved SFW content only |
| Content types | `qa_pair`, `question`, `answer` |
| Sort options | `votes` (default, by vote_count DESC) or `newest` (by created_at DESC) |
| Pagination | Limit 50, offset-based, infinite scroll via sentinel |
| Admin mode | Toggle with admin key input; shows approve/delete buttons |
| Admin actions (pending view) | Approve SFW, Approve NSFW, Reject (hide) |
| Admin actions (approved view) | Delete (hide), copy link |
| Copy link | Copies `playfluke.com?pair={id}` to clipboard |
| Q&A pairs filter | Only shows `is_approved=1` AND `is_nsfw=0` pairs |
| Questions/Answers | Shows items with `vote_count >= 1` and not hidden |

### 2.3 Uncut Best Of Page (`UncutBestOfView.jsx`)

| Element | Expected Behavior |
|---------|-------------------|
| Data source | `GET /api/best-of-uncut` — returns approved content (SFW + NSFW) |
| Content types | `qa_pair` only |
| Sort options | `votes` or `newest`, persisted in sessionStorage |
| Admin actions | Delete pair (permanent DELETE), copy link |
| Copy link | Copies `playfluke.com/fword?pair={id}` to clipboard |
| NSFW badge | Items with `is_nsfw=true` should display a visual indicator |

### 2.4 Help Page (`HelpPage.jsx`)

| Tab | Content |
|-----|---------|
| How Fluke Works | 6-step numbered list explaining the game loop |
| FAQ | Common questions about game mechanics |
| Tips | Strategy tips for playing |
| About | Game description, tech credits |

### 2.5 Support Page (`SupportPage.jsx`)

Should provide contact/support information and link back to the app.

### 2.6 Age Gate (`AgeGate.jsx`)

Should display an age confirmation for the Uncut/NSFW content page before proceeding.

---

## 3. Lobby Phase

### 3.1 Room Creation & Joining

| Action | Socket Event | Validation |
|--------|-------------|------------|
| Create room | `create-room` (playerName) | Name non-empty, 3s cooldown per socket, generates unique 4-digit code |
| Join room | `join-room` (roomCode, playerName) | Room exists, phase is `lobby`, name not duplicate, ≤15 players, 3s cooldown |
| Late join (tournament) | `join-room` | If tournament active, joins as `spectator` |

### 3.2 Lobby UI

| Element | Expected Behavior |
|---------|-------------------|
| Room code pill | Displays 4-digit code, click to copy invite link (`playfluke.com?room=XXXX`) |
| Player list | Shows all active players with badges (you, Host, Spectator, Reconnecting, Disconnected) |
| Player count | `{count}/15` |
| Start button (host) | Disabled if < 3 playing players; shows "Need N more..." |
| Waiting indicator (non-host) | "Waiting for host to start..." |
| Settings gear | Opens `GameSettingsDrawer` |
| Kick button (host) | Opens kick confirm modal, emits `host-kick-player` |
| Spectator toggle (host) | Toggles player role between `player` and `spectator` |
| Host transfer toast | Shows when host changes (3s display) |

### 3.3 Game Settings Drawer

| Setting | Scope | Default | Socket Event |
|---------|-------|---------|-------------|
| Sound Effects | Per-client | On | Local state only |
| Pre-fill "What if..." | Per-client | Off | Local state only |
| Anonymous Mode | Host only, lobby | Off | `toggle-anonymous` |
| No Self-Reading | Host only, lobby | Off | `update-lobby-settings` |
| Tournament Mode | Host only, lobby | Off | `update-lobby-settings` |
| Rounds slider | Host, tournament enabled | 3 (1-10) | `update-lobby-settings` |
| Voting Timer | Host, tournament enabled | 60s (30/60/90) | `update-lobby-settings` |
| Blitz Mode (speed scoring) | Host, tournament enabled | Off | `update-lobby-settings` |

### 3.4 Lobby Settings Broadcast

`broadcastLobbySettings(roomCode, game)` emits `lobby-settings` event with:
```json
{
  "anonymousMode": false,
  "noSelfReading": false,
  "tournamentConfig": {
    "enabled": false,
    "targetRounds": 3,
    "votingTimerSeconds": 60,
    "speedScoringEnabled": false
  }
}
```

### 3.5 Lobby Status Badge

Shows active settings as dot-separated string: `"Anonymous · No Self-Reading · 3 Rounds · 60s · BLITZ"`

### 3.6 Disconnect in Lobby

- Player marked `isActive = false`, 180s grace period
- `player-disconnected` event emitted with `gracePeriod: 180`
- After 180s: permanent removal, host transfer if needed
- Disconnected players filtered out when game starts

---

## 4. Writing Phase

### 4.1 Server-Side

| Step | Behavior |
|------|----------|
| Phase entry | `game.phase = 'writing'`, `writingPhaseStartedAt = Date.now()`, reset submission flags |
| Question submission | `submit-question` event → validate non-empty, ≤500 chars, phase is `writing`, player is active non-spectator, not duplicate |
| DB persist | INSERT into `questions` table with `game_id`, `text`, `author_id`, `author_name`, `vote_count=0`, `anonymous` |
| First/last submitter tracking | `firstQuestionSubmitter` set once, `lastQuestionSubmitter` always updated |
| Progress | `progress-update` event with `{submitted, total, playerStatuses, firstSubmitter}` |
| Auto-advance | When all playing players have submitted → `distributeQuestions()` |
| Distribution | Shuffle player IDs, ensure no one gets own question (100 attempts), assign via `questionAssignments` |
| Phase transition | `game.phase = 'answering'`, `answeringPhaseStartedAt = Date.now()`, emit `answer-phase` to each player with their assigned question |

### 4.2 Client-Side (`WritingPhase.jsx`)

| Element | Expected Behavior |
|---------|-------------------|
| Phase banner | "Phase 1 · Question Time" |
| Anonymous banner | Shows "🔒 This round is anonymized!" if `anonymousMode` is on |
| Blitz badge | ⚡ BLITZ indicator top-right if `speedScoringEnabled` |
| Textarea | Max 300 chars (client), 500 chars (server), must start with "What if" |
| Validation | Submit button disabled if empty or doesn't start with "What if" |
| Char counter | `{length}/300` |
| Error display | Red banner for server errors |
| Submit button | Emits `submit-question`, transitions to "Submitted!" state |
| Progress bar | Shows `{submitted}/{total}` with color change when 1 player remaining |
| Force advance (host) | "⚡ Force Advance" button with confirmation modal; removes non-submitters |
| Waiting panel | Shows `renderWaitingPanel('writing')` after submission |
| Draft saving | `saveDraft(roomCode, "writing", value)` on every keystroke |

### 4.3 Force Advance (Writing)

- Host must have submitted their own question first
- Requires ≥3 submissions to advance
- Non-submitters are permanently removed (`removePlayerFromGame`)
- Kicked players receive `kicked-from-game` event
- If <2 active players would remain → disband room instead

---

## 5. Answering Phase

### 5.1 Server-Side

| Step | Behavior |
|------|----------|
| Question distribution | Each player receives someone else's question via `answer-phase` event |
| Answer submission | `submit-answer` event → validate non-empty, ≤500 chars, phase is `answering`, player has assignment, not duplicate |
| DB persist | INSERT into `answers` table |
| First/last submitter | `firstAnswerSubmitter`, `lastAnswerSubmitter` tracked |
| Auto-advance | When all playing players submitted → `preparePerformancePhase()` |
| Transition guard | `game.isTransitioning = true` during phase transition to prevent race conditions |

### 5.2 Client-Side (`AnsweringPhase.jsx`)

| Element | Expected Behavior |
|---------|-------------------|
| Phase banner | "Phase 2 · Answer this question" |
| Question card | Displays assigned question in highlighted card |
| Textarea | Max 400 chars (client), 500 chars (server) |
| Char counter | `{length}/400 characters` |
| Submit button | Emits `submit-answer`, transitions to "Answer Submitted!" state |
| Progress bar | Same pattern as writing phase |
| Force advance (host) | Same pattern; requires ≥2 answers |
| Draft saving | `saveDraft(roomCode, "answering", value)` on every keystroke |

### 5.3 Force Advance (Answering)

- Host must have submitted their own answer first
- Requires ≥2 answers to advance
- Non-answerers permanently removed
- If <2 active players would remain → disband

---

## 6. Performance Phase

### 6.1 Preparation (`preparePerformancePhase`)

| Step | Behavior |
|------|----------|
| Player order | `shuffleArray` of playing player IDs → `game.playerOrder` |
| Card creation | For each player: card = {question: their received question, answer: their answer, playerId, playerName} |
| DB persist | INSERT Q&A pairs into `qa_pairs` table |
| Card assignment | Shuffle cards; if `noSelfReading`, filter out cards where player authored Q or A; fallback to any card |
| Phase transition | `game.phase = 'performing'`, `currentReaderIndex = 0`, `turnLog = []` |
| Broadcast | `performance-phase` event with `totalRounds = playerIds.length * 2` |
| Start delay | 2-second `setTimeout` before first `startNextReading()` |

### 6.2 Reading Chain (`startNextReading`)

The reading chain follows a **zigzag pattern**:

```
Turn 0 (Q): Player[0] reads Question → Player[1] is next
Turn 1 (A): Player[1] reads Answer → Player[1] reads Question next
Turn 2 (Q): Player[1] reads Question → Player[2] is next
Turn 3 (A): Player[2] reads Answer → Player[2] reads Question next
...
```

**Formula:**
- Even turn (question turn): `questionReader = playerIds[turnIndex / 2]`, `answerReader = playerIds[(turnIndex / 2 + 1) % length]`
- Odd turn (answer turn): `answerReader = playerIds[((turnIndex + 1) / 2) % length]`, `questionReader = playerIds[((turnIndex + 1) / 2 - 1 + length) % length]`

**Turn log entry:**
- Question turn: records `question`, `questionAuthor`, `questionAuthorId`, `questionDbId`, `actualAnswer`, `actualAnswerAuthor`, `actualAnswerAuthorId`, `actualAnswerDbId`
- Answer turn: records `pairedAnswer`, `pairedAnswerAuthor`, `pairedAnswerAuthorId`, `pairedAnswerDbId`

**Skip conditions:**
- If required reader is disconnected/inactive → skip turn, increment index, recurse via `setImmediate`
- If card assignment missing → skip turn

**Broadcast:** `reading-turn` event with:
```json
{
  "questionReader": { "id", "name" },
  "answerReader": { "id", "name" },
  "question": "text or null",
  "answer": "text or null",
  "questionDbId": "number or null",
  "answerDbId": "number or null",
  "currentContentDbId": "number",
  "currentContentAuthorId": "string",
  "currentContentType": "question" | "answer",
  "round": currentReaderIndex + 1,
  "total": totalTurns,
  "isQuestionTurn": boolean
}
```

### 6.3 Reading Complete

- `reading-complete` event from the current reader
- Server validates `socket.id === expectedReaderId`
- Increments `currentReaderIndex`, calls `startNextReading()`
- When all turns complete → `buildGameSummary()` → emit `game-ended` (classic) or enter voting (tournament)

### 6.4 Host Controls During Performance

| Control | Event | Behavior |
|---------|-------|----------|
| Repeat | `rewind-performance` | Decrements `currentReaderIndex`, pops `turnLog` entry, re-emits turn |
| Skip | `force-progress` (performing) | Increments `currentReaderIndex`, calls `startNextReading()` |

### 6.5 Client-Side (`PerformancePhase.jsx`)

| Role | Display |
|------|---------|
| Question reader (their turn) | Green "READ QUESTION" banner + question text in green card + "Done Reading →" button |
| Question reader (not their turn) | Gray "WAITING" banner showing who's reading the answer |
| Answer reader (waiting for Q) | Purple "GET READY" banner + "{name} is reading the question to you" |
| Answer reader (their turn) | Purple "READ ANSWER" banner + answer text in purple card + "Done Reading →" button |
| Spectator/other | Shows "Q reader → A reader" with current phase ("Question being read" / "Answer being read") |

**Progress indicator:** Dots for each turn, filled for completed, pulsing for current.

**Reaction bar:** ❤️ 😂 ❓ buttons (see Reactions section).

---

## 7. Summary / Ended Phase (Classic Mode)

### 7.1 Server-Side

| Step | Behavior |
|------|----------|
| Build summary | `buildGameSummary()` constructs Q&A pairs from `turnLog` |
| Pair persistence | Ensures `qa_pairs` row exists for each performed (Q + paired A) combo |
| Vote counts | Fetches existing vote_count from DB for each pair |
| Awards computation | `computeMostAdoredWriter()` — counts ❤️ + 😂 reactions per author |
| Broadcast | `game-ended` event with summary, votersCount, first/last submitters, mostAdoredWriter |
| Phase | `game.phase = 'ended'` |

### 7.2 `game-ended` Event Payload

```json
{
  "message": "Thanks for playing!",
  "summary": [{
    "question": "text",
    "questionAuthorName": "name",
    "questionDbId": "id",
    "actualAnswer": "text",
    "actualAnswerAuthorName": "name",
    "actualAnswerDbId": "id",
    "pairedAnswer": "text",
    "pairedAnswerAuthorName": "name",
    "pairDbId": "id",
    "voteCount": 0,
    "anonymousMode": false,
    "questionReactions": {},
    "answerReactions": {}
  }],
  "votersCount": 0,
  "firstQuestionSubmitter": "name",
  "firstAnswerSubmitter": "name",
  "lastQuestionSubmitter": "name",
  "lastAnswerSubmitter": "name",
  "mostAdoredWriter": { "names": ["name"], "total": 5, "tied": false }
}
```

### 7.3 Client-Side (`SummaryPhase.jsx`)

| Element | Expected Behavior |
|---------|-------------------|
| Header | Compact single-row with game title and round info |
| View mode toggles | "Pairs" / "List" view modes |
| Q&A pair cards | Shows question, answer, authors (or "???" if anonymous), vote button, reaction counts |
| Voting | Click pair to vote (toggle), single vote per player for `qa_pair` type |
| Author reveals | Toggled by host; shows/hides real author names |
| Awards section | Inline row showing fastestTyper, slowestTyper, mostAdoredWriter (alphabetical sort for ties) |
| Host controls | "Replay" button, "New game" button, anonymous results toggle, no-self-reading toggle |
| Guest controls | "Abandon game" button |
| Copy summary | Button to copy game summary as text |
| Round history | Expandable section showing past round summaries (tournament) |

### 7.4 Replay (`replay-game`)

| Condition | Behavior |
|-----------|----------|
| All players present | Reset game state, preserve `lastQuestionSubmitter`, clear votes, emit `game-restarted` |
| Any player missing | Disband room, emit `game-disbanded` |
| During tournament | Blocked — must use `next-round` or `new-tournament` |

### 7.5 New Game / Leave

| Action | Event | Behavior |
|--------|-------|----------|
| Leave room | `leave-room` | Remove player, transfer host if needed, disband if below minimum |
| Abandon (from summary) | `player-abandon` | Permanently remove player, transfer host, disband check |

---

## 8. Tournament Mode

### 8.1 Tournament Initialization

When host starts game with `tournamentConfig.enabled = true`:
```javascript
game.tournament = {
  enabled: true,
  targetRounds: 1-10,
  votingTimerSeconds: 30|60|90,
  speedScoringEnabled: boolean,
  currentRound: 1,
  scores: {},         // player name → {total, roundScores[], firstPlaces, votesReceived, joinedAtRound, leftGame, roundSpeedBonuses}
  pendingPromotions: [],
  roundSettings: {},
  status: 'active'
}
```

### 8.2 Tournament Phases

| Phase | Entry Condition | Duration | Exit Condition |
|-------|----------------|----------|----------------|
| voting | After performance complete | `votingTimerSeconds` (timer) or all voted | `closeVotingAndTally()` |
| tallying | Voting closed | Instant | Scores calculated |
| scoreboard | Tally complete | 20s (timer) or host advance | `advanceRound()` |
| tournament_complete | Final round scoreboard expires | — | Host starts new tournament |

### 8.3 Voting Phase

- Author names masked to `???` in summary during voting
- `game-ended` event emitted with `tournament` field containing `votingDeadlineAt` and `serverNow`
- Server-side timer: `setTimeout(() => closeVotingAndTally('timer'), votingMs)`
- Auto-close: when all active players have voted
- Host manual close: `finish-voting` event

### 8.4 Scoreboard Phase

- `scoreboard` event with standings, roundWinnerDetails, speedDetails, full summary (unmasked), authorsReveal
- 20-second server-side timer
- Host can manually advance: `next-round` event
- Shows: standings table, round winner details (pair, authors, votes, points breakdown), speed details

### 8.5 Round Advancement (`advanceRound`)

| Step | Behavior |
|------|----------|
| Idempotent guard | Only if `game.phase === 'scoreboard'` |
| Final round check | If `currentRound >= targetRounds` → `tournament_complete` |
| Promote spectators | Apply `pendingPromotions` (spectator → player) |
| Player count check | If <3 playing players → error, stay in scoreboard |
| Increment round | `currentRound++` |
| Reset state | Clear questions, answers, assignments, cards, turnLog, votes |
| Clear votes | `DELETE FROM votes WHERE game_id = ?` |
| Broadcast | `game-restarted` with tournament round info |

### 8.6 Tournament Complete

- `tournament-complete` event with `{champions, isTie, standings}`
- Champions: all players with `rank === 1`
- `isTie`: `champions.length > 1`
- Host can: start new tournament (`new-tournament` event)
- New tournament: reset scores, keep players, go to lobby

### 8.7 Late Joiners & Spectators

- Can join as `spectator` during active tournament
- Host can promote via `promote-player` → added to `pendingPromotions`
- Promotion takes effect at next `advanceRound`
- Spectators cannot submit questions/answers, vote, or react

### 8.8 Left-Game Handling

- When a player is permanently removed, their `tournament.scores[name].leftGame = true`
- `leftGame` players cannot be champions (sorted last in tie-breaker)
- `leftGame` is a tie-breaker criterion in `resolveStandings`

---

## 9. Scoring Engine (`tournament.js`)

### 9.1 `calculateRoundPoints(pairs, votesByPair, settings)`

**Input:**
- `pairs`: `[{pairDbId, questionAuthor, answerAuthor}]`
- `votesByPair`: `{pairDbId: voteCount}`
- `settings`: `{speedScoringEnabled, speedData: {questionTimes, answerTimes, activePlayerCount}}`

**Scoring Rules:**

| Scenario | Points Awarded |
|----------|---------------|
| Each vote on a pair (different Q/A authors) | +1 to Q author, +1 to A author |
| Each vote on a fluke pair (same Q/A author) | +2 to that author (1+1 since same) |
| Winning pair (most votes, ties allowed) | +2 to Q author, +2 to A author |
| Fluke win (same author Q+A, winning pair) | +3 fluke bonus on top of vote + win bonus |
| Non-winning fluke pair | 2 pts per vote (1+1) |
| Zero-vote round | No winner, no bonus |

**Speed Scoring (Blitz Mode):**

| Award | Condition | Points |
|-------|-----------|--------|
| Fastest Q author | Single fastest question submission | +1 |
| Fastest A author | Single fastest answer submission | +1 |
| Slowest Q author | ≥4 active players AND slowest >20s AND ≥2 submissions | -1 |
| Slowest A author | ≥4 active players AND slowest >20s AND ≥2 submissions | -1 |

**Constants:**
- `SLOWEST_MIN_PLAYERS = 4`
- `SLOWEST_THRESHOLD_MS = 20000` (20 seconds)

**Output:**
```javascript
{
  scores: { "name": points },
  winningPairIds: [],
  firstPlaceAuthors: [],
  votesReceived: { "name": voteCount },
  roundWinnerDetails: [{
    pairDbId, questionAuthor, answerAuthor, isFluke, votes,
    pointsBreakdown: { base, speed }
  }],
  speedDetails: {
    fastestQ, fastestA, slowestQ, slowestA,
    speedBonuses: { "name": bonusPoints }
  }
}
```

### 9.2 `mergeRoundScores(tournamentScores, roundResult, roundNumber)`

Merges a round's results into persistent tournament scores:
- `total += points`
- `roundScores[roundNumber - 1] = points`
- `roundSpeedBonuses[roundNumber - 1] = speedBonuses[name] || 0`
- `firstPlaces++` if in `roundResult.firstPlaceAuthors`
- `votesReceived += v`
- Creates new entry if player doesn't exist with `joinedAtRound = roundNumber`

### 9.3 `resolveStandings(tournamentScores)`

**Tie-breaker cascade:**
1. **total** (descending)
2. **firstPlaces** (descending)
3. **votesReceived** (descending)
4. **leftGame** (false before true)
5. Co-champions if all criteria equal

**Output:**
```javascript
{
  champions: ["name"],
  isTie: boolean,
  standings: [{
    name, rank, total, firstPlaces, votesReceived,
    leftGame, roundScores, roundSpeedBonuses, joinedAtRound
  }]
}
```

**Rank assignment:** Same rank for tied entries; next rank is `i + 1` (not dense ranking).

---

## 10. Voting System

### 10.1 Vote Mechanics

| Property | Value |
|----------|-------|
| Vote types | `question`, `answer`, `qa_pair` |
| Vote toggle | Click again to unvote |
| Single vote per type | For `qa_pair`: only one active vote per player; must unvote first to change |
| Rate limit | 500ms between votes per socket |
| Stable voter ID | Uses `player.name` (not socket.id) for persistence across reconnects |
| DB schema | `votes` table with `UNIQUE(player_id, vote_type, target_id)` |

### 10.2 Vote Flow

1. Client emits `submit-vote` with `{type, targetId}`
2. Server validates: game exists, player exists, not spectator
3. Tournament: phase must be `voting` for `qa_pair` votes
4. Check for existing vote → if found, delete (unvote)
5. For `qa_pair`: check no other active vote for same type → reject with message
6. INSERT vote, increment `vote_count` on target table
7. Return `{success, targetId, voteCount, isVoted}`
8. Broadcast `vote-update` to room
9. Tournament: check if all active players voted → auto-close

### 10.3 Tournament Vote Write Queue

- `game.voteWriteQueue` serializes vote DB writes for tournament mode
- Ensures atomic tallying when `closeVotingAndTally` drains the queue

---

## 11. Reactions

### 11.1 Reaction Mechanics

| Property | Value |
|----------|-------|
| Emojis | ❤️, 😂, ❓ |
| One per player per content | Uses `player.name` as stable ID in `playerReactions[contentDbId]` Set |
| Self-reaction blocked | Checks content author against socket.id |
| Rate limit | 20 reactions per 10 seconds per socket (silently dropped) |
| Phase restriction | Only during `performing` phase |

### 11.2 Reaction Flow

1. Client emits `reaction` with `{emoji, x, y, contentDbId}`
2. Server validates: game exists, phase is `performing`, content is from current turn
3. Check self-reaction → reject
4. Check duplicate → reject
5. Record in `game.reactions[contentDbId][emoji]++` and `game.playerReactions[contentDbId].add(player.name)`
6. Broadcast `reaction` (visual) and `reaction-counts` (updated counts) to room

### 11.3 Most Adored Writer

- Computed by `computeMostAdoredWriter(roomCode)`
- Counts only ❤️ and 😂 reactions
- Aggregates by content author (from `game.questions` and `game.answers` authorMap)
- Returns `{names, total, tied}` — `names` is array (multiple if tie)

---

## 12. Reconnection & Disconnect Logic

### 12.1 Disconnect Handling

| Phase | Behavior |
|-------|----------|
| Lobby | Mark inactive, 180s grace, `player-disconnected` event |
| Writing/Answering/Performing | Mark inactive, 180s grace, immediate host transfer if host disconnected, deferred side-effects (2s) |
| Ended | Silent removal (no grace period) |
| Voting/Scoreboard/Tournament Complete | Same as active phases (180s grace) |

**Grace period:** 180 seconds (3 minutes)

**Deferred side-effects (2s after disconnect):**
- Writing: if all remaining active players submitted → distribute questions
- Answering: if all remaining active players answered → prepare performance
- Performing: if disconnected player was the active reader → advance turn

**Permanent removal (after grace timeout):**
- `removePlayerFromGame()` — cleans up all references
- Tournament: mark `leftGame = true` in scores
- Host transfer via `ensureHost()`
- Disband check via `disbandIfBelowMinimum()`

### 12.2 Reconnection (`reconnect-player`)

| Step | Behavior |
|----------|---------|
| Find by name | `game.players.find(p => p.name === playerName)` |
| Stale socket handling | If player still active, remove old socket from room, mark inactive |
| Grace check | If >180s since disconnect → reject, remove player |
| Reactivate | Update `player.id` to new socket.id, `isActive = true`, clear timeout |
| State migration | Migrate questions, answers, assignments, card assignments, playerOrder, reactions from old socket.id to new |
| Host migration | If player was host, update `game.host` to new socket.id |
| Reconnection data | Send `reconnected` event with full game state (phase, players, progress, summary, votes, tournament state) |
| Performance phase | Re-emit current `reading-turn` to reconnecting player |
| Auto-advance check | If all active players now submitted → distribute/perform |

### 12.3 Presence Check

- `check-presence` event: client asks "am I still active?"
- Looks up by `playerName` (not socket.id)
- If not found or not active → `presence-stale` event

### 12.4 Session Persistence (Client)

| Property | Value |
|----------|-------|
| Session TTL | 1 hour (in `gameUtils.js`) |
| Stored data | roomCode, playerName, gameState |
| Draft persistence | Per-room, per-phase text drafts in localStorage |

### 12.5 Socket.IO Configuration

| Setting | Value |
|---------|-------|
| `pingTimeout` | 120000ms (2 minutes) |
| `pingInterval` | 25000ms (25 seconds) |
| CORS | `process.env.CORS_ORIGIN` or `*` |

### 12.6 Wake Lock (Client)

- Acquired on game start
- Re-acquires on release event
- Shows one-time notice if acquisition fails

---

## 13. Host Controls & Admin Tools

### 13.1 Host-Only Socket Events

| Event | Phase | Behavior |
|-------|-------|----------|
| `start-game` | lobby | Start game with settings |
| `toggle-anonymous` | lobby | Toggle anonymous mode |
| `update-lobby-settings` | lobby | Update tournament config, no-self-reading |
| `force-progress` | writing/answering/performing | Skip waiting players or skip turn |
| `rewind-performance` | performing | Repeat current turn |
| `replay-game` | ended | Replay with same players |
| `finish-voting` | voting | Manually close voting |
| `next-round` | scoreboard | Advance to next round |
| `new-tournament` | tournament_complete | Reset for new tournament |
| `promote-player` | tournament active | Queue spectator promotion |
| `host-kick-player` | any | Remove player from game |
| `host-set-spectator` | lobby | Toggle spectator role |
| `disband-room` | any | End game, send all to welcome |

### 13.2 Admin REST API

All admin endpoints require `x-admin-key` header matching `ADMIN_KEY = 'fluke-admin-2024'`.

| Endpoint | Method | Purpose |
|-----------|--------|---------|
| `/api/admin/pending` | GET | List unapproved qa_pairs (vote_count ≥1, not hidden, not approved) |
| `/api/admin/approve-sfw` | POST | Set `is_approved=1, is_nsfw=0` |
| `/api/admin/approve-nsfw` | POST | Set `is_approved=1, is_nsfw=1` |
| `/api/admin/delete-pair` | DELETE | Permanently DELETE qa_pair row |
| `/api/admin/reject-factual` | POST | Set `hidden=1` on qa_pair |
| `/api/hide-game` | POST | Set `hidden_from_best_of=1` on game |
| `/api/delete-best-of` | POST | Set `hidden=1` on question/answer/qa_pair |

### 13.3 Admin Key Storage (Client)

- Stored in `sessionStorage` as `adminKey`
- Prompted on first admin action if not set

---

## 14. Database Schema & Persistence

### 14.1 Tables

#### `games`
| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | INTEGER PK AUTOINCREMENT | | |
| room_code | TEXT UNIQUE | | 4-digit code |
| created_at | TIMESTAMP | CURRENT_TIMESTAMP | |
| anonymous_mode | BOOLEAN | 0 | |
| hidden_from_best_of | BOOLEAN | 0 | Admin can hide entire game |

#### `questions`
| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | INTEGER PK AUTOINCREMENT | | |
| game_id | INTEGER | | FK → games |
| text | TEXT NOT NULL | | |
| author_id | TEXT | | socket.id at time of submission |
| author_name | TEXT | | Display name |
| vote_count | INTEGER | 0 | Denormalized total |
| anonymous | BOOLEAN | 0 | Per-round anonymous mode |
| hidden | BOOLEAN | 0 | Admin moderation |

#### `answers`
Same structure as `questions`.

#### `qa_pairs`
| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | INTEGER PK AUTOINCREMENT | | |
| game_id | INTEGER | | FK → games |
| question_id | INTEGER | | FK → questions |
| answer_id | INTEGER | | FK → answers |
| vote_count | INTEGER | 0 | |
| anonymous | BOOLEAN | 0 | |
| hidden | BOOLEAN | 0 | Admin moderation |
| is_approved | BOOLEAN | 0 | Curation pipeline |
| is_nsfw | BOOLEAN | 0 | NSFW flag |

#### `votes`
| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | INTEGER PK AUTOINCREMENT | | |
| game_id | INTEGER | | |
| player_id | TEXT | | player.name (stable) |
| vote_type | TEXT | | 'question', 'answer', 'qa_pair' |
| target_id | INTEGER | | FK to respective table |
| created_at | TIMESTAMP | CURRENT_TIMESTAMP | |
| | | | UNIQUE(player_id, vote_type, target_id) |

### 14.2 DB Abstraction (`database.js`)

- Production: Turso (`@libsql/client`)
- Testing: in-memory SQLite (`sql.js`)
- Wraps operations to normalize `lastInsertRowid` and BigInt→Number conversion
- Schema migrations via `ALTER TABLE ... ADD COLUMN` with try/catch for idempotency

---

## 15. Best Of Content Pipeline

### 15.1 Content Flow

```
Game ends → Q&A pairs persisted in qa_pairs (is_approved=0 by default)
         → Admin reviews via /api/admin/pending
         → Admin approves as SFW (is_approved=1, is_nsfw=0) or NSFW (is_approved=1, is_nsfw=1)
         → SFW content appears on /best-of page
         → All approved content appears on /fword (uncut) page
         → Random approved SFW pairs appear on landing page via /api/random-pairs
```

### 15.2 Visibility Rules

| Content Location | Filter Criteria |
|-----------------|-----------------|
| Landing page (`/api/random-pairs`) | `is_approved=1`, `is_nsfw=0`, `vote_count≥1`, not hidden, game not hidden |
| Best Of page (`/api/best-of`) | Same as above for qa_pairs; questions/answers need `vote_count≥1`, not hidden |
| Uncut Best Of (`/api/best-of-uncut`) | `is_approved=1` (SFW + NSFW), `vote_count≥1`, not hidden |
| Admin pending (`/api/admin/pending`) | `is_approved=0`, `vote_count≥1`, not hidden, q.text length ≥10, non-empty text |

### 15.3 Anonymous Handling

- If `anonymous=1` on qa_pair/question/answer, author name displays as `???`
- Anonymous flag set per-round from `game.currentRoundAnonymousMode`

---

## 16. Weekly Best Of Job (`weekly-best-of.js`)

### 16.1 Purpose

Standalone CLI script that queries the Turso database for top-voted content from the past N days and outputs a formatted text summary suitable for social media posting.

### 16.2 Configuration

| Env Var | Default | Purpose |
|---------|---------|---------|
| `TURSO_DATABASE_URL` | (required) | Turso database URL |
| `TURSO_AUTH_TOKEN` | (required) | Turso auth token |
| `WEEKLY_DAYS` | 7 | Days to look back |
| `WEEKLY_TOP_N` | 5 | Items per category |

### 16.3 Query Categories

| Category | Query Filter | Sort |
|----------|-------------|------|
| Top Q&A pairs | `is_approved=1`, `is_nsfw=0`, `vote_count>0`, not hidden, `created_at >= since` | `vote_count DESC` |
| Top questions | `vote_count>0`, not hidden, `created_at >= since` | `vote_count DESC` |
| Top answers | `vote_count>0`, not hidden, `created_at >= since` | `vote_count DESC` |
| Game stats | Count games in period | — |

### 16.4 Output Format

- Text-based summary with emoji headers
- Sections: TOP Q&A PAIRS, TOP QUESTIONS, TOP ANSWERS
- Each item: rank, vote count, text, author (or `???` if anonymous)
- Written to `weekly-best-of-{YYYY-MM-DD}.txt` file
- Also printed to console

### 16.5 Execution

```bash
node weekly-best-of.js
```

Not scheduled automatically — must be run manually or via external cron.

---

## 17. Socket.IO Event Reference

### 17.1 Client → Server Events

| Event | Payload | Phase | Role |
|-------|---------|-------|------|
| `create-room` | `(playerName, callback)` | — | Any |
| `join-room` | `(roomCode, playerName, callback)` | — | Any |
| `start-game` | `{noSelfReading, tournament}` | lobby | Host |
| `toggle-anonymous` | — | lobby | Host |
| `update-lobby-settings` | `{tournamentConfig?, noSelfReading?}` | lobby | Host |
| `submit-question` | `(question)` | writing | Player |
| `submit-answer` | `(answer)` | answering | Player |
| `reading-complete` | — | performing | Current reader |
| `reaction` | `{emoji, x, y, contentDbId}` | performing | Non-author |
| `submit-vote` | `{type, targetId}` | ended/voting | Player |
| `force-progress` | — | writing/answering/performing | Host |
| `rewind-performance` | — | performing | Host |
| `finish-voting` | — | voting | Host |
| `next-round` | — | scoreboard | Host |
| `replay-game` | `{noSelfReading?}` | ended | Host |
| `new-tournament` | — | tournament_complete | Host |
| `promote-player` | `{playerName}` | tournament active | Host |
| `host-kick-player` | `{playerId}` | any | Host |
| `host-set-spectator` | `{playerId, isSpectator}` | lobby | Host |
| `disband-room` | — | any | Host |
| `player-abandon` | — | ended/scoreboard/tournament_complete | Non-host |
| `leave-room` | — | any | Any |
| `reconnect-player` | `{roomCode, playerName}` | any | Any |
| `check-presence` | `{roomCode, playerName}` | any | Any |

### 17.2 Server → Client Events

| Event | Payload | Trigger |
|-------|---------|---------|
| `player-joined` | `{players, hostId}` | Player joins/reconnects |
| `player-left` | `{players, hostId}` | Player leaves/kicked |
| `player-disconnected` | `{players, disconnectedPlayer, gracePeriod}` | Player disconnects |
| `player-rejoined` | `{players, playerName, hostId}` | Player reconnects |
| `lobby-settings` | `{anonymousMode, noSelfReading, tournamentConfig}` | Settings change |
| `game-started` | `{phase, anonymousMode, totalPlayers, tournament}` | Host starts game |
| `game-restarted` | `{phase, lastQuestionSubmitter, tournament?}` | Replay/advance round |
| `game-disbanded` | `{message}` | Room disbanded |
| `game-ended` | `{message, summary, votersCount, ...awards, tournament?}` | Performance complete |
| `answer-phase` | `{question, questionAuthor, lastQuestionSubmitter}` | Questions distributed |
| `progress-update` | `{submitted, total, playerStatuses, firstSubmitter?}` | Submission progress |
| `performance-phase` | `{totalRounds, message}` | Performance starts |
| `reading-turn` | `{questionReader, answerReader, question, answer, ...}` | Each reading turn |
| `question-submitted` | — | Question accepted |
| `answer-submitted` | — | Answer accepted |
| `vote-submitted` | `{success, targetId, voteCount, isVoted, authorReveal?}` | Vote processed |
| `vote-update` | `{type, targetId, voteCount, votersCount}` | Vote broadcast |
| `reaction` | `{emoji, x, y}` | Reaction visual |
| `reaction-counts` | `{contentDbId, counts, total}` | Reaction counts |
| `anonymous-toggled` | `{anonymousMode}` | Anonymous mode changed |
| `scoreboard` | `{standings, roundWinnerDetails, summary, ...}` | Round tally complete |
| `tournament-complete` | `{champions, isTie, standings}` | Tournament finished |
| `tournament-reset` | `{tournament}` | New tournament started |
| `promotion-queued` | `{playerName}` | Spectator promotion queued |
| `host-changed` | `{hostId, hostName}` | Host transferred |
| `kicked-from-game` | `{reason}` | Player kicked |
| `reconnected` | `{success, phase, players, ...full state}` | Reconnection success |
| `reconnect-failed` | `{reason, roomCode, playerName}` | Reconnection failure |
| `presence-stale` | `{reason}` | Player not found in room |
| `error` | `(string)` | Generic error |

---

## 18. REST API Reference

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/health` | GET | None | Health check (returns player count) |
| `/api/best-of` | GET | None | Approved SFW content (questions, answers, qa_pairs) |
| `/api/best-of-uncut` | GET | None | Approved content (SFW + NSFW, qa_pairs only) |
| `/api/random-pairs` | GET | None | Random approved SFW qa_pairs for landing page |
| `/api/hide-game` | POST | Admin | Hide entire game from best-of |
| `/api/delete-best-of` | POST | Admin | Hide individual question/answer/qa_pair |
| `/api/admin/pending` | GET | Admin | List unapproved qa_pairs for moderation |
| `/api/admin/approve-sfw` | POST | Admin | Approve pair as SFW |
| `/api/admin/approve-nsfw` | POST | Admin | Approve pair as NSFW |
| `/api/admin/delete-pair` | DELETE | Admin | Permanently delete qa_pair |
| `/api/admin/reject-factual` | POST | Admin | Hide qa_pair (reject) |

### Query Parameters

| Endpoint | Params |
|----------|--------|
| `/api/best-of` | `limit` (max 50), `type` (questions/answers/qa_pairs), `sort` (votes/newest), `offset` |
| `/api/best-of-uncut` | `limit` (max 50), `type` (qa_pairs), `sort` (votes/newest), `offset` |
| `/api/random-pairs` | `count` (default 6) |
| `/api/admin/pending` | `limit` (default 50), `offset` |

---

## 19. Rate Limiting

| Scope | Limit | Window | Applied To |
|-------|-------|--------|-----------|
| General API | 100 req/min | 60s | `/api/*` |
| Write operations | 10 req/min | 60s | `/api/hide-game`, `/api/delete-best-of` |
| Connection | 3s cooldown | 3s | `create-room`, `join-room` per socket |
| Votes | 500ms | 0.5s | `submit-vote` per socket |
| Reactions | 20 per 10s | 10s | `reaction` per socket (silently dropped) |

---

## 20. Frontend State Management

### 20.1 Key State Variables (`App.jsx`)

| Variable | Type | Purpose |
|----------|------|---------|
| `gameState` | string | Current phase: 'welcome', 'lobby', 'writing', 'answering', 'performing', 'ended', 'scoreboard', 'tournament_complete' |
| `playerName` | string | Display name |
| `roomCode` | string | 4-digit room code |
| `players` | array | Active player list |
| `isHost` | boolean | Current user is host |
| `submitted` | boolean | Current phase submission state |
| `question` / `answer` | string | Draft text |
| `assignedQuestion` | string | Question received in answering phase |
| `progress` | object | `{submitted, total, playerStatuses}` |
| `currentTurn` | object | Current reading turn data |
| `gameStats` | object | `{round, total}` for performance progress |
| `gameSummary` | array | End-of-game Q&A pairs |
| `tournament` | object | Tournament config and state |
| `scoreboardData` | object | Round scoreboard data |
| `tournamentCompleteData` | object | Final standings |
| `userVotes` | object | `{targetId: true}` for vote state |
| `summaryVotes` | object | `{pairDbId: voteCount}` |
| `myReactions` | Set | Content IDs this player reacted to |
| `reactionCounts` | object | `{contentDbId: {emoji: count}}` |
| `authorReveals` | object | `{pairDbId: {qAuthor, aAuthor}}` |
| `gameAwards` | object | fastestTyper, slowestTyper, mostAdoredWriter |
| `connectionStatus` | string | Connection indicator |
| `showDisconnectOverlay` | boolean | Reconnection prompt overlay |

### 20.2 Socket URL Resolution

```javascript
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin
```

### 20.3 Phase Routing (`App.jsx`)

| `gameState` | Component Rendered |
|-------------|-------------------|
| `welcome` | `LandingPage` |
| `lobby` | `LobbyView` |
| `writing` | `WritingPhase` |
| `answering` | `AnsweringPhase` |
| `performing` | `PerformancePhase` |
| `ended` | `SummaryPhase` (classic voting) |
| `scoreboard` | `ScoreboardView` |
| `tournament_complete` | `TournamentCompleteView` |

### 20.4 Key Hooks

| Hook | Purpose |
|------|---------|
| `useSocketEvents` | Centralized Socket.IO event handling, state updates |
| `usePWAInstall` | PWA install prompt detection |

### 20.5 Utility Functions (`gameUtils.js`)

| Function | Purpose |
|----------|---------|
| `saveDraft(roomCode, phase, text)` | Persist draft to localStorage |
| `loadDraft(roomCode, phase)` | Load draft from localStorage |
| `clearDraft(roomCode, phase)` | Remove draft |
| `saveSession(roomCode, playerName, gameState)` | Persist session (1hr TTL) |
| `loadSession()` | Load saved session |
| `clearSession()` | Remove saved session |
| `noticeFor(text, type, duration)` | Create notice object |

---

## Audit Checklist

For each section above, the auditor should verify:

1. **State transitions** occur at the correct times with the correct conditions
2. **Event payloads** match the documented schema
3. **Validation** is performed on both client and server
4. **Error handling** provides meaningful feedback to users
5. **Edge cases**: empty rooms, single player, disconnects during transitions, duplicate submissions
6. **Tournament-specific**: round boundaries, score accumulation, tie-breakers, spectator handling
7. **Database**: correct inserts/updates, vote_count denormalization, anonymous flag propagation
8. **Security**: admin key checks, rate limiting, input sanitization, self-vote/self-reaction prevention
9. **UI**: correct phase rendering, responsive layout, accessibility (44px touch targets, ARIA labels)
10. **Reconnection**: state migration, grace period enforcement, host transfer, auto-advance checks
