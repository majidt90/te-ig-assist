import { useState, useEffect } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { motion } from 'framer-motion'
import { Settings, Brain, Power, Instagram, Zap, Play, Timer, RefreshCw } from 'lucide-react'
import InstagramPanel from './components/InstagramPanel'
import SettingsPanel from './components/SettingsPanel'
import { cn } from './lib/utils'
import { autoReplyController } from './lib/autoReplyController'

type TabId = 'settings' | 'memory' | 'rules'

function App(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('settings')
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false)
  const [autoCycle, setAutoCycle] = useState(true)
  const [cycleMinutes, setCycleMinutes] = useState(1)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    void (async () => {
      const [en, cycle, interval] = await Promise.all([
        window.api.getStore('autoReplyEnabled'),
        window.api.getStore('autoCycle'),
        window.api.getStore('cycleIntervalMs')
      ])
      setAutoReplyEnabled(Boolean(en))
      setAutoCycle(cycle !== false)
      if (typeof interval === 'number') setCycleMinutes(Math.max(0.25, interval / 60000))
      autoReplyController.setAutoCycle(cycle !== false)
      if (typeof interval === 'number') autoReplyController.setCycleIntervalMs(interval)
      setIsReady(true)
    })()
  }, [])

  const toggleAutoReply = async () => {
    const next = !autoReplyEnabled
    setAutoReplyEnabled(next)
    await window.api.setStore('autoReplyEnabled', next)
  }

  const toggleAutoCycle = async () => {
    const next = !autoCycle
    setAutoCycle(next)
    await window.api.setStore('autoCycle', next)
    autoReplyController.setAutoCycle(next)
  }

  const onCycleMinutesChange = async (m: number) => {
    setCycleMinutes(m)
    const ms = Math.round(m * 60_000)
    await window.api.setStore('cycleIntervalMs', ms)
    autoReplyController.setCycleIntervalMs(ms)
  }

  const onForceRun = () => {
    autoReplyController.forceRun()
  }

  if (!isReady) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[hsl(var(--background))]">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-5"
        >
          <div className="relative">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg shadow-purple-500/30" />
            <div className="absolute inset-0 animate-ping rounded-2xl bg-purple-500/30" />
          </div>
          <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">
            در حال آماده‌سازی دستیار...
          </p>
        </motion.div>
      </div>
    )
  }

  const tabs: { id: TabId; label: string; icon: typeof Settings }[] = [
    { id: 'settings', label: 'تنظیمات', icon: Settings },
    { id: 'memory', label: 'حافظه', icon: Brain },
    { id: 'rules', label: 'قوانین', icon: Zap }
  ]

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <header className="panel-glass z-20 flex h-13 shrink-0 items-center justify-between gap-2 px-3">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 via-fuchsia-500 to-pink-500 shadow-md shadow-purple-500/25">
            <Instagram className="h-4 w-4 text-white" strokeWidth={2.2} />
          </div>
          <div className="leading-tight">
            <h1 className="text-[13px] font-semibold tracking-tight">TE IG Assist</h1>
            <p className="text-[10px] text-[hsl(var(--muted-foreground))]">دستیار حرفه‌ای اینستاگرام</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-medium',
              autoReplyEnabled
                ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/25'
                : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]'
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                autoReplyEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-[hsl(var(--muted-foreground))]'
              )}
            />
            {autoReplyEnabled ? 'فعال' : 'غیرفعال'}
          </div>

          <button
            onClick={toggleAutoReply}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-medium transition-all',
              autoReplyEnabled
                ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30'
                : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]'
            )}
          >
            <Power className="h-3.5 w-3.5" />
            {autoReplyEnabled ? 'روشن' : 'خاموش'}
          </button>

          <button
            onClick={onForceRun}
            disabled={!autoReplyEnabled}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-medium',
              autoReplyEnabled
                ? 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30 hover:bg-sky-500/25'
                : 'cursor-not-allowed bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] opacity-50'
            )}
            title="اجرای فوری قابلیت‌های فعال"
          >
            <Play className="h-3.5 w-3.5" />
            اجرا فورس
          </button>

          <button
            onClick={toggleAutoCycle}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-medium',
              autoCycle
                ? 'bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30'
                : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]'
            )}
            title="چرخه خودکار دوره‌ای"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', autoCycle && 'animate-spin-slow')} />
            {autoCycle ? 'اتوماتیک' : 'دستی'}
          </button>

          <div className="flex items-center gap-1 rounded-full bg-[hsl(var(--secondary))] px-2 py-1 text-[10px]">
            <Timer className="h-3 w-3 text-[hsl(var(--muted-foreground))]" />
            <input
              type="number"
              min={0.25}
              max={30}
              step={0.25}
              value={cycleMinutes}
              onChange={(e) => void onCycleMinutesChange(Number(e.target.value) || 1)}
              className="w-10 border-0 bg-transparent text-center text-[11px] outline-none"
              title="فاصله چرخه (دقیقه)"
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
                    'relative flex flex-1 items-center justify-center gap-1.5 py-3 text-[11px] font-medium transition-colors',
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
              <SettingsPanel activeTab={activeTab} />
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}

export default App
