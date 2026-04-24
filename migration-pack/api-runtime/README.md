# Ghost Audio Runtime

Pacote standalone para subir apenas a API necessaria para a extensao Ghost
Audio e para o frontend de transcricoes.

## Em uma frase

Se você quer portar isso para outra API, primeiro faça a nova implementação se
comportar como este runtime, depois troque a stack interna.

## Quando usar este pacote

Use este runtime quando você precisar de uma referência prática do comportamento
esperado da API, sem depender do restante do backend original.

## O que este runtime sobe

- `GET /`
- `GET /health`
- `WS /ws/audio`
- `WS /ws/live-transcripts`
- `CRUD /api/recordings`
- `CRUD /api/transcripts`

## O que este runtime nao sobe

- rotas de Valorant
- scraping do Tracker
- `/auth/login` e `/auth/register`

O WebSocket `/ws/audio` continua aceitando `auth` com `dev:true` ou com JWT se
`JWT_SECRET` estiver configurado.

## Bootstrap rapido

1. copie `.env.example` para `.env`
2. ajuste no minimo `PORT` e a estrategia de transcricao
3. rode `npm install`
4. rode `npm run dev`
5. opcionalmente rode `npm run smoke:test`

## Fluxo recomendado para migracao

1. suba este runtime
2. confirme `GET /health`
3. rode `npm run smoke:test`
4. implemente a nova API reproduzindo o mesmo contrato
5. valide novamente com a extensao e com o frontend

## Configuracao recomendada para primeira subida

```env
PORT=3000
GHOST_AUDIO_MAX_SESSIONS=4
GHOST_AUDIO_MAX_WS=8
WHISPER_ENABLED=false
```

## Configuracao recomendada para usar com a extensao

```env
PORT=3000
GHOST_AUDIO_MAX_SESSIONS=4
GHOST_AUDIO_MAX_WS=8
WHISPER_ENABLED=true
WHISPER_MODEL=Xenova/whisper-small
WHISPER_LANG=portuguese
WHISPER_TASK=transcribe
```

## Smoke test minimo

1. abrir `GET /health`
2. abrir `GET /api/recordings`
3. conectar o frontend em `/ws/live-transcripts`
4. apontar a extensao para `ws://127.0.0.1:3000/ws/audio`
5. gravar uma reuniao curta e confirmar `recording_saved`

## Smoke test automatizado

O pacote tambem inclui `scripts/smoke-ghost-audio-runtime.cjs`.

Ele valida:

- subida do runtime standalone
- `GET /health`
- `GET /api/recordings`
- conexao em `/ws/live-transcripts`
- handshake `auth` e `session-start` em `/ws/audio`
- persistencia e consulta da gravacao final
- fallback de transcricao por `caption-partial`

Se esse teste passar no runtime atual e também na nova API adaptada, você tem o
mesmo comportamento essencial preservado.

## Arquivos importantes

- `src/app.js`
- `src/ghostAudioEngine.js`
- `src/audioProtocol.js`
- `src/transcriptStore.js`
- `src/transcriptionAdapter.js`
- `src/whisperAdapter.js`
- `scripts/check-node-version.cjs`
- `scripts/rebuild-sqlite.cjs`
