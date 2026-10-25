import type { ConversationSummary } from '../../core/chat';

export type Section =
  | 'overview'
  | 'chat'
  | 'providers'
  | 'companion'
  | 'settings'
  | 'permissions'
  | 'activity'
  | 'agent';

export type Conversation = ConversationSummary;
