export interface KeywordRule {
  id: string
  keyword: string
  commentReply: string
  dmMessage: string
  enabled: boolean
}

export type DmListMode = 'off' | 'whitelist' | 'blacklist'

export interface FeatureFlags {
  autoReplyDms: boolean
  autoReplyComments: boolean
  autoReplyNotifications: boolean
  replyOwnPostComments: boolean
  replyMentions: boolean
  keywordRulesEnabled: boolean
  walkUnreadDms: boolean
  acceptFollowRequests: boolean
  followBack: boolean
  /** Queue and reply every unanswered message in a thread, not only the last */
  replyAllInThread: boolean
  /** Require user approve before sending */
  previewBeforeSend: boolean
}

export interface FeatureDelays {
  delayDmsMs: number
  delayCommentsMs: number
  delayNotificationsMs: number
}

export interface DmFilter {
  mode: DmListMode
  users: string[]
}

export interface SafetySettings {
  workingHoursEnabled: boolean
  /** Local hour 0-23 */
  workStartHour: number
  workEndHour: number
  dailyLimitEnabled: boolean
  dailyLimitDm: number
  dailyLimitComment: number
}

export const DEFAULT_FLAGS: FeatureFlags = {
  autoReplyDms: true,
  autoReplyComments: true,
  autoReplyNotifications: true,
  replyOwnPostComments: true,
  replyMentions: true,
  keywordRulesEnabled: true,
  walkUnreadDms: true,
  acceptFollowRequests: false,
  followBack: false,
  replyAllInThread: true,
  previewBeforeSend: false
}

export const DEFAULT_DELAYS: FeatureDelays = {
  delayDmsMs: 2500,
  delayCommentsMs: 3000,
  delayNotificationsMs: 3000
}

export const DEFAULT_DM_FILTER: DmFilter = {
  mode: 'off',
  users: []
}

export const DEFAULT_SAFETY: SafetySettings = {
  workingHoursEnabled: false,
  workStartHour: 9,
  workEndHour: 22,
  dailyLimitEnabled: false,
  dailyLimitDm: 50,
  dailyLimitComment: 30
}

/** Strip @ and lowercase */
export function normalizeUsername(u: string): string {
  return u.trim().replace(/^@+/, '').toLowerCase()
}

/** Collapse handles for fuzzy compare: _maryam.zamani_ ≈ maryamzamani ≈ m-a-r-y-a-m partially */
export function compactUsername(u: string): string {
  return normalizeUsername(u).replace(/[._\-\s]/g, '')
}

/** True if two handles refer to the same person (exact or compact match) */
export function usernamesMatch(a: string | undefined, b: string | undefined): boolean {
  const na = normalizeUsername(a || '')
  const nb = normalizeUsername(b || '')
  if (!na || !nb) return false
  if (na === nb) return true
  const ca = compactUsername(na)
  const cb = compactUsername(nb)
  if (!ca || !cb) return false
  if (ca === cb) return true
  // one contains the other (min length 4 to avoid tiny false positives)
  if (ca.length >= 4 && cb.length >= 4) {
    if (ca.includes(cb) || cb.includes(ca)) return true
  }
  return false
}

/** True if username matches any entry in list */
export function usernameInList(username: string | undefined, list: string[]): boolean {
  if (!username || !list.length) return false
  return list.some((entry) => usernamesMatch(username, entry))
}

/**
 * DM filter decision.
 * - off: always allow
 * - whitelist: only listed users (unknown username → deny)
 * - blacklist: block listed users (unknown username → allow, but prefer passing all known aliases)
 */
export function isDmUserAllowed(
  username: string | undefined,
  filter: DmFilter,
  extraCandidates: string[] = []
): boolean {
  if (filter.mode === 'off') return true
  const list = (filter.users || []).map(normalizeUsername).filter(Boolean)
  if (!list.length) return filter.mode === 'blacklist'

  const candidates = [username, ...extraCandidates]
    .map((x) => normalizeUsername(x || ''))
    .filter(Boolean)

  if (!candidates.length) {
    // whitelist needs identity; blacklist without identity → deny to be safe when list is non-empty
    return false
  }

  const hit = candidates.some((c) => usernameInList(c, list))
  return filter.mode === 'whitelist' ? hit : !hit
}

/** Extract best-effort IG username candidates from inbox preview / header text */
export function extractUsernameFromPreview(preview: string): string {
  const candidates = extractUsernameCandidates(preview)
  return candidates[0] || ''
}

export function extractUsernameCandidates(preview: string): string[] {
  const t = (preview || '').replace(/\s+/g, ' ').trim()
  if (!t) return []
  const out: string[] = []
  const push = (v: string) => {
    const n = normalizeUsername(v)
    if (!n || n.length < 2 || n.length > 30) return
    if (/^(unread|new|reacted|you|sent|messages?|active|online|attachment|seen)$/i.test(n)) return
    if (!out.includes(n)) out.push(n)
  }

  // 1) @handle
  for (const m of t.matchAll(/@([A-Za-z0-9._]{2,30})/g)) push(m[1])

  // 2) underscore-style handles like _maryam.zamani_
  for (const m of t.matchAll(/\b(_?[A-Za-z][A-Za-z0-9._]{1,28}_?)\b/g)) {
    if (m[1].includes('.') || m[1].includes('_')) push(m[1])
  }

  // 3) first tokens
  const tokens = t.split(' ')
  for (const tok of tokens.slice(0, 6)) {
    const x = tok.replace(/^@/, '').replace(/[^a-zA-Z0-9._-]/g, '')
    if (/^[A-Za-z0-9._-]{2,30}$/.test(x)) push(x)
  }

  // 4) collapsed display name → slug (m-a-r-y-a-m, Bizhannouri)
  const namePart = t.split(/·|•|sent|Reacted|Unread|new message/i)[0]?.trim() || ''
  const slug = namePart
    .replace(/[^a-zA-Z0-9._\s-]/g, '')
    .trim()
    .split(/\s+/)
    .join('')
  if (/^[A-Za-z0-9._-]{2,30}$/.test(slug)) push(slug)

  return out
}

/** Within working hours? supports overnight ranges (e.g. 22→8) */
export function isWithinWorkingHours(
  enabled: boolean,
  startHour: number,
  endHour: number,
  now = new Date()
): boolean {
  if (!enabled) return true
  const h = now.getHours()
  const s = Math.max(0, Math.min(23, startHour))
  const e = Math.max(0, Math.min(23, endHour))
  if (s === e) return true
  if (s < e) return h >= s && h < e
  // overnight: e.g. 22 → 8
  return h >= s || h < e
}

export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}
