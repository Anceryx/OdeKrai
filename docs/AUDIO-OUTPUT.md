# Leitura em voz alta

A leitura é local e usa `window.speechSynthesis` do Web Speech API exposto pelo WebView2. A configuração é desligada por padrão. O catálogo mostrado pelo aplicativo inclui apenas vozes com `lang` igual a `pt-BR` e `localService` verdadeiro. Uma voz ausente não é substituída por voz remota. A fala não passa pelo Rust, por adaptadores de provedor ou por chamadas de rede.

Cada resposta pode ser lida pelo botão “Ouvir” e interrompida por “Parar”. O texto falado remove blocos e trechos de código, marcação Markdown e endereços de links, preservando o rótulo do link. “Ler respostas automaticamente” lê somente respostas novas; histórico carregado ao selecionar conversa não é lido automaticamente. Uma nova mensagem substitui a fala atual e limpa a fila do sintetizador. Sair da tela, silenciar o pet e a parada de emergência também interrompem a fala.

Velocidade e volume são preferências locais. O aplicativo não instala vozes. Se nenhuma voz local em português do Brasil estiver disponível, abra Configurações do Windows → Hora e idioma → Idioma e região → opções do Português (Brasil) e instale “Conversão de texto em fala”; talvez seja necessário reiniciar o OdeKrai. A disponibilidade do recurso depende do idioma/edição do Windows.

## Referências verificadas

- Tauri `2.12.5` está travado em `src-tauri/Cargo.lock`; a [documentação Tauri 2 sobre WebView2](https://v2.tauri.app/reference/webview-versions/) informa que Windows usa WebView2 baseado em Edge/Chromium.
- A documentação oficial do [Microsoft Edge WebView2 Web Speech API](https://learn.microsoft.com/en-us/microsoft-edge/dev-guide/multimedia/web-speech-api) descreve `SpeechSynthesis`, `SpeechSynthesisVoice`, `SpeechSynthesisUtterance` e a síntese pelo serviço de voz do dispositivo.
- A [especificação Web Speech API](https://webaudio.github.io/web-speech-api/) define `getVoices()`, `voiceschanged` e `SpeechSynthesisVoice.localService`; esta última distingue vozes de serviço local de serviços remotos.
- O [Suporte da Microsoft para instalar recursos de fala](https://support.microsoft.com/pt-br/windows/hardware/input-devices/manage-the-language-and-keyboard-input-layout-settings-in-windows) informa que a conversão de texto em fala pode ser instalada nas opções de idioma, quando disponível.

Testes unitários usam um sintetizador falso. A reprodução com as vozes realmente instaladas e o comportamento do runtime WebView2 desta máquina ainda precisam de validação no Windows.
