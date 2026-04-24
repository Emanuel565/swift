# 02 - Runtime e Dependências

## Runtime mínimo

- Node.js `>=22.0.0 <25`
- npm compatível com o lockfile ou instalação local simples
- Windows, Linux ou macOS com suporte ao binário do `better-sqlite3`

## Dependências diretamente ligadas ao Ghost Audio

| Dependência            | Papel                                  |
| ---------------------- | -------------------------------------- |
| `express`              | API HTTP                               |
| `ws`                   | WebSocket de áudio e monitoramento     |
| `better-sqlite3`       | persistência local e migrações simples |
| `dotenv`               | carga de ambiente                      |
| `jsonwebtoken`         | autenticação opcional do WS            |
| `ffmpeg-static`        | decode de WebM Opus para Whisper       |
| `@xenova/transformers` | Whisper local                          |

## Scripts importantes

Arquivo recomendado para migracao: `valorantapi/package.ghost-audio.json`

```json
{
  "scripts": {
    "start": "node scripts/check-node-version.cjs && node scripts/rebuild-sqlite.cjs --strict && node src/app.js",
    "dev": "node scripts/check-node-version.cjs && node scripts/rebuild-sqlite.cjs --strict && node --watch --watch-path=src --watch-path=.env src/app.js"
  }
}
```

## Arquivo de ambiente de referência

Use `valorantapi/.env.migration.example` como base para a API migrada. No
pacote de migração, esse arquivo acompanha o runtime em `api-runtime/.env.example`.

O runtime standalone do pacote também passa a incluir um `README.md` próprio com
os passos mínimos para bootstrap.

Ele também inclui um smoke test automatizado para validar a subida e o contrato
mínimo do Ghost Audio.

## Variáveis de ambiente que importam para a migração

| Variável                        | Obrigatória | Uso                                             |
| ------------------------------- | ----------- | ----------------------------------------------- |
| `PORT`                          | não         | porta HTTP/WS, default `3000`                   |
| `JWT_SECRET`                    | não         | permite autenticação via token no `/ws/audio`   |
| `GHOST_AUDIO_MAX_SESSIONS`      | não         | limite de sessões de áudio ativas               |
| `GHOST_AUDIO_MAX_WS`            | não         | limite de conexões WS concorrentes              |
| `GHOST_AUDIO_STT_URL`           | não         | delega transcrição para um serviço HTTP externo |
| `GHOST_AUDIO_EMIT_INGEST_DEBUG` | não         | emite eventos de debug da ingestão              |
| `WHISPER_ENABLED`               | não         | ativa Whisper local                             |
| `WHISPER_MODEL`                 | não         | modelo do Whisper                               |
| `WHISPER_LANG`                  | não         | idioma configurado                              |
| `WHISPER_TASK`                  | não         | `transcribe` ou `translate`                     |
| `SQLITE_DB_PATH`                | não         | sobrescreve o caminho local do SQLite           |

## Configuração mínima recomendada para subir a API migrada

```env
PORT=3000
GHOST_AUDIO_MAX_SESSIONS=4
GHOST_AUDIO_MAX_WS=8
WHISPER_ENABLED=false
```

## Configuração recomendada para uso com a nossa extensão

```env
PORT=3000
GHOST_AUDIO_MAX_SESSIONS=4
GHOST_AUDIO_MAX_WS=8
WHISPER_ENABLED=true
WHISPER_MODEL=Xenova/whisper-small
WHISPER_LANG=portuguese
WHISPER_TASK=transcribe
```

Se o ambiente final exigir autenticação por token no WebSocket, adicione também:

```env
JWT_SECRET=troque-em-producao
```

## Risco operacional mais comum na migração

Se `better-sqlite3` ou `ffmpeg-static` não estiverem compatíveis com o runtime,
o backend sobe parcialmente ou falha logo no start. Por isso o script atual já
faz `check-node-version` e `rebuild-sqlite` antes de iniciar.

## Observacao importante sobre o runtime do pacote

O pacote de migração agora usa um `app.js` standalone do Ghost Audio. Isso evita
dependências implícitas com rotas de Valorant e outras partes do monorepo.
