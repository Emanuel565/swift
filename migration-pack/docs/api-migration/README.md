# API Migration Guide

Este diretório concentra a migração da API que sustenta o Ghost Audio.
Ele complementa o guia da extensão e explica o backend mínimo, o contrato
HTTP/WS e a integração com a nossa extensão e com o frontend.

## Comece por aqui

Se a intenção é portar o fluxo para outra API sem perder tempo, siga esta ordem:

1. leia este `README.md`
2. leia [`08-migrate-to-new-api.md`](./08-migrate-to-new-api.md)
3. leia [`09-contract-specs.md`](./09-contract-specs.md)
4. copie o bucket `migration-pack/api-runtime/`
5. suba o runtime e rode `npm run smoke:test`

Se isso funcionar, você já tem uma base prática para reimplementar em outra
stack mantendo o mesmo contrato.

## Qual documento usar

- se você precisa entender a arquitetura: [`01-overview.md`](./01-overview.md)
- se você precisa subir o runtime: [`02-runtime-and-dependencies.md`](./02-runtime-and-dependencies.md)
- se você precisa reproduzir o contrato: [`03-http-and-websocket-contract.md`](./03-http-and-websocket-contract.md)
- se você precisa mudar de stack: [`08-migrate-to-new-api.md`](./08-migrate-to-new-api.md)
- se você precisa implementar pela especificação: [`09-contract-specs.md`](./09-contract-specs.md)

## Ordem recomendada

1. [`01-overview.md`](./01-overview.md)
2. [`02-runtime-and-dependencies.md`](./02-runtime-and-dependencies.md)
3. [`03-http-and-websocket-contract.md`](./03-http-and-websocket-contract.md)
4. [`04-data-and-persistence.md`](./04-data-and-persistence.md)
5. [`05-extension-integration.md`](./05-extension-integration.md)
6. [`06-migration-checklist.md`](./06-migration-checklist.md)
7. [`07-file-collection.md`](./07-file-collection.md)
8. [`08-migrate-to-new-api.md`](./08-migrate-to-new-api.md)
9. [`09-contract-specs.md`](./09-contract-specs.md)

## Escopo deste pacote

- Backend Node 22 com Express 5 e `ws` em modo `noServer`
- Ingestão de áudio binário em `/ws/audio`
- Broadcast de monitoramento em `/ws/live-transcripts`
- Persistência local em SQLite via `better-sqlite3`
- Transcrição assíncrona com Whisper local ou STT externo
- Rotas HTTP consumidas pelo painel React
- Bucket dedicado `migration-pack/api-runtime/` para portar a API isoladamente

## Resultado esperado da migração

Ao final da migração, a nova API deve conseguir:

- receber áudio da extensão em `/ws/audio`
- emitir eventos ao vivo em `/ws/live-transcripts`
- listar gravações em `/api/recordings`
- expor transcrições em `/api/transcripts`
- passar no smoke test do runtime standalone

## Como isso se conecta ao restante do projeto

- A extensão Chrome envia áudio e legendas para esta API
- O frontend consome gravações, transcrições e eventos ao vivo desta API
- O banco local mantém a ligação entre grupo de gravação, tracks e transcrição

## Fontes técnicas originais

- [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
- [`../GHOST_AUDIO.md`](../GHOST_AUDIO.md)
- [`../EXTENSION.md`](../EXTENSION.md)
- [`../extension-migration/README.md`](../extension-migration/README.md)

## Relação com a migração da extensão

Se o objetivo for portar o fluxo completo para outro projeto, use este guia em
conjunto com [`../extension-migration/`](../extension-migration/). A extensão
depende diretamente do contrato descrito aqui para funcionar sem regressões.
