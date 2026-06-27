# Simple Single-Service Deployment to Render.com

This is the EASIEST way to deploy - everything in one service.

## Quick Deploy (5 minutes)

### Step 1: Build the Frontend
```bash
cd frontend
npm install
npm run build
```

This creates a `dist` folder with your production frontend.

### Step 2: Deploy to Render.com

1. Go to https://render.com and create a free account
2. Click **New +** → **Web Service**
3. Choose **Build and deploy from a Git repository** (or **Public Git repository** if not using Git)
4. Configure:
   - **Name**: `what-if-game`
   - **Root Directory**: `backend` (important!)
   - **Environment**: `Node`
   - **Build Command**: (leave blank or `cd ../frontend && npm install && npm run build && cd ../backend && npm install`)
   - **Start Command**: `node server.js`
   - **Plan**: Free

5. Add Environment Variable:
   - `CORS_ORIGIN`: `*`

6. Click **Create Web Service**

### Step 3: That's it!

Your game is now live at `https://what-if-game.onrender.com`

Share this URL with friends - they can all join from their own devices!

## How It Works

- **Single URL**: Everyone goes to the same website
- **Backend serves frontend**: When you visit the URL, you get the game UI
- **Socket.IO**: Players connect to the same backend for real-time gameplay
- **No room codes needed for joining**: Just share the URL and room code separately

## Free Tier Notes

- **First load**: May take 30 seconds if the service was sleeping
- **During play**: Smooth real-time gameplay
- **Concurrent players**: Up to 15 players supported
- **Session data**: Stored in memory (resets if server restarts, but rooms persist while active)

## Troubleshooting

### "Connecting..." stays forever
- Wait 30 seconds for the free tier to wake up
- Refresh the page
- Check that your `CORS_ORIGIN` is set to `*`

### Players can't see each other
- Make sure everyone is using the same backend URL
- Check browser console for errors
- Verify the room code is correct

### Build fails on Render
- Make sure you ran `npm run build` locally first to create the `dist` folder
- Or add the build command to Render's build settings

## Local Development Still Works

```bash
# Terminal 1
cd backend && node server.js

# Terminal 2  
cd frontend && npm run dev
```

Use `server.js` for both local dev and production (it serves the built frontend and runs the API).
