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

type CyclePhase = 'idle' | 'unread_dms' | 'notifications' | 'follows' | 'listening'

export class AutoReplyController {
  private enabled = false
  private memory = ''
  private replyDelayMs = 2500
  private processing = false
  private queue: PendingItem[] = []
  private repliedIds = new Set<string>()
  private inFlightIds = new Set<string>()
  private activities: ActivityItem[] = []
  private listeners = new Set<(items: ActivityItem[]) => void>()
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private webview: WebviewLike | null = null
  private injectorSource = ''
  private readyLogged = false
  private flags: FeatureFlags = { ...DEFAULT_FLAGS }
  private keywordRules: KeywordRule[] = []
  private pendingDmAfterNav: { username: string; text: string } | null = null

  /** Orchestrator */
  private phase: CyclePhase = 'idle'
  private cycleRunning = false
  private lastCycleAt = 0
  private unreadQueue: Array<{ href: string; preview: string }> = []
  private activityQueue: Array<{ href: string; text: string }> = []

  setEnabled(v: boolean): void {
    if (this.enabled === v) return
    this.enabled = v
    this.pushActivity('info', v ? 'پاسخ‌گویی خودکار روشن شد' : 'پاسخ‌گویی خودکار خاموش شد')
    if (v) {
      this.phase = 'idle'
      this.lastCycleAt = 0
    }
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
    this.activities = [item, ...this.activities].slice(0, 80)
    this.listeners.forEach((fn) => fn(this.getActivities()))
  }

  bindWebview(webview: WebviewLike, injectorSource: string): void {
    this.webview = webview
    this.injectorSource = injectorSource
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = setInterval(() => void this.tick(), 1800)
  }

  unbindWebview(): void {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
    this.webview = null
    this.readyLogged = false
  }

  private async exec<T>(code: string): Promise<T | null> {
    const wv = this.webview
    if (!wv) return null
    try {
      return (await wv.executeJavaScript(code)) as T
    } catch {
      return null
    }
  }

  private async tick(): Promise<void> {
    const wv = this.webview
    if (!wv) return

    try {
      const has = await this.exec<boolean>('!!(window.__TE_IG_POLL__ && window.__TE_IG_SEND_REPLY__)')
      if (!has && this.injectorSource) {
        await wv.executeJavaScript(this.injectorSource)
        this.readyLogged = false
      }

      const status = await this.exec<{
        path?: string
        ready?: boolean
        inbox?: boolean
        thread?: boolean
        post?: boolean
      }>('window.__TE_IG_STATUS__ ? window.__TE_IG_STATUS__() : null')

      if (status?.ready && !this.readyLogged) {
        this.readyLogged = true
        this.pushActivity('info', `مانیتور آماده — ${status.path || '?'}`)
      }

      if (this.pendingDmAfterNav && status?.path?.includes(`/${this.pendingDmAfterNav.username}`)) {
        await this.tryClickMessageAndSend(this.pendingDmAfterNav.text)
        this.pendingDmAfterNav = null
      }

      // Pull new events from open thread / post
      const batch = (await this.exec<
        Array<{
          id: string
          text: string
          kind: string
          username?: string
          isMention?: boolean
          path?: string
        }>
      >('window.__TE_IG_POLL__ ? window.__TE_IG_POLL__() : []')) || []

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

      await this.processQueue()

      // Background orchestration when enabled and queue empty
      if (this.enabled && !this.processing && this.queue.length === 0) {
        await this.runCycleStep(status)
      }
    } catch {
      // ignore
    }
  }

  private async runCycleStep(status: { path?: string; inbox?: boolean; thread?: boolean } | null): Promise<void> {
    if (this.cycleRunning) return
    // Full cycle at most every 45s when idle on inbox
    const now = Date.now()

    this.cycleRunning = true
    try {
      if (this.phase === 'idle' || this.phase === 'listening') {
        if (now - this.lastCycleAt < 45000 && this.phase === 'listening') return
        this.lastCycleAt = now

        if (this.flags.walkUnreadDms) {
          this.phase = 'unread_dms'
          this.pushActivity('info', 'بررسی دایرکت‌های خوانده‌نشده…')
          await this.exec('window.__TE_IG_GOTO__ && window.__TE_IG_GOTO__("/direct/inbox/")')
          await sleep(2500)
          const unread =
            (await this.exec<Array<{ href: string; preview: string }>>(
              'window.__TE_IG_LIST_UNREAD__ ? window.__TE_IG_LIST_UNREAD__() : []'
            )) || []
          this.unreadQueue = unread
          if (unread.length) {
            this.pushActivity('info', `${unread.length} گفتگوی خوانده‌نشده پیدا شد`)
          } else {
            this.pushActivity('info', 'دایرکت خوانده‌نشده‌ای نیست')
            this.phase = this.flags.checkNotifications ? 'notifications' : this.flags.acceptFollowRequests ? 'follows' : 'listening'
          }
        } else if (this.flags.checkNotifications) {
          this.phase = 'notifications'
        } else if (this.flags.acceptFollowRequests) {
          this.phase = 'follows'
        } else {
          this.phase = 'listening'
        }
      }

      if (this.phase === 'unread_dms' && this.unreadQueue.length > 0) {
        const next = this.unreadQueue.shift()!
        this.pushActivity('info', `باز کردن گفتگو: ${next.preview.slice(0, 40)}…`)
        await this.exec(`window.__TE_IG_OPEN_HREF__ && window.__TE_IG_OPEN_HREF__(${JSON.stringify(next.href)})`)
        await sleep(2800)
        // messages will be polled into queue; processQueue handles replies
        // after short wait, if no queue items, continue
        await sleep(2000)
        if (this.queue.length === 0 && this.unreadQueue.length === 0) {
          this.phase = this.flags.checkNotifications ? 'notifications' : 'listening'
        }
        return
      }

      if (this.phase === 'unread_dms' && this.unreadQueue.length === 0) {
        this.phase = this.flags.checkNotifications ? 'notifications' : this.flags.acceptFollowRequests ? 'follows' : 'listening'
      }

      if (this.phase === 'notifications') {
        this.pushActivity('info', 'بررسی نوتیفیکیشن / فعالیت…')
        // Instagram activity is often under heart icon — try common paths
        await this.exec('window.__TE_IG_GOTO__ && window.__TE_IG_GOTO__("/accounts/activity/")')
        await sleep(2500)
        // fallback: some locales use notifications
        let acts =
          (await this.exec<Array<{ href: string; text: string; isComment?: boolean }>>(
            'window.__TE_IG_LIST_ACTIVITY__ ? window.__TE_IG_LIST_ACTIVITY__() : []'
          )) || []
        if (!acts.length) {
          await this.exec('window.__TE_IG_GOTO__ && window.__TE_IG_GOTO__("/notifications/")')
          await sleep(2000)
          acts =
            (await this.exec<Array<{ href: string; text: string; isComment?: boolean }>>(
              'window.__TE_IG_LIST_ACTIVITY__ ? window.__TE_IG_LIST_ACTIVITY__() : []'
            )) || []
        }
        this.activityQueue = acts.filter((a) => a.isComment !== false).slice(0, 8)
        if (this.activityQueue.length) {
          this.pushActivity('info', `${this.activityQueue.length} مورد فعالیت مرتبط پیدا شد`)
          const a = this.activityQueue.shift()!
          await this.exec(`window.__TE_IG_OPEN_HREF__ && window.__TE_IG_OPEN_HREF__(${JSON.stringify(a.href)})`)
          await sleep(2500)
        } else {
          this.pushActivity('info', 'نوتیفیکیشن کامنت/منشن جدیدی دیده نشد')
        }
        this.phase = this.flags.acceptFollowRequests ? 'follows' : 'listening'
        return
      }

      if (this.phase === 'follows') {
        this.pushActivity('info', 'بررسی درخواست‌های فالو…')
        await this.exec('window.__TE_IG_GOTO__ && window.__TE_IG_GOTO__("/accounts/activity/")')
        await sleep(1500)
        // Also try follow requests URL patterns
        await this.exec('window.__TE_IG_GOTO__ && window.__TE_IG_GOTO__("/accounts/login/")').catch?.(() => {})
        // Best effort: stay on activity and click Confirm
        const res = await this.exec<{ accepted?: number }>(
          `window.__TE_IG_ACCEPT_FOLLOWS__ ? window.__TE_IG_ACCEPT_FOLLOWS__(${this.flags.followBack ? 'true' : 'false'}) : ({accepted:0})`
        )
        const n = res?.accepted || 0
        if (n > 0) this.pushActivity('success', `${n} درخواست فالو تأیید شد`)
        else this.pushActivity('info', 'درخواست فالو معلقی پیدا نشد')
        this.phase = 'listening'
        // return to inbox
        await this.exec('window.__TE_IG_GOTO__ && window.__TE_IG_GOTO__("/direct/inbox/")')
      }
    } finally {
      this.cycleRunning = false
    }
  }

  private enqueue(item: PendingItem): void {
    if (this.repliedIds.has(item.id)) return
    if (this.inFlightIds.has(item.id)) return
    if (this.queue.some((q) => q.id === item.id)) return
    // Extra dedupe by normalized text for DMs
    if (item.channel === 'dm') {
      const norm = item.text.replace(/\s+/g, ' ').trim()
      if (this.queue.some((q) => q.channel === 'dm' && q.text.replace(/\s+/g, ' ').trim() === norm)) return
      if ([...this.repliedIds].some((id) => id.startsWith(norm.slice(0, 40)))) return
    }

    this.queue.push(item)
    const preview = item.text.slice(0, 50) + (item.text.length > 50 ? '…' : '')
    this.pushActivity(
      'info',
      item.channel === 'dm' ? `پیام جدید: ${preview}` : `کامنت جدید: ${preview}`
    )
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
    if (this.processing || !this.webview || !this.enabled) return
    this.processing = true
    try {
      while (this.queue.length > 0 && this.enabled) {
        const msg = this.queue.shift()!
        if (this.repliedIds.has(msg.id) || this.inFlightIds.has(msg.id)) continue

        this.inFlightIds.add(msg.id)

        if (msg.channel === 'dm') await this.handleDm(msg)
        else await this.handleComment(msg)

        this.inFlightIds.delete(msg.id)
        await sleep(1200)
      }
    } finally {
      this.processing = false
    }
  }

  private async handleDm(msg: PendingItem): Promise<void> {
    // Mark early to prevent parallel double-send
    this.repliedIds.add(msg.id)

    const reply = generateReply(msg.text, this.memory)
    this.pushActivity('info', `پاسخ: ${reply.slice(0, 48)}${reply.length > 48 ? '…' : ''}`)

    await sleep(this.replyDelayMs)
    if (!this.enabled) return

    const result = await this.sendDm(reply)
    if (result.ok) {
      this.pushActivity('success', result.reason === 'cooldown_ok' || result.reason === 'already_sent' ? 'پاسخ ارسال شد (تکراری جلوگیری شد)' : 'پاسخ ارسال شد')
    } else {
      // allow one retry later only for no_compose
      if (result.reason === 'no_compose') {
        this.repliedIds.delete(msg.id)
        this.pushActivity('warn', 'باکس پیام پیدا نشد — گفتگو را باز کنید')
      } else {
        this.pushActivity('error', `ارسال ناموفق: ${result.reason}`)
      }
    }
  }

  private async handleComment(msg: PendingItem): Promise<void> {
    const rule = this.matchKeywordRule(msg.text)
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

    this.repliedIds.add(msg.id)
    const commentText = rule?.commentReply?.trim() || generateCommentReply(msg.text, this.memory)
    this.pushActivity('info', `پاسخ کامنت: ${commentText.slice(0, 40)}…`)
    await sleep(this.replyDelayMs)
    if (!this.enabled) return

    const result = await this.sendComment(commentText, msg.text)
    if (result.ok) this.pushActivity('success', 'پاسخ کامنت ارسال شد')
    else this.pushActivity('error', `کامنت ناموفق: ${result.reason}`)

    if (rule?.dmMessage?.trim() && msg.username) {
      this.pendingDmAfterNav = { username: msg.username, text: rule.dmMessage.trim() }
      await this.exec(`window.__TE_IG_OPEN_DM__ && window.__TE_IG_OPEN_DM__(${JSON.stringify(msg.username)})`)
    }
  }

  private async sendDm(text: string): Promise<{ ok: boolean; reason?: string }> {
    const r = await this.exec<{ ok: boolean; reason?: string }>(
      `window.__TE_IG_SEND_REPLY__ ? window.__TE_IG_SEND_REPLY__(${JSON.stringify(text)}) : ({ ok:false, reason:'injector_missing' })`
    )
    return r || { ok: false, reason: 'no_webview' }
  }

  private async sendComment(text: string, targetText: string): Promise<{ ok: boolean; reason?: string }> {
    const r = await this.exec<{ ok: boolean; reason?: string }>(
      `window.__TE_IG_REPLY_COMMENT__ ? window.__TE_IG_REPLY_COMMENT__(${JSON.stringify({ text, targetText })}) : ({ ok:false, reason:'injector_missing' })`
    )
    return r || { ok: false, reason: 'no_webview' }
  }

  private async tryClickMessageAndSend(dmText: string): Promise<void> {
    await this.exec(`
      (function(){
        var btns = Array.from(document.querySelectorAll('div[role="button"], button, a'));
        var msg = btns.find(function(b){
          var t = (b.innerText || b.getAttribute('aria-label') || '').trim();
          return /^(Message|پیام|ارسال پیام)$/i.test(t);
        });
        if (msg) msg.click();
      })()
    `)
    await sleep(2000)
    const sent = await this.sendDm(dmText)
    if (sent.ok) this.pushActivity('success', 'دایرکت کلیدواژه‌ای ارسال شد')
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

  handleGuestEvent(_raw: string): void {}
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export const autoReplyController = new AutoReplyController()
