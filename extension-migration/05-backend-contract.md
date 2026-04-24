# 05 - Contrato com Backend

## Integracao enterprise (actual) — `enterprise-api`

- **Upload apos a gravacao (multipart)**: `POST /transcriptions`
  - Campos: `file` (Blob/WebM, etc.), `diarizationEnabled` (`"true"`/`"false"`), opcional `folderId`.
  - Cabecalho: `Authorization: Bearer <JWT>` (omitir em modo teste com `NO_AUTH_LOCALHOST=true` no API).
- **Verificar que a API esta acessivel**: `GET /` (resposta de texto; usado pelo
  `background.js` para ping antes do upload).
- **Listagem no explorador** (web): `GET /transcriptions/explorer` (com JWT ou bypass, conforme env).

A URL base do popup deve ser **exatamente** `http://127.0.0.1:<PORT>` ou
`http://localhost:<PORT>` com o `PORT` definido no `.env` do Nest (padrao `3000` se nao
definido). Se a porta estiver errada, o `fetch` falha com **Failed to fetch**.

---

## Contrato legado (WebSocket) — nao e o fluxo do monorepo `swift` actual

## Endpoint (legado)

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
