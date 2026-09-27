import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Save, Brain, Info, Sparkles, CheckCircle2, Lightbulb, Timer } from 'lucide-react'
import { cn } from '../lib/utils'

interface SettingsPanelProps {
  activeTab: 'settings' | 'memory'
}

const MAX_MEMORY_CHARS = 4000

export default function SettingsPanel({ activeTab }: SettingsPanelProps): JSX.Element {
  const [memory, setMemory] = useState('')
  const [replyDelaySec, setReplyDelaySec] = useState(2.5)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)

  useEffect(() => {
    void (async () => {
      const [mem, delay] = await Promise.all([
        window.api.getStore('memory'),
        window.api.getStore('replyDelayMs')
      ])
      if (typeof mem === 'string') setMemory(mem)
      if (typeof delay === 'number') setReplyDelaySec(delay / 1000)
    })()
  }, [])

  const handleSaveMemory = async () => {
    setIsSaving(true)
    await window.api.setStore('memory', memory)
    setIsSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2200)
  }

  const handleSaveSettings = async () => {
    const ms = Math.round(replyDelaySec * 1000)
    await window.api.setStore('replyDelayMs', ms)
    setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 2000)
  }

  const charCount = memory.length
  const charPercent = Math.min(100, (charCount / MAX_MEMORY_CHARS) * 100)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <AnimatePresence mode="wait">
        {activeTab === 'settings' && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="flex h-full flex-col gap-5 overflow-y-auto p-4"
          >
            <section>
              <h3 className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                <Timer className="h-3.5 w-3.5 text-purple-400" />
                تأخیر پاسخ
              </h3>
              <div className="card space-y-3">
                <p className="text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]">
                  بعد از دریافت پیام، چند ثانیه صبر کند و بعد پاسخ بدهد (طبیعی‌تر به‌نظر می‌رسد).
                </p>
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
                  <span className="w-12 text-left text-xs font-medium tabular-nums">
                    {replyDelaySec.toLocaleString('fa-IR')} ث
                  </span>
                </div>
                <button
                  onClick={handleSaveSettings}
                  className={cn(
                    'btn-primary !w-full !py-2 !text-[11px]',
                    settingsSaved && '!bg-emerald-500'
                  )}
                >
                  {settingsSaved ? 'ذخیره شد' : 'ذخیره تنظیمات'}
                </button>
              </div>
            </section>

            <section>
              <h3 className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                نحوه کار پاسخ خودکار
              </h3>
              <div className="card space-y-2">
                <p className="text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]">
                  ۱. وارد اینستاگرام شوید و یک گفتگوی دایرکت را باز کنید.
                  <br />
                  ۲. پاسخ‌گویی را از هدر روشن کنید.
                  <br />
                  ۳. حافظه را با اطلاعات کسب‌وکارتان پر کنید.
                  <br />
                  ۴. وقتی پیام جدید بیاید، بر اساس حافظه پاسخ ساخته و ارسال می‌شود.
                </p>
              </div>
            </section>

            <section>
              <h3 className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                <Info className="h-3.5 w-3.5 text-sky-400" />
                نکات
              </h3>
              <div className="card space-y-2.5">
                {[
                  'برای دقت بیشتر، گفتگو را باز نگه دارید (صفحه /direct/).',
                  'از دکمه «لاگ» بالای پنل اینستاگرام وضعیت تشخیص را ببینید.',
                  'اگر ظاهر اینستاگرام عوض شود، ممکن است نیاز به به‌روزرسانی سلکتورها باشد.'
                ].map((text, i) => (
                  <div
                    key={i}
                    className="flex gap-2.5 text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]"
                  >
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary)/0.15)] text-[10px] font-semibold text-[hsl(var(--primary))]">
                      {i + 1}
                    </span>
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-auto">
              <div className="rounded-xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.3)] px-3.5 py-3 text-center">
                <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                  نسخه ۰.۲.۰ · موتور پاسخ خودکار (فاز ۱)
                </p>
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
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
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
                  saved && '!bg-emerald-500 !shadow-emerald-500/20'
                )}
              >
                {saved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                {isSaving ? 'در حال ذخیره...' : saved ? 'ذخیره شد' : 'ذخیره'}
              </button>
            </div>

            <p className="mb-3 text-[11.5px] leading-relaxed text-[hsl(var(--muted-foreground))]">
              دانش کسب‌وکار، قیمت‌ها، ساعات کاری و لحن پاسخ را بنویسید. موتور پاسخ بر اساس کلمات کلیدی
              مرتبط‌ترین خطوط را برمی‌گرداند.
            </p>

            <div className="relative min-h-0 flex-1">
              <textarea
                value={memory}
                onChange={(e) => {
                  if (e.target.value.length <= MAX_MEMORY_CHARS) setMemory(e.target.value)
                }}
                placeholder={`مثال:\nمن صاحب فروشگاه لباس هستم.\nقیمت محصولات از ۲۰۰ تا ۸۰۰ هزار تومان است.\nساعات کاری: ۱۰ صبح تا ۱۰ شب.\nهمیشه مودب و دوستانه پاسخ بده.\nاگر کسی قیمت پرسید، ابتدا بپرس برای چه محصولی.`}
                className="input-field h-full min-h-[180px] resize-none font-normal leading-[1.7]"
                dir="rtl"
              />
            </div>

            <div className="mt-2.5 flex items-center justify-between gap-3">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
                <motion.div
                  className={cn(
                    'h-full rounded-full',
                    charPercent > 90 ? 'bg-amber-500' : 'bg-[hsl(var(--primary))]'
                  )}
                  initial={false}
                  animate={{ width: `${charPercent}%` }}
                  transition={{ duration: 0.2 }}
                />
              </div>
              <span className="shrink-0 text-[10px] tabular-nums text-[hsl(var(--muted-foreground))]">
                {charCount.toLocaleString('fa-IR')} / {MAX_MEMORY_CHARS.toLocaleString('fa-IR')}
              </span>
            </div>

            <div className="mt-3 flex items-start gap-2 rounded-xl border border-violet-500/15 bg-violet-500/[0.06] px-3 py-2.5">
              <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-400" />
              <p className="text-[11px] leading-relaxed text-violet-200/80">
                هر خط را موضوعی بنویسید (قیمت، ساعت کاری، ارسال و …) تا تطبیق کلیدواژه دقیق‌تر شود.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
