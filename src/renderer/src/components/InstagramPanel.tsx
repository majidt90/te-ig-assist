import { useRef, useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Instagram, RefreshCw, ArrowLeft, ArrowRight, Activity, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '../lib/utils'
import { INJECTOR_SOURCE } from '../lib/instagramInjector'
import { autoReplyController, type ActivityItem } from '../lib/autoReplyController'
import type { KeywordRule } from '../lib/types'

export default function InstagramPanel(): JSX.Element {
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [logOpen, setLogOpen] = useState(true)

  const injectMonitor = useCallback(async () => {
    const wv = webviewRef.current
    if (!wv) return
    await autoReplyController.ensureInjected(wv, INJECTOR_SOURCE)
    autoReplyController.bindWebview(wv, INJECTOR_SOURCE)
  }, [])

  const syncStore = useCallback(async () => {
    const [
      enabled,
      memory,
      delay,
      dms,
      comments,
      notifs,
      own,
      mentions,
      kwOn,
      kwRules,
      walk,
      accept,
      fb
    ] = await Promise.all([
      window.api.getStore('autoReplyEnabled'),
      window.api.getStore('memory'),
      window.api.getStore('replyDelayMs'),
      window.api.getStore('autoReplyDms'),
      window.api.getStore('autoReplyComments'),
      window.api.getStore('autoReplyNotifications'),
      window.api.getStore('replyOwnPostComments'),
      window.api.getStore('replyMentions'),
      window.api.getStore('keywordRulesEnabled'),
      window.api.getStore('keywordRules'),
      window.api.getStore('walkUnreadDms'),
      window.api.getStore('acceptFollowRequests'),
      window.api.getStore('followBack')
    ])
    autoReplyController.setEnabled(Boolean(enabled))
    autoReplyController.setMemory(typeof memory === 'string' ? memory : '')
    if (typeof delay === 'number') autoReplyController.setReplyDelay(delay)
    autoReplyController.setFlags({
      autoReplyDms: dms !== false,
      autoReplyComments: comments !== false,
      autoReplyNotifications: notifs !== false,
      replyOwnPostComments: own !== false,
      replyMentions: mentions !== false,
      keywordRulesEnabled: kwOn !== false,
      walkUnreadDms: walk !== false,
      acceptFollowRequests: Boolean(accept),
      followBack: Boolean(fb)
    })
    if (Array.isArray(kwRules)) autoReplyController.setKeywordRules(kwRules as KeywordRule[])
  }, [])

  useEffect(() => {
    void syncStore()
    const unsub = autoReplyController.subscribe(setActivities)
    return () => {
      unsub()
      autoReplyController.unbindWebview()
    }
  }, [syncStore])

  useEffect(() => {
    const id = setInterval(() => void syncStore(), 2000)
    return () => clearInterval(id)
  }, [syncStore])

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
    const handleNav = () => {
      updateNav()
      setTimeout(() => void injectMonitor(), 1000)
    }
    webview.addEventListener('did-start-loading', handleStart)
    webview.addEventListener('did-stop-loading', handleStop)
    webview.addEventListener('did-navigate', handleNav)
    webview.addEventListener('did-navigate-in-page', handleNav)
    setTimeout(() => void injectMonitor(), 1200)
    return () => {
      webview.removeEventListener('did-start-loading', handleStart)
      webview.removeEventListener('did-stop-loading', handleStop)
      webview.removeEventListener('did-navigate', handleNav)
      webview.removeEventListener('did-navigate-in-page', handleNav)
    }
  }, [injectMonitor])

  const levelColor = (level: ActivityItem['level']): string => {
    if (level === 'success') return 'text-emerald-400'
    if (level === 'warn') return 'text-amber-400'
    if (level === 'error') return 'text-red-400'
    return 'text-white/55'
  }

  return (
    <div className="relative flex h-full w-full flex-col bg-[#0a0a0a]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.06] bg-black/70 px-2.5">
        <div className="flex items-center gap-1">
          <button
            onClick={() => webviewRef.current?.goBack()}
            disabled={!canGoBack}
            className={cn('rounded-md p-1.5', canGoBack ? 'text-white/60 hover:bg-white/10' : 'text-white/20')}
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => webviewRef.current?.goForward()}
            disabled={!canGoForward}
            className={cn('rounded-md p-1.5', canGoForward ? 'text-white/60 hover:bg-white/10' : 'text-white/20')}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <div className="mx-1.5 h-3.5 w-px bg-white/10" />
          <div className="flex items-center gap-1.5 px-1">
            <Instagram className="h-3.5 w-3.5 text-pink-400" />
            <span className="text-[11px] text-white/50">instagram.com</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setLogOpen((v) => !v)}
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-1 text-[10px]',
              logOpen ? 'bg-white/10 text-white' : 'text-white/50'
            )}
          >
            <Activity className="h-3.5 w-3.5" />
            لاگ
            {logOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          <button onClick={() => webviewRef.current?.reload()} className="rounded-md p-1.5 text-white/50">
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
            className="overflow-hidden border-b border-white/[0.06] bg-black/90"
          >
            <div className="max-h-44 space-y-1 overflow-y-auto px-3 py-2">
              {activities.length === 0 ? (
                <p className="text-[11px] text-white/35">منتظر رویداد…</p>
              ) : (
                activities.slice(0, 20).map((a) => (
                  <div key={a.id} className="flex gap-2 text-[11px]">
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
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-pink-500/30 border-t-pink-500" />
          </div>
        )}
        <webview
          ref={webviewRef as any}
          src="https://www.instagram.com/direct/inbox/"
          className="h-full w-full"
          // @ts-expect-error webview
          allowpopups="true"
          partition="persist:instagram"
        />
      </div>
    </div>
  )
}
