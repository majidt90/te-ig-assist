import { motion } from 'framer-motion'
import { Heart, Code2, Sparkles } from 'lucide-react'

/** Planet-style mark matching product icon */
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

export default function AboutPanel(): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full flex-col gap-4 overflow-y-auto p-4"
    >
      <div className="flex flex-col items-center gap-3 pt-4 text-center">
        <div className="relative">
          <AppMark className="h-20 w-20 drop-shadow-[0_8px_24px_rgba(168,85,247,0.35)]" />
        </div>
        <div>
          <h2 className="text-base font-semibold tracking-tight">TE IG Assist</h2>
          <p className="mt-1 text-[12px] text-[hsl(var(--muted-foreground))]">نسخه ۰.۱ · دسکتاپ</p>
        </div>
      </div>

      <div className="card space-y-2 text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]">
        <p className="flex items-start gap-2 text-[hsl(var(--foreground))]">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fuchsia-400" />
          دستیار حرفه‌ای اینستاگرام برای پاسخ خودکار دایرکت، کامنت و نوتیفیکیشن با حافظه و منطق قابل
          تنظیم.
        </p>
        <p>
          اپ روی Electron اجرا می‌شود، اینستاگرام وب را داخل خود دارد و با مانیتور DOM پیام‌های unread را
          می‌خواند و طبق تنظیمات شما پاسخ می‌دهد.
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

      <p className="text-center text-[10px] text-[hsl(var(--muted-foreground))]">
        © {new Date().getFullYear()} TERMIMAL · تمامی حقوق محفوظ است
      </p>
    </motion.div>
  )
}

export { AppMark }
