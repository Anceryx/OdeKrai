# Continuação da Fase 1

Estado em 24/10/2026: a implementação da Fase 1 está na branch `main` local. Consulte [o estado atual](IMPLEMENTATION-STATUS.md) e [os resultados de teste](TESTING.md); relatórios anteriores de outra árvore não validam este código.

## Validação nativa ainda necessária

1. Em uma sessão Windows visível, abrir o aplicativo duas vezes e observar se a segunda abertura foca a instância existente. Se `0x800700AA` reaparecer, registrar os processos e o perfil WebView2 envolvidos.
2. Confirmar salvar, consultar e remover uma credencial descartável no Gerenciador de Credenciais do Windows, sem registrar o valor.
3. Com contas autorizadas, testar Anthropic, um adaptador Chat Completions e Perplexity; observar resposta incremental onde implementada, cancelamento e persistência do histórico após reinício. Essas chamadas podem gerar custo.
4. Inspecionar Hub, catálogo, ilha e modo livre; validar DPI, múltiplos monitores, fullscreen, foco, click-through e WebGL.
5. Validar instalador e atualização somente em procedimento próprio, sem publicar artefatos ou o GLB privado.

Essas verificações não pertencem às próximas fases de agent loop ou integrações.
