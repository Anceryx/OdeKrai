# Licença e distribuição de assets

O código e as dependências do aplicativo têm seus próprios termos de licença. Eles não concedem
direito de redistribuir os materiais visuais fornecidos pelo proprietário.

O modelo `odekrai-head.glb` e as referências visuais em `assets/odekrai/` são materiais privados do
proprietário. Não os inclua em instaladores, releases, capturas públicas ou outros artefatos
distribuídos sem autorização explícita. Esses arquivos permanecem fora do Git.

`npm run build` é um build local do frontend e pode copiar o modelo para `dist/assets/`. Para
preparar o aplicativo distribuível, use `npm run tauri:build`: o `beforeBuildCommand` executa
`check:release-assets` e bloqueia a preparação se encontrar `odekrai-head*.glb` ou arquivos dentro
de `official-references/`. Também executa `check:debug-command`, que exige `cfg(debug_assertions)`
na declaração e no registro da ferramenta manual simulada. Esses verificadores analisam os fontes
de `dist/`, sem abrir ou imprimir o conteúdo dos assets.

Se a verificação bloquear, não remova a guarda nem publique o artefato. Prepare um build sem esses
materiais e repita a verificação. A ausência deles no artefato precisa ser confirmada antes da
distribuição.
