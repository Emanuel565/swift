# 06 - Checklist de Migração da API

## Preparação

- confirmar Node 22 no ambiente alvo
- instalar dependências de `valorantapi/package.json`
- configurar `.env` mínimo com `PORT` e limites de sessão
- decidir se a transcrição será Whisper local ou STT externo

## Arquivos obrigatórios

- copiar `.env.example`
- copiar `src/app.js`
- copiar `src/ghostAudioEngine.js`
- copiar `src/audioProtocol.js`
- copiar `src/transcriptionAdapter.js`
- copiar `src/whisperAdapter.js`
- copiar `src/transcriptStore.js`
- copiar `src/db.js`
- copiar `src/routes/recordings.js`
- copiar `src/routes/transcripts.js`

## Validação da API isolada

- copiar `.env.example` para `.env` e ajustar o mínimo necessário
- subir a API e abrir `GET /`
- verificar se o processo anuncia `/ws/audio` no log de boot
- verificar se o banco SQLite foi criado sem erro
- verificar se `GET /api/recordings` retorna `{ items, total }`

## Validação com a extensão

- ajustar `host_permissions` no `manifest.json`
- ajustar `wsUrl` na extensão para o novo backend
- iniciar uma sessão curta pelo popup
- confirmar recebimento de `auth-ok` e `session-ok`
- confirmar `recording_saved` ao encerrar
- confirmar `transcript-ready` ou `transcript-status=error`

## Validação com o frontend

- abrir a tela de reunião ao vivo e conectar em `/ws/live-transcripts`
- confirmar que eventos `session-started` e `transcript-status` chegam
- abrir a tela de transcrições e conferir se a nova gravação aparece
- reproduzir `/api/recordings/:id/audio`

## Sinais de quebra comuns

- handshake WS responde HTTP e o Chrome acusa erro de frame
- `session-start` falha por falta de `consentVersion`
- chunks chegam fora de ordem e o backend descarta parte do áudio
- `/api/recordings` volta um shape antigo sem `tracks`
- `manifest.json` não autoriza o host novo e a extensão nem conecta
