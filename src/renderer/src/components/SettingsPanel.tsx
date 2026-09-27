import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Save, Brain, Info, Sparkles } from 'lucide-react'
import { cn } from '../lib/utils'

interface SettingsPanelProps {
  activeTab: 'settings' | 'memory'
}

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
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <AnimatePresence mode="wait">
        {activeTab === 'settings' && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
            className="flex h-full flex-col gap-5 overflow-y-auto p-4"
          >
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold text-[hsl(var(--foreground))]">
                <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                تنظیمات عمومی
              </h3>
              <div className="space-y-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.5)] p-3">
                <p className="text-[11px] leading-relaxed text-[hsl(var(--muted-foreground))]">
                  در نسخه‌های بعدی امکان تنظیم تأخیر پاسخ، فیلتر کلمات، و اتصال به مدل‌های زبانی اضافه خواهد شد.
                </p>
              </div>
            </section>

            <section>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold">
                <Info className="h-3.5 w-3.5 text-blue-400" />
                راهنما
              </h3>
              <div className="space-y-2 text-[11px] leading-relaxed text-[hsl(var(--muted-foreground))]">
                <p>• پنل سمت چپ مرورگر داخلی اینستاگرام است. با حساب خود وارد شوید.</p>
                <p>• در تب «حافظه» دانش و سبک پاسخ‌دهی خود را بنویسید.</p>
                <p>• با فعال کردن دکمه «پاسخ‌گویی» در بالای صفحه، پاسخ خودکار شروع می‌شود.</p>
              </div>
            </section>
          </motion.div>
        )}

        {activeTab === 'memory' && (
          <motion.div
            key="memory"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
            className="flex h-full flex-col p-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-xs font-semibold">
                <Brain className="h-3.5 w-3.5 text-violet-400" />
                حافظه دستیار
              </h3>
              <button
                onClick={handleSaveMemory}
                disabled={isSaving}
                className={cn(
                  'btn-primary !px-3 !py-1.5 !text-[11px]',
                  saved && '!bg-emerald-500'
                )}
              >
                <Save className="h-3 w-3" />
                {isSaving ? 'در حال ذخیره...' : saved ? 'ذخیره شد' : 'ذخیره حافظه'}
              </button>
            </div>

            <p className="mb-3 text-[11px] leading-relaxed text-[hsl(var(--muted-foreground))]">
              اینجا بنویسید که دستیار چه چیزهایی بداند. مثلاً: اطلاعات کسب‌وکار، قیمت‌ها، ساعات کاری، سبک پاسخ‌دهی،
              کلمات ممنوعه و غیره. این متن مبنای پاسخ‌های خودکار خواهد بود.
            </p>

            <textarea
              value={memory}
              onChange={(e) => setMemory(e.target.value)}
              placeholder={`مثال:\nمن صاحب فروشگاه لباس هستم.\nقیمت محصولات از ۲۰۰ تا ۸۰۰ هزار تومان است.\nساعات کاری: ۱۰ صبح تا ۱۰ شب.\nهمیشه مودب و دوستانه پاسخ بده.\nاگر کسی قیمت پرسید، ابتدا بپرس برای چه محصولی.\n...`}
              className="input-field min-h-0 flex-1 resize-none font-normal leading-relaxed"
              dir="rtl"
            />

            <div className="mt-3 rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2">
              <p className="text-[10px] text-violet-300/80">
                💡 هرچه حافظه دقیق‌تر و ساختارمندتر باشد، کیفیت پاسخ‌های خودکار بالاتر می‌رود.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
