export interface KeywordRule {
  id: string
  keyword: string
  commentReply: string
  dmMessage: string
  enabled: boolean
}

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
