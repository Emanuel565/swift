# 05 - Contrato com Backend

## Endpoint

- WebSocket de audio: `/ws/audio`

## Sequencia obrigatoria de sessao

1. `auth` (JSON texto)
2. `session-start` (JSON texto)
3. frames de audio binarios (streaming)
4. `session-stop` (JSON texto)

## Mensagens JSON (resumo)

Cliente -> Servidor:

```json
{ "type": "auth", "dev": true }
```

```json
{
  "type": "session-start",
  "sessionId": "uuid-v4",
  "sourceType": "meet",
  "tabUrl": "https://meet.google.com/xxx",
  "tabTitle": "Meet: xxx",
  "mimeType": "audio/webm;codecs=opus"
}
```

```json
{ "type": "caption-partial", "text": "texto da legenda" }
```

```json
{ "type": "session-stop", "durationMs": 19332 }
```

Servidor -> Cliente (eventos comuns):

- `auth-ok`
- `session-ok`
- `recording_saved`
- `transcript-status` (`processing`)
- `session-stopped`
- `transcript-ready` (`done`)

## Requisitos de robustez no backend

- Validar ordem de `seq` dos chunks e descartar duplicados.
- Limitar sessoes simultaneas e conexoes WS.
- Persistir audio bruto e transcricao vinculados por `recordingId`.
- Processar STT em background para nao bloquear encerramento de sessao.
