import { app, shell, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from 'electron-store'

// Store for settings & memory
const store = new Store({
  defaults: {
    memory: '',
    autoReplyEnabled: false,
    windowBounds: { width: 1400, height: 900 }
  }
})

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

/**
 * Creates a professional 32×32 tray icon (rounded square + camera glyph).
 * Works on Windows / macOS / Linux without external assets.
 */
function createTrayIcon(): Electron.NativeImage {
  const size = 32
  const buf = Buffer.alloc(size * size * 4)

  const setPixel = (x: number, y: number, r: number, g: number, b: number, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const i = (y * size + x) * 4
    buf[i] = r
    buf[i + 1] = g
    buf[i + 2] = b
    buf[i + 3] = a
  }

  // Rounded rectangle background with soft purple→pink gradient feel
  const radius = 7
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Distance from nearest edge for rounded corners
      const dx = Math.max(radius - x, 0, x - (size - 1 - radius))
      const dy = Math.max(radius - y, 0, y - (size - 1 - radius))
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist > radius + 0.5) continue // outside

      // Gradient: purple (top-left) → pink (bottom-right)
      const t = (x + y) / (size * 2)
      const r = Math.round(168 + (236 - 168) * t) // 168→236
      const g = Math.round(85 + (72 - 85) * t) // 85→72
      const b = Math.round(247 + (153 - 247) * t) // 247→153

      // Soft antialias on edge
      const alpha = dist > radius - 0.8 ? Math.round(255 * (1 - (dist - (radius - 0.8)) / 1.3)) : 255
      setPixel(x, y, r, g, b, Math.max(0, alpha))
    }
  }

  // White camera glyph (simplified Instagram-style)
  // Outer rounded rectangle (camera body)
  const camPad = 8
  const camW = size - camPad * 2
  const camH = size - camPad * 2 - 2
  const camR = 4

  for (let y = camPad; y < camPad + camH; y++) {
    for (let x = camPad; x < camPad + camW; x++) {
      const dx = Math.max(camR - (x - camPad), 0, x - (camPad + camW - 1 - camR))
      const dy = Math.max(camR - (y - camPad), 0, y - (camPad + camH - 1 - camR))
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist <= camR + 0.3) {
        // Only draw the border (ring)
        const inner = dist < camR - 1.6
        if (!inner) setPixel(x, y, 255, 255, 255, 230)
      }
    }
  }

  // Inner circle (lens)
  const cx = size / 2
  const cy = size / 2 + 0.5
  const lensR = 4.2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
      if (d <= lensR && d >= lensR - 1.5) {
        setPixel(x, y, 255, 255, 255, 240)
      }
    }
  }

  // Small top-right dot (flash)
  setPixel(22, 10, 255, 255, 255, 220)
  setPixel(23, 10, 255, 255, 255, 180)
  setPixel(22, 11, 255, 255, 255, 180)

  return nativeImage.createFromBuffer(buf, { width: size, height: size })
}

function createWindow(): void {
  const bounds = store.get('windowBounds') as { width: number; height: number }

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0a0a0a',
    icon: createTrayIcon(), // also use as window icon
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      spellcheck: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('resize', () => {
    if (mainWindow) {
      const [width, height] = mainWindow.getSize()
      store.set('windowBounds', { width, height })
    }
  })

  // Close → hide (stay in tray)
  mainWindow.on('close', (event) => {
    if (!(app as any).isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createTray(): void {
  const icon = createTrayIcon()
  // macOS prefers template images for menu bar; keep colored for brand consistency
  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'نمایش اپلیکیشن',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      }
    },
    {
      label: 'مخفی کردن',
      click: () => mainWindow?.hide()
    },
    { type: 'separator' },
    {
      label: 'خروج',
      click: () => {
        ;(app as any).isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setToolTip('TE IG Assist — دستیار حرفه‌ای اینستاگرام')
  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })

  // Single click also shows on Windows
  tray.on('click', () => {
    if (process.platform === 'win32') {
      mainWindow?.show()
      mainWindow?.focus()
    }
  })
}

// IPC
ipcMain.handle('store:get', (_event, key: string) => store.get(key))
ipcMain.handle('store:set', (_event, key: string, value: unknown) => {
  store.set(key, value)
  return true
})
ipcMain.handle('store:getAll', () => store.store)

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.majidt90.te-ig-assist')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else mainWindow?.show()
  })
})

app.on('window-all-closed', () => {
  // Stay alive in tray
})

app.on('before-quit', () => {
  ;(app as any).isQuitting = true
})
