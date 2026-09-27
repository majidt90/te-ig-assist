import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Save,
  Brain,
  Info,
  CheckCircle2,
  Lightbulb,
  MessageSquare,
  AtSign,
  Plus,
  Trash2,
  Zap,
  Inbox,
  UserPlus
} from 'lucide-react'
import { cn } from '../lib/utils'
import type { KeywordRule } from '../lib/types'

interface SettingsPanelProps {
  activeTab: 'settings' | 'memory' | 'rules'
}

const MAX_MEMORY_CHARS = 4000

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
        <span className="tabular-nums text-[hsl(var(--foreground))]">
          {valueSec.toLocaleString('fa-IR')} ثانیه
        </span>
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

export default function SettingsPanel({ activeTab }: SettingsPanelProps): JSX.Element {
  const [memory, setMemory] = useState('')
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
  const [rules, setRules] = useState<KeywordRule[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [rulesSaved, setRulesSaved] = useState(false)

  useEffect(() => {
    void (async () => {
      const keys = [
        'memory',
        'autoReplyDms',
        'autoReplyComments',
        'autoReplyNotifications',
        'delayDmsMs',
        'delayCommentsMs',
        'delayNotificationsMs',
        'replyOwnPostComments',
        'replyMentions',
        'keywordRulesEnabled',
        'walkUnreadDms',
        'acceptFollowRequests',
        'followBack',
        'keywordRules'
      ] as const
      const vals = await Promise.all(keys.map((k) => window.api.getStore(k)))
      const map = Object.fromEntries(keys.map((k, i) => [k, vals[i]]))
      if (typeof map.memory === 'string') setMemory(map.memory)
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
      if (Array.isArray(map.keywordRules)) setRules(map.keywordRules as KeywordRule[])
    })()
  }, [])

  const handleSaveMemory = async () => {
    setIsSaving(true)
    await window.api.setStore('memory', memory)
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
    setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 2000)
  }

  const handleSaveRules = async () => {
    await window.api.setStore('keywordRules', rules)
    await window.api.setStore('keywordRulesEnabled', keywordRulesEnabled)
    setRulesSaved(true)
    setTimeout(() => setRulesSaved(false), 2000)
  }

  const charPercent = Math.min(100, (memory.length / MAX_MEMORY_CHARS) * 100)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <AnimatePresence mode="wait">
        {activeTab === 'settings' && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex h-full flex-col gap-4 overflow-y-auto p-4"
          >
            <section className="space-y-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                قابلیت‌های اصلی + تأخیر اختصاصی
              </h3>

              <div className="space-y-2">
                <ToggleSwitch
                  checked={autoReplyDms}
                  onChange={setAutoReplyDms}
                  label="پاسخ‌گویی دایرکت"
                  desc="خواندن و پاسخ به Direct"
                />
                {autoReplyDms && (
                  <DelaySlider label="تأخیر دایرکت" valueSec={delayDmsSec} onChange={setDelayDmsSec} />
                )}
              </div>

              <div className="space-y-2">
                <ToggleSwitch
                  checked={autoReplyComments}
                  onChange={setAutoReplyComments}
                  label="پاسخ‌گویی کامنت"
                  desc="پاسخ به کامنت پست"
                />
                {autoReplyComments && (
                  <DelaySlider
                    label="تأخیر کامنت"
                    valueSec={delayCommentsSec}
                    onChange={setDelayCommentsSec}
                  />
                )}
              </div>

              <div className="space-y-2">
                <ToggleSwitch
                  checked={autoReplyNotifications}
                  onChange={setAutoReplyNotifications}
                  label="پاسخ‌گویی نوتیفیکیشن"
                  desc="منشن و کامنت از صفحه فعالیت"
                />
                {autoReplyNotifications && (
                  <DelaySlider
                    label="تأخیر نوتیفیکیشن"
                    valueSec={delayNotificationsSec}
                    onChange={setDelayNotificationsSec}
                  />
                )}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                <Inbox className="h-3.5 w-3.5 text-sky-400" />
                دایرکت
              </h3>
              <ToggleSwitch
                checked={walkUnreadDms}
                onChange={setWalkUnreadDms}
                label="پیمایش خودکار گفتگوها"
                desc="لیست inbox را یکی‌یکی باز می‌کند"
              />
            </section>

            <section className="space-y-2">
              <h3 className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                <MessageSquare className="h-3.5 w-3.5 text-pink-400" />
                جزئیات کامنت
              </h3>
              <ToggleSwitch
                checked={replyOwnPostComments}
                onChange={setReplyOwnPostComments}
                label="کامنت پست‌های خودم"
                desc="روی صفحه پست"
              />
              <ToggleSwitch
                checked={replyMentions}
                onChange={setReplyMentions}
                label="منشن"
                desc="اگر منشن شدید"
              />
            </section>

            <section className="space-y-2">
              <h3 className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                <UserPlus className="h-3.5 w-3.5 text-emerald-400" />
                فالوئر
              </h3>
              <ToggleSwitch
                checked={acceptFollowRequests}
                onChange={setAcceptFollowRequests}
                label="تأیید درخواست فالو"
                desc="Confirm"
              />
              <ToggleSwitch
                checked={followBack}
                onChange={setFollowBack}
                label="فالو بک"
                desc="بعد از تأیید"
              />
            </section>

            <button
              onClick={handleSaveSettings}
              className={cn('btn-primary !w-full !py-2 !text-[11px]', settingsSaved && '!bg-emerald-500')}
            >
              {settingsSaved ? 'ذخیره شد' : 'ذخیره تنظیمات'}
            </button>

            <div className="card flex gap-2 text-[11px] text-[hsl(var(--muted-foreground))]">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400" />
              <p>
                همه کارها (باز کردن چت، پاسخ، نوتیف) در یک صف زمانی مشترک اجرا می‌شوند تا تداخل نداشته باشند.
              </p>
            </div>
          </motion.div>
        )}

        {activeTab === 'memory' && (
          <motion.div
            key="memory"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex h-full flex-col p-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-[13px] font-semibold">
                <Brain className="h-4 w-4 text-violet-400" />
                حافظه
              </h3>
              <button
                onClick={handleSaveMemory}
                disabled={isSaving}
                className={cn('btn-primary !px-3 !py-1.5 !text-[11px]', saved && '!bg-emerald-500')}
              >
                {saved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                {saved ? 'ذخیره شد' : 'ذخیره'}
              </button>
            </div>
            <textarea
              value={memory}
              onChange={(e) => {
                if (e.target.value.length <= MAX_MEMORY_CHARS) setMemory(e.target.value)
              }}
              className="input-field min-h-0 flex-1 resize-none leading-[1.7]"
              dir="rtl"
            />
            <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
              <motion.div className="h-full rounded-full bg-[hsl(var(--primary))]" animate={{ width: `${charPercent}%` }} />
            </div>
            <div className="mt-3 flex gap-2 rounded-xl border border-violet-500/15 bg-violet-500/[0.06] px-3 py-2.5">
              <Lightbulb className="h-3.5 w-3.5 shrink-0 text-violet-400" />
              <p className="text-[11px] text-violet-200/80">هر خط یک واقعیت.</p>
            </div>
          </motion.div>
        )}

        {activeTab === 'rules' && (
          <motion.div
            key="rules"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex h-full flex-col gap-3 overflow-y-auto p-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-[13px] font-semibold">
                <Zap className="h-4 w-4 text-amber-400" />
                کلیدواژه
              </h3>
              <button
                onClick={handleSaveRules}
                className={cn('btn-primary !px-3 !py-1.5 !text-[11px]', rulesSaved && '!bg-emerald-500')}
              >
                {rulesSaved ? 'ذخیره شد' : 'ذخیره'}
              </button>
            </div>
            <ToggleSwitch
              checked={keywordRulesEnabled}
              onChange={setKeywordRulesEnabled}
              label="فعال‌سازی قوانین"
              desc="کلمه در کامنت → پاسخ + دایرکت"
            />
            {rules.map((rule, idx) => (
              <div key={rule.id} className="card space-y-2">
                <div className="flex justify-between">
                  <span className="text-[11px] text-[hsl(var(--muted-foreground))]">قانون {idx + 1}</span>
                  <button type="button" onClick={() => setRules((r) => r.filter((x) => x.id !== rule.id))}>
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </button>
                </div>
                <input
                  className="input-field !py-1.5 text-[12px]"
                  placeholder="کلمه کلیدی"
                  value={rule.keyword}
                  onChange={(e) =>
                    setRules((all) =>
                      all.map((x) => (x.id === rule.id ? { ...x, keyword: e.target.value } : x))
                    )
                  }
                />
                <textarea
                  className="input-field min-h-[52px] resize-none text-[12px]"
                  placeholder="پاسخ کامنت"
                  value={rule.commentReply}
                  onChange={(e) =>
                    setRules((all) =>
                      all.map((x) => (x.id === rule.id ? { ...x, commentReply: e.target.value } : x))
                    )
                  }
                />
                <textarea
                  className="input-field min-h-[52px] resize-none text-[12px]"
                  placeholder="دایرکت (اختیاری)"
                  value={rule.dmMessage}
                  onChange={(e) =>
                    setRules((all) =>
                      all.map((x) => (x.id === rule.id ? { ...x, dmMessage: e.target.value } : x))
                    )
                  }
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => setRules((r) => [...r, newRule()])}
              className="btn-ghost flex w-full items-center justify-center gap-2 border border-dashed border-[hsl(var(--border))] py-2 text-[12px]"
            >
              <Plus className="h-3.5 w-3.5" />
              افزودن
            </button>
            <div className="flex gap-2 rounded-xl border border-amber-500/15 bg-amber-500/[0.06] px-3 py-2.5">
              <AtSign className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              <p className="text-[11px] text-amber-100/70">دایرکت کلیدواژه best-effort است.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
