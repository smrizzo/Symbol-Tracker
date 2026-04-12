// Load config
const config = require('./config.json');
const io = require('socket.io-client');
const bcrypt = require('bcryptjs');

// State
let socket = null;
let assetsPath = '';
let currentRole = null;
let sessionId = null;
let displayName = null;
let symbolSequence = [];
let players = [];
let isInteractive = true;

// Symbol definitions
const symbols = [
  { id: 'circle', label: 'Circle', file: 'Circle', bg: '#8B5E1A' },
  { id: 'x', label: 'X', file: 'XRune', bg: '#8B1A1A' },
  { id: 'triangle', label: 'Triangle', file: 'TriangleRune', bg: '#1A6B2A' },
  { id: 'diamond', label: 'Diamond', file: 'DiamondRune', bg: '#5B1A8B' },
  { id: 't', label: 'T Rune', file: 'TRune', bg: '#C8C8C8' }
];

// Position slots around the boss in a gentle arc
// Using screen coordinates: 0° = right (3 o'clock), 90° = bottom (6 o'clock)
// Converted from user reference: 0° = 12 o'clock, clockwise positive
const positionAngles = [
  { pos: 1, angle: -35 },   // ~2 o'clock (upper right)
  { pos: 2, angle: 30 },    // ~4 o'clock (lower right)
  { pos: 3, angle: 90 },    // 6 o'clock (bottom center)
  { pos: 4, angle: 150 },   // ~8 o'clock (lower left)
  { pos: 5, angle: 215 }    // ~10 o'clock (upper left)
];

// DOM elements
const loginScreen = document.getElementById('login-screen');
const adminScreen = document.getElementById('admin-screen');
const leaderScreen = document.getElementById('leader-screen');
const raiderScreen = document.getElementById('raider-screen');
const reconnectingOverlay = document.getElementById('reconnecting-overlay');
const sessionEndedOverlay = document.getElementById('session-ended-overlay');

// Login elements
const adminBtnSection = document.getElementById('admin-btn-section');
const adminBtn = document.getElementById('admin-btn');
const adminPasswordSection = document.getElementById('admin-password-section');
const adminCodeInput = document.getElementById('admin-code-input');
const adminConfirmBtn = document.getElementById('admin-confirm-btn');
const displayNameInput = document.getElementById('display-name');
const sessionIdInput = document.getElementById('session-id');
const connectBtn = document.getElementById('connect-btn');
const loginError = document.getElementById('login-error');

// Admin elements
const adminSessionId = document.getElementById('admin-session-id');
const copySessionBtn = document.getElementById('copy-session-btn');
const adminPlayerCount = document.getElementById('admin-player-count');
const adminMode = document.getElementById('admin-mode');
const playersList = document.getElementById('players-list');
const adminSymbolButtons = document.getElementById('admin-symbol-buttons');
const adminResetBtn = document.getElementById('admin-reset-btn');
const adminDiagram = document.getElementById('admin-diagram');
const closeSessionBtn = document.getElementById('close-session-btn');

// Leader elements
const leaderSessionId = document.getElementById('leader-session-id');
const leaderPlayerCount = document.getElementById('leader-player-count');
const leaderMode = document.getElementById('leader-mode');
const leaderSymbolButtons = document.getElementById('leader-symbol-buttons');
const leaderResetBtn = document.getElementById('leader-reset-btn');
const leaderDiagram = document.getElementById('leader-diagram');

// Raider elements
const connectionDot = document.getElementById('connection-dot');
const raiderDiagram = document.getElementById('raider-diagram');

// Initialize
async function init() {
  assetsPath = await window.electronAPI.getAssetsPath();
  setupEventListeners();

  // Set initial interactive mode class (app starts in interactive mode)
  document.body.classList.add('interactive-mode');
}

function setupEventListeners() {
  // Admin login — reveal password field
  adminBtn.addEventListener('click', () => {
    loginError.textContent = '';
    adminBtnSection.classList.add('hidden');
    adminPasswordSection.classList.remove('hidden');
    adminCodeInput.focus();
  });

  // Admin confirm button
  adminConfirmBtn.addEventListener('click', () => {
    const password = adminCodeInput.value;
    if (!password) {
      loginError.textContent = 'Please enter the admin code';
      return;
    }
    loginError.textContent = '';
    adminCodeInput.value = ''; // clear immediately — never keep it in the DOM
    connectAsAdmin(password);
  });

  // Enter key in admin code field
  adminCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') adminConfirmBtn.click();
  });

  // Raider login
  connectBtn.addEventListener('click', () => {
    loginError.textContent = '';
    const name = displayNameInput.value.trim();
    const sessId = sessionIdInput.value.trim().toUpperCase();

    if (!name) {
      loginError.textContent = 'Please enter a display name';
      return;
    }
    if (!sessId) {
      loginError.textContent = 'Please enter a session ID';
      return;
    }

    connectAsRaider(name, sessId);
  });

  // Enter key on inputs
  sessionIdInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') connectBtn.click();
  });
  displayNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sessionIdInput.focus();
  });

  // Copy session ID
  copySessionBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(sessionId);
    copySessionBtn.textContent = 'Copied!';
    setTimeout(() => copySessionBtn.textContent = 'Copy', 1500);
  });

  // Reset buttons
  adminResetBtn.addEventListener('click', () => socket.emit('reset'));
  leaderResetBtn.addEventListener('click', () => socket.emit('reset'));

  // Close session
  closeSessionBtn.addEventListener('click', () => {
    socket.emit('close_session');
  });

  // Mode change from main process
  window.electronAPI.onModeChanged((interactive) => {
    isInteractive = interactive;
    updateModeIndicator();
  });

  // Shared role dropdown — close when clicking outside
  document.addEventListener('click', closeRoleDropdown);

  // Close buttons for raider and leader
  const leaderCloseBtn = document.getElementById('leader-close-btn');
  const raiderCloseBtn = document.getElementById('raider-close-btn');

  const handleClose = () => {
    if (socket) {
      socket.disconnect();
    }
    socket = null;
    currentRole = null;
    sessionId = null;
    displayName = null;
    symbolSequence = [];
    players = [];
    window.electronAPI.quitApp();
  };

  if (leaderCloseBtn) leaderCloseBtn.addEventListener('click', handleClose);
  if (raiderCloseBtn) raiderCloseBtn.addEventListener('click', handleClose);
}

function connectAsAdmin(password) {
  // password was already cleared from the DOM input before this is called.
  // We hold it only in this local variable, hash it, then discard it.
  socket = io(config.serverUrl, { transports: ['websocket', 'polling'] });

  socket.on('connect', () => {
    // Request the server's bcrypt salt, then hash the password client-side
    // so the plaintext never leaves this machine.
    socket.emit('get_salt', (response) => {
      bcrypt.hash(password, response.salt).then((adminHash) => {
        socket.emit('create_session', { adminHash });
      });
    });
  });

  socket.on('session_created', (data) => {
    sessionId = data.sessionId;
    currentRole = 'admin';
    symbolSequence = data.symbolSequence || [];
    showScreen('admin');
    window.electronAPI.notifyRoleChanged('admin');
    renderSymbolButtons(adminSymbolButtons);
    renderDiagram(adminDiagram);
    updateAdminUI();
  });

  socket.on('auth_error', (data) => {
    adminCodeInput.focus();
    loginError.textContent = data.message;
    socket.disconnect();
    socket = null;
  });

  setupCommonSocketHandlers();
}

function connectAsRaider(name, sessId) {
  displayName = name;
  sessionId = sessId;

  socket = io(config.serverUrl, { transports: ['websocket', 'polling'] });

  socket.on('connect', () => {
    socket.emit('join_session', { name: displayName, sessionId: sessionId });
  });

  socket.on('join_success', (data) => {
    currentRole = data.role;
    symbolSequence = data.symbolSequence || [];
    showScreen(currentRole === 'leader' ? 'leader' : 'raider');
    window.electronAPI.notifyRoleChanged(currentRole);

    if (currentRole === 'leader') {
      renderSymbolButtons(leaderSymbolButtons);
      renderDiagram(leaderDiagram);
      updateLeaderUI();
    } else {
      renderDiagram(raiderDiagram);
    }
  });

  socket.on('join_error', (data) => {
    loginError.textContent = data.message;
    socket.disconnect();
  });

  setupCommonSocketHandlers();
}

function setupCommonSocketHandlers() {
  socket.on('disconnect', () => {
    if (currentRole === 'raider') {
      connectionDot.classList.add('disconnected');
    }
    reconnectingOverlay.classList.remove('hidden');
  });

  socket.on('connect', () => {
    if (currentRole === 'raider') {
      connectionDot.classList.remove('disconnected');
    }
    reconnectingOverlay.classList.add('hidden');

    // Rejoin if we were in a session
    if (currentRole && sessionId) {
      if (currentRole === 'admin') {
        // Admin needs to recreate - session is gone
      } else {
        socket.emit('join_session', { name: displayName, sessionId: sessionId });
      }
    }
  });

  socket.on('state_update', (data) => {
    symbolSequence = data.symbolSequence;
    updateAllDiagrams();
    updateSymbolButtons();
  });

  socket.on('state_reset', () => {
    symbolSequence = [];
    updateAllDiagrams();
    updateSymbolButtons();
  });

  socket.on('state_sync', (data) => {
    symbolSequence = data.symbolSequence;
    updateAllDiagrams();
    updateSymbolButtons();
  });

  socket.on('players_update', (data) => {
    players = data;
    updatePlayersList();
    updatePlayerCounts();
  });

  socket.on('role_update', (data) => {
    // Check if it's our role that changed
    if (data.socketId === socket.id) {
      const oldRole = currentRole;
      currentRole = data.role;

      // Update UI based on new role
      if (oldRole !== currentRole) {
        if (currentRole === 'leader') {
          showScreen('leader');
          window.electronAPI.notifyRoleChanged('leader');
          renderSymbolButtons(leaderSymbolButtons);
          renderDiagram(leaderDiagram);
          updateLeaderUI();
        } else if (currentRole === 'raider') {
          showScreen('raider');
          window.electronAPI.notifyRoleChanged('raider');
          renderDiagram(raiderDiagram);
        }
      }
    }
    updatePlayersList();
  });

  socket.on('session_closed', () => {
    sessionEndedOverlay.classList.remove('hidden');
    setTimeout(() => {
      sessionEndedOverlay.classList.add('hidden');
      resetToLogin();
    }, 2000);
  });
}

function showScreen(role) {
  loginScreen.classList.add('hidden');
  adminScreen.classList.add('hidden');
  leaderScreen.classList.add('hidden');
  raiderScreen.classList.add('hidden');

  // Update body class for raider mode styling
  document.body.classList.remove('raider-mode');

  if (role === 'admin') {
    adminScreen.classList.remove('hidden');
  } else if (role === 'leader') {
    leaderScreen.classList.remove('hidden');
  } else {
    raiderScreen.classList.remove('hidden');
    document.body.classList.add('raider-mode');
  }
}

function resetToLogin() {
  socket?.disconnect();
  socket = null;
  currentRole = null;
  sessionId = null;
  displayName = null;
  symbolSequence = [];
  players = [];

  displayNameInput.value = '';
  sessionIdInput.value = '';
  adminCodeInput.value = '';
  loginError.textContent = '';

  adminPasswordSection.classList.add('hidden');
  adminBtnSection.classList.remove('hidden');

  showScreen(null);
  loginScreen.classList.remove('hidden');
  window.electronAPI.resetWindow();
}

function updateModeIndicator() {
  const modeText = isInteractive ? 'Interactive' : 'Click-through';

  if (adminMode) adminMode.textContent = modeText;
  if (leaderMode) leaderMode.textContent = modeText;

  // Toggle interactive mode class on body
  document.body.classList.toggle('interactive-mode', isInteractive);

  // Add pulse animation on interactive
  if (isInteractive) {
    adminScreen.classList.add('interactive');
    leaderScreen.classList.add('interactive');
    setTimeout(() => {
      adminScreen.classList.remove('interactive');
      leaderScreen.classList.remove('interactive');
    }, 300);
  }
}

function updateAdminUI() {
  adminSessionId.textContent = sessionId;
  updatePlayerCounts();
}

function updateLeaderUI() {
  leaderSessionId.textContent = sessionId;
  updatePlayerCounts();
}

function updatePlayerCounts() {
  const count = players.length;
  const text = `${count} player${count !== 1 ? 's' : ''}`;
  if (adminPlayerCount) adminPlayerCount.textContent = text;
  if (leaderPlayerCount) leaderPlayerCount.textContent = text;
}

// --- Shared role dropdown ---
const roleDropdown = document.getElementById('role-dropdown');
const dropdownOption = document.getElementById('dropdown-option');
let dropdownSocketId = null;

function openRoleDropdown(gear) {
  const socketId = gear.dataset.socketId;
  const role = gear.dataset.role;
  dropdownSocketId = socketId;

  dropdownOption.textContent = role === 'leader' ? 'Demote to Raider' : 'Promote to Raid Leader';

  const rect = gear.getBoundingClientRect();
  roleDropdown.style.top = (rect.bottom + 4) + 'px';
  roleDropdown.style.left = (rect.left - 140) + 'px';
  roleDropdown.style.display = 'block';
}

function closeRoleDropdown() {
  roleDropdown.style.display = 'none';
  dropdownSocketId = null;
}

dropdownOption.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!dropdownSocketId) return;
  const isPromote = dropdownOption.textContent.trim().startsWith('Promote');
  socket.emit('assign_role', { socketId: dropdownSocketId, role: isPromote ? 'leader' : 'raider' });
  closeRoleDropdown();
});
// --- End shared role dropdown ---

function updatePlayersList() {
  if (!playersList) return;

  const nonAdminPlayers = players.filter(p => p.role !== 'admin');

  if (nonAdminPlayers.length === 0) {
    playersList.innerHTML = '<div class="empty-state">Waiting for players to connect...</div>';
    return;
  }

  playersList.innerHTML = nonAdminPlayers.map(player => `
    <div class="player-row">
      <div class="player-dot"></div>
      <span class="player-name">${escapeHtml(player.name)}</span>
      <span class="${player.role === 'leader' ? 'badge-leader-sm' : 'badge-raider-sm'}">
        ${player.role === 'leader' ? 'RL' : 'R'}
      </span>
      <div class="player-gear"
           data-socket-id="${player.socketId}"
           data-role="${player.role}">⚙</div>
    </div>
  `).join('');

  // Attach gear click listeners
  playersList.querySelectorAll('.player-gear').forEach(gear => {
    gear.addEventListener('click', (e) => {
      e.stopPropagation();
      openRoleDropdown(gear);
    });
  });
}

function renderSymbolButtons(container) {
  if (!container) return;

  container.innerHTML = symbols.map(sym => `
    <button class="symbol-btn ${sym.id}" data-symbol="${sym.id}" title="${sym.label}">
      <img src="${getAssetPath(sym.file)}" alt="${sym.label}">
    </button>
  `).join('');

  container.querySelectorAll('.symbol-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const symbol = btn.dataset.symbol;
      if (!btn.disabled && !symbolSequence.includes(symbol)) {
        socket.emit('symbol_add', { symbol });
      }
    });
  });

  updateSymbolButtons();
}

function updateSymbolButtons() {
  document.querySelectorAll('.symbol-btn').forEach(btn => {
    const symbol = btn.dataset.symbol;
    btn.disabled = symbolSequence.includes(symbol);
  });
}

function renderDiagram(container) {
  if (!container) return;

  container.innerHTML = `
    <img class="boss-image" src="${getAssetPath('BossMidnight')}" alt="Midnight">
    <img class="tank-marker" src="file://${assetsPath.replace(/\\/g, '/')}/Shield.png" alt="Tank">
    ${positionAngles.map(({ pos, angle }) => {
      return `
        <div class="position-slot" data-position="${pos}" data-angle="${angle}">
          <div class="slot-tile"></div>
          <span class="slot-number">${pos}</span>
        </div>
      `;
    }).join('')}
  `;

  // Position slots based on container size
  layoutDiagramSlots(container);
  updateDiagram(container);

  // Re-layout on resize
  if (!container._resizeObserver) {
    container._resizeObserver = new ResizeObserver(() => {
      layoutDiagramSlots(container);
    });
    container._resizeObserver.observe(container);
  }
}

function layoutDiagramSlots(container) {
  const rect = container.getBoundingClientRect();
  const size = Math.min(rect.width, rect.height);

  // Scale everything proportionally based on container size
  const tileSize = size * 0.18;
  const radius = size * 0.38;
  const bossSize = size * 0.35;
  const tankSize = size * 0.12;
  const numberSize = Math.max(10, size * 0.05);

  // Scale boss image
  const bossImg = container.querySelector('.boss-image');
  if (bossImg) {
    bossImg.style.width = `${bossSize * 0.75}px`;
    bossImg.style.height = `${bossSize}px`;
  }

  // Scale tank marker
  const tankMarker = container.querySelector('.tank-marker');
  if (tankMarker) {
    tankMarker.style.width = `${tankSize}px`;
    tankMarker.style.height = `${tankSize}px`;
    tankMarker.style.top = `${size * 0.04}px`;
  }

  // Position and scale symbol slots
  container.querySelectorAll('.position-slot').forEach(slot => {
    const angle = parseFloat(slot.dataset.angle);
    const rad = (angle * Math.PI) / 180;

    // Calculate center position for the slot
    const centerX = (size / 2) + radius * Math.cos(rad);
    const centerY = (size / 2) + radius * Math.sin(rad);

    // Position slot (accounting for slot dimensions)
    const slotHeight = tileSize + numberSize + 4;
    slot.style.left = `${centerX - (tileSize / 2)}px`;
    slot.style.top = `${centerY - (tileSize / 2)}px`;
    slot.style.width = `${tileSize}px`;
    slot.style.height = `${slotHeight}px`;

    // Scale the tile
    const tile = slot.querySelector('.slot-tile');
    if (tile) {
      tile.style.width = `${tileSize}px`;
      tile.style.height = `${tileSize}px`;
    }

    // Scale the position number
    const numEl = slot.querySelector('.slot-number');
    if (numEl) {
      numEl.style.fontSize = `${numberSize}px`;
    }
  });
}

function updateDiagram(container) {
  if (!container) return;

  positionAngles.forEach(({ pos }) => {
    const slot = container.querySelector(`.position-slot[data-position="${pos}"]`);
    if (!slot) return;

    const tile = slot.querySelector('.slot-tile');
    const symbolId = symbolSequence[pos - 1];

    // Clear previous state
    tile.className = 'slot-tile';
    tile.innerHTML = '';

    if (symbolId) {
      const symbol = symbols.find(s => s.id === symbolId);
      if (symbol) {
        tile.classList.add('filled', symbolId);
        const img = document.createElement('img');
        img.src = getAssetPath(symbol.file);
        img.alt = symbol.label;
        tile.appendChild(img);
        // Trigger fade in
        requestAnimationFrame(() => {
          img.classList.add('visible');
        });
      }
    }
  });
}

function updateAllDiagrams() {
  updateDiagram(adminDiagram);
  updateDiagram(leaderDiagram);
  updateDiagram(raiderDiagram);
}

function getAssetPath(filename) {
  // Use PNG directly since TGA doesn't work in Chromium
  return `file://${assetsPath.replace(/\\/g, '/')}/${filename}.png`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Setup resize grip for frameless window
function setupResizeGrip() {
  const grip = document.getElementById('resize-grip');
  if (!grip) return;

  let isResizing = false;
  let startX, startY, startWidth, startHeight;

  grip.addEventListener('mousedown', async (e) => {
    isResizing = true;
    startX = e.screenX;
    startY = e.screenY;

    const size = await window.electronAPI.getWindowSize();
    startWidth = size.width;
    startHeight = size.height;

    document.body.style.cursor = 'se-resize';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;

    const dx = e.screenX - startX;
    const dy = e.screenY - startY;
    const newWidth = startWidth + dx;
    const newHeight = startHeight + dy;

    window.electronAPI.setWindowSize(newWidth, newHeight);
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
    }
  });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  init();
  setupResizeGrip();
});
