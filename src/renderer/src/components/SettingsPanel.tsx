import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Save,
  Brain,
  Info,
  CheckCircle2,
  Lightbulb,
  Timer,
  MessageSquare,
  AtSign,
  Plus,
  Trash2,
  Zap,
  Inbox,
  Bell,
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

export default function SettingsPanel({ activeTab }: SettingsPanelProps): JSX.Element {
  const [memory, setMemory] = useState('')
  const [replyDelaySec, setReplyDelaySec] = useState(2.5)
  const [replyOwnPostComments, setReplyOwnPostComments] = useState(true)
  const [replyMentions, setReplyMentions] = useState(true)
  const [keywordRulesEnabled, setKeywordRulesEnabled] = useState(true)
  const [walkUnreadDms, setWalkUnreadDms] = useState(true)
  const [checkNotifications, setCheckNotifications] = useState(true)
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
        'replyDelayMs',
        'replyOwnPostComments',
        'replyMentions',
        'keywordRulesEnabled',
        'walkUnreadDms',
        'checkNotifications',
        'acceptFollowRequests',
        'followBack',
        'keywordRules'
      ] as const
      const vals = await Promise.all(keys.map((k) => window.api.getStore(k)))
      const map = Object.fromEntries(keys.map((k, i) => [k, vals[i]]))
      if (typeof map.memory === 'string') setMemory(map.memory)
      if (typeof map.replyDelayMs === 'number') setReplyDelaySec(map.replyDelayMs / 1000)
      if (typeof map.replyOwnPostComments === 'boolean') setReplyOwnPostComments(map.replyOwnPostComments)
      if (typeof map.replyMentions === 'boolean') setReplyMentions(map.replyMentions)
      if (typeof map.keywordRulesEnabled === 'boolean') setKeywordRulesEnabled(map.keywordRulesEnabled)
      if (typeof map.walkUnreadDms === 'boolean') setWalkUnreadDms(map.walkUnreadDms)
      if (typeof map.checkNotifications === 'boolean') setCheckNotifications(map.checkNotifications)
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
    await window.api.setStore('replyDelayMs', Math.round(replyDelaySec * 1000))
    await window.api.setStore('replyOwnPostComments', replyOwnPostComments)
    await window.api.setStore('replyMentions', replyMentions)
    await window.api.setStore('keywordRulesEnabled', keywordRulesEnabled)
    await window.api.setStore('walkUnreadDms', walkUnreadDms)
    await window.api.setStore('checkNotifications', checkNotifications)
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

  const charCount = memory.length
  const charPercent = Math.min(100, (charCount / MAX_MEMORY_CHARS) * 100)

  const Toggle = ({
    checked,
    onChange,
    label,
    desc
  }: {
    checked: boolean
    onChange: (v: boolean) => void
    label: string
    desc: string
  }) => (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-xl border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--secondary)/0.4)] p-3 text-right transition hover:bg-[hsl(var(--secondary)/0.65)]"
    >
      <div
        className={cn(
          'mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition',
          checked ? 'bg-emerald-500' : 'bg-[hsl(var(--muted))]'
        )}
      >
        <span
          className={cn(
            'h-4 w-4 rounded-full bg-white shadow transition',
            checked ? 'translate-x-0' : 'translate-x-4'
          )}
        />
      </div>
      <div>
        <p className="text-[12px] font-medium">{label}</p>
        <p className="mt-0.5 text-[11px] text-[hsl(var(--muted-foreground))]">{desc}</p>
      </div>
    </button>
  )

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
            <section>
              <h3 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                <Timer className="h-3.5 w-3.5 text-purple-400" />
                تأخیر پاسخ
              </h3>
              <div className="card">
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={0.5}
                    value={replyDelaySec}
                    onChange={(e) => setReplyDelaySec(Number(e.target.value))}
                    className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-[hsl(var(--muted))] accent-[hsl(var(--primary))]"
                  />
                  <span className="w-12 text-left text-xs tabular-nums">
                    {replyDelaySec.toLocaleString('fa-IR')} ث
                  </span>
                </div>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                <Inbox className="h-3.5 w-3.5 text-sky-400" />
                دایرکت
              </h3>
              <Toggle
                checked={walkUnreadDms}
                onChange={setWalkUnreadDms}
                label="پیمایش خودکار خوانده‌نشده‌ها"
                desc="لیست inbox را می‌گردد، هر unread را باز می‌کند، پاسخ می‌دهد، بعدی."
              />
            </section>

            <section className="space-y-2">
              <h3 className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                <MessageSquare className="h-3.5 w-3.5 text-pink-400" />
                کامنت و نوتیف
              </h3>
              <Toggle
                checked={replyOwnPostComments}
                onChange={setReplyOwnPostComments}
                label="پاسخ به کامنت پست‌های خودم"
                desc="روی صفحه پست، کامنت‌های جدید را جواب می‌دهد."
              />
              <Toggle
                checked={replyMentions}
                onChange={setReplyMentions}
                label="پاسخ به منشن"
                desc="اگر در کامنت منشن شدید پاسخ می‌دهد."
              />
              <Toggle
                checked={checkNotifications}
                onChange={setCheckNotifications}
                label="بررسی نوتیفیکیشن"
                desc="بعد از دایرکت‌ها، صفحه فعالیت را برای کامنت/منشن چک می‌کند."
              />
            </section>

            <section className="space-y-2">
              <h3 className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                <UserPlus className="h-3.5 w-3.5 text-emerald-400" />
                فالوئر
              </h3>
              <Toggle
                checked={acceptFollowRequests}
                onChange={setAcceptFollowRequests}
                label="تأیید درخواست فالو"
                desc="درخواست‌های معلّق را Confirm می‌کند."
              />
              <Toggle
                checked={followBack}
                onChange={setFollowBack}
                label="فالو بک بعد از تأیید"
                desc="فقط وقتی گزینه بالا روشن باشد معنا دارد."
              />
            </section>

            <button
              onClick={handleSaveSettings}
              className={cn('btn-primary !w-full !py-2 !text-[11px]', settingsSaved && '!bg-emerald-500')}
            >
              {settingsSaved ? 'ذخیره شد' : 'ذخیره تنظیمات'}
            </button>

            <div className="card space-y-2 text-[11px] leading-relaxed text-[hsl(var(--muted-foreground))]">
              <p className="flex items-start gap-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400" />
                هر پیام فقط یک‌بار پاسخ داده می‌شود. cooldown دیگر به‌عنوان خطا تکرار ارسال نمی‌کند.
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
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-[13px] font-semibold">
                <Brain className="h-4 w-4 text-violet-400" />
                حافظه
              </h3>
              <button
                onClick={handleSaveMemory}
                disabled={isSaving}
                className={cn(
                  'btn-primary !px-3 !py-1.5 !text-[11px]',
                  saved && '!bg-emerald-500'
                )}
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
              <motion.div
                className="h-full rounded-full bg-[hsl(var(--primary))]"
                animate={{ width: `${charPercent}%` }}
              />
            </div>
            <div className="mt-3 flex gap-2 rounded-xl border border-violet-500/15 bg-violet-500/[0.06] px-3 py-2.5">
              <Lightbulb className="h-3.5 w-3.5 shrink-0 text-violet-400" />
              <p className="text-[11px] text-violet-200/80">هر خط یک واقعیت؛ پاسخ‌ها متنوع ساخته می‌شوند.</p>
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
            <Toggle
              checked={keywordRulesEnabled}
              onChange={setKeywordRulesEnabled}
              label="فعال‌سازی قوانین"
              desc="کلمه خاص در کامنت → پاسخ کامنت + دایرکت"
            />
            {rules.map((rule, idx) => (
              <div key={rule.id} className="card space-y-2">
                <div className="flex justify-between">
                  <span className="text-[11px] text-[hsl(var(--muted-foreground))]">قانون {idx + 1}</span>
                  <button onClick={() => setRules((r) => r.filter((x) => x.id !== rule.id))}>
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
              onClick={() => setRules((r) => [...r, newRule()])}
              className="btn-ghost flex w-full items-center justify-center gap-2 border border-dashed border-[hsl(var(--border))] py-2 text-[12px]"
            >
              <Plus className="h-3.5 w-3.5" />
              افزودن
            </button>
            <div className="flex gap-2 rounded-xl border border-amber-500/15 bg-amber-500/[0.06] px-3 py-2.5">
              <AtSign className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              <p className="text-[11px] text-amber-100/70">دایرکت بعد از کلیدواژه best-effort است.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
