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
  extractUsernameCandidates,
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
    this.cycleBusy = false
    this.processing = false
    this.pushActivity('info', '▶ اجرای فورس شروع شد')
    if (!this.webview) {
      this.pushActivity('error', 'وب‌ویو متصل نیست — صفحه اینستاگرام را رفرش کنید')
    } else {
      this.pushActivity('info', `وب‌ویو OK · صف فعلی: ${this.tasks.length}`)
    }
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
    this.pollTimer = setInterval(() => void this.tick(), 1200)
  }

  async ensureInjected(webview: WebviewLike, injectorSource: string): Promise<void> {
    this.webview = webview
    this.injectorSource = injectorSource
    try {
      const has = await this.execWithTimeout<boolean>(
        '!!(window.__TE_IG_POLL__ && window.__TE_IG_LIST_CONVERSATIONS__)',
        2500
      )
      if (!has && injectorSource) {
        await this.execWithTimeout(injectorSource, 4000)
      }
    } catch {
      /* ignore */
    }
  }

  unbindWebview(): void {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
    this.webview = null
  }

  private async execWithTimeout<T>(code: string, ms = 4000): Promise<T | null> {
    const wv = this.webview
    if (!wv) return null
    try {
      const result = await Promise.race([
        wv.executeJavaScript(code) as Promise<T>,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))
      ])
      return result as T | null
    } catch {
      return null
    }
  }

  private async exec<T>(code: string): Promise<T | null> {
    return this.execWithTimeout<T>(code, 4000)
  }

  private async tick(): Promise<void> {
    const wv = this.webview
    if (!wv) return
    try {
      const has = await this.execWithTimeout<boolean>(
        '!!(window.__TE_IG_POLL__ && window.__TE_IG_SEND_REPLY__)',
        2000
      )
      if (!has && this.injectorSource) {
        await this.execWithTimeout(this.injectorSource, 3500)
      }

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
      const extra = extractUsernameCandidates(
        [item.username, this.currentPreview, this.currentThreadKey].filter(Boolean).join(' ')
      )
      const u = item.username || extra[0] || ''
      if (this.dmFilter.mode !== 'off' && !u && !extra.length) {
        this.pushActivity('warn', 'یوزرنیم مشخص نیست — رد موقت (فیلتر لیست)')
        return
      }
      if (!isDmUserAllowed(u || undefined, this.dmFilter, extra)) {
        this.repliedIds.add(item.id)
        this.pushActivity(
          'info',
          this.dmFilter.mode === 'whitelist'
            ? `رد شد (وایت‌لیست): @${u || extra[0] || '؟'}`
            : `رد شد (بلک‌لیست): @${u || extra[0] || '؟'}`
        )
        return
      }
    }

    const smart =
      item.channel === 'dm'
        ? generateSmartReply(item.text, this.memory, this.logic)
        : null
    const draft =
      item.channel === 'dm'
        ? smart!.text
        : generateCommentReply(item.text, this.memory, this.logic)

    if (smart?.matchedLogic) {
      this.pushActivity('info', `منطق: ${smart.matchedLogic.slice(0, 80)}`
      )
    }

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
      { msgId: item.id, item, actions: smart?.actions || ['none'] },
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
        try {
          await this.executeTask(task)
        } catch {
          this.pushActivity('warn', `خطا در تسک ${task.kind}`)
        }
        await sleep(250)
      }
    } finally {
      this.processing = false
    }
  }

  private async executeTask(task: Task): Promise<void> {
    switch (task.kind) {
      case 'open_first_unread': {
        const attempt = Number(task.payload['attempt'] || 1)
        this.pushActivity('info', `شروع اسکن unread (تلاش ${attempt})`)
        if (!this.webview) {
          this.pushActivity('error', 'وب‌ویو نیست — اسکن لغو')
          break
        }
        if (this.injectorSource) {
          const alive = await this.execWithTimeout<boolean>(
            '!!window.__TE_IG_LIST_CONVERSATIONS__',
            2000
          )
          if (!alive) await this.execWithTimeout(this.injectorSource, 3500)
        }
        const list =
          (await this.exec<
            Array<{
              index: number
              preview: string
              href?: string
              username?: string
              score?: number
              debug?: string
            }>
          >('window.__TE_IG_LIST_CONVERSATIONS__ ? window.__TE_IG_LIST_CONVERSATIONS__() : []')) ||
          []

        const dbg = list[0]?.debug || ''
        this.pushActivity(
          'info',
          `unread لیست: ${list.length} (تلاش ${attempt})${dbg ? ' · ' + dbg : ''}${list[0] ? ' · ' + list[0].preview.slice(0, 36) : ''}`
        )

        let chosen: { index: number; preview: string; username?: string } | null = null
        for (const row of list) {
          const uname = row.username || extractUsernameFromPreview(row.preview)
          const key = this.threadKeyFromPreview(row.preview, uname)
          if (this.isStillHandled(key, row.preview)) continue
          const extras = extractUsernameCandidates(row.preview)
          if (!isDmUserAllowed(uname || extras[0], this.dmFilter, extras)) {
            this.markThreadHandled(key, row.preview, true)
            this.pushActivity('info', `رد گفتگو (فیلتر لیست): @${uname || extras[0] || '؟'}`)
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
            debug?: string
          }>('window.__TE_IG_OPEN_FIRST_UNREAD__ ? window.__TE_IG_OPEN_FIRST_UNREAD__() : ({ok:false,reason:"no_fn"})')
          if (!res?.ok) {
            const d = res?.debug || ''
            this.pushActivity(
              'info',
              attempt < 3
                ? `هنوز unread پیدا نشد (${res?.reason || 'empty'}${d ? ' ' + d : ''}) — تلاش بعد`
                : `unread باقی نماند (${res?.reason || 'ok'}${d ? ' ' + d : ''})`
            )
            if (attempt >= 3) this.unreadPass = 99
            break
          }
          const uname = res.username || extractUsernameFromPreview(res.preview || '')
          const key = this.threadKeyFromPreview(res.preview || '', uname)
          if (this.isStillHandled(key, res.preview || '')) {
            this.enqueueTask('back_inbox', {}, 600)
            break
          }
          const extras2 = extractUsernameCandidates(res.preview || '')
          if (!isDmUserAllowed(uname || extras2[0], this.dmFilter, extras2)) {
            this.markThreadHandled(key, res.preview || '', true)
            this.pushActivity('info', `رد گفتگو (فیلتر لیست): @${uname || extras2[0] || '؟'}`)
            this.enqueueTask('back_inbox', {}, 600)
            break
          }
          this.currentThreadKey = key
          this.currentPreview = res.preview || ''
          this.pushActivity('info', `باز شد: ${(res.preview || '').slice(0, 52)}`)
          this.enqueueTask('force_scan', { threadKey: key, preview: res.preview || '' }, 3500)
          this.enqueueTask('force_scan', { threadKey: key, preview: res.preview || '' }, 7000)
          this.enqueueTask(
            'back_inbox',
            { threadKey: key, preview: res.preview || '', finalize: true },
            13000
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
        this.enqueueTask('force_scan', { threadKey: key, preview: chosen.preview }, 3500)
        this.enqueueTask('force_scan', { threadKey: key, preview: chosen.preview }, 7000)
        this.enqueueTask(
          'back_inbox',
          { threadKey: key, preview: chosen.preview, finalize: true },
          13000
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

        if (info?.peer) {
          const extras = extractUsernameCandidates(`${info.peer} ${preview}`)
          if (!isDmUserAllowed(info.peer, this.dmFilter, extras)) {
            this.markThreadHandled(threadKey, preview, true)
            this.pushActivity('info', `رد شد (فیلتر لیست): @${info.peer}`)
            this.enqueueTask('back_inbox', { threadKey, preview, finalize: true }, 400)
          }
        }
        break
      }
      case 'reply_dm': {
        const msgId = String(task.payload['msgId'] || '')
        const item = task.payload['item'] as PendingItem
        const forcedText = task.payload['forcedText'] as string | undefined
        if (!item || this.repliedIds.has(msgId) || this.inFlightIds.has(msgId)) break

        const extra = extractUsernameCandidates(
          [item.username, this.currentPreview, this.currentThreadKey].filter(Boolean).join(' ')
        )
        if (!isDmUserAllowed(item.username || extra[0], this.dmFilter, extra)) {
          this.repliedIds.add(msgId)
          this.pushActivity('info', `رد ارسال (فیلتر): @${item.username || extra[0] || '؟'}`)
          break
        }

        this.inFlightIds.add(msgId)
        try {
          const result =
            forcedText && forcedText.trim()
              ? { text: forcedText.trim(), actions: ['none' as const] }
              : generateSmartReply(item.text, this.memory, this.logic)

          if (result.actions.includes('react_heart')) {
            await this.exec('window.__TE_IG_REACT_HEART__ ? window.__TE_IG_REACT_HEART__() : null')
            this.pushActivity('info', 'ری‌اکت قلب')
          }

          const sendRes = await this.exec<{ ok?: boolean; reason?: string }>(
            `window.__TE_IG_SEND_REPLY__ ? window.__TE_IG_SEND_REPLY__(${JSON.stringify(result.text)}) : ({ok:false})`
          )
          if (sendRes?.ok) {
            this.repliedIds.add(msgId)
            await this.bumpDaily('dm')
            this.pushActivity('info', `پاسخ: ${result.text.slice(0, 80)}`)
            this.pushActivity('success', 'پاسخ دایرکت ارسال شد')
            if (this.currentThreadKey) {
              this.markThreadHandled(this.currentThreadKey, this.currentPreview, true)
            }
          } else if (sendRes?.reason === 'no_box') {
            this.pushActivity('warn', 'ارسال ناموفق: no_box — تلاش مجدد')
            this.enqueueTask('reply_dm', task.payload, 2500)
          } else {
            this.pushActivity('warn', `ارسال ناموفق: ${sendRes?.reason || 'unknown'}`)
          }
        } finally {
          this.inFlightIds.delete(msgId)
        }
        break
      }
      case 'reply_comment': {
        const msgId = String(task.payload['msgId'] || '')
        const item = task.payload['item'] as PendingItem
        const forcedText = task.payload['forcedText'] as string | undefined
        if (!item || this.repliedIds.has(msgId) || this.inFlightIds.has(msgId)) break
        this.inFlightIds.add(msgId)
        try {
          const text =
            forcedText?.trim() || generateCommentReply(item.text, this.memory, this.logic)
          const sendRes = await this.exec<{ ok?: boolean; reason?: string }>(
            `window.__TE_IG_SEND_COMMENT_REPLY__ ? window.__TE_IG_SEND_COMMENT_REPLY__(${JSON.stringify(text)}) : ({ok:false})`
          )
          if (sendRes?.ok) {
            this.repliedIds.add(msgId)
            await this.bumpDaily('comment')
            this.pushActivity('success', 'پاسخ کامنت ارسال شد')
          } else {
            this.pushActivity('warn', `کامنت ناموفق: ${sendRes?.reason || 'unknown'}`)
          }
        } finally {
          this.inFlightIds.delete(msgId)
        }
        break
      }
      case 'open_activity_item': {
        await this.exec(
          'window.__TE_IG_OPEN_FIRST_ACTIVITY__ ? window.__TE_IG_OPEN_FIRST_ACTIVITY__() : null'
        )
        break
      }
      case 'back_inbox': {
        const finalize = Boolean(task.payload['finalize'])
        const threadKey = String(task.payload['threadKey'] || this.currentThreadKey || '')
        const preview = String(task.payload['preview'] || this.currentPreview || '')
        if (finalize && threadKey) {
          this.markThreadHandled(threadKey, preview, true)
        }
        void this.exec(
          'window.__TE_IG_GOTO_INBOX__ ? window.__TE_IG_GOTO_INBOX__() : (location.href="https://www.instagram.com/direct/inbox/")'
        )
        if (this.flags.walkUnreadDms && this.unreadPass < 8) {
          this.unreadPass += 1
          this.enqueueTask('open_first_unread', { attempt: 1 }, 2000)
        } else {
          this.pushActivity('info', 'همه unreadهای این پاس بررسی شد')
          this.phase = 'listening'
        }
        break
      }
      default:
        break
    }
  }

  private async maybeScheduleCycle(force: boolean): Promise<void> {
    if (!this.enabled) return
    if (this.cycleBusy && !force) return
    const now = Date.now()
    if (!force && now - this.lastCycleAt < this.cycleIntervalMs) return
    this.lastCycleAt = now
    this.cycleBusy = true
    this.unreadPass = 0
    try {
      if (this.flags.autoReplyDms && this.flags.walkUnreadDms) {
        this.phase = 'dms'
        this.pushActivity('info', force ? 'فورس: بررسی unread…' : 'بررسی دایرکت‌های unread…')
        this.enqueueTask('open_first_unread', { attempt: 1 }, 2000)
        this.enqueueTask('open_first_unread', { attempt: 2 }, 5000)
        this.enqueueTask('open_first_unread', { attempt: 3 }, 8500)
        this.pushActivity('info', `تسک unread در صف: ${this.tasks.length}`)
        void this.exec(
          'window.__TE_IG_GOTO_INBOX__ ? window.__TE_IG_GOTO_INBOX__() : (location.href="https://www.instagram.com/direct/inbox/")'
        )
      } else if (this.flags.autoReplyNotifications) {
        this.phase = 'notifs'
        this.pushActivity('info', 'بررسی نوتیفیکیشن…')
        this.enqueueTask('open_activity_item', {}, 2500)
        void this.exec(
          'window.__TE_IG_OPEN_ACTIVITY_UI__ ? window.__TE_IG_OPEN_ACTIVITY_UI__() : (location.href="https://www.instagram.com/accounts/activity/")'
        )
      } else {
        this.phase = 'listening'
        this.pushActivity('warn', 'walkUnreadDms و نوتیف خاموش است')
        this.cycleBusy = false
      }
    } catch {
      this.pushActivity('error', 'خطا در شروع چرخه')
      this.cycleBusy = false
    } finally {
      setTimeout(() => {
        this.cycleBusy = false
      }, 20_000)
    }
  }

  private async tryClickMessageAndSend(text: string): Promise<void> {
    await this.exec(
      `window.__TE_IG_SEND_REPLY__ ? window.__TE_IG_SEND_REPLY__(${JSON.stringify(text)}) : null`
    )
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export const autoReplyController = new AutoReplyController()
