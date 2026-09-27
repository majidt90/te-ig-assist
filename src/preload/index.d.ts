import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      getStore: (key: string) => Promise<unknown>
      setStore: (key: string, value: unknown) => Promise<boolean>
      getAllStore: () => Promise<Record<string, unknown>>
      platform: NodeJS.Platform
    }
  }
}

export {}
