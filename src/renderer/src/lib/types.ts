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
  replyAllInThread: boolean
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

export function normalizeUsername(u: string): string {
  return u.trim().replace(/^@+/, '').toLowerCase()
}

export function compactUsername(u: string): string {
  return normalizeUsername(u).replace(/[._\-\s]/g, '')
}

export function usernamesMatch(a: string | undefined, b: string | undefined): boolean {
  const na = normalizeUsername(a || '')
  const nb = normalizeUsername(b || '')
  if (!na || !nb) return false
  if (na === nb) return true
  const ca = compactUsername(na)
  const cb = compactUsername(nb)
  if (!ca || !cb) return false
  if (ca === cb) return true
  if (ca.length >= 4 && cb.length >= 4) {
    if (ca.includes(cb) || cb.includes(ca)) return true
  }
  return false
}

export function usernameInList(username: string | undefined, list: string[]): boolean {
  if (!username || !list.length) return false
  return list.some((entry) => usernamesMatch(username, entry))
}

/**
 * - off: always allow
 * - whitelist: only listed (unknown → deny)
 * - blacklist: block listed (unknown → allow — do not reject @؟)
 */
export function isDmUserAllowed(
  username: string | undefined,
  filter: DmFilter,
  extraCandidates: string[] = []
): boolean {
  if (filter.mode === 'off') return true
  const list = (filter.users || []).map(normalizeUsername).filter(Boolean)
  if (!list.length) return true

  const candidates = [username, ...extraCandidates]
    .map((x) => normalizeUsername(x || ''))
    .filter(Boolean)

  if (!candidates.length) {
    // whitelist needs identity; blacklist without identity → allow
    return filter.mode === 'blacklist'
  }

  const hit = candidates.some((c) => usernameInList(c, list))
  return filter.mode === 'whitelist' ? hit : !hit
}

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
    if (/^(unread|new|reacted|you|sent|messages?|active|online|attachment|seen|liked)$/i.test(n)) return
    if (!out.includes(n)) out.push(n)
  }

  for (const m of t.matchAll(/@([A-Za-z0-9._]{2,30})/g)) push(m[1])

  // English handle anywhere: Bizhannouri, m.r.tavoosi
  for (const m of t.matchAll(/\b([A-Za-z][A-Za-z0-9._]{1,28})\b/g)) {
    const w = m[1]
    if (/^(Unread|Reacted|You|Sent|Messages?|Active|Online|Attachment|Liked|Message)$/i.test(w)) continue
    push(w)
  }

  for (const m of t.matchAll(/\b(_?[A-Za-z][A-Za-z0-9._]{1,28}_?)\b/g)) {
    if (m[1].includes('.') || m[1].includes('_')) push(m[1])
  }

  const tokens = t.split(' ')
  for (const tok of tokens.slice(0, 8)) {
    const x = tok.replace(/^@/, '').replace(/[^a-zA-Z0-9._-]/g, '')
    if (/^[A-Za-z0-9._-]{2,30}$/.test(x)) push(x)
  }

  const namePart = t.split(/·|•|sent|Reacted|Unread|new message/i)[0]?.trim() || ''
  const slug = namePart
    .replace(/[^a-zA-Z0-9._\s-]/g, '')
    .trim()
    .split(/\s+/)
    .join('')
  if (/^[A-Za-z0-9._-]{2,30}$/.test(slug)) push(slug)

  return out
}

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
  return h >= s || h < e
}

export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}
