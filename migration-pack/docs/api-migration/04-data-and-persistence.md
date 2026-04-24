# 04 - Dados, SQLite e Migrações

## Banco usado pela API migrada

A API usa SQLite local via `better-sqlite3`. O módulo central é
`valorantapi/src/transcriptStore.js`.

## O que esse módulo faz na prática

- cria tabelas se ainda não existirem
- aplica migrações incrementais de colunas antigas
- normaliza o modelo atual em `recording_groups`, `recordings` e `transcripts`
- expõe os helpers usados pelas rotas HTTP e pelo `ghostAudioEngine`

## Modelo atual de dados

### `recording_groups`

Representa a sessão lógica vista pelo frontend.

Campos principais:

- `id`
- `session_id`
- `user_id`
- `source_type`
- `source_app`
- `source_url`
- `source_host`
- `tab_title`
- `mime_type`
- `duration_ms`
- `created_at`

### `recordings`

Representa cada track física da sessão.

Campos relevantes:

- `id`
- `group_id`
- `track` com valores `mix`, `tab` ou `mic`
- `session_id`
- `audio_blob`
- `audio_deleted_at`

### `transcripts`

Representa a transcrição vinculada a uma track.

Campos relevantes:

- `id`
- `recording_id`
- `text`
- `status`
- `created_at`
- `updated_at`

## Migrações já embutidas no código

Ao migrar a API, preserve a lógica de bootstrap do `transcriptStore.js`, porque
ela já cobre cenários de evolução do schema:

- adiciona `source_type` se a base for antiga
- adiciona `audio_deleted_at` se faltar
- adiciona `group_id` e faz backfill com `id`
- adiciona `track` com default `mix`
- cria `recording_groups` e popula a partir das linhas antigas
- cria ou evolui `transcripts` com `recording_id`, `status` e `updated_at`

## Por que isso importa para a migração

O frontend atual não consome mais uma gravação linear única. Ele consome grupos
com tracks, e escolhe a transcrição preferencial em ordem `mix`, `tab`, `mic`.
Se a API migrada perder esse modelo, a UI continua abrindo, mas com respostas
incompatíveis com `recordingsApi.ts`.

## Regras de deleção expostas hoje

- `DELETE /api/recordings/:id` remove grupo, tracks e transcrições associadas
- `DELETE /api/recordings/:id/audio` apaga apenas o blob de áudio
- `DELETE /api/transcripts/:id` remove apenas a transcrição alvo

## Estratégia recomendada para migrar o banco

1. leve `db.js` e `transcriptStore.js` sem reescrever a camada
2. suba a API apontando para um banco vazio primeiro
3. valide criação automática das tabelas
4. só depois tente apontar para uma base antiga, se existir legado
5. confira se `GET /api/recordings` retorna `items`, `total`, `tracks` e `transcript`
