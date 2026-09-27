import { useState, useEffect } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { motion } from 'framer-motion'
import { Settings, Brain, Power, Instagram } from 'lucide-react'
import InstagramPanel from './components/InstagramPanel'
import SettingsPanel from './components/SettingsPanel'
import { cn } from './lib/utils'

function App(): JSX.Element {
  const [activeTab, setActiveTab] = useState<'settings' | 'memory'>('settings')
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    window.api.getStore('autoReplyEnabled').then((val) => {
      setAutoReplyEnabled(Boolean(val))
      setIsReady(true)
    })
  }, [])

  const toggleAutoReply = async () => {
    const next = !autoReplyEnabled
    setAutoReplyEnabled(next)
    await window.api.setStore('autoReplyEnabled', next)
  }

  if (!isReady) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[hsl(var(--background))]">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
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

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* ── Top Bar ── */}
      <header className="panel-glass z-20 flex h-13 shrink-0 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 via-fuchsia-500 to-pink-500 shadow-md shadow-purple-500/25">
            <Instagram className="h-4 w-4 text-white" strokeWidth={2.2} />
          </div>
          <div className="leading-tight">
            <h1 className="text-[13px] font-semibold tracking-tight">TE IG Assist</h1>
            <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
              دستیار حرفه‌ای اینستاگرام
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Live status pill */}
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium transition-all duration-300',
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
              'group flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-300',
              autoReplyEnabled
                ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25'
                : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]'
            )}
          >
            <Power
              className={cn(
                'h-3.5 w-3.5 transition-transform duration-300',
                autoReplyEnabled && 'scale-110'
              )}
            />
            {autoReplyEnabled ? 'پاسخ‌گویی روشن' : 'پاسخ‌گویی خاموش'}
          </button>
        </div>
      </header>

      {/* ── Main split layout ── */}
      <PanelGroup direction="horizontal" className="flex-1">
        {/* Left – Instagram */}
        <Panel defaultSize={68} minSize={42} className="relative">
          <InstagramPanel />
        </Panel>

        {/* Resize Handle */}
        <PanelResizeHandle className="group relative z-10 w-2 bg-transparent transition-colors duration-200 hover:bg-[hsl(var(--primary)/0.12)] data-[resize-handle-active]:bg-[hsl(var(--primary)/0.2)]">
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[hsl(var(--border))] transition-all duration-200 group-hover:bg-[hsl(var(--primary)/0.7)] group-hover:w-[2px] group-data-[resize-handle-active]:bg-[hsl(var(--primary))] group-data-[resize-handle-active]:w-[2px]" />
          {/* Grip dots */}
          <div className="resize-grip">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </PanelResizeHandle>

        {/* Right – Settings / Memory */}
        <Panel defaultSize={32} minSize={22} maxSize={46} className="relative">
          <div className="flex h-full flex-col border-l border-[hsl(var(--border)/0.7)] bg-[hsl(var(--card)/0.35)]">
            {/* Tabs */}
            <div className="flex shrink-0 border-b border-[hsl(var(--border)/0.7)]">
              {(
                [
                  { id: 'settings' as const, label: 'تنظیمات', icon: Settings },
                  { id: 'memory' as const, label: 'حافظه', icon: Brain }
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    'relative flex flex-1 items-center justify-center gap-2 py-3 text-xs font-medium transition-colors duration-200',
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
                      className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-[hsl(var(--primary))]"
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
