# 03 - Contrato HTTP e WebSocket

## Endpoints mínimos expostos pela API migrada

| Tipo     | Endpoint                         | Uso                                          |
| -------- | -------------------------------- | -------------------------------------------- |
| `GET`    | `/`                              | health simples e mapa de endpoints           |
| `WS`     | `/ws/audio`                      | ingestão da extensão                         |
| `WS`     | `/ws/live-transcripts`           | monitoramento do frontend                    |
| `GET`    | `/api/recordings`                | lista grupos de gravação                     |
| `GET`    | `/api/recordings/:id`            | detalhe do grupo                             |
| `GET`    | `/api/recordings/:id/audio`      | stream do áudio principal ou da track pedida |
| `PATCH`  | `/api/recordings/:id/transcript` | edição manual da transcrição                 |
| `DELETE` | `/api/recordings/:id/audio`      | remoção do áudio                             |
| `DELETE` | `/api/recordings/:id`            | exclusão do grupo                            |
| `GET`    | `/api/transcripts`               | listagem simples de transcrições             |
| `GET`    | `/api/transcripts/:id`           | detalhe de transcrição                       |
| `PATCH`  | `/api/transcripts/:id`           | edição por id                                |
| `DELETE` | `/api/transcripts/:id`           | exclusão da transcrição                      |

## Handshake obrigatório em `/ws/audio`

Sequência correta:

1. `auth`
2. `session-start`
3. frames binários de áudio
4. `caption-partial` opcional durante a sessão
5. `session-stop`

### Auth em modo desenvolvimento

Cliente:

```json
{ "type": "auth", "dev": true }
```

Servidor:

```json
{ "type": "auth-ok", "dev": true, "userId": null }
```

### Auth com JWT

Cliente:

```json
{ "type": "auth", "token": "jwt-aqui" }
```

Servidor:

```json
{ "type": "auth-ok", "userId": "user-id", "email": "user@email" }
```

## Abertura de sessão

Cliente:

```json
{
  "type": "session-start",
  "sessionId": "uuid-v4",
  "consentVersion": 1,
  "sourceType": "meet",
  "tabUrl": "https://meet.google.com/xxx-yyyy-zzz",
  "hostname": "meet.google.com",
  "tabTitle": "Meet: xxx-yyyy-zzz",
  "mimeType": "audio/webm;codecs=opus",
  "track": "mix"
}
```

Servidor:

```json
{ "type": "session-ok", "sessionId": "uuid-v4" }
```

## Streaming binário

O payload binário usa o protocolo definido em `audioProtocol.js`.

Estrutura do frame:

```text
[0-1]   magic "GA"
[2]     versão
[3]     tipo
[4-7]   seq uint32 big-endian
[8-43]  sessionId UUID ASCII 36 bytes
[44-47] payloadLen uint32 big-endian
[48...] payload WebM Opus
```

Garantias que a API espera do cliente:

- `seq` crescente sem regressão
- `sessionId` do frame igual ao `session-start`
- envio em ordem real de captura
- flush completo antes do `session-stop`

## Eventos emitidos pelo backend

Durante ou após a sessão, o cliente pode receber:

- `auth-ok`
- `session-ok`
- `recording_saved`
- `transcript-status`
- `session-stopped`
- `transcript-ready`
- `error`

O frontend em `/ws/live-transcripts` recebe eventos como:

- `live-connected`
- `session-started`
- `transcript-status`
- `transcript-partial`
- `transcript-ready`
- `recording_saved`

## Exemplo de encerramento

Cliente:

```json
{ "type": "session-stop", "durationMs": 19332 }
```

Servidor:

```json
{
  "type": "recording_saved",
  "recordingId": "uuid",
  "groupId": "uuid",
  "track": "mix",
  "audioBytes": 310478,
  "warning": null
}
```

```json
{
  "type": "transcript-status",
  "status": "processing",
  "recordingId": "uuid",
  "groupId": "uuid",
  "track": "mix"
}
```

```json
{ "type": "session-stopped" }
```

Depois do processamento assíncrono:

```json
{
  "type": "transcript-ready",
  "recordingId": "uuid",
  "groupId": "uuid",
  "track": "mix",
  "status": "done",
  "text": "..."
}
```
