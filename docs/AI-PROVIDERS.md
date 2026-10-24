# Provedores de IA

## Disponível nesta versão

O chat usa a rota `POST {URL-base}/chat/completions`, cabeçalho `Authorization: Bearer`, corpo JSON com `model`, `messages` e `stream: false`. Isso atende serviços que implementam o formato OpenAI Chat Completions. O nome do provedor é apenas um rótulo; não significa que exista integração específica ou compatibilidade confirmada.

Configure uma URL HTTPS, um modelo válido e uma chave fornecida pelo serviço. O valor é mantido apenas em memória. CORS precisa permitir a origem do WebView quando a chamada parte da interface.

## Ainda não disponível

Não há integração nativa independente para OpenAI Responses, Anthropic Messages ou Google Gemini, streaming, catálogo remoto de modelos, roteamento, failover, orçamento, limite de uso ou armazenamento seguro de credenciais. A implementação desses recursos deverá tratar cada contrato e cabeçalho de autenticação em seu próprio adaptador.
