# Licença e distribuição de assets

O código e as dependências do aplicativo têm seus próprios termos de licença. Eles não concedem direito de redistribuir materiais visuais fornecidos pelo proprietário.

## Materiais privados do proprietário

O modelo 3D e as referências visuais fornecidos pelo proprietário são privados. Não podem ser versionados nem incluídos em artefatos distribuídos. O runtime e o build do aplicativo não os consomem.

## Personagens Kenney

Os doze sprites usados pelo aplicativo são renderizações dos modelos Mini Characters da Kenney, distribuídos sob CC0. As imagens foram renderizadas em 512×512 px, com fundo transparente e pose de repouso. Origem, URL, licença e edição estão registradas em [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

O script de desenvolvimento `scripts/render-pets.mjs` recebe os modelos-fonte externos por parâmetro. Three.js é dependência de desenvolvimento, usada somente por esse script; não é importada pelo aplicativo. Os modelos-fonte e as texturas não devem ser adicionados ao repositório ou aos artefatos do aplicativo.
