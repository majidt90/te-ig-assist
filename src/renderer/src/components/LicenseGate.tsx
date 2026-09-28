import { useState } from 'react'
import { motion } from 'framer-motion'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { validateLicense } from '../lib/license'
import { AppMark } from './AboutPanel'
import { cn } from '../lib/utils'

interface Props {
  onActivated: () => void
}

export default function LicenseGate({ onActivated }: Props): JSX.Element {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [license, setLicense] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const activate = async () => {
    setError('')
    setLoading(true)
    try {
      const res = await validateLicense(username, email, license)
      if (!res.ok) {
        const map: Record<string, string> = {
          mismatch: 'لایسنس با این نام کاربری / ایمیل مطابقت ندارد',
          expired: 'لایسنس منقضی شده است',
          format: 'فرمت لایسنس نامعتبر است (TEIG2)',
          payload: 'محتوای لایسنس قابل خواندن نیست',
          error: 'خطا در اعتبارسنجی'
        }
        setError(map[res.reason || ''] || 'اطلاعات نامعتبر است')
        setLoading(false)
        return
      }
      const machineId = await window.api.getMachineId()
      const keyNorm = license.trim()
      const prevKey = String((await window.api.getStore('licenseKey')) || '')
      const prevMachine = String((await window.api.getStore('licenseMachineId')) || '')
      if (prevKey && prevKey === keyNorm && prevMachine && prevMachine !== machineId) {
        setError('این لایسنس قبلاً روی سیستم دیگری فعال شده است')
        setLoading(false)
        return
      }
      await window.api.setStore('licenseUsername', username.trim().replace(/^@/, '').toLowerCase())
      await window.api.setStore('licenseEmail', email.trim().toLowerCase())
      await window.api.setStore('licenseKey', keyNorm)
      await window.api.setStore('licenseLock', res.lock || '')
      await window.api.setStore('licenseExpiresAt', res.expiresAt || '')
      await window.api.setStore('licenseMachineId', machineId)
      await window.api.setStore('licenseActivated', true)
      await window.api.setStore(
        'licenseBinding',
        JSON.stringify({ key: keyNorm.slice(0, 24), machineId, at: Date.now() })
      )
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
            نام کاربری، ایمیل و لایسنس — هر لایسنس فقط روی یک سیستم
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
          <textarea
            className="input-field min-h-[110px] resize-none font-mono text-[10px]"
            placeholder="لایسنس TEIG2...."
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
              ورود
            </>
          )}
        </button>

        <p className="flex items-center justify-center gap-1 text-[10px] text-[hsl(var(--muted-foreground))]">
          <KeyRound className="h-3 w-3" />
          پنل صدور: license_generator/
        </p>
      </motion.div>
    </div>
  )
}
