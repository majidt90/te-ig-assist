import { motion } from 'framer-motion'
import {
  Heart,
  Code2,
  Sparkles,
  BookOpen,
  MessageSquare,
  Brain,
  Shield,
  Zap,
  Settings,
  Clock
} from 'lucide-react'

function AppMark({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="igRing" x1="0" y1="0" x2="100" y2="100">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="35%" stopColor="#ec4899" />
          <stop offset="70%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
        <linearGradient id="igPlanet" x1="20" y1="20" x2="80" y2="80">
          <stop offset="0%" stopColor="#fb923c" />
          <stop offset="50%" stopColor="#d946ef" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="92" height="92" rx="22" stroke="url(#igRing)" strokeWidth="5" />
      <ellipse cx="50" cy="52" rx="22" ry="22" fill="url(#igPlanet)" />
      <ellipse
        cx="50"
        cy="52"
        rx="34"
        ry="12"
        stroke="url(#igRing)"
        strokeWidth="4"
        transform="rotate(-28 50 52)"
      />
      <circle cx="74" cy="30" r="5" fill="url(#igPlanet)" />
    </svg>
  )
}

const FEATURES: { icon: typeof MessageSquare; title: string; body: string }[] = [
  {
    icon: MessageSquare,
    title: 'پاسخ دایرکت unread',
    body: 'فقط گفتگوهای خوانده‌نشده را باز می‌کند، پیام‌ها را می‌خواند و پاسخ می‌دهد. با «پاسخ به همه پیام‌های ترد» همه پیام‌های بی‌پاسخ در صف قرار می‌گیرند.'
  },
  {
    icon: Brain,
    title: 'حافظه + منطق',
    body: 'در تب حافظه واقعیت‌ها را بنویسید؛ در منطق قوانین «اگر … آنگاه …». مثال: اگر پست فرستاد آنگاه ری‌اکت قلب.'
  },
  {
    icon: Zap,
    title: 'اجرا فورس و چرخه',
    body: 'هدر: روشن/خاموش، اجرا فورس، اتوماتیک/دستی، فاصله چرخه (دقیقه). فورس فوراً قابلیت‌های فعال را اجرا می‌کند.'
  },
  {
    icon: Settings,
    title: 'تأخیر و فیلتر دایرکت',
    body: 'تأخیر جدا برای دایرکت/کامنت/نوتیف. وایت‌لیست یا بلک‌لیست یوزرنیم برای محدود کردن پاسخ.'
  },
  {
    icon: Clock,
    title: 'ساعات کاری و سقف روزانه',
    body: 'در تنظیمات می‌توانید بازه ساعت پاسخ و حداکثر تعداد دایرکت/کامنت روزانه را فعال کنید.'
  },
  {
    icon: Shield,
    title: 'پیش‌نمایش قبل از ارسال',
    body: 'اگر فعال باشد، پاسخ‌ها اول در پنل تأیید ظاهر می‌شوند؛ می‌توانید ارسال، رد یا ویرایش کنید.'
  },
  {
    icon: Sparkles,
    title: 'کامنت، منشن، کلیدواژه',
    body: 'پاسخ کامنت پست و منشن؛ قوانین کلیدواژه: کلمه در کامنت → پاسخ + دایرکت اختیاری.'
  },
  {
    icon: BookOpen,
    title: 'لایسنس و Studio',
    body: 'ورود با نام کاربری + ایمیل + لایسنس TEIG2. صدور لایسنس از پوشه license_generator با خروجی TXT/PDF.'
  }
]

export default function AboutPanel(): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full flex-col gap-4 overflow-y-auto p-4"
    >
      <div className="flex flex-col items-center gap-3 pt-2 text-center">
        <AppMark className="h-20 w-20 drop-shadow-[0_8px_24px_rgba(168,85,247,0.35)]" />
        <div>
          <h2 className="text-base font-semibold tracking-tight">TE IG Assist</h2>
          <p className="mt-1 text-[12px] text-[hsl(var(--muted-foreground))]">نسخه ۰.۲ · دسکتاپ</p>
        </div>
      </div>

      <div className="card space-y-2 text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]">
        <p className="flex items-start gap-2 text-[hsl(var(--foreground))]">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fuchsia-400" />
          دستیار حرفه‌ای اینستاگرام برای پاسخ خودکار دایرکت، کامنت و نوتیفیکیشن با حافظه و منطق قابل
          تنظیم.
        </p>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center gap-2 text-[12px]">
          <Heart className="h-3.5 w-3.5 text-pink-400" />
          <span className="text-[hsl(var(--muted-foreground))]">سازنده</span>
          <span className="font-medium">مجید محبوبیان</span>
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <Code2 className="h-3.5 w-3.5 text-violet-400" />
          <span className="text-[hsl(var(--muted-foreground))]">تیم سازنده</span>
          <span className="font-medium tracking-wide">TERMIMAL</span>
        </div>
      </div>

      <section className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-[12px] font-semibold">
          <BookOpen className="h-3.5 w-3.5 text-sky-400" />
          امکانات و نحوه استفاده
        </h3>
        <div className="space-y-2">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-xl border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--secondary)/0.35)] p-3"
            >
              <div className="mb-1 flex items-center gap-1.5 text-[12px] font-medium">
                <Icon className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
                {title}
              </div>
              <p className="text-[11px] leading-relaxed text-[hsl(var(--muted-foreground))]">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3 text-[11px] leading-relaxed text-emerald-100/80">
        <p className="font-medium text-emerald-300">شروع سریع</p>
        <ol className="mt-1 list-inside list-decimal space-y-1 text-[hsl(var(--muted-foreground))]">
          <li>وارد اینستاگرام شوید (پنل چپ)</li>
          <li>حافظه و منطق را پر و ذخیره کنید</li>
          <li>در تنظیمات قابلیت‌ها و ایمنی را تنظیم کنید</li>
          <li>پاسخ‌گویی را روشن کنید و در صورت نیاز «اجرا فورس» بزنید</li>
        </ol>
      </div>

      <p className="pb-2 text-center text-[10px] text-[hsl(var(--muted-foreground))]">
        © {new Date().getFullYear()} TERMIMAL · تمامی حقوق محفوظ است
      </p>
    </motion.div>
  )
}

export { AppMark }
