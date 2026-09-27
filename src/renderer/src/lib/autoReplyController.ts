import { generateSmartReply, generateCommentReply, type IncomingMessage } from './replyEngine'
import type { FeatureDelays, FeatureFlags, KeywordRule } from './types'
import { DEFAULT_DELAYS, DEFAULT_FLAGS } from './types'

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
type TaskKind =
  | 'open_first_unread'
  | 'force_scan'
  | 'reply_dm'
  | 'reply_comment'
  | 'open_activity_item'
  | 'back_inbox'

interface Task {
  id: string
  kind: TaskKind
  executeAt: number
  payload: Record<string, unknown>
}

const MAX_LOG = 200

export class AutoReplyController {
  private enabled = false
  private autoCycle = true
  private cycleIntervalMs = 60_000
  private memory = ''
  private logic = ''
  private processing = false
  private cycleBusy = false
  private repliedIds = new Set<string>()
  private inFlightIds = new Set<string>()
  private activities: ActivityItem[] = []
  private listeners = new Set<(items: ActivityItem[]) => void>()
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private webview: WebviewLike | null = null
  private injectorSource = ''
  private lastReadyPath = ''
  private flags: FeatureFlags = { ...DEFAULT_FLAGS }
  private delays: FeatureDelays = { ...DEFAULT_DELAYS }
  private keywordRules: KeywordRule[] = []
  private pendingDmAfterNav: { username: string; text: string } | null = null

  private tasks: Task[] = []
  private lastCycleAt = 0
  private phase: 'idle' | 'dms' | 'notifs' | 'listening' = 'idle'
  private unreadPass = 0

  setEnabled(v: boolean): void {
    if (this.enabled === v) return
    this.enabled = v
    this.pushActivity('info', v ? 'پاسخ‌گویی خودکار روشن شد' : 'پاسخ‌گویی خودکار خاموش شد')
    if (v) {
      this.phase = 'idle'
      this.lastCycleAt = 0
    }
  }

  setAutoCycle(v: boolean): void {
    if (this.autoCycle === v) return
    this.autoCycle = v
    this.pushActivity('info', v ? 'چرخه خودکار روشن' : 'چرخه خودکار خاموش (فقط Force Run)')
  }

  setCycleIntervalMs(ms: number): void {
    const next = Math.max(15_000, Math.min(30 * 60_000, ms))
    if (this.cycleIntervalMs === next) return
    this.cycleIntervalMs = next
  }

  setMemory(m: string): void {
    this.memory = m || ''
  }

  setLogic(l: string): void {
    this.logic = l || ''
  }

  setFlags(flags: Partial<FeatureFlags>): void {
    this.flags = { ...this.flags, ...flags }
  }

  setDelays(d: Partial<FeatureDelays>): void {
    this.delays = { ...this.delays, ...d }
  }

  setKeywordRules(rules: KeywordRule[]): void {
    this.keywordRules = Array.isArray(rules) ? rules : []
  }

  forceRun(): void {
    if (!this.enabled) {
      this.pushActivity('warn', 'اول پاسخ‌گویی را روشن کنید')
      return
    }
    if (this.cycleBusy || this.processing) {
      this.pushActivity('warn', 'یک چرخه در حال اجراست — صبر کنید')
      return
    }
    this.pushActivity('info', '▶ اجرای فورس شروع شد')
    this.lastCycleAt = 0
    this.phase = 'idle'
    this.tasks = []
    this.unreadPass = 0
    void this.maybeScheduleCycle(true)
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
    this.activities = [item, ...this.activities].slice(0, MAX_LOG)
    this.listeners.forEach((fn) => fn(this.getActivities()))
  }

  private enqueueTask(kind: TaskKind, payload: Record<string, unknown>, delayMs: number): void {
    this.tasks.push({
      id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind,
      executeAt: Date.now() + Math.max(0, delayMs),
      payload
    })
    this.tasks.sort((a, b) => a.executeAt - b.executeAt)
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
      }

      const status = await this.exec<{ path?: string; ready?: boolean }>(
        'window.__TE_IG_STATUS__ ? window.__TE_IG_STATUS__() : null'
      )

      if (status?.ready && status.path && status.path !== this.lastReadyPath) {
        this.lastReadyPath = status.path
        this.pushActivity('info', `مانیتور — ${status.path}`)
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
        if (item.kind === 'dm_incoming' && this.flags.autoReplyDms) {
          this.scheduleReply({
            id: item.id,
            text: item.text,
            timestamp: Date.now(),
            channel: 'dm'
          })
        } else if (item.kind === 'comment' && this.flags.autoReplyComments) {
          this.scheduleReply({
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

      await this.runDueTasks()

      if (
        this.enabled &&
        this.autoCycle &&
        !this.processing &&
        !this.cycleBusy &&
        this.tasks.length === 0
      ) {
        await this.maybeScheduleCycle(false)
      }
    } catch {
      // ignore
    }
  }

  private scheduleReply(item: PendingItem): void {
    if (this.repliedIds.has(item.id) || this.inFlightIds.has(item.id)) return
    if (this.tasks.some((t) => t.payload['msgId'] === item.id)) return

    const delay = item.channel === 'dm' ? this.delays.delayDmsMs : this.delays.delayCommentsMs
    this.pushActivity(
      'info',
      item.channel === 'dm'
        ? `پیام در صف: ${item.text.slice(0, 42)}…`
        : `کامنت در صف: ${item.text.slice(0, 42)}…`
    )
    this.enqueueTask(
      item.channel === 'dm' ? 'reply_dm' : 'reply_comment',
      { msgId: item.id, item },
      delay
    )
  }

  private async runDueTasks(): Promise<void> {
    if (this.processing || !this.enabled) return
    const now = Date.now()
    const due = this.tasks.filter((t) => t.executeAt <= now)
    if (!due.length) return

    this.processing = true
    try {
      due.sort((a, b) => a.executeAt - b.executeAt)
      for (const task of due) {
        this.tasks = this.tasks.filter((t) => t.id !== task.id)
        await this.executeTask(task)
        await sleep(350)
      }
    } finally {
      this.processing = false
    }
  }

  private async executeTask(task: Task): Promise<void> {
    switch (task.kind) {
      case 'open_first_unread': {
        const res = await this.exec<{
          ok?: boolean
          via?: string
          reason?: string
          total?: number
          preview?: string
        }>('window.__TE_IG_OPEN_FIRST_UNREAD__ ? window.__TE_IG_OPEN_FIRST_UNREAD__() : ({ok:false})')
        if (!res?.ok) {
          this.pushActivity('info', `unread باقی نماند (${res?.reason || 'ok'})`)
          this.unreadPass = 99
        } else {
          this.pushActivity(
            'info',
            `باز شد: ${(res.preview || '').slice(0, 48)} (مانده≈${(res.total || 1) - 1})`
          )
          this.enqueueTask('force_scan', {}, 2800)
          this.enqueueTask('force_scan', {}, 5000)
          this.enqueueTask('back_inbox', {}, 10000)
        }
        break
      }
      case 'force_scan': {
        const info = await this.exec<{ dmNodes?: number; queued?: number; method?: string }>(
          'window.__TE_IG_FORCE_SCAN_THREAD__ ? window.__TE_IG_FORCE_SCAN_THREAD__() : null'
        )
        this.pushActivity(
          'info',
          `اسکن اجباری: ${info?.dmNodes ?? 0} حباب / ${info?.queued ?? 0} صف (${info?.method || '?'})`
        )
        const batch =
          (await this.exec<Array<{ id: string; text: string; kind: string }>>(
            'window.__TE_IG_POLL__ ? window.__TE_IG_POLL__() : []'
          )) || []
        for (const item of batch) {
          if (item.kind === 'dm_incoming' && this.flags.autoReplyDms) {
            this.scheduleReply({
              id: item.id,
              text: item.text,
              timestamp: Date.now(),
              channel: 'dm'
            })
          }
        }
        break
      }
      case 'back_inbox': {
        await this.exec('window.__TE_IG_GOTO__ && window.__TE_IG_GOTO__("/direct/inbox/")')
        await sleep(2500)
        this.unreadPass += 1
        if (this.unreadPass < 10 && this.flags.autoReplyDms) {
          const list =
            (await this.exec<Array<{ preview: string }>>(
              'window.__TE_IG_LIST_CONVERSATIONS__ ? window.__TE_IG_LIST_CONVERSATIONS__() : []'
            )) || []
          if (list.length) {
            this.pushActivity('info', `ادامه unread: ${list.length} مورد`)
            this.enqueueTask('open_first_unread', {}, 800)
          } else {
            this.pushActivity('info', 'همه unreadهای این پاس بررسی شد')
          }
        }
        break
      }
      case 'reply_dm': {
        const item = task.payload['item'] as PendingItem
        if (!item || this.repliedIds.has(item.id)) return
        await this.handleDm(item)
        break
      }
      case 'reply_comment': {
        const item = task.payload['item'] as PendingItem
        if (!item || this.repliedIds.has(item.id)) return
        await this.handleComment(item)
        break
      }
      case 'open_activity_item': {
        const href = String(task.payload['href'] || '')
        const text = String(task.payload['text'] || '')
        this.pushActivity('info', `نوتیف: ${text.slice(0, 40)}`)
        await this.exec(`window.__TE_IG_OPEN_HREF__ && window.__TE_IG_OPEN_HREF__(${JSON.stringify(href)})`)
        break
      }
    }
  }

  private async maybeScheduleCycle(force: boolean): Promise<void> {
    const now = Date.now()
    if (this.cycleBusy) return
    if (!force && now - this.lastCycleAt < this.cycleIntervalMs) return
    if (this.tasks.length > 0) return

    this.cycleBusy = true
    this.lastCycleAt = now
    this.unreadPass = 0

    try {
      if (this.flags.autoReplyDms && this.flags.walkUnreadDms) {
        this.phase = 'dms'
        this.pushActivity('info', force ? 'فورس: بررسی unread…' : 'بررسی دایرکت‌های unread…')
        await this.exec('window.__TE_IG_GOTO__ && window.__TE_IG_GOTO__("/direct/inbox/")')
        await sleep(3500)

        const list =
          (await this.exec<Array<{ preview: string }>>(
            'window.__TE_IG_LIST_CONVERSATIONS__ ? window.__TE_IG_LIST_CONVERSATIONS__() : []'
          )) || []

        this.pushActivity('info', list.length ? `${list.length} گفتگوی unread` : 'دایرکت unread نیست')

        if (list.length) {
          this.enqueueTask('open_first_unread', {}, 600)
          this.phase = 'listening'
          return
        }
      }

      if (this.flags.autoReplyNotifications) {
        this.phase = 'notifs'
        this.pushActivity('info', 'بررسی نوتیفیکیشن…')
        await this.exec('window.__TE_IG_OPEN_ACTIVITY_UI__ && window.__TE_IG_OPEN_ACTIVITY_UI__()')
        await sleep(3000)
        const acts =
          (await this.exec<Array<{ href: string; text: string }>>(
            'window.__TE_IG_LIST_ACTIVITY__ ? window.__TE_IG_LIST_ACTIVITY__() : []'
          )) || []
        this.pushActivity('info', acts.length ? `${acts.length} مورد فعالیت` : 'فعالیتی پیدا نشد')
        acts.slice(0, 5).forEach((a, i) => {
          this.enqueueTask(
            'open_activity_item',
            { href: a.href, text: a.text },
            this.delays.delayNotificationsMs + i * 7000
          )
        })
      }

      if (this.flags.acceptFollowRequests) {
        await this.exec('window.__TE_IG_OPEN_ACTIVITY_UI__ && window.__TE_IG_OPEN_ACTIVITY_UI__()')
        await sleep(1500)
        const res = await this.exec<{ accepted?: number }>(
          `window.__TE_IG_ACCEPT_FOLLOWS__ ? window.__TE_IG_ACCEPT_FOLLOWS__(${this.flags.followBack ? 'true' : 'false'}) : ({accepted:0})`
        )
        const n = res?.accepted || 0
        this.pushActivity(n > 0 ? 'success' : 'info', n > 0 ? `${n} فالو تأیید شد` : 'Confirm نبود')
      }

      this.phase = 'listening'
    } finally {
      this.cycleBusy = false
    }
  }

  private async handleDm(msg: PendingItem): Promise<void> {
    if (this.repliedIds.has(msg.id)) return
    this.repliedIds.add(msg.id)
    this.inFlightIds.add(msg.id)

    const result = generateSmartReply(msg.text, this.memory, this.logic)
    if (result.matchedLogic) {
      this.pushActivity('info', `منطق: ${result.matchedLogic.slice(0, 50)}`)
    }
    this.pushActivity('info', `پاسخ: ${result.text.slice(0, 48)}`)

    if (result.actions.includes('like_shared')) {
      const liked = await this.exec<{ ok?: boolean }>(
        'window.__TE_IG_LIKE_SHARED__ ? window.__TE_IG_LIKE_SHARED__() : ({ok:false})'
      )
      if (liked?.ok) this.pushActivity('success', 'لایک شد')
    }

    const sent = await this.sendDm(result.text)
    this.inFlightIds.delete(msg.id)
    if (sent.ok) this.pushActivity('success', 'پاسخ دایرکت ارسال شد')
    else if (sent.reason === 'no_compose') {
      this.repliedIds.delete(msg.id)
      this.pushActivity('warn', 'باکس پیام نیست')
    } else this.pushActivity('error', `ارسال ناموفق: ${sent.reason}`)
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
    const commentText =
      rule?.commentReply?.trim() || generateCommentReply(msg.text, this.memory, this.logic)
    this.pushActivity('info', `پاسخ کامنت: ${commentText.slice(0, 40)}`)
    const result = await this.sendComment(commentText, msg.text)
    if (result.ok) this.pushActivity('success', 'پاسخ کامنت ارسال شد')
    else this.pushActivity('error', `کامنت ناموفق: ${result.reason}`)
    if (rule?.dmMessage?.trim() && msg.username) {
      this.pendingDmAfterNav = { username: msg.username, text: rule.dmMessage.trim() }
      await this.exec(`window.__TE_IG_OPEN_DM__ && window.__TE_IG_OPEN_DM__(${JSON.stringify(msg.username)})`)
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
