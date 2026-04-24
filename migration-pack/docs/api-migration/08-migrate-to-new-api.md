# 08 - Como Migrar Tudo Isso para uma Nova API

## Objetivo

Este documento descreve como levar o fluxo completo do Ghost Audio para uma
API nova, sem quebrar a extensão Chrome nem o frontend que já consome as rotas
e eventos atuais.

Quando eu digo "nova API", existem dois cenários:

1. você vai criar um backend novo, mas quer manter o contrato atual
2. você vai trocar também o contrato e precisa adaptar extensão e frontend

O caminho mais seguro é o primeiro. A extensão e o painel já dependem de um
contrato estável, então o ideal é a nova API imitar esse contrato primeiro e só
depois evoluir internamente.

## Resposta curta

Sim: vocês conseguem implementar isso em praticamente qualquer outro tipo de
API, desde que preservem o contrato externo ou coloquem um adapter na frente da
nova implementação.

Na prática, isso significa manter compatíveis:

- os endpoints HTTP
- os eventos dos WebSockets
- o frame binário do áudio
- o shape das respostas consumidas por extensão e frontend

## O que precisa continuar funcionando

Para a migração ser transparente, a nova API deve manter estes quatro blocos:

- WebSocket de ingestão em `/ws/audio`
- WebSocket de monitoramento em `/ws/live-transcripts`
- HTTP de gravações em `/api/recordings`
- HTTP de transcrições em `/api/transcripts`

Além disso, precisa continuar aceitando:

- `auth` em modo `dev:true` ou via JWT
- `session-start` com `sessionId` e `consentVersion`
- chunks binários no protocolo atual
- `caption-partial` durante a sessão
- `session-stop` no encerramento

## Estratégia recomendada

## Caminho mais simples

Se a meta for sair do Node atual e ir para outra stack com o menor risco, use
este caminho:

1. pegue `migration-pack/api-runtime/` como comportamento de referência
2. valide o pacote com `npm run smoke:test`
3. implemente a nova API reproduzindo o mesmo contrato
4. coloque a nova API atrás do mesmo host ou de um adapter compatível
5. só depois troque a extensão e o frontend para o ambiente novo

Esse é o caminho mais usual e mais fácil de entender para quem entra no projeto
sem histórico prévio.

### Fase 1: replicar a superfície externa

Antes de reimplementar qualquer regra interna, faça a nova API responder com a
mesma superfície que o projeto atual expõe.

Checklist mínimo:

- mesma URL base ou proxy equivalente
- mesmos endpoints HTTP
- mesmos nomes de eventos WS
- mesmo formato dos payloads JSON
- mesmo protocolo binário dos chunks

Se isso estiver preservado, a extensão e o frontend continuam funcionando mesmo
que o banco, a fila, o serviço de STT ou a arquitetura interna mudem.

### Fase 2: migrar o backend de ingestão

A nova API precisa reproduzir o comportamento de ingestão de áudio:

1. autenticar a conexão
2. abrir uma sessão com `session-start`
3. validar `sessionId`
4. validar ordem de `seq`
5. acumular os blobs de áudio
6. persistir a gravação
7. registrar status `processing`
8. disparar a transcrição em background
9. emitir `transcript-ready` quando terminar

Mesmo que você troque SQLite por Postgres, fila local por Redis, ou Whisper por
um STT externo, esses passos precisam continuar existindo do ponto de vista do
cliente.

### Fase 3: migrar o armazenamento

O frontend atual espera uma estrutura lógica baseada em grupos e tracks.

A nova API precisa devolver em `/api/recordings` algo compatível com:

```json
{
  "items": [
    {
      "id": "group-id",
      "sessionId": "session-id",
      "sourceApp": "meet",
      "sourceType": "meet",
      "sourceUrl": "https://meet.google.com/...",
      "sourceHost": "meet.google.com",
      "tabTitle": "Meet: sala",
      "mimeType": "audio/webm;codecs=opus",
      "durationMs": 12000,
      "createdAt": 1710000000000,
      "tracks": [
        {
          "id": "recording-id",
          "track": "mix",
          "mimeType": "audio/webm;codecs=opus",
          "durationMs": 12000,
          "audioDeleted": false,
          "audioDeletedAt": null,
          "createdAt": 1710000000000,
          "transcript": {
            "id": "transcript-id",
            "text": "...",
            "status": "done",
            "createdAt": 1710000000000,
            "updatedAt": 1710000005000
          }
        }
      ],
      "transcript": {
        "id": "transcript-id",
        "text": "...",
        "status": "done",
        "createdAt": 1710000000000,
        "updatedAt": 1710000005000
      }
    }
  ],
  "total": 1
}
```

Você pode armazenar isso em outro modelo interno, mas a resposta externa deve
continuar compatível com `recordingsApi.ts`.

### Fase 4: migrar a transcrição

A cadeia atual de fallback é:

1. STT externo via `GHOST_AUDIO_STT_URL`
2. Whisper local
3. legendas acumuladas do Meet
4. placeholder informativo

Na nova API, você pode:

- manter exatamente essa cadeia
- simplificar para um único provedor
- delegar tudo a outro microserviço

Mas o cliente ainda precisa receber:

- `transcript-status` com `processing`
- `transcript-ready` com o texto final
- `error` ou `transcript-status=error` quando falhar

### Fase 5: migrar a integração da extensão

Depois que a nova API responder corretamente, adapte a extensão:

1. atualizar `host_permissions` em `manifest.json`
2. atualizar a URL WS usada por `popup.js` e `offscreen.js`
3. confirmar handshake `auth` -> `session-start` -> chunks -> `session-stop`
4. validar se `recording_saved` e `transcript-ready` continuam chegando

Se a nova API usar outro domínio, porta ou esquema (`wss`), esse ajuste é
obrigatório na extensão antes de testar o fluxo real.

### Fase 6: migrar a integração do frontend

O frontend usa duas superfícies:

- HTTP para listar e editar gravações e transcrições
- WebSocket para monitoramento ao vivo

Então a nova API precisa ser validada com:

- `GET /api/recordings`
- `GET /api/recordings/:id`
- `GET /api/recordings/:id/audio`
- `PATCH /api/recordings/:id/transcript`
- `GET /api/transcripts`
- `PATCH /api/transcripts/:id`
- `WS /ws/live-transcripts`

Se o domínio mudar, ajuste também o proxy do frontend ou as URLs base.

## Cenário seguro: nova API compatível

Se você quer trocar o backend sem retrabalho no cliente, siga esta ordem:

1. subir a nova API com o mesmo contrato atual
2. apontar o frontend para ela
3. apontar a extensão para ela
4. validar uma reunião curta fim a fim
5. só depois desligar a API antiga

Esse é o melhor caminho para reduzir risco.

## Cenário de ruptura: nova API com contrato diferente

Se a nova API não puder manter o contrato atual, você terá que adaptar junto:

- `extension/offscreen.js` para o novo handshake
- `extension/background.js` se houver mudança de controle de sessão
- `src/services/recordingsApi.ts` para novas respostas HTTP
- `src/services/liveTranscriptWs.ts` para novos eventos ao vivo
- páginas que consomem gravações e transcrições

Nesse cenário, o trabalho deixa de ser só migração de backend e vira migração de
backend + clientes.

## Riscos mais comuns ao migrar para outra API

- mudar o endpoint, mas esquecer `host_permissions` da extensão
- mudar o schema HTTP e quebrar `recordingsApi.ts`
- mudar nomes de eventos WS e quebrar `liveTranscriptWs.ts`
- não preservar `consentVersion` em `session-start`
- perder a ordem de `seq` ou ignorar validação de chunk duplicado
- responder HTTP normal no handshake WS e quebrar a conexão
- salvar áudio, mas não emitir `transcript-ready`

## Plano prático recomendado

### Opção A: migração por compatibilidade

Use quando a prioridade é velocidade e baixo risco.

1. copie `api-runtime/` como base
2. troque persistência, autenticação ou STT internamente
3. preserve o contrato externo
4. valide extensão e frontend sem alterar os clientes

Para reduzir risco operacional, prefira começar pelo runtime standalone que já
sai no pacote com `README.md`, `.env.example`, `scripts/` e `src/app.js`
preparados só para Ghost Audio.

Se a nova API conseguir reproduzir esse contrato ou colocar uma camada adapter
na frente dele, a migração fica viável para praticamente qualquer stack. Se não
conseguir preservar esse contrato, você ainda pode migrar, mas terá que alterar
os clientes também.

## O que eu faria na prática

Para um time novo ou para uma migração sem contexto acumulado, a sequência mais
fácil de operar é esta:

1. subir o `api-runtime` exportado
2. validar o smoke test
3. implementar o HTTP pela spec OpenAPI
4. implementar os eventos WS pelos JSON Schemas
5. por último portar o frame binário do áudio

Essa ordem é a que tende a gerar menos retrabalho.

### Opção B: migração por redesign

Use quando a prioridade é mudar o produto ou o protocolo.

1. desenhe o novo contrato
2. adapte backend
3. adapte extensão
4. adapte frontend
5. teste tudo junto

## Critério de sucesso

A migração para uma nova API está concluída quando:

- a extensão inicia e encerra uma sessão sem erro
- o áudio é persistido
- a transcrição chega ao frontend
- a listagem em `/api/recordings` continua funcional
- a tela de reunião ao vivo continua recebendo eventos

Se esses cinco pontos passarem, a troca da API foi bem-sucedida do ponto de
vista do produto.
