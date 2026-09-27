export interface KeywordRule {
  id: string
  keyword: string
  commentReply: string
  dmMessage: string
  enabled: boolean
}

export interface FeatureFlags {
  /** Master: reply to Instagram DMs */
  autoReplyDms: boolean
  /** Master: reply to post comments */
  autoReplyComments: boolean
  /** Master: walk notifications / activity */
  autoReplyNotifications: boolean
  replyOwnPostComments: boolean
  replyMentions: boolean
  keywordRulesEnabled: boolean
  walkUnreadDms: boolean
  acceptFollowRequests: boolean
  followBack: boolean
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
