# Extension Migration Guide

Este diretório concentra o que voce precisa para portar a extensao de audio
do Radiante para outro projeto, sem depender de contexto espalhado.

## Ordem recomendada

1. [`01-overview.md`](./01-overview.md)
2. [`02-permissions-and-manifest.md`](./02-permissions-and-manifest.md)
3. [`03-message-flow.md`](./03-message-flow.md)
4. [`04-audio-pipeline.md`](./04-audio-pipeline.md)
5. [`05-backend-contract.md`](./05-backend-contract.md)
6. [`06-migration-checklist.md`](./06-migration-checklist.md)
7. [`07-file-collection.md`](./07-file-collection.md)

## Escopo deste pacote

- Extensao Chrome Manifest V3 com `offscreen` para gravacao persistente.
- Captura de audio da aba + microfone com mix via Web Audio API.
- Integracao via WebSocket com backend para ingestao e transcricao.
- Checklist de portabilidade com passos e validacoes finais.

## Fontes tecnicas originais

- [`../EXTENSION.md`](../EXTENSION.md)
- [`../GHOST_AUDIO.md`](../GHOST_AUDIO.md)
- [`../README.md`](../README.md)
- [`../api-migration/README.md`](../api-migration/README.md)

## Guia complementar da API

Se a migracao incluir o backend que recebe o audio, consulte tambem:

- [`../api-migration/README.md`](../api-migration/README.md)

Esse material separa a migracao da API, o contrato HTTP/WS e a forma como ela
se conecta com esta extensao.

## Coleta inicial de arquivos

Para montar um pacote staging com extensao, frontend relacionado e backend
minimo do Ghost Audio, use o script:

- [`collect-migration-files.ps1`](./collect-migration-files.ps1)

Ele gera uma pasta `migration-pack/` na raiz do repo, separando os arquivos por
camada para facilitar a portabilidade para um novo projeto.
