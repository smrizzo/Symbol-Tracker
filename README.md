# SymbolTracker

A real-time multiplayer desktop overlay application for World of Warcraft raid coordination during the Death's Dirge Midnight encounter.

## Overview

During the Midnight boss encounter, the boss briefly flashes 5 symbols in a specific order, then assigns one of those symbols to each of 5 players. Players must remember the position their symbol appeared in the sequence (1st, 2nd, 3rd, 4th, 5th) and stand at the corresponding clockwise position around the boss.

SymbolTracker lets the raid leader click symbols in the order the boss shows them, and every connected raider's overlay updates in real time.

## Three Roles

### Admin
- Clicks the Admin button and types the admin code into the password field
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
  .env.example    # Template for required environment variables (commit this)
  .env            # Your local secrets - NEVER commit this file

/client
  main.js         # Electron main process
  preload.js      # Context bridge
  index.html      # UI
  style.css       # Styles
  renderer.js     # Client-side logic
  package.json
  config.json     # Server URL and admin code (update before building)

/assets           # Symbol and boss images (TGA/PNG)
Procfile          # For Railway deployment
```

## Environment Variables

The server requires the following environment variable:

| Variable     | Required | Description                                                    |
|--------------|----------|----------------------------------------------------------------|
| `ADMIN_CODE` | Yes      | The admin password. Bcrypt-hashed at startup; never stored in plain text or transmitted over the network. |
| `PORT`       | No       | Port to listen on (defaults to `3000`)                         |

The server will **exit immediately with an error message** if `ADMIN_CODE` is not set.

### How the authentication works

1. At startup the server bcrypt-hashes `ADMIN_CODE` (cost factor 10) and deletes the plaintext from the environment. Only the salt and the resulting hash live in memory.
2. When the Admin clicks "Connect as Admin" the client requests the salt from the server via a `get_salt` socket event.
3. The client hashes the typed password locally with that salt using `bcryptjs`.
4. Only the hash is sent to the server — the plaintext never leaves the machine.
5. The server compares the received hash to its stored hash using a constant-time comparison and either creates the session or returns an error.

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

### 2. Configure the Server (Local Dev)

```bash
cd server
cp .env.example .env
```

Open `server/.env` and set a strong, unique admin code:

```env
ADMIN_CODE=some-long-random-secret-here
```

> **Never commit `server/.env` to git.** It is listed in `.gitignore`.

### 3. Configure the Client

Edit `client/config.json` with the server URL:

```json
{
  "serverUrl": "http://localhost:3000"
}
```

For Railway deployment, replace the URL with your Railway-assigned URL.

> **Note:** The admin code is no longer stored in `config.json`. The Admin enters it manually in the login screen each time.

### 4. Run the Server

```bash
cd server
npm install
node index.js
```

The server runs on port 3000 by default.

### 5. Run the Client

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
  "serverUrl": "https://abc123.ngrok.io"
}
```

## Deploying to Railway

### Before you deploy

You must set environment variables in Railway **before** the first deploy or the server will crash on startup.

### Steps

1. Create a new project on [Railway](https://railway.app)
2. Link your GitHub repository
3. In Railway **Settings → Variables**, add:
   - `ADMIN_CODE` → your real admin password (e.g. a long random string). Railway encrypts environment variables at rest. This value is bcrypt-hashed at server startup and then discarded — it is never stored in any file or transmitted over the network.
4. Railway auto-detects the `Procfile` at the repo root and runs `node server/index.js`
5. After deploy, copy the Railway-assigned URL and update `client/config.json`:
   ```json
   {
     "serverUrl": "https://your-app.up.railway.app"
   }
   ```
6. Rebuild and distribute the client executable

> **Railway note:** `PORT` is automatically provided by Railway — do not set it manually.

## Releasing a New Version

Releases are built and published automatically by GitHub Actions whenever `client/` files are pushed to `main`.

### Steps to release

1. Bump the version in `client/package.json`:
   ```json
   { "version": "1.1.0" }
   ```
2. Commit and push to `main`:
   ```bash
   git add client/package.json
   git commit -m "chore: bump version to 1.1.0"
   git push origin main
   ```
3. GitHub Actions automatically:
   - Creates a git tag `v1.1.0`
   - Runs `electron-builder` on `windows-latest`
   - Publishes a Windows installer (NSIS) and portable `.exe` to GitHub Releases
4. Existing users are prompted to update on their next app launch via `electron-updater`.

> **Required secret:** Add a `GH_TOKEN` secret to your GitHub repo (**Settings → Secrets → Actions**) with a Personal Access Token that has `repo` scope. This is used to create releases and upload artifacts.

### Building locally

```bash
cd client
npm install
npm run build
```

The built files appear in `client/dist/`. Note: auto-update publishing is skipped in local builds unless you pass `--publish always` with a valid `GH_TOKEN`.

### Server deploys

The server does **not** go through this pipeline — Railway deploys automatically on every push to `main`.

## Tech Stack

- **Server:** Node.js 18+, Socket.io v4, dotenv
- **Client:** Electron v28, Socket.io-client, vanilla JS/HTML/CSS
- **Packaging:** electron-builder

## Window Behavior

- Frameless, transparent, always-on-top overlay
- Raider window: 320x320px (compact diagram only)
- Admin/Leader window: 420x600px (full dashboard)
- Click-through by default for seamless game overlay
- Purple border pulse animation when switching to interactive mode
