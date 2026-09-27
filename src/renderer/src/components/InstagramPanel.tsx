import { useRef, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Instagram, RefreshCw, ExternalLink } from 'lucide-react'

export default function InstagramPanel(): JSX.Element {
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [canGoBack, setCanGoBack] = useState(false)

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const handleStartLoading = () => setIsLoading(true)
    const handleStopLoading = () => {
      setIsLoading(false)
      setCanGoBack(webview.canGoBack())
    }

    webview.addEventListener('did-start-loading', handleStartLoading)
    webview.addEventListener('did-stop-loading', handleStopLoading)

    return () => {
      webview.removeEventListener('did-start-loading', handleStartLoading)
      webview.removeEventListener('did-stop-loading', handleStopLoading)
    }
  }, [])

  const handleRefresh = () => {
    webviewRef.current?.reload()
  }

  const handleOpenExternal = () => {
    // In real app we can open in system browser if needed
  }

  return (
    <div className="relative flex h-full w-full flex-col bg-black">
      {/* Webview Toolbar */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/5 bg-black/80 px-3">
        <div className="flex items-center gap-2">
          <Instagram className="h-3.5 w-3.5 text-pink-400" />
          <span className="text-[11px] font-medium text-white/60">instagram.com</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            className="rounded p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            title="بارگذاری مجدد"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Instagram WebView */}
      <div className="relative flex-1">
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-pink-500 border-t-transparent" />
              <p className="text-xs text-white/60">در حال اتصال به اینستاگرام...</p>
            </div>
          </motion.div>
        )}

        <webview
          ref={webviewRef as any}
          src="https://www.instagram.com"
          className="h-full w-full"
          // @ts-ignore - webview attributes
          allowpopups="true"
          // Important for Instagram login & cookies
          partition="persist:instagram"
        />
      </div>
    </div>
  )
}
