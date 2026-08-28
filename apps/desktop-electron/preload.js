'use strict'
const { contextBridge, ipcRenderer } = require('electron')

const flag = process.argv.find((a) => a.startsWith('--platform-backdrop='))
const backdrop = flag ? flag.slice('--platform-backdrop='.length) : 'app'

contextBridge.exposeInMainWorld('platformBridge', {
  backdrop,
  pickEntry: async (options) => {
    const result = await ipcRenderer.invoke('platform:pickEntry', options)
    return result.paths
  },
})
