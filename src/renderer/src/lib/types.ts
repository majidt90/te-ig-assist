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

export const DEFAULT_FLAGS: FeatureFlags = {
  autoReplyDms: true,
  autoReplyComments: true,
  autoReplyNotifications: true,
  replyOwnPostComments: true,
  replyMentions: true,
  keywordRulesEnabled: true,
  walkUnreadDms: true,
  acceptFollowRequests: false,
  followBack: false
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

export function normalizeUsername(u: string): string {
  return u.trim().replace(/^@/, '').toLowerCase()
}

/**
 * true = allowed to auto-reply
 * empty username: whitelist → not allowed (caller should not permanent-skip);
 * blacklist → allowed
 */
export function isDmUserAllowed(username: string | undefined, filter: DmFilter): boolean {
  if (filter.mode === 'off') return true
  const list = filter.users.map(normalizeUsername).filter(Boolean)
  if (!list.length) return filter.mode === 'blacklist'
  const u = normalizeUsername(username || '')
  if (!u) return filter.mode === 'blacklist'
  const inList = list.includes(u)
  return filter.mode === 'whitelist' ? inList : !inList
}

/** Extract best-effort IG username token from inbox preview text */
export function extractUsernameFromPreview(preview: string): string {
  const t = (preview || '').replace(/\s+/g, ' ').trim()
  // prefer token that looks like handle (letters, digits, . _ -)
  const tokens = t.split(' ')
  for (const tok of tokens.slice(0, 4)) {
    const x = tok.replace(/^@/, '')
    if (/^[A-Za-z0-9._-]{2,30}$/.test(x) && !/^(unread|new|reacted|you|sent)$/i.test(x)) {
      return x
    }
  }
  return ''
}
