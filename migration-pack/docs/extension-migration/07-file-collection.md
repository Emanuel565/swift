# 07 - Coleta de Arquivos para Novo Projeto

Este documento consolida os arquivos que devem ser levados para um novo projeto
quando o objetivo e migrar a extensao Ghost Audio junto com o frontend que a
acompanha.

## Objetivo da coleta

Separar o que e necessario em quatro camadas:

- documentacao de suporte
- runtime da extensao Chrome
- frontend ligado a gravacoes e transcricao ao vivo
- backend minimo que sustenta o contrato WS/HTTP da extensao

## 1) Documentacao que deve acompanhar a migracao

Arquivos:

- `docs/README.md`
- `docs/ARCHITECTURE.md`
- `docs/EXTENSION.md`
- `docs/GHOST_AUDIO.md`
- `docs/api-migration/README.md`
- `docs/api-migration/01-overview.md`
- `docs/api-migration/02-runtime-and-dependencies.md`
- `docs/api-migration/03-http-and-websocket-contract.md`
- `docs/api-migration/04-data-and-persistence.md`
- `docs/api-migration/05-extension-integration.md`
- `docs/api-migration/06-migration-checklist.md`
- `docs/api-migration/07-file-collection.md`
- `docs/extension-migration/README.md`
- `docs/extension-migration/01-overview.md`
- `docs/extension-migration/02-permissions-and-manifest.md`
- `docs/extension-migration/03-message-flow.md`
- `docs/extension-migration/04-audio-pipeline.md`
- `docs/extension-migration/05-backend-contract.md`
- `docs/extension-migration/06-migration-checklist.md`

Motivo: estes arquivos descrevem permissoes MV3, fluxo interno popup/background/
offscreen, contrato do WebSocket, migracao da API e validacoes finais.

## 2) Runtime obrigatorio da extensao

Arquivos:

- `extension/manifest.json`
- `extension/background.js`
- `extension/offscreen.html`
- `extension/offscreen.js`
- `extension/popup.html`
- `extension/popup.js`
- `extension/content-meet.js`

Motivo: esse conjunto implementa a extensao completa citada na documentacao.
Sem qualquer um desses arquivos, a captura ou a UI do popup fica incompleta.

## 3) Frontend do painel ligado a extensao

### Nucleo funcional

Arquivos:

- `src/pages/GhostExtensao.tsx`
- `src/pages/Transcricoes.tsx`
- `src/pages/ReuniaoAoVivo.tsx`
- `src/services/recordingsApi.ts`
- `src/services/liveTranscriptWs.ts`
- `src/index.css`

Motivo:

- `GhostExtensao.tsx` documenta a instalacao e o uso da extensao dentro do app
- `Transcricoes.tsx` consome `/api/recordings` e exibe audio/transcricoes
- `ReuniaoAoVivo.tsx` consome `/ws/live-transcripts`
- os services encapsulam o contrato do backend

### Referencia de integracao do shell React

Arquivos:

- `index.html`
- `package.json`
- `vite.config.ts`
- `eslint.config.js`
- `postcss.config.js`
- `tailwind.config.js`
- `tsconfig.json`
- `tsconfig.app.json`
- `tsconfig.node.json`

Motivo: estes arquivos aceleram a subida do novo frontend Vite + React +
Tailwind sem depender de reconfiguracao manual.

## 4) Backend minimo do Ghost Audio

Arquivos:

- `valorantapi/package.json`
- `valorantapi/src/app.js`
- `valorantapi/src/audioProtocol.js`
- `valorantapi/src/ghostAudioEngine.js`
- `valorantapi/src/transcriptionAdapter.js`
- `valorantapi/src/whisperAdapter.js`
- `valorantapi/src/transcriptStore.js`
- `valorantapi/src/db.js`
- `valorantapi/src/routes/recordings.js`
- `valorantapi/src/routes/transcripts.js`

Motivo: este bloco sustenta o upgrade WS, o protocolo binario, a persistencia,
o fallback de transcricao e as rotas HTTP consumidas pelo frontend.

## 5) O que fica fora desta coleta inicial

Arquivos fora do pacote inicial:

- paginas e servicos de Valorant (`Dashboard`, Tracker, hardware)
- rotas de perfil competitivo e scraping do Tracker
- automacoes de testes que nao participam da captura/transcricao

Motivo: essas partes nao sao necessarias para migrar a extensao nem o frontend
de transcricoes. Mantive a coleta focada no fluxo Meet -> extensao -> backend ->
painel.

## 6) Estrutura sugerida do pacote staging

O script de coleta gera a pasta `migration-pack/` com buckets separados:

- `migration-pack/docs/`
- `migration-pack/docs/api-migration/`
- `migration-pack/api-runtime/`
- `migration-pack/extension-runtime/`
- `migration-pack/frontend-extension/`
- `migration-pack/frontend-reference/`

Assim voce consegue mover o pacote por camada, sem confundir arquivos de
producao com arquivos apenas de referencia.

## 7) Proximo passo recomendado

Depois da coleta inicial:

1. adaptar `manifest.json` para o host final
2. adaptar `wsUrl` e autenticacao do `popup.js` e `offscreen.js`
3. integrar `recordingsApi.ts` e `liveTranscriptWs.ts` no roteador do novo front
4. validar o backend com uma reuniao curta no Meet
