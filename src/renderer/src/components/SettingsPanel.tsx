import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Save,
  Brain,
  Info,
  Sparkles,
  CheckCircle2,
  Lightbulb,
  Timer,
  MessageSquare,
  AtSign,
  Plus,
  Trash2,
  Zap
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
  const [rules, setRules] = useState<KeywordRule[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [rulesSaved, setRulesSaved] = useState(false)

  useEffect(() => {
    void (async () => {
      const [mem, delay, own, mentions, kwOn, kwRules] = await Promise.all([
        window.api.getStore('memory'),
        window.api.getStore('replyDelayMs'),
        window.api.getStore('replyOwnPostComments'),
        window.api.getStore('replyMentions'),
        window.api.getStore('keywordRulesEnabled'),
        window.api.getStore('keywordRules')
      ])
      if (typeof mem === 'string') setMemory(mem)
      if (typeof delay === 'number') setReplyDelaySec(delay / 1000)
      if (typeof own === 'boolean') setReplyOwnPostComments(own)
      if (typeof mentions === 'boolean') setReplyMentions(mentions)
      if (typeof kwOn === 'boolean') setKeywordRulesEnabled(kwOn)
      if (Array.isArray(kwRules)) setRules(kwRules as KeywordRule[])
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
              <div className="card space-y-3">
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
                <MessageSquare className="h-3.5 w-3.5 text-pink-400" />
                کامنت‌ها
              </h3>
              <Toggle
                checked={replyOwnPostComments}
                onChange={setReplyOwnPostComments}
                label="پاسخ به کامنت پست‌های خودم"
                desc="وقتی روی پست خودتان هستید، کامنت‌های جدید پاسخ داده می‌شوند."
              />
              <Toggle
                checked={replyMentions}
                onChange={setReplyMentions}
                label="پاسخ به منشن در کامنت"
                desc="اگر در کامنت منشن شدید، بر اساس حافظه پاسخ می‌دهد."
              />
            </section>

            <button
              onClick={handleSaveSettings}
              className={cn('btn-primary !w-full !py-2 !text-[11px]', settingsSaved && '!bg-emerald-500')}
            >
              {settingsSaved ? 'ذخیره شد' : 'ذخیره تنظیمات'}
            </button>

            <section>
              <h3 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                <Info className="h-3.5 w-3.5 text-sky-400" />
                نکات
              </h3>
              <div className="card space-y-2 text-[11px] leading-relaxed text-[hsl(var(--muted-foreground))]">
                <p>• فقط پیام/کامنتهای <b className="text-white/70">جدید</b> بعد از روشن‌شدن مانیتور پاسخ داده می‌شوند.</p>
                <p>• چند پیام پشت‌سرهم به‌ترتیب صف پردازش می‌شوند.</p>
                <p>• برای کامنت: پست را باز کنید (`/p/` یا `/reel/`).</p>
              </div>
            </section>
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
                حافظه دستیار
              </h3>
              <button
                onClick={handleSaveMemory}
                disabled={isSaving}
                className={cn(
                  'btn-primary !gap-1.5 !rounded-lg !px-3 !py-1.5 !text-[11px]',
                  saved && '!bg-emerald-500'
                )}
              >
                {saved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                {saved ? 'ذخیره شد' : 'ذخیره'}
              </button>
            </div>

            <p className="mb-3 text-[11.5px] text-[hsl(var(--muted-foreground))]">
              هر خط یک واقعیت. موتور پاسخ‌های متنوع و خلاقانه‌تر از همین خطوط می‌سازد.
            </p>

            <textarea
              value={memory}
              onChange={(e) => {
                if (e.target.value.length <= MAX_MEMORY_CHARS) setMemory(e.target.value)
              }}
              className="input-field min-h-0 flex-1 resize-none leading-[1.7]"
              dir="rtl"
              placeholder="من مجیدم\nفروشگاه لباس دارم\nقیمت از ۲۰۰ تا ۸۰۰ هزار..."
            />

            <div className="mt-2.5 flex items-center gap-3">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
                <motion.div
                  className={cn('h-full rounded-full', charPercent > 90 ? 'bg-amber-500' : 'bg-[hsl(var(--primary))]')}
                  animate={{ width: `${charPercent}%` }}
                />
              </div>
              <span className="text-[10px] tabular-nums text-[hsl(var(--muted-foreground))]">
                {charCount.toLocaleString('fa-IR')}
              </span>
            </div>

            <div className="mt-3 flex gap-2 rounded-xl border border-violet-500/15 bg-violet-500/[0.06] px-3 py-2.5">
              <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-400" />
              <p className="text-[11px] text-violet-200/80">
                برای خلاقیت بیشتر: لحن، مثال قیمت، و چند واقعیت کوتاه بنویسید.
              </p>
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
                قوانین کلیدواژه
              </h3>
              <button
                onClick={handleSaveRules}
                className={cn('btn-primary !px-3 !py-1.5 !text-[11px]', rulesSaved && '!bg-emerald-500')}
              >
                {rulesSaved ? 'ذخیره شد' : 'ذخیره قوانین'}
              </button>
            </div>

            <Toggle
              checked={keywordRulesEnabled}
              onChange={setKeywordRulesEnabled}
              label="فعال‌سازی قوانین کلیدواژه"
              desc="اگر کسی کلمه خاص کامنت کند → پاسخ کامنت + دایرکت اختیاری"
            />

            <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
              مثال: کلمه «قیمت» → کامنت: «دایرکت چک کنید» و دایرکت: لیست قیمت‌ها
            </p>

            <div className="space-y-3">
              {rules.map((rule, idx) => (
                <div key={rule.id} className="card space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-[hsl(var(--muted-foreground))]">
                      قانون {idx + 1}
                    </span>
                    <button
                      onClick={() => setRules((r) => r.filter((x) => x.id !== rule.id))}
                      className="rounded p-1 text-red-400/80 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <input
                    className="input-field !py-1.5 text-[12px]"
                    placeholder="کلمه کلیدی (مثلاً قیمت)"
                    value={rule.keyword}
                    onChange={(e) =>
                      setRules((all) =>
                        all.map((x) => (x.id === rule.id ? { ...x, keyword: e.target.value } : x))
                      )
                    }
                  />
                  <textarea
                    className="input-field min-h-[56px] resize-none text-[12px]"
                    placeholder="متن پاسخ کامنت"
                    value={rule.commentReply}
                    onChange={(e) =>
                      setRules((all) =>
                        all.map((x) =>
                          x.id === rule.id ? { ...x, commentReply: e.target.value } : x
                        )
                      )
                    }
                  />
                  <textarea
                    className="input-field min-h-[56px] resize-none text-[12px]"
                    placeholder="متن دایرکت (اختیاری)"
                    value={rule.dmMessage}
                    onChange={(e) =>
                      setRules((all) =>
                        all.map((x) => (x.id === rule.id ? { ...x, dmMessage: e.target.value } : x))
                      )
                    }
                  />
                </div>
              ))}
            </div>

            <button
              onClick={() => setRules((r) => [...r, newRule()])}
              className="btn-ghost flex w-full items-center justify-center gap-2 border border-dashed border-[hsl(var(--border))] py-2 text-[12px]"
            >
              <Plus className="h-3.5 w-3.5" />
              افزودن قانون
            </button>

            <div className="flex gap-2 rounded-xl border border-amber-500/15 bg-amber-500/[0.06] px-3 py-2.5">
              <AtSign className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
              <p className="text-[11px] text-amber-100/70">
                برای دایرکت بعد از کلیدواژه، اپ به پروفایل کاربر می‌رود و دکمه Message را می‌زند — ممکن
                است گاهی نیاز به تأیید دستی باشد.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
