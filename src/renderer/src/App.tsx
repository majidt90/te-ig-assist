import { useState, useEffect } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { motion } from 'framer-motion'
import { Settings, Brain, Power, Zap, Play, Timer, RefreshCw, Info } from 'lucide-react'
import InstagramPanel from './components/InstagramPanel'
import SettingsPanel from './components/SettingsPanel'
import AboutPanel from './components/AboutPanel'
import LicenseGate from './components/LicenseGate'
import { AppMark } from './components/AboutPanel'
import { cn } from './lib/utils'
import { autoReplyController } from './lib/autoReplyController'
import { validateLicense } from './lib/license'

export type TabId = 'settings' | 'memory' | 'rules' | 'about'

function App(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('settings')
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false)
  const [autoCycle, setAutoCycle] = useState(true)
  const [cycleMinutes, setCycleMinutes] = useState(1)
  const [isReady, setIsReady] = useState(false)
  const [licensed, setLicensed] = useState(false)

  useEffect(() => {
    void (async () => {
      const [en, cycle, interval, activated, u, e, key] = await Promise.all([
        window.api.getStore('autoReplyEnabled'),
        window.api.getStore('autoCycle'),
        window.api.getStore('cycleIntervalMs'),
        window.api.getStore('licenseActivated'),
        window.api.getStore('licenseUsername'),
        window.api.getStore('licenseEmail'),
        window.api.getStore('licenseKey')
      ])
      setAutoReplyEnabled(Boolean(en))
      setAutoCycle(cycle !== false)
      if (typeof interval === 'number') setCycleMinutes(Math.max(0.25, interval / 60000))
      autoReplyController.setAutoCycle(cycle !== false)
      if (typeof interval === 'number') autoReplyController.setCycleIntervalMs(interval)

      if (activated && typeof u === 'string' && typeof e === 'string' && typeof key === 'string') {
        const ok = await validateLicense(u, e, key)
        const machineId = await window.api.getMachineId()
        const bound = String((await window.api.getStore('licenseMachineId')) || '')
        let deviceOk = true
        if (ok.ok) {
          if (!bound) {
            await window.api.setStore('licenseMachineId', machineId)
          } else if (bound !== machineId) {
            deviceOk = false
            await window.api.setStore('licenseActivated', false)
          }
        }
        setLicensed(ok.ok && deviceOk)
        if (ok.ok && deviceOk && ok.expiresAt) {
          await window.api.setStore('licenseExpiresAt', ok.expiresAt)
          if (ok.lock) await window.api.setStore('licenseLock', ok.lock)
        }
        if (!ok.ok) await window.api.setStore('licenseActivated', false)
      } else {
        setLicensed(false)
      }
      setIsReady(true)
    })()
  }, [])

  const toggleAutoReply = async () => {
    const next = !autoReplyEnabled
    setAutoReplyEnabled(next)
    autoReplyController.setEnabled(next)
    await window.api.setStore('autoReplyEnabled', next)
  }

  const toggleAutoCycle = async () => {
    const next = !autoCycle
    setAutoCycle(next)
    autoReplyController.setAutoCycle(next)
    await window.api.setStore('autoCycle', next)
  }

  const onCycleMinutesChange = async (mins: number) => {
    const m = Math.max(0.25, Math.min(180, mins))
    setCycleMinutes(m)
    const ms = Math.round(m * 60_000)
    autoReplyController.setCycleIntervalMs(ms)
    await window.api.setStore('cycleIntervalMs', ms)
  }

  const tabs: { id: TabId; label: string; icon: typeof Settings }[] = [
    { id: 'settings', label: 'تنظیمات', icon: Settings },
    { id: 'memory', label: 'حافظه', icon: Brain },
    { id: 'rules', label: 'قوانین', icon: Zap },
    { id: 'about', label: 'درباره', icon: Info }
  ]

  if (!isReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-[hsl(var(--background))]">
        <RefreshCw className="h-6 w-6 animate-spin text-[hsl(var(--primary))]" />
      </div>
    )
  }

  if (!licensed) {
    return <LicenseGate onActivated={() => setLicensed(true)} />
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[hsl(var(--border)/0.7)] bg-[hsl(var(--card)/0.6)] px-3 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <AppMark className="h-7 w-7" />
          <div className="leading-tight">
            <div className="text-[12px] font-semibold">TE IG Assist</div>
            <div className="text-[9px] text-[hsl(var(--muted-foreground))]">دستیار حرفه‌ای اینستاگرام</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void toggleAutoReply()}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-all',
              autoReplyEnabled
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                : 'border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] text-[hsl(var(--muted-foreground))]'
            )}
          >
            <Power className="h-3.5 w-3.5" />
            {autoReplyEnabled ? 'فعال' : 'خاموش'}
          </button>

          <button
            type="button"
            onClick={() => autoReplyController.forceRun()}
            className="flex items-center gap-1.5 rounded-full border border-[hsl(var(--primary)/0.35)] bg-[hsl(var(--primary)/0.12)] px-3 py-1.5 text-[11px] font-medium text-[hsl(var(--primary))]"
          >
            <Play className="h-3.5 w-3.5" />
            اجرا فورس
          </button>

          <button
            type="button"
            onClick={() => void toggleAutoCycle()}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium',
              autoCycle
                ? 'border-sky-500/40 bg-sky-500/15 text-sky-300'
                : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]'
            )}
          >
            <Timer className="h-3.5 w-3.5" />
            {autoCycle ? 'اتوماتیک' : 'دستی'}
          </button>

          <div className="flex items-center gap-1 rounded-full border border-[hsl(var(--border))] px-2 py-1 text-[11px]">
            <input
              type="number"
              min={0.25}
              step={0.25}
              value={cycleMinutes}
              onChange={(e) => void onCycleMinutesChange(Number(e.target.value) || 1)}
              className="w-10 border-0 bg-transparent text-center text-[11px] outline-none"
            />
            <span className="text-[hsl(var(--muted-foreground))]">دقیقه</span>
          </div>
        </div>
      </header>

      <PanelGroup direction="horizontal" className="flex-1">
        <Panel defaultSize={68} minSize={42}>
          <InstagramPanel />
        </Panel>

        <PanelResizeHandle className="group relative z-10 w-2 bg-transparent hover:bg-[hsl(var(--primary)/0.12)]">
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[hsl(var(--border))] group-hover:w-[2px] group-hover:bg-[hsl(var(--primary)/0.7)]" />
          <div className="resize-grip">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </PanelResizeHandle>

        <Panel defaultSize={32} minSize={22} maxSize={48}>
          <div className="flex h-full flex-col border-l border-[hsl(var(--border)/0.7)] bg-[hsl(var(--card)/0.35)]">
            <div className="flex shrink-0 border-b border-[hsl(var(--border)/0.7)]">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    'relative flex flex-1 items-center justify-center gap-1 py-3 text-[10px] font-medium transition-colors',
                    activeTab === id
                      ? 'text-[hsl(var(--primary))]'
                      : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                  {label}
                  {activeTab === id && (
                    <motion.div
                      layoutId="tab-indicator"
                      className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-[hsl(var(--primary))]"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-hidden">
              {activeTab === 'about' ? <AboutPanel /> : <SettingsPanel activeTab={activeTab} />}
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}

export default App
