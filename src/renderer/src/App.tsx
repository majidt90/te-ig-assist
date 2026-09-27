import { useState, useEffect } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { motion } from 'framer-motion'
import { Settings, MessageSquare, Brain, Power, Instagram } from 'lucide-react'
import InstagramPanel from './components/InstagramPanel'
import SettingsPanel from './components/SettingsPanel'
import { cn } from './lib/utils'

function App(): JSX.Element {
  const [activeTab, setActiveTab] = useState<'settings' | 'memory'>('settings')
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    // Load initial state
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
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" />
          <p className="text-sm text-[hsl(var(--muted-foreground))]">در حال بارگذاری...</p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Top Bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--card)/0.6)] px-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-pink-500">
            <Instagram className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight">TE IG Assist</h1>
            <p className="text-[10px] text-[hsl(var(--muted-foreground))]">دستیار حرفه‌ای اینستاگرام</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleAutoReply}
            className={cn(
              'flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-300',
              autoReplyEnabled
                ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30'
                : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]'
            )}
          >
            <Power className={cn('h-3.5 w-3.5', autoReplyEnabled && 'animate-pulse-soft')} />
            {autoReplyEnabled ? 'پاسخ‌گویی فعال' : 'پاسخ‌گویی غیرفعال'}
          </button>
        </div>
      </header>

      {/* Main Content - Resizable Panels */}
      <PanelGroup direction="horizontal" className="flex-1">
        {/* Left: Instagram Panel */}
        <Panel defaultSize={68} minSize={40} className="relative">
          <InstagramPanel />
        </Panel>

        {/* Resize Handle */}
        <PanelResizeHandle className="group relative w-1.5 bg-transparent transition-colors hover:bg-[hsl(var(--primary)/0.3)]">
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[hsl(var(--border))] transition-all group-hover:bg-[hsl(var(--primary))] group-hover:w-0.5" />
        </PanelResizeHandle>

        {/* Right: Settings / Memory Panel */}
        <Panel defaultSize={32} minSize={22} maxSize={45} className="relative">
          <div className="flex h-full flex-col border-l border-[hsl(var(--border))] bg-[hsl(var(--card)/0.4)]">
            {/* Tabs */}
            <div className="flex shrink-0 border-b border-[hsl(var(--border))]">
              <button
                onClick={() => setActiveTab('settings')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 py-3 text-xs font-medium transition-all duration-200',
                  activeTab === 'settings'
                    ? 'border-b-2 border-[hsl(var(--primary))] text-[hsl(var(--primary))]'
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                )}
              >
                <Settings className="h-3.5 w-3.5" />
                تنظیمات
              </button>
              <button
                onClick={() => setActiveTab('memory')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 py-3 text-xs font-medium transition-all duration-200',
                  activeTab === 'memory'
                    ? 'border-b-2 border-[hsl(var(--primary))] text-[hsl(var(--primary))]'
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                )}
              >
                <Brain className="h-3.5 w-3.5" />
                حافظه
              </button>
            </div>

            {/* Panel Content */}
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
