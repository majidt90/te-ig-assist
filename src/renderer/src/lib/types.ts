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
  /** Instagram usernames without @ */
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

/** Returns true if this user is allowed to receive auto DM replies */
export function isDmUserAllowed(username: string | undefined, filter: DmFilter): boolean {
  if (filter.mode === 'off') return true
  const list = filter.users.map(normalizeUsername).filter(Boolean)
  if (!list.length) return filter.mode === 'blacklist' // empty whitelist = block all; empty blacklist = allow all
  const u = normalizeUsername(username || '')
  if (!u) {
    // unknown peer: whitelist blocks, blacklist allows
    return filter.mode === 'blacklist'
  }
  const inList = list.includes(u)
  return filter.mode === 'whitelist' ? inList : !inList
}
