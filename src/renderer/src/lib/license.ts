/**
 * License helpers — shared algorithm for app validation and HTML generator.
 * Format: TEIG1.<320 hex chars>
 * Bound to: username + email + lock (embedded in payload hash)
 */

const APP_SECRET = 'TE-IG-ASSIST-TERMIMAL-2026-v1'

function normalizeUser(u: string): string {
  return (u || '').trim().replace(/^@/, '').toLowerCase()
}

function normalizeEmail(e: string): string {
  return (e || '').trim().toLowerCase()
}

/** Browser/Node-compatible SHA-256 hex via Web Crypto when available */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  // renderer / browser
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const buf = await globalThis.crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
  // Node fallback
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createHash } = require('crypto') as typeof import('crypto')
    return createHash('sha256').update(input).digest('hex')
  } catch {
    throw new Error('SHA-256 not available')
  }
}

function randomLock(len = 24): string {
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

export interface LicenseGenerateInput {
  username: string
  email: string
  lock?: string
}

export interface LicenseGenerateResult {
  license: string
  lock: string
  username: string
  email: string
}

export async function generateLicense(input: LicenseGenerateInput): Promise<LicenseGenerateResult> {
  const username = normalizeUser(input.username)
  const email = normalizeEmail(input.email)
  const lock = (input.lock || randomLock(28)).trim()
  if (!username || !email) throw new Error('username and email required')

  const material = `${username}|${email}|${lock}|${APP_SECRET}`
  const h1 = await sha256Hex(material)
  const h2 = await sha256Hex(`${h1}|${material}`)
  const h3 = await sha256Hex(`${h2}|${h1}|${APP_SECRET}`)
  const h4 = await sha256Hex(`${username}|${h3}|${email}`)
  // ~320 hex chars
  const body = (h1 + h2 + h3 + h4 + h1.slice(0, 64)).slice(0, 320)
  return {
    license: `TEIG1.${body}`,
    lock,
    username,
    email
  }
}

export async function validateLicense(
  username: string,
  email: string,
  license: string
): Promise<{ ok: boolean; reason?: string }> {
  const u = normalizeUser(username)
  const e = normalizeEmail(email)
  const key = (license || '').trim()
  if (!u || !e || !key) return { ok: false, reason: 'incomplete' }
  if (!key.startsWith('TEIG1.') || key.length < 40) return { ok: false, reason: 'format' }

  // Brute: we don't store lock in app — license must match one of derived patterns
  // License embeds hash of username|email|lock; without lock we verify structural checksum
  // by re-deriving from known parts using lock extracted from optional second field,
  // OR store lock alongside license in activation.
  //
  // Activation stores: username, email, lock, license
  // Validation: regenerate and compare.
  return { ok: false, reason: 'use_validateWithLock' }
}

export async function validateLicenseWithLock(
  username: string,
  email: string,
  lock: string,
  license: string
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const gen = await generateLicense({ username, email, lock })
    if (gen.license === (license || '').trim()) return { ok: true }
    return { ok: false, reason: 'mismatch' }
  } catch {
    return { ok: false, reason: 'error' }
  }
}
