# Desenvolvimento

## Requisitos

- Node.js 22.12 ou superior e npm para a interface, conforme `package.json`.
- Rust estável, Microsoft C++ Build Tools e WebView2 para compilar Tauri no Windows.

## Comandos

```powershell
npm install
npm run dev
npm run build
```

## Executável Windows de diagnóstico

O workflow manual **Build Windows diagnostic executable** compila em uma máquina limpa do GitHub Actions. Para iniciá-lo, abra a aba **Actions**, selecione o workflow, clique em **Run workflow** e escolha se `diagnostics` ficará habilitado. Com `false` (padrão), o executável não inclui DevTools; com `true`, use `Ctrl+Shift+I` no Windows para abrir o inspetor do WebView2.

Ao concluir, abra a execução do workflow e baixe o artefato `odekrai-windows-<sha-curto>`. Extraia o arquivo e execute `odekrai.exe`. O artefato contém o executável, `SHA256SUMS.txt` e este aviso em `LEIA-ME.txt`. O executável não é assinado, então o SmartScreen pode mostrar um aviso, e requer o Microsoft Edge WebView2 Runtime instalado.

A seção **Configurações > Sobre** mostra versão, commit, data UTC do build e versão do WebView2. O console do WebView também registra esses dados no cabeçalho `[OdeKrai diagnóstico]`.

Para compilar localmente sem empacotar instalador, use `npx tauri build --no-bundle`. O build de diagnóstico pode ser feito com `npx tauri build --no-bundle --features diagnostics`; a feature `diagnostics` ativa `tauri/devtools` apenas quando explicitamente passada. O workflow verifica que as features padrão não ativam DevTools.

## Estrutura

- `src/core`: configurações e acesso ao provedor.
- `src/ui`: Hub React e tema.
- `src-tauri`: shell nativo Tauri.
- `assets/odekrai`: organização de assets com controle de versão seletivo.
- `docs`: arquitetura, operação e status verificável.
