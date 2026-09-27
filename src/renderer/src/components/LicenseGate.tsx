import { useState } from 'react'
import { motion } from 'framer-motion'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { validateLicenseWithLock } from '../lib/license'
import { AppMark } from './AboutPanel'
import { cn } from '../lib/utils'

interface Props {
  onActivated: () => void
}

export default function LicenseGate({ onActivated }: Props): JSX.Element {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [lock, setLock] = useState('')
  const [license, setLicense] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const activate = async () => {
    setError('')
    setLoading(true)
    try {
      // expiresAt can be ISO from generator; if user pastes full package, try parse
      let exp = expiresAt.trim()
      if (!exp && license.includes('Expires:')) {
        // ignore
      }
      if (!exp) {
        setError('تاریخ انقضا (ISO) را از پنل لایسنس وارد کنید')
        setLoading(false)
        return
      }
      const res = await validateLicenseWithLock(username, email, lock, license, exp)
      if (!res.ok) {
        const map: Record<string, string> = {
          mismatch: 'لایسنس با این اطلاعات مطابقت ندارد',
          expired: 'لایسنس منقضی شده است',
          no_expiry: 'تاریخ انقضا مشخص نیست',
          error: 'خطا در اعتبارسنجی'
        }
        setError(map[res.reason || ''] || 'اطلاعات نامعتبر است')
        setLoading(false)
        return
      }
      await window.api.setStore('licenseUsername', username.trim().replace(/^@/, '').toLowerCase())
      await window.api.setStore('licenseEmail', email.trim().toLowerCase())
      await window.api.setStore('licenseLock', lock.trim())
      await window.api.setStore('licenseKey', license.trim())
      await window.api.setStore('licenseExpiresAt', exp)
      await window.api.setStore('licenseActivated', true)
      onActivated()
    } catch {
      setError('خطا در اعتبارسنجی')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-[hsl(var(--background))] p-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-xl"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <AppMark className="h-14 w-14" />
          <h1 className="text-sm font-semibold">فعال‌سازی TE IG Assist</h1>
          <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
            اطلاعات را از پنل license_generator کپی کنید
          </p>
        </div>

        <div className="space-y-2">
          <input
            className="input-field text-[12px]"
            placeholder="نام کاربری"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            dir="ltr"
          />
          <input
            className="input-field text-[12px]"
            placeholder="ایمیل"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            dir="ltr"
          />
          <input
            className="input-field text-[12px]"
            placeholder="قفل (Lock)"
            value={lock}
            onChange={(e) => setLock(e.target.value)}
            dir="ltr"
          />
          <input
            className="input-field text-[12px]"
            placeholder="تاریخ انقضا ISO (مثلاً 2027-09-27T...)"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            dir="ltr"
          />
          <textarea
            className="input-field min-h-[90px] resize-none font-mono text-[10px]"
            placeholder="لایسنس TEIG1...."
            value={license}
            onChange={(e) => setLicense(e.target.value)}
            dir="ltr"
          />
        </div>

        {error && <p className="text-center text-[11px] text-red-400">{error}</p>}

        <button
          type="button"
          disabled={loading}
          onClick={() => void activate()}
          className={cn(
            'btn-primary flex w-full items-center justify-center gap-2 !py-2.5 text-[12px]',
            loading && 'opacity-70'
          )}
        >
          {loading ? (
            'در حال بررسی…'
          ) : (
            <>
              <ShieldCheck className="h-4 w-4" />
              فعال‌سازی
            </>
          )}
        </button>

        <p className="flex items-center justify-center gap-1 text-[10px] text-[hsl(var(--muted-foreground))]">
          <KeyRound className="h-3 w-3" />
          مسیر پنل: /license_generator/
        </p>
      </motion.div>
    </div>
  )
}
