# Privacidade

Esta base não exige conta e não implementa servidor Odekrai nem telemetria. Preferências não secretas são salvas no armazenamento local do WebView. Conversas ficam apenas em memória na versão atual.

Quando o usuário envia uma mensagem, o conteúdo e a chave de API são enviados diretamente ao endereço configurado para que o provedor processe o pedido. A política de retenção e os custos dependem desse serviço externo. Nenhuma chave é persistida nesta versão; fechar a aplicação a remove da memória do processo.

Esta página descreve apenas o comportamento implementado no estado indicado em `IMPLEMENTATION-STATUS.md`; não é uma garantia jurídica para versões futuras.
