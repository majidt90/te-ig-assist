/**
 * TEIG2 license: username + email + licenseKey is enough to validate.
 * Format: TEIG2.<base64url({lock,expiresAt})>.<320 hex signature>
 */

const APP_SECRET = 'TE-IG-ASSIST-TERMIMAL-2026-v1'

export function normalizeUser(u: string): string {
  return (u || '').trim().replace(/^@/, '').toLowerCase()
}

export function normalizeEmail(e: string): string {
  return (e || '').trim().toLowerCase()
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const buf = await globalThis.crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createHash } = require('crypto') as typeof import('crypto')
    return createHash('sha256').update(input).digest('hex')
  } catch {
    throw new Error('SHA-256 not available')
  }
}

function randomLock(len = 28): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnopqrstuvwxyz'
  let out = ''
  const arr = new Uint8Array(len)
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(arr)
  } else {
    for (let i = 0; i < len; i++) arr[i] = Math.floor(Math.random() * 256)
  }
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length]
  return out
}

function b64urlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  bytes.forEach((b) => {
    bin += String.fromCharCode(b)
  })
  const b64 =
    typeof btoa !== 'undefined'
      ? btoa(bin)
      : Buffer.from(str, 'utf8').toString('base64')
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(str: string): string {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4))
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad
  if (typeof atob !== 'undefined') {
    const bin = atob(b64)
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  }
  return Buffer.from(b64, 'base64').toString('utf8')
}

export interface LicensePayload {
  lock: string
  expiresAt: string
}

export interface LicenseGenerateInput {
  username: string
  email: string
  lock?: string
  daysValid?: number
  expiresAt?: string
}

export interface LicenseGenerateResult {
  license: string
  lock: string
  username: string
  email: string
  expiresAt: string
  daysValid: number
}

export async function generateLicense(input: LicenseGenerateInput): Promise<LicenseGenerateResult> {
  const username = normalizeUser(input.username)
  const email = normalizeEmail(input.email)
  const lock = (input.lock || randomLock(28)).trim()
  if (!username || !email) throw new Error('username and email required')

  let expiresAt = input.expiresAt
  let daysValid = input.daysValid ?? 365
  if (!expiresAt) {
    daysValid = Math.max(1, Math.min(3650, daysValid))
    const d = new Date()
    d.setDate(d.getDate() + daysValid)
    expiresAt = d.toISOString()
  } else {
    const ms = new Date(expiresAt).getTime() - Date.now()
    daysValid = Math.max(0, Math.ceil(ms / 86400000))
  }

  const material = `${username}|${email}|${lock}|${expiresAt}|${APP_SECRET}`
  const h1 = await sha256Hex(material)
  const h2 = await sha256Hex(`${h1}|${material}`)
  const h3 = await sha256Hex(`${h2}|${h1}|${APP_SECRET}`)
  const h4 = await sha256Hex(`${username}|${h3}|${email}|${expiresAt}`)
  const sig = (h1 + h2 + h3 + h4 + h1.slice(0, 64)).slice(0, 320)

  const payload: LicensePayload = { lock, expiresAt }
  const license = `TEIG2.${b64urlEncode(JSON.stringify(payload))}.${sig}`

  return { license, lock, username, email, expiresAt, daysValid }
}

export function parseLicenseKey(license: string): {
  ok: boolean
  payload?: LicensePayload
  sig?: string
  reason?: string
} {
  const key = (license || '').trim()
  const parts = key.split('.')
  if (parts.length !== 3 || parts[0] !== 'TEIG2') {
    return { ok: false, reason: 'format' }
  }
  try {
    const json = b64urlDecode(parts[1])
    const payload = JSON.parse(json) as LicensePayload
    if (!payload?.lock || !payload?.expiresAt) return { ok: false, reason: 'payload' }
    return { ok: true, payload, sig: parts[2] }
  } catch {
    return { ok: false, reason: 'payload' }
  }
}

/** Validate with only username + email + license key */
export async function validateLicense(
  username: string,
  email: string,
  license: string
): Promise<{ ok: boolean; reason?: string; expiresAt?: string; lock?: string }> {
  const parsed = parseLicenseKey(license)
  if (!parsed.ok || !parsed.payload || !parsed.sig) {
    return { ok: false, reason: parsed.reason || 'format' }
  }
  const { lock, expiresAt } = parsed.payload
  if (new Date(expiresAt).getTime() < Date.now()) {
    return { ok: false, reason: 'expired', expiresAt, lock }
  }
  const gen = await generateLicense({ username, email, lock, expiresAt })
  if (gen.license !== (license || '').trim()) {
    return { ok: false, reason: 'mismatch' }
  }
  return { ok: true, expiresAt, lock }
}

/** @deprecated use validateLicense */
export async function validateLicenseWithLock(
  username: string,
  email: string,
  lock: string,
  license: string,
  expiresAt: string
): Promise<{ ok: boolean; reason?: string }> {
  const r = await validateLicense(username, email, license)
  if (!r.ok) return { ok: false, reason: r.reason }
  if (lock && r.lock && lock !== r.lock) return { ok: false, reason: 'mismatch' }
  if (expiresAt && r.expiresAt && expiresAt !== r.expiresAt) return { ok: false, reason: 'mismatch' }
  return { ok: true }
}

export function formatRemaining(expiresAt: string): {
  expired: boolean
  label: string
  totalMs: number
} {
  const end = new Date(expiresAt).getTime()
  const ms = end - Date.now()
  if (Number.isNaN(end) || ms <= 0) {
    return { expired: true, label: 'منقضی شده', totalMs: 0 }
  }
  const days = Math.floor(ms / 86400000)
  const hours = Math.floor((ms % 86400000) / 3600000)
  const mins = Math.floor((ms % 3600000) / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  if (days > 0) {
    return {
      expired: false,
      label: `${days.toLocaleString('fa-IR')} روز و ${hours.toLocaleString('fa-IR')} ساعت`,
      totalMs: ms
    }
  }
  if (hours > 0) {
    return {
      expired: false,
      label: `${hours.toLocaleString('fa-IR')} ساعت و ${mins.toLocaleString('fa-IR')} دقیقه`,
      totalMs: ms
    }
  }
  return {
    expired: false,
    label: `${mins.toLocaleString('fa-IR')}:${secs.toString().padStart(2, '0')}`,
    totalMs: ms
  }
}
