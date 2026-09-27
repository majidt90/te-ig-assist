import { generateReply, generateCommentReply, type IncomingMessage } from './replyEngine'
import type { FeatureFlags, KeywordRule } from './types'
import { DEFAULT_FLAGS } from './types'

export type ActivityLevel = 'info' | 'success' | 'warn' | 'error'

export interface ActivityItem {
  id: string
  level: ActivityLevel
  message: string
  at: number
}

interface PendingItem extends IncomingMessage {
  channel: 'dm' | 'comment'
  username?: string
  isMention?: boolean
  path?: string
}

type WebviewLike = Electron.WebviewTag

export class AutoReplyController {
  private enabled = false
  private memory = ''
  private replyDelayMs = 2500
  private processing = false
  private queue: PendingItem[] = []
  private repliedIds = new Set<string>()
  private activities: ActivityItem[] = []
  private listeners = new Set<(items: ActivityItem[]) => void>()
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private webview: WebviewLike | null = null
  private injectorSource = ''
  private readyLogged = false
  private flags: FeatureFlags = { ...DEFAULT_FLAGS }
  private keywordRules: KeywordRule[] = []
  /** DM text waiting to send after profile navigation */
  private pendingDmAfterNav: { username: string; text: string } | null = null

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

  setFlags(flags: Partial<FeatureFlags>): void {
    this.flags = { ...this.flags, ...flags }
  }

  setKeywordRules(rules: KeywordRule[]): void {
    this.keywordRules = Array.isArray(rules) ? rules : []
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
    this.activities = [item, ...this.activities].slice(0, 60)
    this.listeners.forEach((fn) => fn(this.getActivities()))
  }

  bindWebview(webview: WebviewLike, injectorSource: string): void {
    this.webview = webview
    this.injectorSource = injectorSource
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = setInterval(() => void this.tick(), 1500)
  }

  unbindWebview(): void {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
    this.webview = null
    this.readyLogged = false
  }

  private async tick(): Promise<void> {
    const wv = this.webview
    if (!wv) return

    try {
      const hasInjector = await wv.executeJavaScript(
        '!!(window.__TE_IG_POLL__ && window.__TE_IG_SEND_REPLY__)'
      )
      if (!hasInjector && this.injectorSource) {
        await wv.executeJavaScript(this.injectorSource)
        this.readyLogged = false
      }

      const status = (await wv.executeJavaScript(
        'window.__TE_IG_STATUS__ ? window.__TE_IG_STATUS__() : null'
      )) as {
        path?: string
        ready?: boolean
        direct?: boolean
        post?: boolean
      } | null

      if (status?.ready && !this.readyLogged) {
        this.readyLogged = true
        this.pushActivity('info', `مانیتور آماده — ${status.path || '?'}`)
      }

      // After navigating to profile for keyword DM
      if (this.pendingDmAfterNav && status?.path) {
        const u = this.pendingDmAfterNav.username
        if (status.path.includes(`/${u}`)) {
          await this.tryClickMessageAndSend(this.pendingDmAfterNav.text)
          this.pendingDmAfterNav = null
        }
      }

      const batch = (await wv.executeJavaScript(
        'window.__TE_IG_POLL__ ? window.__TE_IG_POLL__() : []'
      )) as Array<{
        id: string
        text: string
        kind: string
        username?: string
        isMention?: boolean
        path?: string
      }>

      if (!Array.isArray(batch) || !batch.length) return

      // Process in order (oldest first as scanned)
      for (const item of batch) {
        if (item.kind === 'dm_incoming') {
          this.enqueue({
            id: item.id,
            text: item.text,
            timestamp: Date.now(),
            channel: 'dm'
          })
        } else if (item.kind === 'comment') {
          this.enqueue({
            id: item.id,
            text: item.text,
            timestamp: Date.now(),
            channel: 'comment',
            username: item.username,
            isMention: item.isMention,
            path: item.path
          })
        }
      }

      void this.processQueue()
    } catch {
      // navigation
    }
  }

  private enqueue(item: PendingItem): void {
    if (this.repliedIds.has(item.id)) return
    if (this.queue.some((q) => q.id === item.id)) return

    this.queue.push(item)
    const preview = item.text.slice(0, 55) + (item.text.length > 55 ? '…' : '')
    if (item.channel === 'dm') {
      this.pushActivity('info', `پیام جدید (دایرکت): ${preview}`)
    } else {
      this.pushActivity(
        'info',
        `کامنت جدید${item.username ? ' از @' + item.username : ''}: ${preview}`
      )
    }
  }

  private matchKeywordRule(text: string): KeywordRule | null {
    if (!this.flags.keywordRulesEnabled) return null
    const n = text.toLowerCase()
    for (const rule of this.keywordRules) {
      if (!rule.enabled || !rule.keyword.trim()) continue
      if (n.includes(rule.keyword.trim().toLowerCase())) return rule
    }
    return null
  }

  private async processQueue(): Promise<void> {
    if (this.processing || !this.webview) return
    if (!this.enabled) {
      // keep queue but don't reply
      return
    }
    this.processing = true

    try {
      // Strict sequential order
      while (this.queue.length > 0 && this.enabled) {
        const msg = this.queue.shift()!
        if (this.repliedIds.has(msg.id)) continue

        if (msg.channel === 'dm') {
          await this.handleDm(msg)
        } else {
          await this.handleComment(msg)
        }

        await sleep(900)
      }
    } finally {
      this.processing = false
    }
  }

  private async handleDm(msg: PendingItem): Promise<void> {
    const reply = generateReply(msg.text, this.memory)
    this.pushActivity('info', `پاسخ دایرکت: ${reply.slice(0, 50)}${reply.length > 50 ? '…' : ''}`)

    await sleep(this.replyDelayMs)
    if (!this.enabled) return

    const result = await this.sendDm(reply)
    if (result.ok) {
      this.repliedIds.add(msg.id)
      this.pushActivity('success', 'پاسخ دایرکت ارسال شد')
    } else {
      this.pushActivity('error', `ارسال دایرکت ناموفق: ${result.reason}`)
      // put back once if compose missing
      if (result.reason === 'no_compose') {
        this.pushActivity('warn', 'گفتگو را باز نگه دارید')
      }
    }
  }

  private async handleComment(msg: PendingItem): Promise<void> {
    const rule = this.matchKeywordRule(msg.text)

    // Feature gates
    if (!rule) {
      if (msg.isMention && !this.flags.replyMentions) {
        this.repliedIds.add(msg.id)
        return
      }
      if (!msg.isMention && !this.flags.replyOwnPostComments) {
        this.repliedIds.add(msg.id)
        return
      }
    }

    let commentText: string
    if (rule?.commentReply?.trim()) {
      commentText = rule.commentReply.trim()
    } else {
      commentText = generateCommentReply(msg.text, this.memory)
    }

    this.pushActivity('info', `پاسخ کامنت: ${commentText.slice(0, 50)}…`)
    await sleep(this.replyDelayMs)
    if (!this.enabled) return

    const result = await this.sendComment(commentText, msg.text)
    if (result.ok) {
      this.repliedIds.add(msg.id)
      this.pushActivity('success', 'پاسخ کامنت ارسال شد')
    } else {
      this.pushActivity('error', `کامنت ناموفق: ${result.reason}`)
      return
    }

    // Keyword → also DM
    if (rule?.dmMessage?.trim() && msg.username) {
      this.pushActivity('info', `ارسال دایرکت کلیدواژه‌ای به @${msg.username}`)
      this.pendingDmAfterNav = { username: msg.username, text: rule.dmMessage.trim() }
      await this.webview?.executeJavaScript(
        `window.__TE_IG_OPEN_DM__ && window.__TE_IG_OPEN_DM__(${JSON.stringify(msg.username)})`
      )
    }
  }

  private async sendDm(text: string): Promise<{ ok: boolean; reason?: string }> {
    const wv = this.webview
    if (!wv) return { ok: false, reason: 'no_webview' }
    try {
      return (await wv.executeJavaScript(
        `window.__TE_IG_SEND_REPLY__ ? window.__TE_IG_SEND_REPLY__(${JSON.stringify(text)}) : ({ ok:false, reason:'injector_missing' })`
      )) as { ok: boolean; reason?: string }
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : 'exec_failed' }
    }
  }

  private async sendComment(
    text: string,
    targetText: string
  ): Promise<{ ok: boolean; reason?: string }> {
    const wv = this.webview
    if (!wv) return { ok: false, reason: 'no_webview' }
    try {
      return (await wv.executeJavaScript(
        `window.__TE_IG_REPLY_COMMENT__ ? window.__TE_IG_REPLY_COMMENT__(${JSON.stringify({ text, targetText })}) : ({ ok:false, reason:'injector_missing' })`
      )) as { ok: boolean; reason?: string }
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : 'exec_failed' }
    }
  }

  private async tryClickMessageAndSend(dmText: string): Promise<void> {
    const wv = this.webview
    if (!wv) return
    try {
      // Click Message / پیام on profile
      await wv.executeJavaScript(`
        (async function() {
          var btns = Array.from(document.querySelectorAll('div[role="button"], button, a'));
          var msg = btns.find(function(b) {
            var t = (b.innerText || b.getAttribute('aria-label') || '').trim();
            return /^(Message|پیام|ارسال پیام)$/i.test(t);
          });
          if (msg) { msg.click(); return true; }
          return false;
        })()
      `)
      await sleep(2000)
      const sent = await this.sendDm(dmText)
      if (sent.ok) this.pushActivity('success', 'دایرکت کلیدواژه‌ای ارسال شد')
      else this.pushActivity('warn', 'دایرکت کلیدواژه: باکس پیام پیدا نشد — دستی چک کنید')
    } catch {
      this.pushActivity('warn', 'خطا در باز کردن دایرکت پروفایل')
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

  handleGuestEvent(_raw: string): void {
    // reserved
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export const autoReplyController = new AutoReplyController()
