import openaiLogo from '../assets/providers/openai.svg';
import anthropicLogo from '../assets/providers/anthropic.svg';
import geminiLogo from '../assets/providers/gemini.svg';
import xaiLogo from '../assets/providers/xai.svg';
import mistralLogo from '../assets/providers/mistral.svg';
import cohereLogo from '../assets/providers/cohere.svg';
import groqLogo from '../assets/providers/groq.svg';
import deepseekLogo from '../assets/providers/deepseek.svg';
import perplexityLogo from '../assets/providers/perplexity.svg';
import cerebrasLogo from '../assets/providers/cerebras.svg';
import togetherLogo from '../assets/providers/together.svg';
import openrouterLogo from '../assets/providers/openrouter.svg';
import fireworksLogo from '../assets/providers/fireworks.svg';
import azureLogo from '../assets/providers/azure-openai.svg';
import bedrockLogo from '../assets/providers/bedrock.svg';
import vertexLogo from '../assets/providers/vertex-ai.svg';

export const PROVIDER_LOGOS: Record<string, string> = {
  openai: openaiLogo,
  anthropic: anthropicLogo,
  gemini: geminiLogo,
  xai: xaiLogo,
  mistral: mistralLogo,
  cohere: cohereLogo,
  groq: groqLogo,
  deepseek: deepseekLogo,
  perplexity: perplexityLogo,
  cerebras: cerebrasLogo,
  together: togetherLogo,
  openrouter: openrouterLogo,
  fireworks: fireworksLogo,
  'azure-openai': azureLogo,
  bedrock: bedrockLogo,
  'vertex-ai': vertexLogo,
};

export const providerLogoFor = (providerId: string) => PROVIDER_LOGOS[providerId];
