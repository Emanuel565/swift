# 01 - Visão Geral da Migração da API

## O que esta migração cobre

A migração da API isola o backend mínimo necessário para manter o fluxo:

1. extensão captura áudio e legendas no Chrome
2. extensão transmite áudio binário em `/ws/audio`
3. backend persiste áudio e cria status de transcrição
4. backend roda transcrição em background
5. frontend lê `/api/recordings`, `/api/transcripts` e `/ws/live-transcripts`

## Blocos mínimos que precisam viajar juntos

- servidor HTTP principal em `valorantapi/src/app.js`
- engine WS de áudio em `valorantapi/src/ghostAudioEngine.js`
- protocolo binário em `valorantapi/src/audioProtocol.js`
- persistência e migrações em `valorantapi/src/transcriptStore.js` e `valorantapi/src/db.js`
- adaptadores de STT em `valorantapi/src/transcriptionAdapter.js` e `valorantapi/src/whisperAdapter.js`
- rotas HTTP em `valorantapi/src/routes/recordings.js` e `valorantapi/src/routes/transcripts.js`

## Responsabilidades por camada

| Camada                    | Responsabilidade                                                         |
| ------------------------- | ------------------------------------------------------------------------ |
| `app.js`                  | monta Express, registra rotas HTTP e roteia upgrades WebSocket           |
| `ghostAudioEngine.js`     | autentica cliente WS, controla sessão, salva áudio e emite eventos       |
| `audioProtocol.js`        | valida e decodifica o frame binário enviado pela extensão                |
| `transcriptStore.js`      | cria schema, faz migrações e expõe CRUD de grupos, tracks e transcrições |
| `transcriptionAdapter.js` | define o fluxo de transcrição no fim da sessão                           |
| `whisperAdapter.js`       | roda Whisper local quando habilitado                                     |

## Decisão arquitetural que precisa ser preservada

O backend usa `WebSocketServer({ noServer: true })` e trata o `upgrade`
manualmente em `app.js`. Isso evita que o Express responda ao handshake WS
como HTTP comum, o que quebraria a conexão com erro de frame inválido.

## O que não faz parte desta migração mínima

- rotas de Valorant, Tracker.gg e scraping
- autenticação completa do painel, exceto o suporte a JWT no WS
- Redis, Ollama e recursos fora do Ghost Audio

Esses blocos podem continuar no monorepo, mas não são obrigatórios para levar a
extensão e o fluxo de transcrição para outro projeto.
