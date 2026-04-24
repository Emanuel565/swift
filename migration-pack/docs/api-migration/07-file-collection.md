# 07 - Coleta de Arquivos da API para Novo Projeto

## Objetivo

Separar em uma pasta própria tudo que um novo projeto precisa para levar a API
do Ghost Audio com o menor número de dependências implícitas.

## Arquivos de documentação que devem acompanhar a API

- `docs/ARCHITECTURE.md`
- `docs/GHOST_AUDIO.md`
- `docs/EXTENSION.md`
- `docs/api-migration/README.md`
- `docs/api-migration/01-overview.md`
- `docs/api-migration/02-runtime-and-dependencies.md`
- `docs/api-migration/03-http-and-websocket-contract.md`
- `docs/api-migration/04-data-and-persistence.md`
- `docs/api-migration/05-extension-integration.md`
- `docs/api-migration/06-migration-checklist.md`
- `docs/api-migration/07-file-collection.md`
- `docs/api-migration/08-migrate-to-new-api.md`
- `docs/api-migration/09-contract-specs.md`
- `docs/api-migration/contracts/http-openapi.json`
- `docs/api-migration/contracts/ws-audio.schema.json`
- `docs/api-migration/contracts/ws-live-transcripts.schema.json`

## Runtime mínimo do backend

- `valorantapi/.env.migration.example`
- `valorantapi/package.ghost-audio.json`
- `valorantapi/GHOST_AUDIO_MIGRATION_README.md`
- `valorantapi/src/app.ghost-audio.js`
- `valorantapi/src/audioProtocol.js`
- `valorantapi/src/ghostAudioEngine.js`
- `valorantapi/src/transcriptionAdapter.js`
- `valorantapi/src/whisperAdapter.js`
- `valorantapi/src/transcriptStore.js`
- `valorantapi/src/db.js`
- `valorantapi/src/routes/recordings.js`
- `valorantapi/src/routes/transcripts.js`
- `valorantapi/scripts/check-node-version.cjs`
- `valorantapi/scripts/rebuild-sqlite.cjs`
- `valorantapi/scripts/smoke-ghost-audio-runtime.cjs`

## Arquivos da extensão que dependem desta API

- `extension/background.js`
- `extension/offscreen.js`
- `extension/manifest.json`
- `extension/content-meet.js`

## Arquivos do frontend que validam a integração

- `src/services/recordingsApi.ts`
- `src/services/liveTranscriptWs.ts`
- `src/pages/Transcricoes.tsx`
- `src/pages/ReuniaoAoVivo.tsx`
- `src/pages/GhostExtensao.tsx`

## Estrutura sugerida no pacote de migração

```text
migration-pack/
  docs/
    api-migration/
  api-runtime/
  extension-runtime/
  frontend-extension/
```

## Regra prática

Se a intenção for migrar apenas a API, leve o bucket `api-runtime/` e a
documentação de `docs/api-migration/`. Se a intenção for migrar o fluxo inteiro,
leve também a extensão e os serviços do frontend.

O bucket `api-runtime/` agora é pensado para subir sozinho, sem depender das
rotas de Valorant do monorepo original.
