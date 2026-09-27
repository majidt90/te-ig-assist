import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Save,
  Brain,
  CheckCircle2,
  Lightbulb,
  MessageSquare,
  AtSign,
  Plus,
  Trash2,
  Inbox,
  UserPlus,
  GitBranch,
  ListFilter,
  KeyRound,
  Timer,
  BookOpen,
  Clock,
  Shield
} from 'lucide-react'
import { cn } from '../lib/utils'
import type { DmListMode, KeywordRule } from '../lib/types'
import { formatRemaining } from '../lib/license'

interface SettingsPanelProps {
  activeTab: 'settings' | 'memory' | 'rules'
}

const MAX_MEMORY_CHARS = 4000
const MAX_LOGIC_CHARS = 3000

function newRule(): KeywordRule {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    keyword: '',
    commentReply: '',
    dmMessage: '',
    enabled: true
  }
}

function ToggleSwitch({
  checked,
  onChange,
  label,
  desc
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  desc: string
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-xl border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--secondary)/0.4)] p-3 text-right transition hover:bg-[hsl(var(--secondary)/0.65)]"
    >
      <div
        className={cn(
          'mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors duration-200',
          checked ? 'justify-start bg-emerald-500' : 'justify-end bg-zinc-600'
        )}
        role="switch"
        aria-checked={checked}
      >
        <span className="h-4 w-4 rounded-full bg-white shadow-sm" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium">{label}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-[hsl(var(--muted-foreground))]">{desc}</p>
      </div>
    </button>
  )
}

function DelaySlider({
  label,
  valueSec,
  onChange
}: {
  label: string
  valueSec: number
  onChange: (v: number) => void
}): JSX.Element {
  return (
    <div className="rounded-lg border border-[hsl(var(--border)/0.5)] bg-black/20 px-3 py-2">
      <div className="mb-1.5 flex items-center justify-between text-[11px]">
        <span className="text-[hsl(var(--muted-foreground))]">{label}</span>
        <span className="tabular-nums">{valueSec.toLocaleString('fa-IR')} ثانیه</span>
      </div>
      <input
        type="range"
        min={1}
        max={15}
        step={0.5}
        value={valueSec}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[hsl(var(--muted))] accent-[hsl(var(--primary))]"
      />
    </div>
  )
}

function TabSaveBar({
  onSave,
  saved,
  saving,
  label
}: {
  onSave: () => void
  saved: boolean
  saving?: boolean
  label: string
}): JSX.Element {
  return (
    <div className="sticky top-0 z-10 -mx-4 mb-1 flex items-center justify-between gap-2 border-b border-[hsl(var(--border)/0.6)] bg-[hsl(var(--card)/0.92)] px-4 py-2.5 backdrop-blur-md">
      <span className="text-[12px] font-semibold">{label}</span>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className={cn(
          'btn-primary flex items-center gap-1.5 !px-3 !py-1.5 !text-[11px]',
          saved && '!bg-emerald-500'
        )}
      >
        {saved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
        {saved ? 'ذخیره شد' : 'ذخیره'}
      </button>
    </div>
  )
}

function LicenseSection(): JSX.Element {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [keyPreview, setKeyPreview] = useState('')
  const [remaining, setRemaining] = useState('')
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    void (async () => {
      const [u, e, exp, key] = await Promise.all([
        window.api.getStore('licenseUsername'),
        window.api.getStore('licenseEmail'),
        window.api.getStore('licenseExpiresAt'),
        window.api.getStore('licenseKey')
      ])
      if (typeof u === 'string') setUsername(u)
      if (typeof e === 'string') setEmail(e)
      if (typeof exp === 'string') setExpiresAt(exp)
      if (typeof key === 'string') setKeyPreview(key.slice(0, 28) + '…')
    })()
  }, [])

  useEffect(() => {
    if (!expiresAt) return
    const tick = () => {
      const r = formatRemaining(expiresAt)
      setRemaining(r.label)
      setExpired(r.expired)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt])

  const expDate = expiresAt
    ? new Date(expiresAt).toLocaleDateString('fa-IR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    : '—'

  return (
    <section className="space-y-2">
      <h3 className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
        <KeyRound className="h-3.5 w-3.5 text-violet-400" />
        لایسنس
      </h3>
      <div className="space-y-2 rounded-xl border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--secondary)/0.35)] p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-[hsl(var(--muted-foreground))]">وضعیت</span>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-medium',
              expired ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'
            )}
          >
            {expired ? 'منقضی' : 'فعال'}
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-black/25 px-3 py-2">
          <Timer className={cn('h-4 w-4', expired ? 'text-red-400' : 'text-amber-400')} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-[hsl(var(--muted-foreground))]">زمان باقی‌مانده</p>
            <p className={cn('text-[13px] font-semibold tabular-nums', expired && 'text-red-400')}>
              {remaining || '—'}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-1 text-[11px]">
          <div className="flex justify-between gap-2">
            <span className="text-[hsl(var(--muted-foreground))]">کاربر</span>
            <span className="font-mono text-[10px]" dir="ltr">{username || '—'}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-[hsl(var(--muted-foreground))]">ایمیل</span>
            <span className="truncate font-mono text-[10px]" dir="ltr">{email || '—'}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-[hsl(var(--muted-foreground))]">انقضا</span>
            <span>{expDate}</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function SafetySection(): JSX.Element {
  const [replyAllInThread, setReplyAllInThread] = useState(true)
  const [previewBeforeSend, setPreviewBeforeSend] = useState(false)
  const [workingHoursEnabled, setWorkingHoursEnabled] = useState(false)
  const [workStartHour, setWorkStartHour] = useState(9)
  const [workEndHour, setWorkEndHour] = useState(22)
  const [dailyLimitEnabled, setDailyLimitEnabled] = useState(false)
  const [dailyLimitDm, setDailyLimitDm] = useState(50)
  const [dailyLimitComment, setDailyLimitComment] = useState(30)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void (async () => {
      const keys = [
        'replyAllInThread',
        'previewBeforeSend',
        'workingHoursEnabled',
        'workStartHour',
        'workEndHour',
        'dailyLimitEnabled',
        'dailyLimitDm',
        'dailyLimitComment'
      ] as const
      const vals = await Promise.all(keys.map((k) => window.api.getStore(k)))
      const m = Object.fromEntries(keys.map((k, i) => [k, vals[i]]))
      if (typeof m.replyAllInThread === 'boolean') setReplyAllInThread(m.replyAllInThread)
      if (typeof m.previewBeforeSend === 'boolean') setPreviewBeforeSend(m.previewBeforeSend)
      if (typeof m.workingHoursEnabled === 'boolean') setWorkingHoursEnabled(m.workingHoursEnabled)
      if (typeof m.workStartHour === 'number') setWorkStartHour(m.workStartHour)
      if (typeof m.workEndHour === 'number') setWorkEndHour(m.workEndHour)
      if (typeof m.dailyLimitEnabled === 'boolean') setDailyLimitEnabled(m.dailyLimitEnabled)
      if (typeof m.dailyLimitDm === 'number') setDailyLimitDm(m.dailyLimitDm)
      if (typeof m.dailyLimitComment === 'number') setDailyLimitComment(m.dailyLimitComment)
    })()
  }, [])

  const save = async () => {
    await window.api.setStore('replyAllInThread', replyAllInThread)
    await window.api.setStore('previewBeforeSend', previewBeforeSend)
    await window.api.setStore('workingHoursEnabled', workingHoursEnabled)
    await window.api.setStore('workStartHour', workStartHour)
    await window.api.setStore('workEndHour', workEndHour)
    await window.api.setStore('dailyLimitEnabled', dailyLimitEnabled)
    await window.api.setStore('dailyLimitDm', dailyLimitDm)
    await window.api.setStore('dailyLimitComment', dailyLimitComment)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          <Shield className="h-3.5 w-3.5 text-emerald-400" />
          ایمنی و هوشمند
        </h3>
        <button
          type="button"
          onClick={() => void save()}
          className={cn(
            'rounded-full px-2.5 py-1 text-[10px] font-medium',
            saved ? 'bg-emerald-500/20 text-emerald-300' : 'bg-[hsl(var(--primary)/0.2)] text-[hsl(var(--primary))]'
          )}
        >
          {saved ? 'ذخیره شد' : 'ذخیره این بخش'}
        </button>
      </div>
      <ToggleSwitch checked={replyAllInThread} onChange={setReplyAllInThread} label="پاسخ به همه پیام‌های ترد" desc="همه پیام‌های بی‌پاسخ در یک گفتگو صف شوند" />
      <ToggleSwitch checked={previewBeforeSend} onChange={setPreviewBeforeSend} label="پیش‌نمایش قبل از ارسال" desc="تأیید/ویرایش پاسخ قبل از ارسال" />
      <ToggleSwitch checked={workingHoursEnabled} onChange={setWorkingHoursEnabled} label="ساعات کاری" desc="فقط در بازه ساعت مشخص پاسخ" />
      {workingHoursEnabled && (
        <div className="flex items-center gap-2 rounded-lg border border-[hsl(var(--border)/0.5)] bg-black/20 px-3 py-2 text-[11px]">
          <Clock className="h-3.5 w-3.5 text-sky-400" />
          <span className="text-[hsl(var(--muted-foreground))]">از</span>
          <input type="number" min={0} max={23} value={workStartHour} onChange={(e) => setWorkStartHour(Number(e.target.value))} className="w-14 rounded-md border border-[hsl(var(--border))] bg-transparent px-2 py-1 text-center" />
          <span className="text-[hsl(var(--muted-foreground))]">تا</span>
          <input type="number" min={0} max={23} value={workEndHour} onChange={(e) => setWorkEndHour(Number(e.target.value))} className="w-14 rounded-md border border-[hsl(var(--border))] bg-transparent px-2 py-1 text-center" />
        </div>
      )}
      <ToggleSwitch checked={dailyLimitEnabled} onChange={setDailyLimitEnabled} label="سقف روزانه" desc="حداکثر تعداد پاسخ دایرکت و کامنت در روز" />
      {dailyLimitEnabled && (
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-lg border border-[hsl(var(--border)/0.5)] bg-black/20 px-3 py-2">
            <label className="text-[hsl(var(--muted-foreground))]">دایرکت</label>
            <input type="number" min={1} max={500} value={dailyLimitDm} onChange={(e) => setDailyLimitDm(Number(e.target.value) || 50)} className="mt-1 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-2 py-1" />
          </div>
          <div className="rounded-lg border border-[hsl(var(--border)/0.5)] bg-black/20 px-3 py-2">
            <label className="text-[hsl(var(--muted-foreground))]">کامنت</label>
            <input type="number" min={1} max={500} value={dailyLimitComment} onChange={(e) => setDailyLimitComment(Number(e.target.value) || 30)} className="mt-1 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-2 py-1" />
          </div>
        </div>
      )}
    </section>
  )
}

export default function SettingsPanel({ activeTab }: SettingsPanelProps): JSX.Element {
  const [memory, setMemory] = useState('')
  const [logic, setLogic] = useState('')
  const [autoReplyDms, setAutoReplyDms] = useState(true)
  const [autoReplyComments, setAutoReplyComments] = useState(true)
  const [autoReplyNotifications, setAutoReplyNotifications] = useState(true)
  const [delayDmsSec, setDelayDmsSec] = useState(2.5)
  const [delayCommentsSec, setDelayCommentsSec] = useState(3)
  const [delayNotificationsSec, setDelayNotificationsSec] = useState(3)
  const [replyOwnPostComments, setReplyOwnPostComments] = useState(true)
  const [replyMentions, setReplyMentions] = useState(true)
  const [keywordRulesEnabled, setKeywordRulesEnabled] = useState(true)
  const [walkUnreadDms, setWalkUnreadDms] = useState(true)
  const [acceptFollowRequests, setAcceptFollowRequests] = useState(false)
  const [followBack, setFollowBack] = useState(false)
  const [dmListMode, setDmListMode] = useState<DmListMode>('off')
  const [dmUserListText, setDmUserListText] = useState('')
  const [rules, setRules] = useState<KeywordRule[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [rulesSaved, setRulesSaved] = useState(false)

  useEffect(() => {
    void (async () => {
      const keys = [
        'memory', 'logic', 'autoReplyDms', 'autoReplyComments', 'autoReplyNotifications',
        'delayDmsMs', 'delayCommentsMs', 'delayNotificationsMs', 'replyOwnPostComments',
        'replyMentions', 'keywordRulesEnabled', 'walkUnreadDms', 'acceptFollowRequests',
        'followBack', 'dmListMode', 'dmUserList', 'keywordRules'
      ] as const
      const vals = await Promise.all(keys.map((k) => window.api.getStore(k)))
      const map = Object.fromEntries(keys.map((k, i) => [k, vals[i]]))
      if (typeof map.memory === 'string') setMemory(map.memory)
      if (typeof map.logic === 'string') setLogic(map.logic)
      if (typeof map.autoReplyDms === 'boolean') setAutoReplyDms(map.autoReplyDms)
      if (typeof map.autoReplyComments === 'boolean') setAutoReplyComments(map.autoReplyComments)
      if (typeof map.autoReplyNotifications === 'boolean') setAutoReplyNotifications(map.autoReplyNotifications)
      if (typeof map.delayDmsMs === 'number') setDelayDmsSec(map.delayDmsMs / 1000)
      if (typeof map.delayCommentsMs === 'number') setDelayCommentsSec(map.delayCommentsMs / 1000)
      if (typeof map.delayNotificationsMs === 'number') setDelayNotificationsSec(map.delayNotificationsMs / 1000)
      if (typeof map.replyOwnPostComments === 'boolean') setReplyOwnPostComments(map.replyOwnPostComments)
      if (typeof map.replyMentions === 'boolean') setReplyMentions(map.replyMentions)
      if (typeof map.keywordRulesEnabled === 'boolean') setKeywordRulesEnabled(map.keywordRulesEnabled)
      if (typeof map.walkUnreadDms === 'boolean') setWalkUnreadDms(map.walkUnreadDms)
      if (typeof map.acceptFollowRequests === 'boolean') setAcceptFollowRequests(map.acceptFollowRequests)
      if (typeof map.followBack === 'boolean') setFollowBack(map.followBack)
      if (map.dmListMode === 'whitelist' || map.dmListMode === 'blacklist' || map.dmListMode === 'off') setDmListMode(map.dmListMode)
      if (Array.isArray(map.dmUserList)) setDmUserListText((map.dmUserList as string[]).join('\n'))
      if (Array.isArray(map.keywordRules)) setRules(map.keywordRules as KeywordRule[])
    })()
  }, [])

  const parseUserList = (text: string): string[] =>
    text.split(/[\n,،]+/).map((s) => s.trim().replace(/^@/, '')).filter(Boolean)

  const handleSaveMemory = async () => {
    setIsSaving(true)
    await window.api.setStore('memory', memory)
    await window.api.setStore('logic', logic)
    setIsSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleSaveSettings = async () => {
    await window.api.setStore('autoReplyDms', autoReplyDms)
    await window.api.setStore('autoReplyComments', autoReplyComments)
    await window.api.setStore('autoReplyNotifications', autoReplyNotifications)
    await window.api.setStore('delayDmsMs', Math.round(delayDmsSec * 1000))
    await window.api.setStore('delayCommentsMs', Math.round(delayCommentsSec * 1000))
    await window.api.setStore('delayNotificationsMs', Math.round(delayNotificationsSec * 1000))
    await window.api.setStore('replyOwnPostComments', replyOwnPostComments)
    await window.api.setStore('replyMentions', replyMentions)
    await window.api.setStore('keywordRulesEnabled', keywordRulesEnabled)
    await window.api.setStore('walkUnreadDms', walkUnreadDms)
    await window.api.setStore('acceptFollowRequests', acceptFollowRequests)
    await window.api.setStore('followBack', followBack)
    await window.api.setStore('dmListMode', dmListMode)
    await window.api.setStore('dmUserList', parseUserList(dmUserListText))
    setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 2000)
  }

  const handleSaveRules = async () => {
    await window.api.setStore('keywordRules', rules)
    await window.api.setStore('keywordRulesEnabled', keywordRulesEnabled)
    setRulesSaved(true)
    setTimeout(() => setRulesSaved(false), 2000)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <AnimatePresence mode="wait">
        {activeTab === 'settings' && (
          <motion.div key="settings" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="flex h-full flex-col overflow-y-auto px-4 pb-4">
            <TabSaveBar label="تنظیمات" onSave={handleSaveSettings} saved={settingsSaved} />
            <div className="mt-3 space-y-4">
              <LicenseSection />
              <SafetySection />
              <section className="space-y-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">قابلیت‌های اصلی + تأخیر</h3>
                <div className="space-y-2">
                  <ToggleSwitch checked={autoReplyDms} onChange={setAutoReplyDms} label="پاسخ‌گویی دایرکت" desc="خواندن و پاسخ به پیام‌های unread" />
                  {autoReplyDms && <DelaySlider label="تأخیر دایرکت" valueSec={delayDmsSec} onChange={setDelayDmsSec} />}
                </div>
                <div className="space-y-2">
                  <ToggleSwitch checked={autoReplyComments} onChange={setAutoReplyComments} label="پاسخ‌گویی کامنت" desc="کامنت پست" />
                  {autoReplyComments && <DelaySlider label="تأخیر کامنت" valueSec={delayCommentsSec} onChange={setDelayCommentsSec} />}
                </div>
                <div className="space-y-2">
                  <ToggleSwitch checked={autoReplyNotifications} onChange={setAutoReplyNotifications} label="پاسخ‌گویی نوتیفیکیشن" desc="منشن و کامنت از فعالیت" />
                  {autoReplyNotifications && <DelaySlider label="تأخیر نوتیف" valueSec={delayNotificationsSec} onChange={setDelayNotificationsSec} />}
                </div>
              </section>
              <section className="space-y-2">
                <h3 className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]"><Inbox className="h-3.5 w-3.5 text-sky-400" />دایرکت</h3>
                <ToggleSwitch checked={walkUnreadDms} onChange={setWalkUnreadDms} label="پیمایش فقط unread" desc="فقط چت‌های خوانده‌نشده" />
                <div className="rounded-xl border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--secondary)/0.35)] p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium"><ListFilter className="h-3.5 w-3.5 text-amber-400" />فیلتر کاربران دایرکت</div>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {([{ id: 'off' as const, label: 'خاموش' }, { id: 'whitelist' as const, label: 'وایت‌لیست' }, { id: 'blacklist' as const, label: 'بلک‌لیست' }] as const).map((opt) => (
                      <button key={opt.id} type="button" onClick={() => setDmListMode(opt.id)} className={cn('rounded-full px-2.5 py-1 text-[11px]', dmListMode === opt.id ? 'bg-[hsl(var(--primary)/0.25)] text-[hsl(var(--primary))] ring-1 ring-[hsl(var(--primary)/0.4)]' : 'bg-black/20 text-[hsl(var(--muted-foreground))]')}>{opt.label}</button>
                    ))}
                  </div>
                  {dmListMode !== 'off' && (
                    <textarea value={dmUserListText} onChange={(e) => setDmUserListText(e.target.value)} className="input-field min-h-[88px] resize-none font-mono text-[12px]" dir="ltr" placeholder={'user1\nuser2'} />
                  )}
                </div>
              </section>
              <section className="space-y-2">
                <h3 className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]"><MessageSquare className="h-3.5 w-3.5 text-pink-400" />کامنت</h3>
                <ToggleSwitch checked={replyOwnPostComments} onChange={setReplyOwnPostComments} label="کامنت پست‌های خودم" desc="روی صفحه پست" />
                <ToggleSwitch checked={replyMentions} onChange={setReplyMentions} label="منشن" desc="اگر منشن شدید" />
              </section>
              <section className="space-y-2">
                <h3 className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]"><UserPlus className="h-3.5 w-3.5 text-emerald-400" />فالوئر</h3>
                <ToggleSwitch checked={acceptFollowRequests} onChange={setAcceptFollowRequests} label="تأیید درخواست فالو" desc="Confirm" />
                <ToggleSwitch checked={followBack} onChange={setFollowBack} label="فالو بک" desc="بعد از تأیید" />
              </section>
            </div>
          </motion.div>
        )}
        {activeTab === 'memory' && (
          <motion.div key="memory" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="flex h-full flex-col overflow-y-auto px-4 pb-4">
            <TabSaveBar label="حافظه و منطق" onSave={handleSaveMemory} saved={saved} saving={isSaving} />
            <div className="mt-3 space-y-4">
              <section>
                <h3 className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold"><Brain className="h-3.5 w-3.5 text-violet-400" />حافظه</h3>
                <textarea value={memory} onChange={(e) => { if (e.target.value.length <= MAX_MEMORY_CHARS) setMemory(e.target.value) }} className="input-field min-h-[130px] resize-none leading-[1.7]" dir="rtl" placeholder={'من مجیدم\nفروشگاه لباس دارم'} />
                <p className="mt-1 text-left text-[10px] text-[hsl(var(--muted-foreground))">{memory.length.toLocaleString('fa-IR')} / {MAX_MEMORY_CHARS.toLocaleString('fa-IR')}</p>
              </section>
              <section>
                <h3 className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold"><GitBranch className="h-3.5 w-3.5 text-emerald-400" />منطق</h3>
                <textarea value={logic} onChange={(e) => { if (e.target.value.length <= MAX_LOGIC_CHARS) setLogic(e.target.value) }} className="input-field min-h-[140px] resize-none leading-[1.7]" dir="rtl" placeholder={'اگر حال پرسید آنگاه تشکر کن\nاگر پست فرستاد آنگاه لایک کن'} />
                <p className="mt-1 text-left text-[10px] text-[hsl(var(--muted-foreground))">{logic.length.toLocaleString('fa-IR')} / {MAX_LOGIC_CHARS.toLocaleString('fa-IR')}</p>
              </section>
              <div className="space-y-2 rounded-xl border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--secondary)/0.3)] p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold"><BookOpen className="h-3.5 w-3.5 text-sky-400" />راهنما</div>
                <p className="text-[11px] text-[hsl(var(--muted-foreground))]"><Lightbulb className="inline h-3.5 w-3.5 text-emerald-400" /> منطق = واکنش · حافظه = محتوا</p>
              </div>
            </div>
          </motion.div>
        )}
        {activeTab === 'rules' && (
          <motion.div key="rules" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="flex h-full flex-col overflow-y-auto px-4 pb-4">
            <TabSaveBar label="قوانین کلیدواژه" onSave={handleSaveRules} saved={rulesSaved} />
            <div className="mt-3 space-y-3">
              <ToggleSwitch checked={keywordRulesEnabled} onChange={setKeywordRulesEnabled} label="فعال‌سازی قوانین کلیدواژه" desc="کلمه در کامنت → پاسخ + دایرکت" />
              {rules.map((rule, idx) => (
                <div key={rule.id} className="card space-y-2">
                  <div className="flex justify-between">
                    <span className="text-[11px] text-[hsl(var(--muted-foreground))]">قانون {idx + 1}</span>
                    <button type="button" onClick={() => setRules((r) => r.filter((x) => x.id !== rule.id))}><Trash2 className="h-3.5 w-3.5 text-red-400" /></button>
                  </div>
                  <input className="input-field !py-1.5 text-[12px]" placeholder="کلمه کلیدی" value={rule.keyword} onChange={(e) => setRules((all) => all.map((x) => (x.id === rule.id ? { ...x, keyword: e.target.value } : x)))} />
                  <textarea className="input-field min-h-[52px] resize-none text-[12px]" placeholder="پاسخ کامنت" value={rule.commentReply} onChange={(e) => setRules((all) => all.map((x) => (x.id === rule.id ? { ...x, commentReply: e.target.value } : x)))} />
                  <textarea className="input-field min-h-[52px] resize-none text-[12px]" placeholder="دایرکت (اختیاری)" value={rule.dmMessage} onChange={(e) => setRules((all) => all.map((x) => (x.id === rule.id ? { ...x, dmMessage: e.target.value } : x)))} />
                </div>
              ))}
              <button type="button" onClick={() => setRules((r) => [...r, newRule()])} className="btn-ghost flex w-full items-center justify-center gap-2 border border-dashed border-[hsl(var(--border))] py-2 text-[12px]"><Plus className="h-3.5 w-3.5" />افزودن قانون</button>
              <div className="flex gap-2 rounded-xl border border-amber-500/15 bg-amber-500/[0.06] px-3 py-2.5"><AtSign className="h-3.5 w-3.5 shrink-0 text-amber-400" /><p className="text-[11px] text-amber-100/70">کلیدواژه در کامنت → پاسخ کامنت و در صورت نیاز دایرکت</p></div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
