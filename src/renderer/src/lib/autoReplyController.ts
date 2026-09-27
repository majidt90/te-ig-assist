import { generateReply, type IncomingMessage } from './replyEngine'

export type ActivityLevel = 'info' | 'success' | 'warn' | 'error'

export interface ActivityItem {
  id: string
  level: ActivityLevel
  message: string
  at: number
}

type WebviewLike = Electron.WebviewTag

export class AutoReplyController {
  private enabled = false
  private memory = ''
  private replyDelayMs = 2500
  private processing = false
  private queue: IncomingMessage[] = []
  private repliedIds = new Set<string>()
  private activities: ActivityItem[] = []
  private listeners = new Set<(items: ActivityItem[]) => void>()
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private webview: WebviewLike | null = null
  private injectorSource = ''
  private readyLogged = false

  setEnabled(v: boolean): void {
    if (this.enabled === v) return
    this.enabled = v
    this.pushActivity('info', v ? 'پاسخ‌گویی خودکار روشن شد' : 'پاسخ‌گویی خودکار خاموش شد')
  }

  setMemory(m: string): void {
    const next = m || ''
    if (this.memory === next) return
    this.memory = next
  }

  setReplyDelay(ms: number): void {
    this.replyDelayMs = Math.max(800, Math.min(15000, ms))
  }

  getActivities(): ActivityItem[] {
    return [...this.activities]
  }

  subscribe(fn: (items: ActivityItem[]) => void): () => void {
    this.listeners.add(fn)
    fn(this.getActivities())
    return () => this.listeners.delete(fn)
  }

  private pushActivity(level: ActivityLevel, message: string): void {
    const item: ActivityItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      level,
      message,
      at: Date.now()
    }
    this.activities = [item, ...this.activities].slice(0, 50)
    this.listeners.forEach((fn) => fn(this.getActivities()))
  }

  /** Attach webview and start host-side polling (reliable bridge). */
  bindWebview(webview: WebviewLike, injectorSource: string): void {
    this.webview = webview
    this.injectorSource = injectorSource
    this.startPolling()
  }

  unbindWebview(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    this.webview = null
    this.readyLogged = false
  }

  private startPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = setInterval(() => {
      void this.tick()
    }, 1500)
  }

  private async tick(): Promise<void> {
    const wv = this.webview
    if (!wv) return

    try {
      // Ensure injector is present
      const hasInjector = await wv.executeJavaScript(
        '!!(window.__TE_IG_POLL__ && window.__TE_IG_SEND_REPLY__)'
      )
      if (!hasInjector && this.injectorSource) {
        await wv.executeJavaScript(this.injectorSource)
        this.readyLogged = false
      }

      const status = (await wv.executeJavaScript(
        'window.__TE_IG_STATUS__ ? window.__TE_IG_STATUS__() : null'
      )) as { path?: string; ready?: boolean; seen?: number } | null

      if (status?.ready && !this.readyLogged) {
        this.readyLogged = true
        this.pushActivity(
          'info',
          `مانیتور آماده — مسیر: ${status.path || '?'}`
        )
      }

      const batch = (await wv.executeJavaScript(
        'window.__TE_IG_POLL__ ? window.__TE_IG_POLL__() : []'
      )) as Array<{ id: string; text: string; kind: string }>

      if (!Array.isArray(batch) || batch.length === 0) return

      for (const item of batch) {
        if (item.kind === 'incoming') {
          this.onIncoming(item.id, item.text)
        }
      }
    } catch {
      // webview may be mid-navigation
    }
  }

  private onIncoming(id: string, text: string): void {
    const clean = (text || '').trim()
    if (!clean || this.repliedIds.has(id)) return

    this.pushActivity(
      'info',
      `پیام جدید: ${clean.slice(0, 70)}${clean.length > 70 ? '…' : ''}`
    )

    if (!this.enabled) {
      this.pushActivity('warn', 'پاسخ‌گویی خاموش است — نادیده گرفته شد')
      return
    }

    this.queue.push({ id, text: clean, timestamp: Date.now() })
    void this.processQueue()
  }

  /** Optional: still accept console bridge events */
  handleGuestEvent(raw: string): void {
    if (!raw.startsWith('TE_IG|')) return
    try {
      const data = JSON.parse(raw.slice(5)) as {
        type: string
        payload?: Record<string, unknown>
      }
      if (data.type === 'incoming') {
        const text = String(data.payload?.text || '').trim()
        const id = String(data.payload?.id || text)
        this.onIncoming(id, text)
      }
    } catch {
      // ignore
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing || !this.webview) return
    this.processing = true

    try {
      while (this.queue.length > 0 && this.enabled) {
        const msg = this.queue.shift()!
        if (this.repliedIds.has(msg.id)) continue

        const reply = generateReply(msg.text, this.memory)
        this.pushActivity(
          'info',
          `پاسخ پیشنهادی: ${reply.slice(0, 60)}${reply.length > 60 ? '…' : ''}`
        )

        await sleep(this.replyDelayMs)
        if (!this.enabled) break

        const result = await this.sendReply(reply)
        if (result.ok) {
          this.repliedIds.add(msg.id)
          this.pushActivity('success', 'پاسخ ارسال شد')
        } else {
          this.pushActivity('error', `ارسال ناموفق: ${result.reason || 'unknown'}`)
          if (result.reason === 'no_compose') {
            this.pushActivity('warn', 'باکس نوشتن پیدا نشد — یک گفتگو را باز کنید')
          }
          if (result.reason === 'injector_missing') {
            this.pushActivity('warn', 'مانیتور تزریق نشده — صفحه را رفرش کنید')
          }
        }

        await sleep(1000)
      }
    } finally {
      this.processing = false
    }
  }

  private async sendReply(text: string): Promise<{ ok: boolean; reason?: string }> {
    const wv = this.webview
    if (!wv) return { ok: false, reason: 'no_webview' }
    const escaped = JSON.stringify(text)
    try {
      const result = await wv.executeJavaScript(
        `window.__TE_IG_SEND_REPLY__ ? window.__TE_IG_SEND_REPLY__(${escaped}) : ({ ok: false, reason: 'injector_missing' })`
      )
      return result as { ok: boolean; reason?: string }
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : 'exec_failed' }
    }
  }

  async ensureInjected(webview: WebviewLike, injectorSource: string): Promise<void> {
    this.webview = webview
    this.injectorSource = injectorSource
    try {
      await webview.executeJavaScript(injectorSource)
      this.readyLogged = false
    } catch {
      this.pushActivity('error', 'خطا در تزریق مانیتور')
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export const autoReplyController = new AutoReplyController()
