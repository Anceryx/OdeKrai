export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
  citations?: { title: string; url: string }[];
};
