const {app, BrowserWindow} = require('electron');
const path = require('path');
const url = require('url');

let winRef;
function createWindow () {
  winRef = new BrowserWindow({
    width: 300,
    height: 130,
    titleBarStyle: 'hidden'
  });
 winRef.setAlwaysOnTop(true);
  // winRef.webContents.openDevTools();
  winRef.loadURL(url.format({
    pathname: path.join(__dirname, 'www/midi.html'),
    protocol: 'file:',
    slashes: true
  }));

  winRef.on('closed', () => {
    winRef = null;
  })
}

app.on('ready', () => {
  createWindow();
});

app.on('window-all-closed', () => {
  if (!process.platform.includes('darwin')) {
    app.quit();
  }
});

app.on('activate', () => {
  if (winRef === null) {
    createWindow();
  }
});