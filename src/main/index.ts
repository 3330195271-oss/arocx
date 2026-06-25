import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { APP_DISPLAY_NAME, APP_ID } from './app-data-dir'
import { registerIpcHandlers } from './ipc-handlers'

let mainWindow: BrowserWindow | null = null

app.setName(APP_DISPLAY_NAME)
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID)
}

function resolveAppIcon(): string | undefined {
  const candidates = [
    join(process.resourcesPath, 'logo-aro-icon.png'),
    join(process.resourcesPath, 'resources', 'logo-aro-icon.png'),
    join(app.getAppPath(), 'resources', 'logo-aro-icon.png'),
    join(process.cwd(), 'resources', 'logo-aro-icon.png'),
    join(__dirname, '../../resources', 'logo-aro-icon.png')
  ]

  return candidates.find(filePath => existsSync(filePath))
}

function createWindow(): void {
  const appIcon = resolveAppIcon()
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hiddenInset',  // macOS: native traffic lights overlay
    backgroundColor: '#f5f5f7',
    icon: appIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerWindowControls(): void {
  ipcMain.on('window-minimize', () => mainWindow?.minimize())
  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })
  ipcMain.on('window-close', () => mainWindow?.close())
  ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized())
}

app.whenReady().then(() => {
  const appIcon = resolveAppIcon()
  if (process.platform === 'darwin' && appIcon) {
    app.dock.setIcon(appIcon)
  }
  registerWindowControls()
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
