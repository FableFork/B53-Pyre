import { app, BrowserWindow, Notification } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initHandlers, cleanupAllJobs } from './ipc/handlers'

function getIconPath(): string {
  const ext = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  if (app.isPackaged) {
    // Packaged: icon sits next to the resources folder (electron-builder places it there)
    return join(process.resourcesPath, '..', ext)
  }
  // Dev: two levels up from out/main/ to the project root, then into assets/
  return join(__dirname, '../../assets', ext)
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#111111',
    icon: getIconPath(),
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.b53studios.pyre')

  app.on('browser-window-created', (_, win) => {
    optimizer.watchWindowShortcuts(win)
  })

  const win = createWindow()
  initHandlers(win)

  // Enable file drag-and-drop at the OS level
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  cleanupAllJobs()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  cleanupAllJobs()
})
