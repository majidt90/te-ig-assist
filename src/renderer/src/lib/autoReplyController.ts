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

  private phase: CyclePhase = 'idle'
  private cycleRunning = false
  private lastCycleAt = 0
  private unreadQueue: Array<{ href: string; preview: string }> = []
  private activityQueue: Array<{ href: string; text: string }> = []
  private threadWaitUntil = 0
  private lastScanLogAt = 0

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
        hasCompose?: boolean
        lastScan?: { dmNodes?: number; queued?: number; thread?: boolean; method?: string }
      }>('window.__TE_IG_STATUS__ ? window.__TE_IG_STATUS__() : null')

      if (status?.ready && !this.readyLogged) {
        this.readyLogged = true
        this.pushActivity('info', `مانیتور آماده — ${status.path || '?'}`)
      }

      if (status?.thread && status.lastScan && Date.now() - this.lastScanLogAt > 7000) {
        this.lastScanLogAt = Date.now()
        const ls = status.lastScan
        this.pushActivity(
          'info',
          `اسکن: ${ls.dmNodes || 0} حباب / ${ls.queued || 0} صف (${ls.method || '?'}) · compose=${status.hasCompose ? 'بله' : 'خیر'}`
        )
      }

      if (this.pendingDmAfterNav && status?.path?.includes(`/${this.pendingDmAfterNav.username}`)) {
        await this.tryClickMessageAndSend(this.pendingDmAfterNav.text)
        this.pendingDmAfterNav = null
      }

      const batch =
        (await this.exec<
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
          if (!this.flags.autoReplyDms) continue
          this.enqueue({
            id: item.id,
            text: item.text,
            timestamp: Date.now(),
            channel: 'dm'
          })
        } else if (item.kind === 'comment') {
          if (!this.flags.autoReplyComments) continue
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

      if (Date.now() < this.threadWaitUntil) return

      if (this.enabled && !this.processing && this.queue.length === 0) {
        await this.runCycleStep(status)
      }
    } catch {
      // ignore
    }
  }

  private async runCycleStep(status: { path?: string; thread?: boolean } | null): Promise<void> {
    if (this.cycleRunning) return
    const now = Date.now()
    this.cycleRunning = true

    try {
      if (this.phase === 'idle' || this.phase === 'listening') {
        if (now - this.lastCycleAt < 50000 && this.phase === 'listening') return
        this.lastCycleAt = now

        const wantDms = this.flags.autoReplyDms && this.flags.walkUnreadDms
        const wantNotif = this.flags.autoReplyNotifications

        if (wantDms) {
          this.phase = 'unread_dms'
          this.pushActivity('info', 'بررسی دایرکت‌ها…')
          await this.exec('window.__TE_IG_GOTO__ && window.__TE_IG_GOTO__("/direct/inbox/")')
          await sleep(3500)
          const unread =
            (await this.exec<Array<{ href: string; preview: string }>>(
              'window.__TE_IG_LIST_UNREAD__ ? window.__TE_IG_LIST_UNREAD__() : []'
            )) || []
          this.unreadQueue = unread
          this.pushActivity(
            'info',
            unread.length ? `${unread.length} گفتگو در صف` : 'گفتگویی در inbox لیست نشد'
          )
          if (!unread.length) {
            this.phase = wantNotif ? 'notifications' : this.flags.acceptFollowRequests ? 'follows' : 'listening'
          }
        } else if (wantNotif) {
          this.phase = 'notifications'
        } else if (this.flags.acceptFollowRequests) {
          this.phase = 'follows'
        } else {
          this.phase = 'listening'
        }
      }

      if (this.phase === 'unread_dms' && this.unreadQueue.length > 0) {
        const next = this.unreadQueue.shift()!
        this.pushActivity('info', `باز کردن: ${next.preview.slice(0, 48) || next.href}`)
        // Click-based open (SPA) preferred
        await this.exec(
          `window.__TE_IG_OPEN_THREAD__ ? window.__TE_IG_OPEN_THREAD__(${JSON.stringify(next.href)}) : window.__TE_IG_OPEN_HREF__(${JSON.stringify(next.href)})`
        )
        this.threadWaitUntil = Date.now() + 7000
        return
      }

      if (this.phase === 'unread_dms' && this.unreadQueue.length === 0) {
        if (status?.thread) {
          this.phase = this.flags.autoReplyNotifications
            ? 'notifications'
            : this.flags.acceptFollowRequests
              ? 'follows'
              : 'listening'
        }
      }

      if (this.phase === 'notifications') {
        if (!this.flags.autoReplyNotifications) {
          this.phase = this.flags.acceptFollowRequests ? 'follows' : 'listening'
          return
        }
        this.pushActivity('info', 'بررسی نوتیفیکیشن…')
        await this.exec('window.__TE_IG_OPEN_ACTIVITY_UI__ && window.__TE_IG_OPEN_ACTIVITY_UI__()')
        await sleep(3500)
        let acts =
          (await this.exec<Array<{ href: string; text: string }>>(
            'window.__TE_IG_LIST_ACTIVITY__ ? window.__TE_IG_LIST_ACTIVITY__() : []'
          )) || []
        if (!acts.length) {
          await this.exec('window.__TE_IG_GOTO__ && window.__TE_IG_GOTO__("/accounts/activity/")')
          await sleep(3000)
          acts =
            (await this.exec<Array<{ href: string; text: string }>>(
              'window.__TE_IG_LIST_ACTIVITY__ ? window.__TE_IG_LIST_ACTIVITY__() : []'
            )) || []
        }
        this.activityQueue = acts.slice(0, 8)
        if (this.activityQueue.length) {
          this.pushActivity('info', `${this.activityQueue.length} مورد فعالیت`)
          const a = this.activityQueue.shift()!
          await this.exec(`window.__TE_IG_OPEN_HREF__ && window.__TE_IG_OPEN_HREF__(${JSON.stringify(a.href)})`)
          this.threadWaitUntil = Date.now() + 5000
        } else {
          this.pushActivity('warn', 'لینک پست در activity پیدا نشد')
        }
        this.phase = this.flags.acceptFollowRequests ? 'follows' : 'listening'
        return
      }

      if (this.phase === 'follows') {
        this.pushActivity('info', 'بررسی درخواست فالو…')
        await this.exec('window.__TE_IG_OPEN_ACTIVITY_UI__ && window.__TE_IG_OPEN_ACTIVITY_UI__()')
        await sleep(2000)
        await this.exec(`
          (function(){
            var nodes = Array.from(document.querySelectorAll('div[role="button"], a, span'));
            var row = nodes.find(function(n){ return /Follow requests|درخواست/i.test((n.innerText||'').trim()); });
            if (row) row.click();
          })()
        `)
        await sleep(1500)
        const res = await this.exec<{ accepted?: number }>(
          `window.__TE_IG_ACCEPT_FOLLOWS__ ? window.__TE_IG_ACCEPT_FOLLOWS__(${this.flags.followBack ? 'true' : 'false'}) : ({accepted:0})`
        )
        const n = res?.accepted || 0
        this.pushActivity(n > 0 ? 'success' : 'info', n > 0 ? `${n} تأیید شد` : 'Confirm دیده نشد')
        this.phase = 'listening'
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

    this.queue.push(item)
    const preview = item.text.slice(0, 50) + (item.text.length > 50 ? '…' : '')
    this.pushActivity('info', item.channel === 'dm' ? `پیام جدید: ${preview}` : `کامنت جدید: ${preview}`)
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
        if (msg.channel === 'dm') {
          if (this.flags.autoReplyDms) await this.handleDm(msg)
          else this.repliedIds.add(msg.id)
        } else {
          if (this.flags.autoReplyComments) await this.handleComment(msg)
          else this.repliedIds.add(msg.id)
        }
        this.inFlightIds.delete(msg.id)
        await sleep(1200)
      }
    } finally {
      this.processing = false
    }
  }

  private async handleDm(msg: PendingItem): Promise<void> {
    this.repliedIds.add(msg.id)
    const reply = generateReply(msg.text, this.memory)
    this.pushActivity('info', `پاسخ: ${reply.slice(0, 48)}${reply.length > 48 ? '…' : ''}`)
    await sleep(this.replyDelayMs)
    if (!this.enabled) return
    const result = await this.sendDm(reply)
    if (result.ok) this.pushActivity('success', 'پاسخ ارسال شد')
    else if (result.reason === 'no_compose') {
      this.repliedIds.delete(msg.id)
      this.pushActivity('warn', 'باکس پیام پیدا نشد')
    } else this.pushActivity('error', `ارسال ناموفق: ${result.reason}`)
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
