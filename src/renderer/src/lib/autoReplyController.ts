import { generateSmartReply, generateCommentReply, type IncomingMessage } from './replyEngine'
import type {
  DmFilter,
  FeatureDelays,
  FeatureFlags,
  KeywordRule,
  SafetySettings
} from './types'
import {
  DEFAULT_DELAYS,
  DEFAULT_DM_FILTER,
  DEFAULT_FLAGS,
  DEFAULT_SAFETY,
  extractUsernameFromPreview,
  isDmUserAllowed,
  isWithinWorkingHours,
  todayKey
} from './types'

export type ActivityLevel = 'info' | 'success' | 'warn' | 'error'

export interface ActivityItem {
  id: string
  level: ActivityLevel
  message: string
  at: number
}

export interface ApprovalItem {
  id: string
  channel: 'dm' | 'comment'
  incoming: string
  draft: string
  username?: string
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

interface HandledMeta {
  previewFp: string
  at: number
  replied: boolean
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
  private handledThreads = new Map<string, HandledMeta>()
  private activities: ActivityItem[] = []
  private listeners = new Set<(items: ActivityItem[]) => void>()
  private approvals: ApprovalItem[] = []
  private approvalListeners = new Set<(items: ApprovalItem[]) => void>()
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private webview: WebviewLike | null = null
  private injectorSource = ''
  private lastReadyPath = ''
  private currentThreadKey = ''
  private currentPreview = ''
  private flags: FeatureFlags = { ...DEFAULT_FLAGS }
  private delays: FeatureDelays = { ...DEFAULT_DELAYS }
  private dmFilter: DmFilter = { ...DEFAULT_DM_FILTER, users: [] }
  private safety: SafetySettings = { ...DEFAULT_SAFETY }
  private dailyStats = { day: '', dm: 0, comment: 0 }
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
    this.cycleIntervalMs = Math.max(15_000, Math.min(30 * 60_000, ms))
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

  setDmFilter(filter: Partial<DmFilter>): void {
    this.dmFilter = {
      mode: filter.mode ?? this.dmFilter.mode,
      users: Array.isArray(filter.users) ? filter.users : this.dmFilter.users
    }
  }

  setSafety(s: Partial<SafetySettings>): void {
    this.safety = { ...this.safety, ...s }
  }

  setDailyStats(stats: { day: string; dm: number; comment: number }): void {
    this.dailyStats = { ...stats }
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
    this.handledThreads.clear()
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

  getApprovals(): ApprovalItem[] {
    return [...this.approvals]
  }

  subscribeApprovals(fn: (items: ApprovalItem[]) => void): () => void {
    this.approvalListeners.add(fn)
    fn(this.getApprovals())
    return () => this.approvalListeners.delete(fn)
  }

  private notifyApprovals(): void {
    const list = this.getApprovals()
    this.approvalListeners.forEach((fn) => fn(list))
  }

  approveReply(id: string, editedText?: string): void {
    const item = this.approvals.find((a) => a.id === id)
    if (!item) return
    this.approvals = this.approvals.filter((a) => a.id !== id)
    this.notifyApprovals()
    const text = (editedText ?? item.draft).trim()
    if (!text) return
    this.enqueueTask(
      item.channel === 'dm' ? 'reply_dm' : 'reply_comment',
      {
        msgId: item.id,
        item: {
          id: item.id,
          text: item.incoming,
          timestamp: Date.now(),
          channel: item.channel,
          username: item.username
        } as PendingItem,
        forcedText: text,
        skipPreview: true
      },
      300
    )
  }

  rejectReply(id: string): void {
    this.approvals = this.approvals.filter((a) => a.id !== id)
    this.repliedIds.add(id)
    this.notifyApprovals()
    this.pushActivity('info', 'پاسخ پیشنهادی رد شد')
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

  private previewFp(preview: string): string {
    return (preview || '').replace(/\s+/g, ' ').trim().slice(0, 120).toLowerCase()
  }

  private threadKeyFromPreview(preview: string, username?: string): string {
    const u = (username || extractUsernameFromPreview(preview) || '').toLowerCase()
    return u ? `u:${u}` : `p:${this.previewFp(preview).slice(0, 40)}`
  }

  private isStillHandled(key: string, preview: string): boolean {
    const meta = this.handledThreads.get(key)
    if (!meta) return false
    const fp = this.previewFp(preview)
    if (fp && fp !== meta.previewFp) return false
    if (!meta.replied && Date.now() - meta.at > 8 * 60_000) return false
    return true
  }

  private markThreadHandled(key: string, preview: string, replied: boolean): void {
    if (!key) return
    this.handledThreads.set(key, {
      previewFp: this.previewFp(preview),
      at: Date.now(),
      replied
    })
    if (this.handledThreads.size > 400) {
      const first = this.handledThreads.keys().next().value
      if (first) this.handledThreads.delete(first)
    }
  }

  private ensureDailyDay(): void {
    const k = todayKey()
    if (this.dailyStats.day !== k) {
      this.dailyStats = { day: k, dm: 0, comment: 0 }
      void window.api.setStore('dailyStats', this.dailyStats)
    }
  }

  private withinHours(): boolean {
    return isWithinWorkingHours(
      this.safety.workingHoursEnabled,
      this.safety.workStartHour,
      this.safety.workEndHour
    )
  }

  private canSend(channel: 'dm' | 'comment'): boolean {
    if (!this.safety.dailyLimitEnabled) return true
    this.ensureDailyDay()
    if (channel === 'dm') return this.dailyStats.dm < this.safety.dailyLimitDm
    return this.dailyStats.comment < this.safety.dailyLimitComment
  }

  private async bumpDaily(channel: 'dm' | 'comment'): Promise<void> {
    if (!this.safety.dailyLimitEnabled) return
    this.ensureDailyDay()
    if (channel === 'dm') this.dailyStats.dm += 1
    else this.dailyStats.comment += 1
    await window.api.setStore('dailyStats', this.dailyStats)
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
      if (!has && this.injectorSource) await wv.executeJavaScript(this.injectorSource)

      const status = await this.exec<{ path?: string; ready?: boolean; peer?: string }>(
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
          Array<{ id: string; text: string; kind: string; username?: string; isMention?: boolean; path?: string }>
        >('window.__TE_IG_POLL__ ? window.__TE_IG_POLL__() : []')) || []

      for (const item of batch) {
        if (item.kind === 'dm_incoming' && this.flags.autoReplyDms) {
          this.scheduleReply({
            id: item.id,
            text: item.text,
            timestamp: Date.now(),
            channel: 'dm',
            username: item.username || status?.peer
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
      /* ignore */
    }
  }

  private scheduleReply(item: PendingItem): void {
    if (this.repliedIds.has(item.id) || this.inFlightIds.has(item.id)) return
    if (this.tasks.some((t) => t.payload['msgId'] === item.id)) return
    if (this.approvals.some((a) => a.id === item.id)) return

    if (/^reacted\s+/i.test(item.text.trim()) || /reacted .* to your message/i.test(item.text)) {
      this.repliedIds.add(item.id)
      return
    }

    if (!this.withinHours()) {
      this.pushActivity('warn', 'خارج از ساعات کاری — پاسخ متوقف')
      return
    }

    if (!this.canSend(item.channel === 'dm' ? 'dm' : 'comment')) {
      this.pushActivity('warn', 'سقف روزانه پاسخ پر شده است')
      return
    }

    if (item.channel === 'dm') {
      const u = item.username || ''
      if (!u && this.dmFilter.mode === 'whitelist') {
        this.pushActivity('warn', 'یوزرنیم مشخص نیست — رد موقت (وایت‌لیست)')
        return
      }
      if (!isDmUserAllowed(u || undefined, this.dmFilter)) {
        this.repliedIds.add(item.id)
        this.pushActivity(
          'info',
          this.dmFilter.mode === 'whitelist'
            ? `رد شد (وایت‌لیست): @${u || '؟'}`
            : `رد شد (بلک‌لیست): @${u || '؟'}`
        )
        return
      }
    }

    const draft =
      item.channel === 'dm'
        ? generateSmartReply(item.text, this.memory, this.logic).text
        : generateCommentReply(item.text, this.memory, this.logic)

    if (this.flags.previewBeforeSend) {
      this.approvals = [
        {
          id: item.id,
          channel: item.channel,
          incoming: item.text,
          draft,
          username: item.username,
          at: Date.now()
        },
        ...this.approvals
      ].slice(0, 30)
      this.notifyApprovals()
      this.pushActivity('info', `در انتظار تأیید: ${item.text.slice(0, 32)}…`)
      return
    }

    const delay = item.channel === 'dm' ? this.delays.delayDmsMs : this.delays.delayCommentsMs
    this.pushActivity(
      'info',
      item.channel === 'dm'
        ? `پیام در صف${item.username ? ' @' + item.username : ''}: ${item.text.slice(0, 40)}…`
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
        const list =
          (await this.exec<
            Array<{ index: number; preview: string; href?: string; username?: string }>
          >('window.__TE_IG_LIST_CONVERSATIONS__ ? window.__TE_IG_LIST_CONVERSATIONS__() : []')) ||
          []

        let chosen: { index: number; preview: string; username?: string } | null = null
        for (const row of list) {
          const uname = row.username || extractUsernameFromPreview(row.preview)
          const key = this.threadKeyFromPreview(row.preview, uname)
          if (this.isStillHandled(key, row.preview)) continue
          if (uname && !isDmUserAllowed(uname, this.dmFilter)) {
            this.markThreadHandled(key, row.preview, true)
            this.pushActivity('info', `رد گفتگو (فیلتر لیست): @${uname}`)
            continue
          }
          chosen = { index: row.index, preview: row.preview, username: uname }
          break
        }

        if (!chosen) {
          const res = await this.exec<{
            ok?: boolean
            reason?: string
            preview?: string
            username?: string
          }>('window.__TE_IG_OPEN_FIRST_UNREAD__ ? window.__TE_IG_OPEN_FIRST_UNREAD__() : ({ok:false})')
          if (!res?.ok) {
            this.pushActivity('info', `unread باقی نماند (${res?.reason || 'ok'})`)
            this.unreadPass = 99
            break
          }
          const uname = res.username || extractUsernameFromPreview(res.preview || '')
          const key = this.threadKeyFromPreview(res.preview || '', uname)
          if (this.isStillHandled(key, res.preview || '')) {
            this.enqueueTask('back_inbox', {}, 600)
            break
          }
          if (uname && !isDmUserAllowed(uname, this.dmFilter)) {
            this.markThreadHandled(key, res.preview || '', true)
            this.enqueueTask('back_inbox', {}, 600)
            break
          }
          this.currentThreadKey = key
          this.currentPreview = res.preview || ''
          this.pushActivity('info', `باز شد: ${(res.preview || '').slice(0, 52)}`)
          this.enqueueTask('force_scan', { threadKey: key, preview: res.preview || '' }, 2200)
          this.enqueueTask('force_scan', { threadKey: key, preview: res.preview || '' }, 4800)
          this.enqueueTask(
            'back_inbox',
            { threadKey: key, preview: res.preview || '', finalize: true },
            11000
          )
          break
        }

        const openRes = await this.exec<{ ok?: boolean }>(
          `window.__TE_IG_OPEN_CONV_INDEX__ ? window.__TE_IG_OPEN_CONV_INDEX__(${chosen.index}) : ({ok:false})`
        )
        const key = this.threadKeyFromPreview(chosen.preview, chosen.username)
        this.currentThreadKey = key
        this.currentPreview = chosen.preview
        if (!openRes?.ok) {
          this.markThreadHandled(key, chosen.preview, false)
          this.enqueueTask('back_inbox', {}, 600)
          break
        }
        this.pushActivity('info', `باز شد: ${chosen.preview.slice(0, 52)}`)
        this.enqueueTask('force_scan', { threadKey: key, preview: chosen.preview }, 2200)
        this.enqueueTask('force_scan', { threadKey: key, preview: chosen.preview }, 4800)
        this.enqueueTask(
          'back_inbox',
          { threadKey: key, preview: chosen.preview, finalize: true },
          11000
        )
        break
      }
      case 'force_scan': {
        const threadKey = String(task.payload['threadKey'] || this.currentThreadKey || '')
        const preview = String(task.payload['preview'] || this.currentPreview || '')
        const info = await this.exec<{
          dmNodes?: number
          queued?: number
          peer?: string
          hasAttachment?: boolean
        }>('window.__TE_IG_FORCE_SCAN_THREAD__ ? window.__TE_IG_FORCE_SCAN_THREAD__() : null')

        this.pushActivity(
          'info',
          `اسکن: ${info?.dmNodes ?? 0} حباب / ${info?.queued ?? 0} صف${info?.peer ? ' @' + info.peer : ''}${info?.hasAttachment ? ' · رسانه' : ''}`
        )

        const batch =
          (await this.exec<
            Array<{ id: string; text: string; kind: string; username?: string }>
          >('window.__TE_IG_POLL__ ? window.__TE_IG_POLL__() : []')) || []

        let queuedReplies = 0
        // reply-all: schedule every dm_incoming (controller de-dupes)
        for (const item of batch) {
          if (item.kind === 'dm_incoming' && this.flags.autoReplyDms) {
            const before = this.tasks.length + this.approvals.length
            this.scheduleReply({
              id: item.id,
              text: item.text,
              timestamp: Date.now(),
              channel: 'dm',
              username: item.username || info?.peer
            })
            if (this.tasks.length + this.approvals.length > before) queuedReplies++
          }
        }

        if (
          (info?.hasAttachment || /attachment|sent an attach/i.test(preview)) &&
          queuedReplies === 0
        ) {
          const syntheticId = `attach|${threadKey}|${this.previewFp(preview)}`
          if (!this.repliedIds.has(syntheticId)) {
            this.scheduleReply({
              id: syntheticId,
              text: '[shared_post_or_attachment]',
              timestamp: Date.now(),
              channel: 'dm',
              username: info?.peer
            })
            queuedReplies++
          }
        }

        if (queuedReplies === 0 && (info?.queued ?? 0) === 0 && threadKey) {
          this.markThreadHandled(threadKey, preview, false)
        }
        break
      }
      case 'back_inbox': {
        const threadKey = String(task.payload['threadKey'] || this.currentThreadKey || '')
        const preview = String(task.payload['preview'] || this.currentPreview || '')
        const finalize = Boolean(task.payload['finalize'])
        if (finalize && threadKey) {
          const pendingDm = this.tasks.some((t) => t.kind === 'reply_dm')
          if (!pendingDm) this.markThreadHandled(threadKey, preview, false)
        }
        await this.exec('window.__TE_IG_GOTO__ && window.__TE_IG_GOTO__("/direct/inbox/")')
        await sleep(2200)
        this.unreadPass += 1
        if (this.unreadPass < 12 && this.flags.autoReplyDms) {
          const list =
            (await this.exec<Array<{ preview: string; username?: string }>>(
              'window.__TE_IG_LIST_CONVERSATIONS__ ? window.__TE_IG_LIST_CONVERSATIONS__() : []'
            )) || []
          const remaining = list.filter((r) => {
            const uname = r.username || extractUsernameFromPreview(r.preview)
            const key = this.threadKeyFromPreview(r.preview, uname)
            return !this.isStillHandled(key, r.preview)
          })
          if (remaining.length) {
            this.pushActivity('info', `ادامه unread: ${remaining.length} مورد`)
            this.enqueueTask('open_first_unread', {}, 700)
          } else {
            this.pushActivity('info', 'همه unreadهای قابل‌بررسی تمام شد')
          }
        }
        break
      }
      case 'reply_dm': {
        const item = task.payload['item'] as PendingItem
        const forcedText = task.payload['forcedText'] as string | undefined
        if (!item || this.repliedIds.has(item.id)) return
        await this.handleDm(item, forcedText)
        break
      }
      case 'reply_comment': {
        const item = task.payload['item'] as PendingItem
        const forcedText = task.payload['forcedText'] as string | undefined
        if (!item || this.repliedIds.has(item.id)) return
        await this.handleComment(item, forcedText)
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

    if (!this.withinHours()) {
      this.pushActivity('info', 'خارج از ساعات کاری — چرخه رد شد')
      this.lastCycleAt = now
      return
    }

    this.cycleBusy = true
    this.lastCycleAt = now
    this.unreadPass = 0

    try {
      if (this.flags.autoReplyDms && this.flags.walkUnreadDms) {
        this.phase = 'dms'
        this.pushActivity('info', force ? 'فورس: بررسی unread…' : 'بررسی دایرکت‌های unread…')
        await this.exec('window.__TE_IG_GOTO__ && window.__TE_IG_GOTO__("/direct/inbox/")')
        await sleep(3200)

        const list =
          (await this.exec<Array<{ preview: string; username?: string }>>(
            'window.__TE_IG_LIST_CONVERSATIONS__ ? window.__TE_IG_LIST_CONVERSATIONS__() : []'
          )) || []

        const actionable = list.filter((r) => {
          const uname = r.username || extractUsernameFromPreview(r.preview)
          const key = this.threadKeyFromPreview(r.preview, uname)
          return !this.isStillHandled(key, r.preview)
        })

        this.pushActivity(
          'info',
          list.length
            ? `${list.length} unread · ${actionable.length} قابل بررسی`
            : 'دایرکت unread نیست'
        )

        if (actionable.length) {
          this.enqueueTask('open_first_unread', {}, 500)
          this.phase = 'listening'
          return
        }
      }

      if (this.flags.autoReplyNotifications) {
        this.phase = 'notifs'
        this.pushActivity('info', 'بررسی نوتیفیکیشن…')
        await this.exec('window.__TE_IG_OPEN_ACTIVITY_UI__ && window.__TE_IG_OPEN_ACTIVITY_UI__()')
        await sleep(2800)
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

  private async handleDm(msg: PendingItem, forcedText?: string): Promise<void> {
    if (this.repliedIds.has(msg.id)) return
    if (!this.canSend('dm')) {
      this.pushActivity('warn', 'سقف روزانه دایرکت')
      return
    }
    this.repliedIds.add(msg.id)
    this.inFlightIds.add(msg.id)

    const result = generateSmartReply(msg.text, this.memory, this.logic)
    if (result.matchedLogic) this.pushActivity('info', `منطق: ${result.matchedLogic.slice(0, 56)}`)

    if (result.actions.includes('react_heart') || result.actions.includes('like_shared')) {
      const reacted = await this.exec<{ ok?: boolean; via?: string }>(
        'window.__TE_IG_REACT_HEART__ ? window.__TE_IG_REACT_HEART__() : ({ok:false})'
      )
      if (reacted?.ok) this.pushActivity('success', `ری‌اکت قلب (${reacted.via || ''})`)
      else {
        const liked = await this.exec<{ ok?: boolean }>(
          'window.__TE_IG_LIKE_SHARED__ ? window.__TE_IG_LIKE_SHARED__() : ({ok:false})'
        )
        if (liked?.ok) this.pushActivity('success', 'لایک رسانه')
      }
    }

    const text = (forcedText || result.text).trim()
    const isAttachOnly = msg.text === '[shared_post_or_attachment]'
    if (isAttachOnly && !forcedText && (!text || text === 'پیامتون رو دیدم ✅')) {
      this.inFlightIds.delete(msg.id)
      if (this.currentThreadKey)
        this.markThreadHandled(this.currentThreadKey, this.currentPreview, true)
      return
    }

    this.pushActivity('info', `پاسخ: ${text.slice(0, 48)}`)
    const sent = await this.sendDm(text)
    this.inFlightIds.delete(msg.id)
    if (sent.ok) {
      await this.bumpDaily('dm')
      this.pushActivity('success', 'پاسخ دایرکت ارسال شد')
      if (this.currentThreadKey)
        this.markThreadHandled(this.currentThreadKey, this.currentPreview, true)
      if (msg.username)
        this.markThreadHandled(`u:${msg.username.toLowerCase()}`, this.currentPreview, true)
    } else if (sent.reason === 'no_compose') {
      this.repliedIds.delete(msg.id)
      this.pushActivity('warn', 'باکس پیام نیست')
    } else this.pushActivity('error', `ارسال ناموفق: ${sent.reason}`)
  }

  private async handleComment(msg: PendingItem, forcedText?: string): Promise<void> {
    if (!this.canSend('comment')) {
      this.pushActivity('warn', 'سقف روزانه کامنت')
      return
    }
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
      forcedText ||
      rule?.commentReply?.trim() ||
      generateCommentReply(msg.text, this.memory, this.logic)
    this.pushActivity('info', `پاسخ کامنت: ${commentText.slice(0, 40)}`)
    const result = await this.sendComment(commentText, msg.text)
    if (result.ok) {
      await this.bumpDaily('comment')
      this.pushActivity('success', 'پاسخ کامنت ارسال شد')
    } else this.pushActivity('error', `کامنت ناموفق: ${result.reason}`)
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
