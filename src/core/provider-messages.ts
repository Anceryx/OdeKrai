export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
  created_at?: number;
  citations?: { title: string; url: string }[];
};
