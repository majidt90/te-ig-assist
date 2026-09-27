import { contextBridge, ipcRenderer } from 'electron'

// Expose a secure API to the renderer
contextBridge.exposeInMainWorld('api', {
  // Store (settings + memory)
  getStore: (key: string) => ipcRenderer.invoke('store:get', key),
  setStore: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
  getAllStore: () => ipcRenderer.invoke('store:getAll'),

  // Platform info
  platform: process.platform
})

// Type declaration for TypeScript
declare global {
  interface Window {
    api: {
      getStore: (key: string) => Promise<unknown>
      setStore: (key: string, value: unknown) => Promise<boolean>
      getAllStore: () => Promise<Record<string, unknown>>
      platform: NodeJS.Platform
    }
  }
}
