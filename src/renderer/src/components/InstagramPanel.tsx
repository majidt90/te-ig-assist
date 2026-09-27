import { useRef, useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Instagram,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  Activity,
  ChevronDown,
  ChevronUp,
  Copy,
  Check
} from 'lucide-react'
import { cn } from '../lib/utils'
import { INJECTOR_SOURCE } from '../lib/instagramInjector'
import { autoReplyController, type ActivityItem } from '../lib/autoReplyController'
import type { DmListMode, KeywordRule } from '../lib/types'

export default function InstagramPanel(): JSX.Element {
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [logOpen, setLogOpen] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)

  const injectMonitor = useCallback(async () => {
    const wv = webviewRef.current
    if (!wv) return
    await autoReplyController.ensureInjected(wv, INJECTOR_SOURCE)
    autoReplyController.bindWebview(wv, INJECTOR_SOURCE)
  }, [])

  const syncStore = useCallback(async () => {
    const vals = await Promise.all([
      window.api.getStore('autoReplyEnabled'),
      window.api.getStore('memory'),
      window.api.getStore('logic'),
      window.api.getStore('autoReplyDms'),
      window.api.getStore('autoReplyComments'),
      window.api.getStore('autoReplyNotifications'),
      window.api.getStore('delayDmsMs'),
      window.api.getStore('delayCommentsMs'),
      window.api.getStore('delayNotificationsMs'),
      window.api.getStore('replyOwnPostComments'),
      window.api.getStore('replyMentions'),
      window.api.getStore('keywordRulesEnabled'),
      window.api.getStore('keywordRules'),
      window.api.getStore('walkUnreadDms'),
      window.api.getStore('acceptFollowRequests'),
      window.api.getStore('followBack'),
      window.api.getStore('autoCycle'),
      window.api.getStore('cycleIntervalMs'),
      window.api.getStore('dmListMode'),
      window.api.getStore('dmUserList')
    ])
    const [
      enabled,
      memory,
      logic,
      dms,
      comments,
      notifs,
      dDms,
      dCmt,
      dNotif,
      own,
      mentions,
      kwOn,
      kwRules,
      walk,
      accept,
      fb,
      autoCycle,
      cycleMs,
      dmMode,
      dmUsers
    ] = vals

    autoReplyController.setEnabled(Boolean(enabled))
    autoReplyController.setMemory(typeof memory === 'string' ? memory : '')
    autoReplyController.setLogic(typeof logic === 'string' ? logic : '')
    autoReplyController.setAutoCycle(autoCycle !== false)
    if (typeof cycleMs === 'number') autoReplyController.setCycleIntervalMs(cycleMs)
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
    autoReplyController.setDelays({
      delayDmsMs: typeof dDms === 'number' ? dDms : 2500,
      delayCommentsMs: typeof dCmt === 'number' ? dCmt : 3000,
      delayNotificationsMs: typeof dNotif === 'number' ? dNotif : 3000
    })
    const mode: DmListMode =
      dmMode === 'whitelist' || dmMode === 'blacklist' || dmMode === 'off' ? dmMode : 'off'
    autoReplyController.setDmFilter({
      mode,
      users: Array.isArray(dmUsers) ? (dmUsers as string[]) : []
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

  const formatLine = (a: ActivityItem): string => {
    const t = new Date(a.at).toLocaleTimeString('fa-IR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
    return `${t}\t[${a.level}]\t${a.message}`
  }

  const copyOne = async (a: ActivityItem) => {
    try {
      await navigator.clipboard.writeText(formatLine(a))
      setCopiedId(a.id)
      setTimeout(() => setCopiedId(null), 1200)
    } catch {
      /* ignore */
    }
  }

  const copyAll = async () => {
    try {
      const text = activities.map(formatLine).join('\n')
      await navigator.clipboard.writeText(text)
      setCopiedAll(true)
      setTimeout(() => setCopiedAll(false), 1500)
    } catch {
      /* ignore */
    }
  }

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
            <div className="flex items-center justify-between border-b border-white/[0.04] px-3 py-1">
              <span className="text-[10px] text-white/35">{activities.length} ردیف (حداکثر ۲۰۰)</span>
              <button
                onClick={() => void copyAll()}
                className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-white/60 hover:bg-white/10 hover:text-white"
              >
                {copiedAll ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                {copiedAll ? 'کپی شد' : 'کپی همه'}
              </button>
            </div>
            <div className="max-h-52 space-y-0.5 overflow-y-auto px-2 py-1.5">
              {activities.length === 0 ? (
                <p className="px-1 text-[11px] text-white/35">منتظر رویداد…</p>
              ) : (
                activities.map((a) => (
                  <div
                    key={a.id}
                    className="group flex items-start gap-1.5 rounded px-1 py-0.5 hover:bg-white/[0.04]"
                  >
                    <span className="shrink-0 tabular-nums text-[10px] text-white/30">
                      {new Date(a.at).toLocaleTimeString('fa-IR', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </span>
                    <span className={cn('min-w-0 flex-1 text-[11px]', levelColor(a.level))}>{a.message}</span>
                    <button
                      onClick={() => void copyOne(a)}
                      className="shrink-0 rounded p-0.5 text-white/20 opacity-0 group-hover:opacity-100 hover:text-white/70"
                      title="کپی این خط"
                    >
                      {copiedId === a.id ? (
                        <Check className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
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
