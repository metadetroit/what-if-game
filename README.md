# What If... Chain 🎮

A hilarious multiplayer question & answer chain game for 3-15 players. Perfect for parties, icebreakers, or remote hangouts!

## How to Play

1. **Create a Room** - One player hosts and shares the 6-digit room code
2. **Join** - Everyone enters their name and the room code
3. **Write** - Each player writes a "What if..." question
4. **Answer** - Everyone gets someone else's question and writes an answer
5. **Perform** - Players read questions and answers in a chain, creating hilarious mismatched Q&A pairs!

## Tech Stack

- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Node.js + Express + Socket.io
- **Real-time**: WebSocket connections for instant game state sync

## Quick Start

### Prerequisites
- Node.js 18+ installed
- npm or yarn

### 1. Start the Backend

```bash
cd backend
npm install
npm run dev
```

Backend runs on `http://localhost:3001`

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
| **Lobby** | Players join using room code, host starts when ready |
| **Writing** | Everyone writes a "What if..." question |
| **Answering** | Questions are shuffled and distributed, everyone answers |
| **Performing** | Chain reading where Q&A pairs create funny mismatches |
| **Ended** | Game complete! |

## Architecture

```
┌─────────────┐     WebSocket      ┌─────────────┐
│   Frontend  │◄─────────────────►│   Backend   │
│  (React)    │    Socket.io       │  (Node.js)  │
└─────────────┘                    └─────────────┘
                                        │
                                   ┌────┴────┐
                                   │  Games  │
                                   │  Store  │
                                   │(Memory) │
                                   └─────────┘
```

## Deploy to Web (Render.com - Free!)

Play with friends across the internet! The easiest deployment is using **Render.com's free tier**.

### Quick Deploy (Single Service - Easiest)

1. **Build the frontend:**
   ```bash
   cd frontend
   npm install
   npm run build
   cd ..
   ```

2. **Create free Render.com account:** https://render.com

3. **New Web Service:**
   - Connect your GitHub repo or upload files
   - **Name**: `what-if-game`
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Start Command**: `node server-static.js`
   - **Plan**: `Free`
   - **Environment Variable**: `CORS_ORIGIN` = `*`

4. **Done!** Your game is live at `https://what-if-game.onrender.com`

5. **Share the URL** with 3-15 friends anywhere in the world!

### Two-Service Deploy (Better for Updates)

For separate frontend/backend deployment (see `DEPLOY.md` for full instructions):
- Backend: Web Service on Render
- Frontend: Static Site on Render
- More flexible for updates

### Deployment Notes

- **Free tier**: Service sleeps after 15 min inactivity (30 sec to wake up)
- **CORS**: Already configured for any origin (`*`)
- **Socket.IO**: Fully supported on Render.com
- **Players**: Up to 15 concurrent players per game

## Future Enhancements

- [ ] Persistent storage (Redis/MongoDB)
- [ ] Spectator mode
- [ ] Custom question categories
- [ ] Timer for each phase
- [ ] Score/voting system
- [ ] Emoji reactions during reading
- [ ] Game history/recap

## License

MIT
