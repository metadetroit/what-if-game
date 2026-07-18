# What If... Chain 🎮

A hilarious multiplayer question & answer chain game for 3-15 players. Perfect for parties, icebreakers, or remote hangouts!

## How to Play

1. **Create a Room** - One player hosts and shares the 4-digit room code
2. **Join** - Everyone enters their name and the room code
3. **Write** - Each player writes a "What if..." question
4. **Answer** - Questions are shuffled and distributed, everyone answers
5. **Perform** - Players take turns reading questions and answers aloud, creating hilarious mismatched Q&A pairs
6. **Vote** - After all readings, everyone votes for the best Q&A pair
7. **Replay** - Host can start a new round with the same players or disband for a new group

## Features

- **Real-time multiplayer** via Socket.IO (3-15 players per game)
- **Best Of page** - Public gallery of top-voted questions, answers, and Q&A pairs from all games
- **Anonymous mode** - Host can hide player names in end-game summary and Best Of
- **No self-reading toggle** - Prevents players from reading their own content
- **Emoji reactions** - React with ❤️ 😂 ❓ during the performance phase
- **Reconnect grace period** - Disconnected players have 3 minutes to rejoin
- **Force advance** - Host can skip players who haven't submitted
- **Round history** - Review past rounds during the voting phase
- **Awards** - Fastest typer, slowest typer, and most-adored writer recognitions
- **Sound effects** - Toggleable sound cues for game events
- **PWA installable** - Add to home screen on mobile devices
- **Accessibility** - ARIA dialog attributes, focus traps, and keyboard navigation for modals
- **Error boundary** - Graceful error handling with reload option
- **Rate limiting** - Backend API and socket event rate limiting to prevent abuse

## Tech Stack

- **Frontend**: React 18 + Vite + Tailwind CSS
- **Backend**: Node.js + Express + Socket.IO
- **Database**: Turso (libSQL) for Best Of content persistence
- **Real-time**: WebSocket connections for instant game state sync

## Project Structure

```
windsurf-project/
├── backend/
│   ├── server.js          # Express + Socket.IO server (serves frontend + API)
│   ├── server-static.js   # Legacy static-only server (kept for reference)
│   ├── database.js        # Turso/libSQL database wrapper
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Main app component & game state
│   │   ├── LandingPage.jsx      # Welcome screen with hero image
│   │   ├── main.jsx             # Entry point (wraps App in ErrorBoundary)
│   │   ├── index.css            # Global styles + Tailwind
│   │   ├── components/
│   │   │   ├── LobbyView.jsx       # Lobby phase (room code, players, host controls)
│   │   │   ├── WritingPhase.jsx    # Question writing phase
│   │   │   ├── AnsweringPhase.jsx  # Answer writing phase
│   │   │   ├── PerformancePhase.jsx # Reading/performance phase
│   │   │   ├── SummaryPhase.jsx    # End-game voting & awards
│   │   │   ├── BestOfView.jsx      # Public Best Of gallery
│   │   │   ├── HelpPage.jsx        # How to play / FAQ
│   │   │   ├── SupportPage.jsx     # Support/contact page
│   │   │   └── ErrorBoundary.jsx   # React error boundary
│   │   ├── hooks/
│   │   │   ├── useSocketEvents.js  # Socket.IO event handlers
│   │   │   └── useFocusTrap.js     # Focus trap for modal accessibility
│   │   └── utils/
│   │       └── gameUtils.js        # Shared utility functions
│   ├── public/
│   │   ├── manifest.json        # PWA manifest
│   │   └── hero-chaos-v3.png    # Hero image
│   ├── index.html              # HTML with OG tags, favicon, PWA links
│   └── package.json
└── README.md
```

## Quick Start

### Prerequisites
- Node.js 18+ installed
- npm
- Turso database account (for Best Of feature) — set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` env vars

### 1. Start the Backend

```bash
cd backend
npm install
npm run dev
```

Backend runs on `http://localhost:3001`

Required environment variables:
- `TURSO_DATABASE_URL` - Turso database URL
- `TURSO_AUTH_TOKEN` - Turso auth token
- `CORS_ORIGIN` - comma-separated exact origins; production uses `https://what-if-game-v2.onrender.com`

### 2. Start the Frontend

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`

### 3. Play!

- Open `http://localhost:3000` in your browser
- Create a room on one device
- Join from other devices (or browser tabs) using the room code
- Have fun!

## Game Phases

| Phase | Description |
|-------|-------------|
| **Lobby** | Players join using room code, host configures settings and starts when ready |
| **Writing** | Everyone writes a "What if..." question |
| **Answering** | Questions are shuffled and distributed, everyone answers someone else's question |
| **Performing** | Players take turns reading Q&A pairs aloud — mismatched pairings create comedy |
| **Ended** | Vote for best Q&A pair, view awards, host starts new round or disbands |

## Architecture

```
┌─────────────┐     WebSocket      ┌─────────────┐
│   Frontend  │◄─────────────────►│   Backend   │
│  (React)    │    Socket.IO       │  (Node.js)  │
└─────────────┘                    └─────────────┘
                                        │
                                   ┌────┴────┐
                                   │  Turso  │
                                   │   DB    │
                                   │(Best Of)│
                                   └─────────┘
```

## Deploy to Web (Render.com - Free!)

Play with friends across the internet! The easiest deployment is using **Render.com's free tier**.

### Quick Deploy (Single Service - Easiest)

1. **Create a free Render.com account:** https://render.com

2. **Open the existing `what-if-game-v2` Web Service or create a Blueprint from `render-new.yaml`.**
   - Build command: `cd frontend && npm install && npm run build && cd ../backend && npm install`
   - Start command: `cd backend && npm start`
   - Health check: `/api/health`
   - Plan: `Free`

3. **Set environment variables in Render:**
   - `CORS_ORIGIN` = `https://what-if-game-v2.onrender.com`
   - `ADMIN_KEY` = a rotated secret configured directly in Render, never committed
   - `TURSO_DATABASE_URL` = your Turso URL
   - `TURSO_AUTH_TOKEN` = your Turso auth token

4. **Done!** Your game is live at `https://what-if-game-v2.onrender.com`

5. **Share the URL** with 3-15 friends anywhere in the world!

### Deployment topology

The current deployment is one Render Web Service serving the built frontend and Socket.IO backend. Keep `render-new.yaml` authoritative; the legacy `render.yaml` is deprecated after the first verified deployment.

### Deployment Notes

- **Free tier**: Service sleeps after 15 min inactivity (30 sec to wake up)
- **CORS**: Configurable via `CORS_ORIGIN` env var
- **Socket.IO**: Fully supported on Render.com
- **Players**: Up to 15 concurrent players per game
- **Rate limiting**: API endpoints limited to 100 req/min; write ops 10 req/min; socket `reaction` events limited to 20 per 10s per connection

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/best-of` | Get top-voted content (questions, answers, Q&A pairs) |
| GET | `/api/random-pairs` | Get random Q&A pairs for front page examples |
| POST | `/api/hide-game` | Hide a game from Best Of (admin only) |
| POST | `/api/delete-best-of` | Hide individual Best Of item (admin only) |

## License

Copyright (c) 2026 FLuke Games. All rights reserved.
No one is permitted to copy, distribute, or modify this software for any purpose without explicit written permission from the author.
