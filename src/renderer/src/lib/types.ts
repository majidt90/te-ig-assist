export interface KeywordRule {
  id: string
  keyword: string
  commentReply: string
  dmMessage: string
  enabled: boolean
}

export interface FeatureFlags {
  replyOwnPostComments: boolean
  replyMentions: boolean
  keywordRulesEnabled: boolean
}

export const DEFAULT_FLAGS: FeatureFlags = {
  replyOwnPostComments: true,
  replyMentions: true,
  keywordRulesEnabled: true
}
