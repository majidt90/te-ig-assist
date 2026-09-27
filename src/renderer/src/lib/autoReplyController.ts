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

  setEnabled(v: boolean): void {
    this.enabled = v
    this.pushActivity('info', v ? 'پاسخ‌گویی خودکار روشن شد' : 'پاسخ‌گویی خودکار خاموش شد')
  }

  setMemory(m: string): void {
    this.memory = m || ''
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
    this.activities = [item, ...this.activities].slice(0, 40)
    this.listeners.forEach((fn) => fn(this.getActivities()))
  }

  handleGuestEvent(raw: string, webview: WebviewLike | null): void {
    if (!raw.startsWith('TE_IG|')) return
    try {
      const data = JSON.parse(raw.slice(5)) as { type: string; payload?: Record<string, unknown> }
      const { type, payload } = data

      if (type === 'ready') {
        this.pushActivity('info', 'مانیتور دایرکت آماده است')
        return
      }

      if (type === 'navigate') {
        const path = String(payload?.path || '')
        if (path.includes('/direct/')) {
          this.pushActivity('info', 'وارد بخش دایرکت شدید')
        }
        return
      }

      if (type === 'incoming') {
        const text = String(payload?.text || '').trim()
        const id = String(payload?.id || text)
        if (!text || this.repliedIds.has(id)) return

        this.pushActivity('info', `پیام جدید: ${text.slice(0, 60)}${text.length > 60 ? '…' : ''}`)

        if (!this.enabled) {
          this.pushActivity('warn', 'پاسخ‌گویی خاموش است — نادیده گرفته شد')
          return
        }

        this.queue.push({ id, text, timestamp: Date.now() })
        void this.processQueue(webview)
        return
      }

      if (type === 'sent') {
        this.pushActivity('success', 'پاسخ ارسال شد')
      }
    } catch {
      // ignore malformed
    }
  }

  private async processQueue(webview: WebviewLike | null): Promise<void> {
    if (this.processing || !webview) return
    this.processing = true

    try {
      while (this.queue.length > 0 && this.enabled) {
        const msg = this.queue.shift()!
        if (this.repliedIds.has(msg.id)) continue

        const reply = generateReply(msg.text, this.memory)
        this.pushActivity('info', `در حال آماده‌سازی پاسخ…`)

        await sleep(this.replyDelayMs)

        if (!this.enabled) break

        const result = await this.sendReply(webview, reply)
        if (result.ok) {
          this.repliedIds.add(msg.id)
          this.pushActivity('success', `پاسخ: ${reply.slice(0, 50)}${reply.length > 50 ? '…' : ''}`)
        } else {
          this.pushActivity('error', `ارسال ناموفق: ${result.reason || 'unknown'}`)
          // re-queue once on transient failure
          if (result.reason === 'no_compose') {
            this.pushActivity('warn', 'باکس نوشتن پیدا نشد — گفتگو را باز کنید')
          }
        }

        await sleep(1200)
      }
    } finally {
      this.processing = false
    }
  }

  private async sendReply(
    webview: WebviewLike,
    text: string
  ): Promise<{ ok: boolean; reason?: string }> {
    const escaped = JSON.stringify(text)
    try {
      const result = await webview.executeJavaScript(
        `window.__TE_IG_SEND_REPLY__ ? window.__TE_IG_SEND_REPLY__(${escaped}) : ({ ok: false, reason: 'injector_missing' })`
      )
      return result as { ok: boolean; reason?: string }
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : 'exec_failed' }
    }
  }

  async ensureInjected(webview: WebviewLike, injectorSource: string): Promise<void> {
    try {
      await webview.executeJavaScript(injectorSource)
    } catch {
      this.pushActivity('error', 'خطا در تزریق مانیتور')
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Singleton for the app session */
export const autoReplyController = new AutoReplyController()
