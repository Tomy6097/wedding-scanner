const { app, BrowserWindow, Tray, Menu, shell, dialog, nativeImage } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let mainWindow = null;
let tray = null;
let serverProcess = null;
let serverReady = false;
const PORT = 3000;

// ── Fix paths when running as packaged app ────────────────────
function getResourcePath(...segments) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ...segments);
  }
  return path.join(__dirname, '..', ...segments);
}

// ── Start the Express server as a child process ───────────────
function startServer() {
  const serverPath = getResourcePath('server', 'index.js');

  serverProcess = fork(serverPath, [], {
    env: {
      ...process.env,
      PORT: String(PORT),
      ELECTRON: '1',
      DATA_DIR: getDataDir()
    },
    silent: true
  });

  serverProcess.stdout.on('data', (data) => {
    const msg = data.toString();
    console.log('[Server]', msg);
    if (msg.includes('running at')) {
      serverReady = true;
      if (mainWindow) loadApp();
    }
  });

  serverProcess.stderr.on('data', (data) => {
    console.error('[Server Error]', data.toString());
  });

  serverProcess.on('exit', (code) => {
    console.log('[Server] exited with code', code);
  });
}

// ── Data directory: use userData so it persists ───────────────
function getDataDir() {
  const userDataPath = app.getPath('userData');
  const fs = require('fs');
  const dataDir = path.join(userDataPath, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

// ── Create the main window ────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Wedding Check-in System',
    icon: getIconPath(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    show: false, // show after ready
    backgroundColor: '#f9fafb'
  });

  // Show loading screen while server starts
  mainWindow.loadFile(path.join(__dirname, 'loading.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Open external links in browser, not in app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (e) => {
    if (process.platform !== 'darwin') return;
    e.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function loadApp() {
  if (!mainWindow) return;
  mainWindow.loadURL(`http://localhost:${PORT}`);
}

// ── Tray icon ─────────────────────────────────────────────────
function createTray() {
  let trayIcon;
  const iconPath = getIconPath();
  if (iconPath) {
    trayIcon = nativeImage.createFromPath(iconPath);
  }
  // Fall back to empty image if icon missing
  if (!trayIcon || trayIcon.isEmpty()) {
    trayIcon = nativeImage.createEmpty();
  }
  tray = new Tray(trayIcon);

  const menu = Menu.buildFromTemplate([
    {
      label: 'Open Wedding Check-in',
      click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
        else createWindow();
      }
    },
    { type: 'separator' },
    {
      label: 'Open in Browser',
      click: () => shell.openExternal(`http://localhost:${PORT}`)
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Wedding Check-in System');
  tray.setContextMenu(menu);
  tray.on('double-click', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });
}

function getIconPath() {
  const { existsSync } = require('fs');
  const ico = path.join(__dirname, 'icon.ico');
  const png = path.join(__dirname, 'icon.png');
  const svg = path.join(__dirname, 'icon.svg');
  if (existsSync(ico)) return ico;
  if (existsSync(png)) return png;
  if (existsSync(svg)) return svg;
  return ''; // no icon, electron will use default
}

// ── App lifecycle ─────────────────────────────────────────────
app.whenReady().then(() => {
  startServer();
  createWindow();
  createTray();

  // If server takes too long, load anyway after 8 seconds
  setTimeout(() => {
    if (!serverReady && mainWindow) loadApp();
  }, 8000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep running in tray on Windows
    // app.quit() — don't quit, stay in tray
  }
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
  else mainWindow.show();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
