import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Save, Brain, Info, Sparkles, CheckCircle2, Lightbulb } from 'lucide-react'
import { cn } from '../lib/utils'

interface SettingsPanelProps {
  activeTab: 'settings' | 'memory'
}

const MAX_MEMORY_CHARS = 4000

export default function SettingsPanel({ activeTab }: SettingsPanelProps): JSX.Element {
  const [memory, setMemory] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.getStore('memory').then((val) => {
      if (typeof val === 'string') setMemory(val)
    })
  }, [])

  const handleSaveMemory = async () => {
    setIsSaving(true)
    await window.api.setStore('memory', memory)
    setIsSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2200)
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
                <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                تنظیمات عمومی
              </h3>
              <div className="card space-y-2">
                <p className="text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]">
                  در نسخه‌های بعدی امکان تنظیم تأخیر پاسخ، فیلتر کلمات کلیدی، و اتصال به مدل‌های زبانی
                  (OpenAI / محلی) اضافه خواهد شد.
                </p>
              </div>
            </section>

            <section>
              <h3 className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                <Info className="h-3.5 w-3.5 text-sky-400" />
                راهنمای سریع
              </h3>
              <div className="card space-y-2.5">
                {[
                  'پنل سمت چپ مرورگر داخلی اینستاگرام است — با حساب خود وارد شوید.',
                  'در تب «حافظه» دانش کسب‌وکار و سبک پاسخ‌دهی را بنویسید.',
                  'با روشن کردن دکمه پاسخ‌گویی در هدر، پاسخ خودکار فعال می‌شود.'
                ].map((text, i) => (
                  <div key={i} className="flex gap-2.5 text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]">
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
                  نسخه ۰.۱.۰ · ساخته‌شده با دقت برای جامعه فارسی‌زبان
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
                {saved ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {isSaving ? 'در حال ذخیره...' : saved ? 'ذخیره شد' : 'ذخیره'}
              </button>
            </div>

            <p className="mb-3 text-[11.5px] leading-relaxed text-[hsl(var(--muted-foreground))]">
              دانش کسب‌وکار، قیمت‌ها، ساعات کاری، لحن پاسخ و قوانین را اینجا بنویسید. این متن مبنای
              پاسخ‌های خودکار خواهد بود.
            </p>

            <div className="relative min-h-0 flex-1">
              <textarea
                value={memory}
                onChange={(e) => {
                  if (e.target.value.length <= MAX_MEMORY_CHARS) setMemory(e.target.value)
                }}
                placeholder={`مثال:\nمن صاحب فروشگاه لباس هستم.\nقیمت محصولات از ۲۰۰ تا ۸۰۰ هزار تومان است.\nساعات کاری: ۱۰ صبح تا ۱۰ شب.\nهمیشه مودب و دوستانه پاسخ بده.\nاگر کسی قیمت پرسید، ابتدا بپرس برای چه محصولی.\n...`}
                className="input-field h-full min-h-[180px] resize-none font-normal leading-[1.7]"
                dir="rtl"
              />
            </div>

            {/* Character counter */}
            <div className="mt-2.5 flex items-center justify-between gap-3">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
                <motion.div
                  className={cn(
                    'h-full rounded-full transition-colors',
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
                هرچه حافظه دقیق‌تر و ساختارمندتر باشد، کیفیت پاسخ‌های خودکار بالاتر می‌رود.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
