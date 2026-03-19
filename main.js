const { app, BrowserWindow, globalShortcut, Tray, Menu, screen, nativeImage } = require('electron');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ─── Config ────────────────────────────────────────────────────────────────

function loadConfig() {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  const bundledConfig = path.join(__dirname, 'config.json');

  // On first run, copy bundled config to userData so users can edit it there
  if (!fs.existsSync(configPath)) {
    try {
      fs.copyFileSync(bundledConfig, configPath);
    } catch (e) {
      // Fall back to bundled if copy fails
    }
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    // Fallback to bundled config
    try {
      const raw = fs.readFileSync(bundledConfig, 'utf8');
      return JSON.parse(raw);
    } catch {
      return { hotkey: 'F9', url: 'https://factoriolab.github.io/dsp', window: { width: 1280, height: 800 } };
    }
  }
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  const statePath = path.join(app.getPath('userData'), 'window-state.json');
  try {
    const bounds = win.getBounds();
    fs.writeFileSync(statePath, JSON.stringify(bounds, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save window state:', e.message);
  }
}

function loadWindowState(defaultWidth, defaultHeight) {
  const statePath = path.join(app.getPath('userData'), 'window-state.json');
  try {
    if (fs.existsSync(statePath)) {
      const raw = fs.readFileSync(statePath, 'utf8');
      return JSON.parse(raw);
    }
  } catch {
    // ignore
  }
  return null;
}

// ─── Process detection ─────────────────────────────────────────────────────

function isDspRunning() {
  try {
    const output = execSync('tasklist /FI "IMAGENAME eq DSPGAME.exe" /NH', {
      windowsHide: true,
      timeout: 4000,
    }).toString();
    return output.toLowerCase().includes('dspgame.exe');
  } catch {
    return false;
  }
}

// ─── Startup registration ──────────────────────────────────────────────────

function registerStartup() {
  if (process.platform !== 'win32') return;
  try {
    const { execSync: exec } = require('child_process');
    const exePath = process.execPath;
    const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
    const name = 'DSPFactoriolabOverlay';
    exec(`reg add "${key}" /v "${name}" /t REG_SZ /d "${exePath}" /f`, {
      windowsHide: true,
    });
  } catch (e) {
    console.error('Failed to register startup:', e.message);
  }
}

// ─── Tray icon generation ──────────────────────────────────────────────────

function getTrayIcon() {
  // Try to load bundled tray icon first
  const pngPath = path.join(__dirname, 'tray-icon.png');
  const icoPath = path.join(__dirname, 'tray-icon.ico');

  if (fs.existsSync(icoPath)) {
    return nativeImage.createFromPath(icoPath);
  }
  if (fs.existsSync(pngPath)) {
    return nativeImage.createFromPath(pngPath);
  }

  // Generate a simple fallback icon (16x16 blue square)
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const offset = i * 4;
    buf[offset] = 30;      // R
    buf[offset + 1] = 100; // G
    buf[offset + 2] = 200; // B
    buf[offset + 3] = 255; // A
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

// ─── App state ─────────────────────────────────────────────────────────────

let mainWindow = null;
let tray = null;
let config = null;
let hotkeyRegistered = false;
let pollInterval = null;
let wasGameRunning = false;

// ─── Window management ─────────────────────────────────────────────────────

function createWindow() {
  config = loadConfig();

  const savedState = loadWindowState();
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  const winWidth = (savedState && savedState.width) || config.window?.width || 1280;
  const winHeight = (savedState && savedState.height) || config.window?.height || 800;
  const winX = (savedState && savedState.x != null)
    ? savedState.x
    : Math.round((screenWidth - winWidth) / 2);
  const winY = (savedState && savedState.y != null)
    ? savedState.y
    : Math.round((screenHeight - winHeight) / 2);

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: winX,
    y: winY,
    show: false,               // Hidden on launch
    frame: false,              // Frameless
    transparent: false,
    resizable: true,
    skipTaskbar: false,
    alwaysOnTop: true,
    type: 'screen-saver',      // Renders over fullscreen/borderless-windowed apps on Windows
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Keep alwaysOnTop at the highest level
  mainWindow.setAlwaysOnTop(true, 'screen-saver');

  mainWindow.loadURL(config.url || 'https://factoriolab.github.io/dsp');

  // Save state on move/resize
  mainWindow.on('moved', () => saveWindowState(mainWindow));
  mainWindow.on('resized', () => saveWindowState(mainWindow));

  mainWindow.on('close', (e) => {
    // Intercept close — hide instead of destroying
    e.preventDefault();
    mainWindow.hide();
    updateTrayMenu();
  });
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.show();
  mainWindow.focus();
  updateTrayMenu();
}

function hideWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.hide();
  updateTrayMenu();
}

function toggleWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isVisible()) {
    hideWindow();
  } else {
    showWindow();
  }
}

// ─── Hotkey management ─────────────────────────────────────────────────────

function registerHotkey() {
  if (hotkeyRegistered) return;
  const hotkey = config?.hotkey || 'F9';
  try {
    const ok = globalShortcut.register(hotkey, () => {
      toggleWindow();
    });
    if (!ok) {
      console.warn(`Hotkey "${hotkey}" could not be registered — it may be in use by another app.`);
    } else {
      hotkeyRegistered = true;
      console.log(`Hotkey registered: ${hotkey}`);
    }
  } catch (e) {
    console.error('Error registering hotkey:', e.message);
  }
}

function unregisterHotkey() {
  if (!hotkeyRegistered) return;
  try {
    globalShortcut.unregisterAll();
    hotkeyRegistered = false;
    console.log('Hotkey unregistered');
  } catch (e) {
    console.error('Error unregistering hotkey:', e.message);
  }
}

// ─── Tray ──────────────────────────────────────────────────────────────────

function updateTrayMenu() {
  if (!tray) return;
  const isVisible = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible();
  const contextMenu = Menu.buildFromTemplate([
    {
      label: isVisible ? 'Hide Overlay' : 'Show Overlay',
      click: () => toggleWindow(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.exit(0);
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
}

function createTray() {
  const icon = getTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('DSP Factoriolab Overlay');
  updateTrayMenu();

  // Left-click toggles window
  tray.on('click', () => {
    toggleWindow();
  });
}

// ─── Process polling ───────────────────────────────────────────────────────

function startPolling() {
  if (pollInterval) return;
  pollInterval = setInterval(() => {
    const running = isDspRunning();

    if (running && !wasGameRunning) {
      // Game just started
      console.log('DSP detected — activating hotkey');
      registerHotkey();
      wasGameRunning = true;
    } else if (!running && wasGameRunning) {
      // Game just closed
      console.log('DSP closed — deactivating hotkey and hiding window');
      unregisterHotkey();
      hideWindow();
      wasGameRunning = false;
    }
  }, 5000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// ─── App lifecycle ─────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Prevent multiple instances
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  config = loadConfig();

  createWindow();
  createTray();
  registerStartup();
  startPolling();

  // Run an initial check immediately
  if (isDspRunning()) {
    wasGameRunning = true;
    registerHotkey();
  }
});

app.on('second-instance', () => {
  // Focus existing window if user launches again
  if (mainWindow) {
    showWindow();
  }
});

app.on('will-quit', () => {
  stopPolling();
  unregisterHotkey();
  if (mainWindow && !mainWindow.isDestroyed()) {
    saveWindowState(mainWindow);
  }
});

// Prevent default quit when all windows close — keep running in tray
app.on('window-all-closed', (e) => {
  // No-op: we keep the app alive via the tray
});
