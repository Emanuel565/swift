# Extension Migration Guide

Este diretório concentra o que voce precisa para portar a extensao de audio
do Radiante para outro projeto, sem depender de contexto espalhado.

## Ordem recomendada

1. [`01-overview.md`](./01-overview.md)
2. [`02-permissions-and-manifest.md`](./02-permissions-and-manifest.md)
3. [`03-message-flow.md`](./03-message-flow.md) (parcial: mensagens atuais usam `POPUP_*` + upload HTTP, não o fluxo WS legado)
4. [`04-audio-pipeline.md`](./04-audio-pipeline.md) (a parte de `MediaRecorder`/mix permanece; envio em WS foi trocado por `POST` multipart no `background.js`)
5. [`05-backend-contract.md`](./05-backend-contract.md) — **leia a secao “Integracao enterprise (actual)”**; o contrato WS e historico
6. [`06-migration-checklist.md`](./06-migration-checklist.md)
7. [`07-file-collection.md`](./07-file-collection.md) — referencia a packs antigos; no repo `swift` o alvo e `enterprise-api` + `../enterprise-extension`

## Escopo deste pacote (repo swift)

- Extensao Chrome MV3 com `offscreen` para captura de audio (aba Meet + microfone).
- **Integracao de producao** com o backend **Nest** `enterprise-api`: `POST /transcriptions` (multipart) a partir do **service worker**; ping `GET /` antes do upload para validar base URL/porta.
- A documentacao original do Ghost Audio (WebSocket, `valorantapi`, etc.) permanece como **contexto historico**; nao e o runtime ligado no monorepo actual.
- Referencia: pasta `../enterprise-extension` (Transcriber ProV2).

## Fontes tecnicas originais

- [`../EXTENSION.md`](../EXTENSION.md)
- [`../GHOST_AUDIO.md`](../GHOST_AUDIO.md)
- [`../README.md`](../README.md)

## Coleta inicial de arquivos

Para montar um pacote staging com extensao, frontend relacionado e backend
minimo do Ghost Audio, use o script:

- [`collect-migration-files.ps1`](./collect-migration-files.ps1)

Ele gera uma pasta `migration-pack/` na raiz do repo, separando os arquivos por
camada para facilitar a portabilidade para um novo projeto.
