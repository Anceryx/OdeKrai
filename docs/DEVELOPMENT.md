# Desenvolvimento

## Requisitos

- Node.js 20.19+ ou 22.12+ e npm para a interface.
- Rust estável, Microsoft C++ Build Tools e WebView2 para compilar Tauri no Windows.

## Comandos

```powershell
npm install
npm run dev
npm run build
```

O comando desktop Tauri só deve ser documentado como disponível após a configuração Rust e a compilação terem sido validadas em Windows.

## Estrutura

- `src/core`: configurações e acesso ao provedor.
- `src/ui`: Hub React e tema.
- `src-tauri`: shell nativo, ainda pendente.
- `assets/odekrai`: organização de assets com controle de versão seletivo.
- `docs`: arquitetura, operação e status verificável.
