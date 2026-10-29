# Transcrição sob demanda

A transcrição é opcional e só começa depois de a pessoa confirmar o envio do áudio. O aplicativo envia o arquivo ao provedor selecionado e insere o texto retornado no campo de mensagem para revisão; não envia a mensagem. A gravação fica em memória e suas referências são descartadas após a tentativa confirmada. Não há transcrição em tempo real nem offline.

## Provedores verificados

| Provedor | Endpoint                                                   | Modelo                   | Formatos aceitos pelo serviço                    | Limite do serviço                            | Preço oficial consultado em 29/10/2026 |
| -------- | ---------------------------------------------------------- | ------------------------ | ------------------------------------------------ | -------------------------------------------- | -------------------------------------- |
| OpenAI   | `POST https://api.openai.com/v1/audio/transcriptions`      | `gpt-transcribe`         | MP3, MP4, MPEG, MPGA, M4A, WAV e WebM            | 25 MB                                        | US$ 0,0045/minuto                      |
| Groq     | `POST https://api.groq.com/openai/v1/audio/transcriptions` | `whisper-large-v3-turbo` | FLAC, MP3, MP4, MPEG, MPGA, M4A, OGG, WAV e WebM | 25 MB no nível gratuito; 100 MB no nível dev | US$ 0,04/hora; mínimo cobrado de 10 s  |

O OdeKrai limita qualquer upload a 25 MB. O formato criado pelo navegador é validado contra o provedor antes do envio. O idioma padrão informado é português (`pt`, ISO 639-1); a instrução textual pede transcrição em português brasileiro. Na OpenAI, o modelo recomendado atualmente é `gpt-transcribe`. O candidato `gpt-4o-mini-transcribe` está depreciado e tem desligamento anunciado para 26/02/2027; não é usado pelo OdeKrai.

O custo estimado na confirmação só aparece quando a pessoa preenche o campo opcional de preço em USD por minuto. O valor informado não é salvo nem tratado como cotação da conta. A estimativa é duração × preço por minuto; arredondamento, mínimos de cobrança, impostos, créditos, tier, descontos e câmbio podem alterar o valor faturado.

## Referências oficiais

- [OpenAI — transcrição de arquivos, endpoint, modelos, formatos e limite](https://developers.openai.com/api/docs/guides/speech-to-text)
- [OpenAI — referência do endpoint de transcrição](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create)
- [OpenAI — preços](https://developers.openai.com/pt-BR/api/docs/pricing)
- [Groq — Speech to Text, endpoint, formatos, limites, idioma e preço dos modelos](https://console.groq.com/docs/speech-to-text)
- [Groq — referência da API de transcrição](https://console.groq.com/docs/api-reference)

Valores de preço e tiers podem mudar; confira as páginas dos provedores antes de usar uma estimativa para decidir sobre custos.
