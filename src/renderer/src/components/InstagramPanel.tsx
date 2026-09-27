import { useRef, useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Instagram, RefreshCw, ArrowLeft, ArrowRight, Activity, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '../lib/utils'
import { INJECTOR_SOURCE } from '../lib/instagramInjector'
import { autoReplyController, type ActivityItem } from '../lib/autoReplyController'

export default function InstagramPanel(): JSX.Element {
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [logOpen, setLogOpen] = useState(true) // open by default while debugging

  const injectMonitor = useCallback(async () => {
    const wv = webviewRef.current
    if (!wv) return
    await autoReplyController.ensureInjected(wv, INJECTOR_SOURCE)
    autoReplyController.bindWebview(wv, INJECTOR_SOURCE)
  }, [])

  useEffect(() => {
    void (async () => {
      const [enabled, memory, delay] = await Promise.all([
        window.api.getStore('autoReplyEnabled'),
        window.api.getStore('memory'),
        window.api.getStore('replyDelayMs')
      ])
      autoReplyController.setEnabled(Boolean(enabled))
      autoReplyController.setMemory(typeof memory === 'string' ? memory : '')
      if (typeof delay === 'number') autoReplyController.setReplyDelay(delay)
    })()

    const unsub = autoReplyController.subscribe(setActivities)
    return () => {
      unsub()
      autoReplyController.unbindWebview()
    }
  }, [])

  // Sync store without spamming logs (controller ignores unchanged values)
  useEffect(() => {
    const id = setInterval(async () => {
      const [enabled, memory, delay] = await Promise.all([
        window.api.getStore('autoReplyEnabled'),
        window.api.getStore('memory'),
        window.api.getStore('replyDelayMs')
      ])
      autoReplyController.setEnabled(Boolean(enabled))
      autoReplyController.setMemory(typeof memory === 'string' ? memory : '')
      if (typeof delay === 'number') autoReplyController.setReplyDelay(delay)
    }, 2000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const updateNav = () => {
      setCanGoBack(webview.canGoBack())
      setCanGoForward(webview.canGoForward())
    }

    const handleStart = () => setIsLoading(true)
    const handleStop = () => {
      setIsLoading(false)
      updateNav()
      setTimeout(() => void injectMonitor(), 800)
    }

    const handleConsole = (e: { message?: string }) => {
      const msg = e.message || ''
      if (msg.includes('TE_IG|')) {
        const idx = msg.indexOf('TE_IG|')
        autoReplyController.handleGuestEvent(msg.slice(idx))
      }
    }

    const handleNav = () => {
      updateNav()
      setTimeout(() => void injectMonitor(), 1000)
    }

    webview.addEventListener('did-start-loading', handleStart)
    webview.addEventListener('did-stop-loading', handleStop)
    webview.addEventListener('did-navigate', handleNav)
    webview.addEventListener('did-navigate-in-page', handleNav)
    webview.addEventListener('console-message', handleConsole as EventListener)

    // If already loaded
    setTimeout(() => void injectMonitor(), 1200)

    return () => {
      webview.removeEventListener('did-start-loading', handleStart)
      webview.removeEventListener('did-stop-loading', handleStop)
      webview.removeEventListener('did-navigate', handleNav)
      webview.removeEventListener('did-navigate-in-page', handleNav)
      webview.removeEventListener('console-message', handleConsole as EventListener)
    }
  }, [injectMonitor])

  const handleRefresh = () => webviewRef.current?.reload()
  const handleBack = () => webviewRef.current?.goBack()
  const handleForward = () => webviewRef.current?.goForward()

  const levelColor = (level: ActivityItem['level']): string => {
    switch (level) {
      case 'success':
        return 'text-emerald-400'
      case 'warn':
        return 'text-amber-400'
      case 'error':
        return 'text-red-400'
      default:
        return 'text-white/55'
    }
  }

  return (
    <div className="relative flex h-full w-full flex-col bg-[#0a0a0a]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.06] bg-black/70 px-2.5 backdrop-blur-sm">
        <div className="flex items-center gap-1">
          <button
            onClick={handleBack}
            disabled={!canGoBack}
            className={cn(
              'rounded-md p-1.5 transition-colors',
              canGoBack ? 'text-white/60 hover:bg-white/10 hover:text-white' : 'cursor-not-allowed text-white/20'
            )}
            title="برگشت"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleForward}
            disabled={!canGoForward}
            className={cn(
              'rounded-md p-1.5 transition-colors',
              canGoForward
                ? 'text-white/60 hover:bg-white/10 hover:text-white'
                : 'cursor-not-allowed text-white/20'
            )}
            title="جلو"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>

          <div className="mx-1.5 h-3.5 w-px bg-white/10" />

          <div className="flex items-center gap-1.5 px-1">
            <Instagram className="h-3.5 w-3.5 text-pink-400" />
            <span className="text-[11px] font-medium tracking-wide text-white/50">instagram.com</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setLogOpen((v) => !v)}
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-1 text-[10px] transition-colors',
              logOpen ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/10 hover:text-white'
            )}
            title="لاگ فعالیت"
          >
            <Activity className="h-3.5 w-3.5" />
            لاگ
            {logOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          <button
            onClick={handleRefresh}
            className="rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            title="بارگذاری مجدد"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {logOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-b border-white/[0.06] bg-black/90"
          >
            <div className="max-h-40 space-y-1 overflow-y-auto px-3 py-2">
              {activities.length === 0 ? (
                <p className="text-[11px] text-white/35">
                  منتظر مانیتور… یک گفتگوی دایرکت را باز کنید.
                </p>
              ) : (
                activities.slice(0, 15).map((a) => (
                  <div key={a.id} className="flex gap-2 text-[11px] leading-relaxed">
                    <span className="shrink-0 tabular-nums text-white/30">
                      {new Date(a.at).toLocaleTimeString('fa-IR', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </span>
                    <span className={cn(levelColor(a.level))}>{a.message}</span>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative flex-1">
        <AnimatePresence>
          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 backdrop-blur-[2px]"
            >
              <div className="flex flex-col items-center gap-3">
                <div className="relative h-9 w-9">
                  <div className="absolute inset-0 animate-spin rounded-full border-2 border-pink-500/30 border-t-pink-500" />
                </div>
                <p className="text-[11px] text-white/50">در حال اتصال به اینستاگرام...</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <webview
          ref={webviewRef as any}
          src="https://www.instagram.com/direct/inbox/"
          className="h-full w-full"
          // @ts-expect-error webview attributes
          allowpopups="true"
          partition="persist:instagram"
        />
      </div>
    </div>
  )
}
