'use strict'
// Electron port of apps/desktop/src/bun/index.ts (spike).
// Shared-dev mode only: server + web are already running.
const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const path = require('node:path')

const WEB_HOST = process.env.WEB_HOST ?? '127.0.0.1'
const WEB_PORT = process.env.WEB_PORT ?? '5173'
const WEB_URL = `http://${WEB_HOST}:${WEB_PORT}`
const MAIN_WINDOW_TITLE = 'Platform'

// Linux default, same rule as shared/window.ts: the compositor blends an
// opaque window, so the web layer must not draw a wallpaper of its own.
const BACKDROP = process.platform === 'linux' ? 'compositor' : 'app'

async function isHttpReady(url) {
  try {
    const response = await fetch(url)
    return response.ok
  } catch {
    return false
  }
}

async function waitForHttp(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isHttpReady(url)) return
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

ipcMain.handle('platform:pickEntry', async (_event, options) => {
  const properties = []
  if (options?.mode === 'folder') properties.push('openDirectory')
  else properties.push('openFile')
  if (options?.multiple === true) properties.push('multiSelections')

  const result = await dialog.showOpenDialog({
    defaultPath: options?.startingPath || undefined,
    properties,
  })
  return { paths: result.canceled ? [] : result.filePaths }
})

app.whenReady().then(async () => {
  await waitForHttp(WEB_URL)
  const window = new BrowserWindow({
    title: MAIN_WINDOW_TITLE,
    width: 1440,
    height: 960,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      // Read synchronously by the preload, so the page knows its backdrop
      // before it paints — the equivalent of handoffPrelude().
      additionalArguments: [`--platform-backdrop=${BACKDROP}`],
    },
  })
  await window.loadURL(WEB_URL)
})

app.on('window-all-closed', () => app.quit())
