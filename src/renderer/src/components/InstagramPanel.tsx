import { useRef, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Instagram, RefreshCw, ArrowLeft, ArrowRight } from 'lucide-react'
import { cn } from '../lib/utils'

export default function InstagramPanel(): JSX.Element {
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)

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
    }

    webview.addEventListener('did-start-loading', handleStart)
    webview.addEventListener('did-stop-loading', handleStop)
    webview.addEventListener('did-navigate', updateNav)
    webview.addEventListener('did-navigate-in-page', updateNav)

    return () => {
      webview.removeEventListener('did-start-loading', handleStart)
      webview.removeEventListener('did-stop-loading', handleStop)
      webview.removeEventListener('did-navigate', updateNav)
      webview.removeEventListener('did-navigate-in-page', updateNav)
    }
  }, [])

  const handleRefresh = () => webviewRef.current?.reload()
  const handleBack = () => webviewRef.current?.goBack()
  const handleForward = () => webviewRef.current?.goForward()

  return (
    <div className="relative flex h-full w-full flex-col bg-[#0a0a0a]">
      {/* Toolbar */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.06] bg-black/70 px-2.5 backdrop-blur-sm">
        <div className="flex items-center gap-1">
          <button
            onClick={handleBack}
            disabled={!canGoBack}
            className={cn(
              'rounded-md p-1.5 transition-colors',
              canGoBack
                ? 'text-white/60 hover:bg-white/10 hover:text-white'
                : 'text-white/20 cursor-not-allowed'
            )}
            title="برگشت"
          >
            <ArrowRight className="h-3.5 w-3.5" /> {/* RTL: right = back */}
          </button>
          <button
            onClick={handleForward}
            disabled={!canGoForward}
            className={cn(
              'rounded-md p-1.5 transition-colors',
              canGoForward
                ? 'text-white/60 hover:bg-white/10 hover:text-white'
                : 'text-white/20 cursor-not-allowed'
            )}
            title="جلو"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>

          <div className="mx-1.5 h-3.5 w-px bg-white/10" />

          <div className="flex items-center gap-1.5 px-1">
            <Instagram className="h-3.5 w-3.5 text-pink-400" />
            <span className="text-[11px] font-medium tracking-wide text-white/50">
              instagram.com
            </span>
          </div>
        </div>

        <button
          onClick={handleRefresh}
          className="rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          title="بارگذاری مجدد"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
        </button>
      </div>

      {/* WebView area */}
      <div className="relative flex-1">
        <AnimatePresence>
          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
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
          src="https://www.instagram.com"
          className="h-full w-full"
          // @ts-expect-error webview attributes
          allowpopups="true"
          partition="persist:instagram"
        />
      </div>
    </div>
  )
}
