# Processo de release

## Próxima versão

1. Escolha o próximo patch ou minor SemVer dentro de `0.x`, conforme a compatibilidade mantida. Atualize a mesma versão em `package.json`, `package-lock.json` (raiz), `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` (pacote `odekrai`) e `src-tauri/tauri.conf.json`.
2. Rode `npm run check:version` e atualize o `CHANGELOG.md` e `docs/releases/vX.Y.Z.md`. Registre somente mudanças comprovadas pelo código e pelos commits, a data real do commit de fechamento, limitações e validações pendentes.
3. Execute as verificações definidas no CI e revise o diff. Crie um commit de versão separado e uma tag anotada local apontada para esse commit, com título e resumo em português.
4. Revise o workflow `.github/workflows/build-windows.yml` e confirme que o artefato é apenas diagnóstico e não é anexado à release. Envie a branch e as tags em comandos explícitos, após revisão; este repositório não publica tags automaticamente.
5. Confira que cada tag existe no remoto e rode `npm run publish:releases` para simular. Depois de revisar o resultado e preparar `GITHUB_TOKEN` no ambiente, rode `npm run publish:releases -- --execute` para criar as releases.

O publisher não faz push, não cria tags, não altera releases existentes e não anexa arquivos. A data exibida na página do GitHub pode ser a data em que a release foi criada; por isso, cada nota registra separadamente a data real do commit do marco.

## Pré-lançamentos e SemVer 0.x

Todas as releases deste plano são marcadas como pré-lançamento no GitHub. A API do GitHub não permite definir um pré-lançamento como release `latest`; o publisher define `make_latest: false` para todas e não promove nenhuma. Se essa regra de produto mudar, será necessário decidir entre manter pré-lançamentos sem `latest` ou publicar uma versão estável separada.

O projeto permanece em `0.x` enquanto a API, os formatos locais e os fluxos de segurança ainda puderem mudar sem compatibilidade estável. Considere `1.0.0` quando houver contratos públicos definidos, política de compatibilidade, fluxos críticos validados em Windows e provedores suportados verificados com contas reais. O histórico de versões, por si só, não é critério de estabilidade.

## Binários

As releases não incluem `.exe`, instaladores nem outros binários. Isso evita distribuir builds sem validação final de assinatura, licenças e comportamento no Windows; os workflows de build permanecem separados da publicação das notas. Os usuários podem consultar o código-fonte e as instruções de build do repositório.
