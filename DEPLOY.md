# Deploy to Render.com (Free Tier)

## Prerequisites
1. Create a free account at https://render.com
2. Push your code to GitHub (recommended) or use Render's Git integration

## Step 1: Use the authoritative single-service manifest

1. In Render Dashboard, open the existing `what-if-game-v2` service or create a Blueprint from `render-new.yaml`.
2. Confirm the service builds the frontend from `frontend`, starts `backend`, and serves `/api/health`.
3. Set `CORS_ORIGIN` to `https://what-if-game-v2.onrender.com`.
4. Set `ADMIN_KEY` to a rotated secret directly in Render; never commit or report its value.
5. Apply the Blueprint/service configuration and wait for the deployment to complete.

## Testing Your Deployment

1. Visit your frontend URL
2. Open the game in 3+ different browsers/devices
3. Create a room on one device
4. Join with room code on other devices
5. Play a full round!

## Important Notes

### Free Tier Limitations
- **Backend**: Spins down after 15 minutes of inactivity (takes ~30 seconds to wake up)
- **Frontend**: Always fast (static hosting)
- **Workaround**: If players experience delays, the first player should wait for the "Connecting..." to resolve before others join

### CORS Configuration
- Production uses the exact origin `https://what-if-game-v2.onrender.com`
- Legacy frontend/backend origins and `playfluke.com` are not allowlisted until the custom domain serves the app directly
- Update the Render environment value only when the final custom-domain cutover is complete

### Socket.IO on Render.com
Socket.IO works great on Render.com's free tier. The WebSocket connections are properly supported.

### Debugging
- Backend logs: Available in Render dashboard under your web service
- Browser console: Check for connection errors
- If players can't connect, verify the `VITE_SOCKET_URL` is set correctly

## Local Development (Still Works!)

Your local development continues to work as before:
```bash
# Terminal 1
cd backend && npm start

# Terminal 2
cd frontend && npm run dev
```

The frontend will use `localhost:3001` locally and your Render URL in production automatically.
