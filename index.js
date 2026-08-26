const { app, BrowserWindow, powerSaveBlocker } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

/** @type {BrowserWindow | null} */
let winRef = null;
let powerSaveBlockerId = null;

function createWindow() {
  winRef = new BrowserWindow({
    width: 300,
    height: 130,
    resizable: false,
    maximizable: false,
    titleBarStyle: "hidden",
    alwaysOnTop: true,
    backgroundColor: "#1a1a1a",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Keep setTimeout cadence accurate while the window is backgrounded/minimized
      backgroundThrottling: false,
    },
  });

  // Prevent OS timer coalescing / app suspension that desynchronizes tap trains
  if (powerSaveBlockerId === null) {
    powerSaveBlockerId = powerSaveBlocker.start("prevent-app-suspension");
  }

  winRef.loadURL(pathToFileURL(path.join(__dirname, "www", "midi.html")).href);

  winRef.on("closed", () => {
    winRef = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId)) {
    powerSaveBlocker.stop(powerSaveBlockerId);
    powerSaveBlockerId = null;
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});
