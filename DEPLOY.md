# Deploy to Render.com (Free Tier)

## Prerequisites
1. Create a free account at https://render.com
2. Push your code to GitHub (recommended) or use Render's Git integration

## Step 1: Deploy the Backend

1. In Render Dashboard, click **New +** → **Web Service**
2. Connect your GitHub repo or use **Public Git Repository**
3. Configure:
   - **Name**: `what-if-game-backend`
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free
4. Add Environment Variables:
   - `CORS_ORIGIN`: `*` (or your frontend URL after deployment)
5. Click **Create Web Service**

6. Wait for deployment to complete. Note your backend URL (e.g., `https://what-if-game-backend.onrender.com`)

## Step 2: Deploy the Frontend

1. In Render Dashboard, click **New +** → **Static Site**
2. Connect the same repo
3. Configure:
   - **Name**: `what-if-game-frontend`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
4. Add Environment Variables:
   - `VITE_SOCKET_URL`: `https://what-if-game-backend.onrender.com` (your actual backend URL)
5. Click **Create Static Site**

## Alternative: Deploy Both Together (Simpler)

If you want a single service (easier to manage), modify `render.yaml` and use Blueprint:

1. Push `render.yaml` to your repo
2. In Render, click **New +** → **Blueprint**
3. Connect your repo
4. Render will create both services automatically

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
- By default, backend accepts connections from anywhere (`*`)
- For security, after deploying, update `CORS_ORIGIN` to your exact frontend URL:
  - Example: `https://what-if-game-frontend.onrender.com`

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
