# Roadmap

1. **Fundação:** projeto reproduzível, interface, contratos e documentação.
2. **Hub desktop:** Tauri, preferências SQLite, idioma e credenciais pelo armazenamento seguro do sistema.
3. **Chat:** provedores com adaptadores próprios, streaming, histórico local e controles de custo.
4. **Companion:** ilha e janelas Windows, estados do personagem e carregador seguro de assets.
5. **Ferramentas e voz:** capacidades locais com permissões explícitas, auditoria e confirmação.
6. **Distribuição:** CI, testes Windows, instalador assinado quando houver certificado e documentação de atualização.

Cada fase depende de validação no Windows real antes de ser declarada pronta.

## Execução e hospedagem

A execução hospedada em nuvem é planejada e não está disponível nesta versão. O aplicativo não
conecta contas de nuvem nem executa habilidades remotamente. Uma implementação futura deverá pedir
aprovação para cada ação remota e aplicar limites de gasto; provedores listados na interface são
apenas referências planejadas, sem promessa de compatibilidade.
