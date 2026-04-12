# SymbolTracker — Claude Code Build Prompt

> Navigate into this folder in Claude Code then say:
> "Read PROMPT.md and build everything described in it. The assets are already in the assets/ folder."

---

I want to build a real-time multiplayer desktop overlay application called **SymbolTracker** for use during a World of Warcraft raid encounter. Please build the entire application from scratch with all files complete and no placeholders.

---

## Background & Context

During a WoW raid boss called "Midnight" (Death's Dirge encounter), the boss briefly flashes 5 symbols in a specific order, then assigns one of those symbols to each of 5 players. Players must remember the position their symbol appeared in the sequence (1st, 2nd, 3rd, 4th, 5th) and stand at the corresponding clockwise position around the boss. This app lets the raid leader click symbols in the order the boss shows them, and every connected raider's overlay updates in real time.

---

## The 5 Symbols

These are the exact tile colors as they appear in the game UI:

| ID       | Label    | Tile Background Color       |
|----------|----------|-----------------------------|
| circle   | Circle   | Orange/brown (#8B5E1A)      |
| x        | X        | Red (#8B1A1A)               |
| triangle | Triangle | Green (#1A6B2A)             |
| diamond  | Diamond  | Purple (#5B1A8B)            |
| t        | T Rune   | White/grey (#C8C8C8) with dark border |

---

## Image Assets

All image files are already in the `assets/` folder. Use them directly:

- `assets/Circle.tga` — Circle symbol
- `assets/XRune.tga` — X symbol
- `assets/TriangleRune.tga` — Triangle symbol
- `assets/DiamondRune.tga` — Diamond symbol
- `assets/TRune.tga` — T Rune symbol
- `assets/BossMidnight.tga` — Boss image for center of diagram

TGA files may not load in Electron's renderer. Attempt to load each TGA first; if it fails fall back to the matching PNG (same filename, `.png` extension).

---

## Project Structure to Create

```
/server
  index.js
  package.json
  Procfile

/client
  main.js
  preload.js
  index.html
  style.css
  renderer.js
  package.json
  config.json

README.md
```

The `assets/` folder already exists at the root — reference images from there using Electron's `__dirname`.

---

## Three Roles

### 1. Admin (session owner)
- Logs in using an admin code stored in `client/config.json` under the key `adminCode`
- There is only ever **one active session at a time**
- Admin creates the session and gets the session ID to share
- Admin sees the full **Admin Dashboard** (described below)
- Admin can assign or revoke the Raid Leader role for any connected player via a gear icon next to their name
- Admin can close/reset the session
- Admin is identified as "Admin" in the player list — no display name entry needed

### 2. Raid Leader (assigned by Admin)
- Joins like a regular Raider (display name + session ID)
- Default role on join is Raider
- When Admin promotes them, their UI **immediately updates** to show the symbol buttons without reconnecting
- When Admin demotes them, the symbol buttons disappear immediately
- Multiple players can hold Raid Leader role simultaneously

### 3. Raider (default for everyone)
- Joins with display name + session ID
- Sees **only the boss diagram** — as minimal as possible, matching the reference images described below
- Diagram updates live as Raid Leaders click symbols

---

## Server Requirements (`server/index.js`)

- Node.js + Socket.io v4
- Only one session can exist at a time. Reject new `create_session` with `"A session is already active"` if one exists
- **Create session**: Admin sends admin code. Server validates against `process.env.ADMIN_CODE || "changeme"`. If invalid return `auth_error`. If valid, generate a unique session ID like `RAID-4892`, return `session_created` with the ID
- **Join session**: client sends `{ name, sessionId }`. If session not found return `join_error: "Session not found"`. If name taken return `join_error: "Name already taken"`. On success return `join_success` with role (`raider`) and current symbol sequence state
- **Role assignment**: Admin emits `assign_role` with `{ socketId, role }`. Server updates role and broadcasts `role_update` to all: `{ socketId, name, role }`
- Leader emits `symbol_add` → server appends to state (max 5, no duplicates) → broadcasts `state_update`
- Leader emits `reset` → server clears state → broadcasts `state_reset`
- Any connect/disconnect → broadcast `players_update` with `[{ socketId, name, role }]`
- Session deleted when all clients disconnect or Admin closes it
- Port: `process.env.PORT || 3000`
- Admin code: `process.env.ADMIN_CODE || "changeme"`
- Procfile: `web: node index.js`

---

## `client/config.json`

```json
{
  "serverUrl": "http://localhost:3000",
  "adminCode": "changeme"
}
```

---

## Client — Launch Screen

### Admin Login
- A single **Admin** button — sends `adminCode` from `config.json` automatically, no typing
- On auth fail: "Invalid admin code"
- On session already active: "A session is already active"
- On success: Admin Dashboard

### Join as Raider / Raid Leader
- **Display Name** text input (required, max 20 chars)
- **Session ID** text input
- **Connect** button
- Inline validation on empty fields
- Show `join_error` message if returned by server
- On success: render UI based on assigned role

---

## Client — Admin Dashboard

### Status Bar
- Session ID shown prominently with **Copy** button
- Total connected player count
- Role badge: `ADMIN` (gold — #c8a400)
- Interactive / click-through mode indicator
- **Close Session** button

### Connected Players List
- Each row: green dot, display name, role badge, gear icon (⚙) on the right
- Gear icon dropdown: "Promote to Raid Leader" or "Demote to Raider"
- Role changes apply instantly with no reconnect
- Empty state: "Waiting for players to connect..."

### Boss Diagram
- Full diagram shown below the player list, updates live

---

## Client — Raid Leader UI

### Status Bar
- Session ID, player count, role badge `RAID LEADER` (blue — #4a90d9), mode indicator

### Symbol Buttons
- 5 buttons in a row, each showing the symbol image on its correct colored tile
- Clicking appends to sequence (max 5, no duplicates)
- Used symbols are greyed out and disabled
- **Reset** button re-enables all buttons and clears the sequence

### Boss Diagram
- Full diagram shown below, updates live

---

## Client — Raider Overlay

**This should be as minimal as possible — just the diagram, nothing else.**

The target look is a floating circular diagram that sits cleanly over WoW, matching
the style of the in-game addon shown in the reference. Specifically:

- The window background is fully transparent except for the diagram circle itself
- The diagram is a **dark grey circle** (`rgba(40, 40, 55, 0.92)`) with a subtle grey/purple border
- No title bar, no status bar, no labels outside the circle, no extra chrome
- The only text visible is the position numbers (1–5) beneath each symbol slot
- A very small subtle connection indicator dot in one corner (green = connected, red = disconnected) — this is the ONLY UI element outside the diagram circle, and it should be tiny and unobtrusive
- The window should feel like it's part of the game UI, not an app sitting on top of it

---

## Boss Diagram (used by all roles)

Match this layout precisely based on the reference images:

- Dark grey circle as the arena background
- `BossMidnight.tga` centered in the middle of the circle, sized to fill roughly 35% of the circle diameter
- A shield icon at exactly 12 o'clock, outside/above the symbol slots, as a fixed tank reference marker — not a position slot. Use a unicode shield character styled to look like the WoW tank icon
- 5 symbol position slots arranged clockwise around the boss image:
  - Position 1 → ~1-2 o'clock (upper right)
  - Position 2 → ~4 o'clock (lower right)
  - Position 3 → 6 o'clock (bottom center)
  - Position 4 → ~8 o'clock (lower left)
  - Position 5 → ~10-11 o'clock (upper left)
- Each slot is a square tile (~52×52px)
- Empty slot: dark background with just the position number centered in white beneath it (outside the tile, below it)
- Filled slot: symbol image displayed on its colored tile background, position number beneath in white
- When a symbol is placed, it fades in smoothly

---

## Electron Window Behaviour (`main.js`)

- Frameless, transparent, always-on-top window
- Raider window size: 320×320px (just big enough for the diagram circle)
- Admin/Raid Leader window size: 420×600px
- Both positioned top-right of screen on launch
- **Click-through by default** using `setIgnoreMouseEvents(true, { forward: true })`
- **`Ctrl+Shift+S`** toggles interactive / click-through mode
- When switching to interactive mode: brief purple border pulse animation
- When switching to click-through mode: border fades out
- Window draggable in interactive mode only, via `-webkit-app-region: drag` on drag handle

---

## Real-time Sync

- Socket.io, server URL from `config.json`
- On connect: receive `state_sync` with current sequence, render immediately
- Handle: `state_update`, `state_reset`, `players_update`, `role_update`, `session_closed`
- On `session_closed`: show brief "Session ended" message then return to launch screen
- On disconnect: show small "Reconnecting..." indicator, auto-reconnect and rejoin with same credentials

---

## Visual Style

- Overall: dark, semi-transparent, WoW aesthetic
- Admin/Leader background: `rgba(10, 10, 18, 0.88)` with `#5c3a8a` border
- Raider window: fully transparent outside the diagram circle
- White text, system font
- Role badges: Admin = gold `#c8a400`, Raid Leader = blue `#4a90d9`, Raider = grey `#888888`
- Keep everything compact and unobtrusive

---

## README

1. Project overview and three roles explained
2. Prerequisites (Node.js 18+, npm)
3. How to copy assets into `assets/`
4. How to change admin code in `config.json` and set `ADMIN_CODE` env var on server
5. Run server: `cd server && npm install && node index.js`
6. Run client: `cd client && npm install && npm start`
7. Test with ngrok: `ngrok http 3000`, update `config.json` serverUrl
8. Deploy to Railway: link repo, set `ADMIN_CODE` env var, auto-detects Procfile
9. Package as `.exe`: `npm run build` with electron-builder

---

## Tech Versions

- Node.js 18+
- Socket.io v4
- Electron v28
- electron-builder for packaging
- No frontend frameworks — plain HTML, CSS, vanilla JS only

---

Build all files completely. The app should work end to end when the README instructions are followed.
