import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  getStore: (key: string) => ipcRenderer.invoke('store:get', key),
  setStore: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
  getAllStore: () => ipcRenderer.invoke('store:getAll'),
  getMachineId: () => ipcRenderer.invoke('machine:id') as Promise<string>,
  platform: process.platform
})

declare global {
  interface Window {
    api: {
      getStore: (key: string) => Promise<unknown>
      setStore: (key: string, value: unknown) => Promise<boolean>
      getAllStore: () => Promise<Record<string, unknown>>
      getMachineId: () => Promise<string>
      platform: NodeJS.Platform
    }
  }
}
