# SymbolTracker

A real-time multiplayer desktop overlay application for World of Warcraft raid coordination during the Death's Dirge Midnight encounter.

## Overview

During the Midnight boss encounter, the boss briefly flashes 5 symbols in a specific order, then assigns one of those symbols to each of 5 players. Players must remember the position their symbol appeared in the sequence (1st, 2nd, 3rd, 4th, 5th) and stand at the corresponding clockwise position around the boss.

SymbolTracker lets the raid leader click symbols in the order the boss shows them, and every connected raider's overlay updates in real time.

## Three Roles

### Admin
- Logs in using the admin code from `client/config.json`
- Creates and manages the session
- Can promote/demote players to Raid Leader role
- Sees the full Admin Dashboard with player list and boss diagram
- Can close/reset the session

### Raid Leader
- Joins as a regular player (display name + session ID)
- Can be promoted by the Admin
- Has access to symbol input buttons to record the sequence
- Multiple players can hold this role simultaneously

### Raider
- Default role for all joining players
- Sees only the minimal boss diagram overlay
- Diagram updates live as Raid Leaders click symbols

## Prerequisites

- Node.js 18 or higher
- npm (comes with Node.js)

## Project Structure

```
/server
  index.js        # Socket.io server
  package.json
  Procfile        # For Railway/Heroku deployment

/client
  main.js         # Electron main process
  preload.js      # Context bridge
  index.html      # UI
  style.css       # Styles
  renderer.js     # Client-side logic
  package.json
  config.json     # Server URL and admin code

/assets           # Symbol and boss images (TGA/PNG)
```

## Setup

### 1. Assets

The `assets/` folder should contain the following image files in **PNG format**:
- `Circle.png`
- `XRune.png`
- `TriangleRune.png`
- `DiamondRune.png`
- `TRune.png`
- `BossMidnight.png`

**Important:** TGA files cannot be displayed directly in Electron/Chromium. If you have TGA files, convert them to PNG using:
- Any image editor (Photoshop, GIMP, Paint.NET)
- Online converters (cloudconvert.com, convertio.co)
- ImageMagick: `magick Circle.tga Circle.png`

The app attempts to load TGA first, then falls back to PNG if TGA fails.

### 2. Configure Admin Code

**Client:** Edit `client/config.json`:
```json
{
  "serverUrl": "http://localhost:3000",
  "adminCode": "your-secret-code"
}
```

**Server:** Set the `ADMIN_CODE` environment variable or it defaults to `"changeme"`.

### 3. Run the Server

```bash
cd server
npm install
node index.js
```

The server runs on port 3000 by default. Set `PORT` environment variable to change.

### 4. Run the Client

```bash
cd client
npm install
npm start
```

## Usage

1. **Admin:** Click the "Admin" button to create a new session
2. **Share:** Copy the session ID (e.g., `RAID-4892`) and share with your raid
3. **Raiders:** Enter display name and session ID, click Connect
4. **Promote:** Admin can promote players to Raid Leader using the gear icon
5. **Input Symbols:** Raid Leaders click symbols in the order shown by the boss
6. **Reset:** Click Reset to clear and start over

### Keyboard Shortcuts

- **Ctrl+Shift+S:** Toggle between click-through and interactive mode
  - Click-through: Overlay doesn't capture mouse clicks (default)
  - Interactive: Can click buttons and drag window

## Testing with ngrok

For testing across different machines:

```bash
ngrok http 3000
```

Update `client/config.json` with the ngrok URL:
```json
{
  "serverUrl": "https://abc123.ngrok.io",
  "adminCode": "your-secret-code"
}
```

## Deploying to Railway

1. Create a new project on [Railway](https://railway.app)
2. Link your GitHub repository
3. Set the `ADMIN_CODE` environment variable in Railway settings
4. Railway auto-detects the Procfile and deploys the server
5. Update client `config.json` with the Railway URL

## Building as Executable

To package the client as a standalone `.exe`:

```bash
cd client
npm run build
```

The executable will be in the `client/dist` folder.

## Tech Stack

- **Server:** Node.js 18+, Socket.io v4
- **Client:** Electron v28, Socket.io-client, vanilla JS/HTML/CSS
- **Packaging:** electron-builder

## Window Behavior

- Frameless, transparent, always-on-top overlay
- Raider window: 320x320px (compact diagram only)
- Admin/Leader window: 420x600px (full dashboard)
- Click-through by default for seamless game overlay
- Purple border pulse animation when switching to interactive mode
