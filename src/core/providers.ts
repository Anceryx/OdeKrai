export type ProviderAuthMode = 'bearer' | 'api-key' | 'x-api-key';
export type ProviderIntegration =
  'openai-chat' | 'anthropic-messages' | 'perplexity-agent' | 'local-chat' | 'guide';

export type AiProvider = {
  id: string;
  name: string;
  description: string;
  integration: ProviderIntegration;
  docsUrl: string;
  signupUrl: string;
  consoleUrl: string;
  baseUrl?: string;
  modelHint: string;
  authMode: ProviderAuthMode;
  requirements: string[];
  logo?: string;
  color: string;
  region?: boolean;
  freePlan?: { limitsUrl: string; note?: string };
};

export type ProviderCatalogEntry = {
  id: string;
  baseUrl: string;
  chatPath: string | null;
  authHeader: string | null;
  modelListPath: string | null;
  modelListShape: string | null;
  hostRule: string | null;
  docsUrl: string;
  verifiedAt: string | null;
  verification: 'verified' | 'unverified';
  fields: string[];
  capabilities: ProviderCapabilities;
};

export type ProviderCapabilities = {
  streaming: boolean;
  tools: boolean;
  vision: boolean;
  imageGeneration: boolean;
  verified: boolean;
};

import rawCatalog from '../../src-tauri/resources/provider-catalog.json';
export const PROVIDER_CATALOG = rawCatalog as ProviderCatalogEntry[];
export const providerCatalogEntry = (id: string) =>
  PROVIDER_CATALOG.find((entry) => entry.id === id);

const providerDefinitions: AiProvider[] = [
  {
    id: 'local',
    name: 'IA local',
    description: 'Conecte um servidor compatível executado no seu computador.',
    integration: 'local-chat',
    docsUrl: 'https://github.com/ollama/ollama/blob/main/docs/api/openai-compatibility.mdx',
    signupUrl: 'https://ollama.com/download',
    consoleUrl: 'https://github.com/ggml-org/llama.cpp/tree/master/tools/server',
    baseUrl: 'http://127.0.0.1:11434/v1',
    modelHint: 'Selecione um modelo carregado',
    authMode: 'bearer',
    requirements: ['Servidor local já instalado e iniciado', 'Modelo local carregado'],
    color: '#7c7cf5',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Modelos GPT pela API de Chat Completions.',
    integration: 'openai-chat',
    docsUrl:
      'https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create',
    signupUrl: 'https://platform.openai.com/signup',
    consoleUrl: 'https://platform.openai.com/api-keys',
    baseUrl: 'https://api.openai.com/v1',
    modelHint: 'ID de modelo disponível na sua conta',
    authMode: 'bearer',
    requirements: ['Chave de API da plataforma OpenAI', 'ID de modelo habilitado no projeto'],
    logo: 'openai',
    color: '#F5F5F5',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude pela Messages API oficial da Anthropic.',
    integration: 'anthropic-messages',
    docsUrl: 'https://platform.claude.com/docs/en/api/messages/create',
    signupUrl: 'https://platform.claude.com/',
    consoleUrl: 'https://platform.claude.com/settings/keys',
    baseUrl: 'https://api.anthropic.com',
    modelHint: 'ID de modelo Claude',
    authMode: 'x-api-key',
    requirements: [
      'Chave da Claude Console',
      'Modelo disponível no workspace',
      'Chave da API e versão atual do Claude API',
    ],
    logo: 'anthropic',
    color: '#D4A27F',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Modelos Gemini pelo endpoint OpenAI compatível do Google AI Studio.',
    integration: 'openai-chat',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/openai',
    signupUrl: 'https://aistudio.google.com/welcome',
    consoleUrl: 'https://aistudio.google.com/api-keys',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    modelHint: 'ID de modelo Gemini',
    authMode: 'bearer',
    requirements: ['Chave da API Gemini no Google AI Studio', 'ID de modelo compatível'],
    logo: 'gemini',
    color: '#8E75B2',
    freePlan: {
      limitsUrl: 'https://ai.google.dev/gemini-api/docs/rate-limits',
      note: 'O acesso gratuito depende do modelo selecionado.',
    },
  },
  {
    id: 'xai',
    name: 'xAI',
    description: 'Modelos Grok pela API compatível com OpenAI.',
    integration: 'openai-chat',
    docsUrl: 'https://docs.x.ai/docs/api-reference',
    signupUrl: 'https://console.x.ai/',
    consoleUrl: 'https://console.x.ai/team/default/api-keys',
    baseUrl: 'https://api.x.ai/v1',
    modelHint: 'ID do modelo listado no console xAI',
    authMode: 'bearer',
    requirements: ['Chave de API da xAI', 'Modelo habilitado no console'],
    logo: 'xai',
    color: '#F5F5F5',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    description: 'Modelos Mistral pela API compatível com OpenAI.',
    integration: 'openai-chat',
    docsUrl: 'https://docs.mistral.ai/resources/migration-guides',
    signupUrl: 'https://console.mistral.ai/',
    consoleUrl: 'https://console.mistral.ai/api-keys/',
    baseUrl: 'https://api.mistral.ai/v1',
    modelHint: 'ID do modelo Mistral',
    authMode: 'bearer',
    requirements: ['Chave da API Mistral', 'Modelo habilitado na conta'],
    logo: 'mistral',
    color: '#FA520F',
    freePlan: {
      limitsUrl: 'https://docs.mistral.ai/admin/billing-usage/usage-limits',
      note: 'O modo gratuito tem limites de uso.',
    },
  },
  {
    id: 'cohere',
    name: 'Cohere',
    description: 'Chat pela API de compatibilidade da Cohere.',
    integration: 'openai-chat',
    docsUrl: 'https://docs.cohere.com/docs/compatibility-api',
    signupUrl: 'https://dashboard.cohere.com/',
    consoleUrl: 'https://dashboard.cohere.com/api-keys',
    baseUrl: 'https://api.cohere.ai/compatibility/v1',
    modelHint: 'ID do modelo Command',
    authMode: 'bearer',
    requirements: ['Chave da API Cohere', 'Modelo com suporte à Compatibility API'],
    logo: 'cohere',
    color: '#39594D',
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Inferência de modelos pela API compatível com OpenAI.',
    integration: 'openai-chat',
    docsUrl: 'https://console.groq.com/docs/openai',
    signupUrl: 'https://console.groq.com/',
    consoleUrl: 'https://console.groq.com/keys',
    baseUrl: 'https://api.groq.com/openai/v1',
    modelHint: 'ID do modelo disponível no GroqCloud',
    authMode: 'bearer',
    requirements: ['Chave de API Groq', 'Modelo disponível na conta'],
    logo: 'groq',
    color: '#F5F5F5',
    freePlan: {
      limitsUrl: 'https://console.groq.com/docs/rate-limits',
      note: 'Os limites variam conforme o modelo e a conta.',
    },
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'Modelos DeepSeek pela API compatível com OpenAI.',
    integration: 'openai-chat',
    docsUrl: 'https://api-docs.deepseek.com/quick_start/agent_integrations/',
    signupUrl: 'https://platform.deepseek.com/',
    consoleUrl: 'https://platform.deepseek.com/api_keys',
    baseUrl: 'https://api.deepseek.com',
    modelHint: 'ID do modelo publicado na documentação',
    authMode: 'bearer',
    requirements: ['Chave da API DeepSeek', 'Modelo ativo na conta'],
    logo: 'deepseek',
    color: '#5786FE',
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    description: 'Agent API com modelos, ferramentas e busca web configurável.',
    integration: 'perplexity-agent',
    docsUrl: 'https://docs.perplexity.ai/api-reference/agent-post',
    signupUrl: 'https://console.perplexity.ai/',
    consoleUrl: 'https://console.perplexity.ai/project/keys',
    baseUrl: 'https://api.perplexity.ai/v1/agent',
    modelHint: 'ID de modelo aceito pela Agent API',
    authMode: 'bearer',
    requirements: [
      'Chave de API Perplexity',
      'ID de modelo disponível na Agent API',
      'A busca na web não é ativada automaticamente',
    ],
    logo: 'perplexity',
    color: '#20B8CD',
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    description: 'Inferência pela API de Chat Completions compatível com OpenAI.',
    integration: 'openai-chat',
    docsUrl: 'https://inference-docs.cerebras.ai/api-reference/chat-completions',
    signupUrl: 'https://cloud.cerebras.ai/',
    consoleUrl: 'https://cloud.cerebras.ai/',
    baseUrl: 'https://api.cerebras.ai/v1',
    modelHint: 'ID do modelo Cerebras',
    authMode: 'bearer',
    requirements: ['Chave de API Cerebras', 'Modelo habilitado na conta'],
    logo: 'cerebras',
    color: '#F5F5F5',
    freePlan: {
      limitsUrl: 'https://inference-docs.cerebras.ai/support/pricing',
      note: 'O plano gratuito tem limites próprios de uso.',
    },
  },
  {
    id: 'together',
    name: 'Together AI',
    description: 'Modelos hospedados pela API compatível com OpenAI.',
    integration: 'openai-chat',
    docsUrl: 'https://docs.together.ai/docs/inference/openai-compatibility',
    signupUrl: 'https://api.together.ai/',
    consoleUrl: 'https://api.together.ai/settings/projects/~current/api-keys',
    baseUrl: 'https://api.together.ai/v1',
    modelHint: 'ID completo do modelo no catálogo Together',
    authMode: 'bearer',
    requirements: ['Chave de API Together AI', 'ID completo do modelo, incluindo namespace'],
    logo: 'together',
    color: '#F5F5F5',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Acesse modelos de vários provedores com uma API única.',
    integration: 'openai-chat',
    docsUrl: 'https://openrouter.ai/docs/quickstart',
    signupUrl: 'https://openrouter.ai/',
    consoleUrl: 'https://openrouter.ai/settings/keys',
    baseUrl: 'https://openrouter.ai/api/v1',
    modelHint: 'ID do modelo no formato provedor/modelo',
    authMode: 'bearer',
    requirements: ['Chave de API OpenRouter', 'ID do modelo no catálogo OpenRouter'],
    logo: 'openrouter',
    color: '#94A3B8',
    freePlan: {
      limitsUrl: 'https://openrouter.ai/pricing',
      note: 'Modelos com sufixo :free e limites menores.',
    },
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    description: 'Inferência de modelos pela API compatível com OpenAI.',
    integration: 'openai-chat',
    docsUrl: 'https://docs.fireworks.ai/guides/querying-text-models',
    signupUrl: 'https://fireworks.ai/',
    consoleUrl: 'https://app.fireworks.ai/account/home',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    modelHint: 'ID do modelo, incluindo accounts/.../models/...',
    authMode: 'bearer',
    requirements: ['Chave de API Fireworks', 'ID completo do modelo'],
    logo: 'fireworks',
    color: '#F5F5F5',
  },
  {
    id: 'azure-openai',
    name: 'Azure OpenAI',
    description: 'Use um deployment do Azure pelo endpoint OpenAI v1.',
    integration: 'openai-chat',
    docsUrl: 'https://learn.microsoft.com/en-us/azure/foundry/openai/latest',
    signupUrl: 'https://ai.azure.com/',
    consoleUrl: 'https://ai.azure.com/',
    baseUrl: '',
    modelHint: 'Nome do deployment do Azure',
    authMode: 'api-key',
    requirements: [
      'Endpoint do recurso terminado em /openai/v1',
      'API key do recurso no cabeçalho api-key',
      'Nome do deployment no campo Modelo',
      'API version v1 é usada por este endpoint',
    ],
    logo: 'azure',
    color: '#0078D4',
  },
  {
    id: 'bedrock',
    name: 'AWS Bedrock',
    description: 'Chat Completions no endpoint regional do Bedrock Runtime.',
    integration: 'openai-chat',
    docsUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/inference-chat-completions.html',
    signupUrl: 'https://signin.aws.amazon.com/signup?request_type=register',
    consoleUrl: 'https://console.aws.amazon.com/bedrock/',
    baseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1',
    modelHint: 'Model ID ou inference profile habilitado',
    authMode: 'bearer',
    requirements: [
      'Região AWS com o modelo disponível',
      'Chave de API Amazon Bedrock (não chave IAM de longa duração)',
      'Model ID e permissões de inferência; alguns modelos exigem acesso adicional',
    ],
    logo: 'bedrock',
    color: '#FF9900',
    region: true,
  },
  {
    id: 'vertex-ai',
    name: 'Vertex AI',
    description: 'Modelos Gemini em projeto Google Cloud com Application Default Credentials.',
    integration: 'guide',
    docsUrl:
      'https://docs.cloud.google.com/vertex-ai/generative-ai/docs/samples/generativeaionvertexai-gemini-chat-completions-non-streaming',
    signupUrl: 'https://console.cloud.google.com/',
    consoleUrl: 'https://console.cloud.google.com/vertex-ai/',
    modelHint: 'ID do modelo Vertex AI',
    authMode: 'bearer',
    requirements: [
      'Project ID e região',
      'Vertex AI API e faturamento habilitados',
      'Application Default Credentials com papel Vertex AI User',
      'O fluxo OAuth/ADC ainda não está integrado no ODEKRAI',
    ],
    logo: 'google-cloud',
    color: '#4285F4',
  },
];

export const AI_PROVIDERS = providerDefinitions.map((provider) => {
  const entry = PROVIDER_CATALOG.find((item) => item.id === provider.id);
  if (!entry) return provider;
  const authMode: ProviderAuthMode =
    entry.authHeader === 'x-api-key'
      ? 'x-api-key'
      : entry.authHeader === 'api-key'
        ? 'api-key'
        : 'bearer';
  return {
    ...provider,
    docsUrl: entry.docsUrl,
    baseUrl: entry.baseUrl || provider.baseUrl,
    authMode,
    modelHint: 'ID do modelo habilitado na sua conta',
  };
});

export function providerById(id: string): AiProvider | undefined {
  return AI_PROVIDERS.find((provider) => provider.id === id);
}
