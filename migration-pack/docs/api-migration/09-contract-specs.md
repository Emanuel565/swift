# 09 - Contract Specs

Este diretório agora também inclui uma versão formal do contrato do Ghost Audio
para facilitar a implementação em qualquer outra stack.

## Arquivos incluídos

- `contracts/http-openapi.json`
- `contracts/ws-audio.schema.json`
- `contracts/ws-live-transcripts.schema.json`

## Leitura mais rápida

Se você quer implementar a nova API sem ler o restante da pasta inteira, use
esta ordem mínima:

1. `contracts/http-openapi.json`
2. `contracts/ws-audio.schema.json`
3. `contracts/ws-live-transcripts.schema.json`
4. `03-http-and-websocket-contract.md` para o frame binário custom

## Quando usar cada um

- use `http-openapi.json` para implementar ou validar os endpoints HTTP
- use `ws-audio.schema.json` para validar as mensagens textuais e os eventos do
  fluxo `/ws/audio`
- use `ws-live-transcripts.schema.json` para validar os eventos de
  `/ws/live-transcripts`

## Como isso ajuda na migração

Com essas specs, a nova API não precisa mais ser inferida lendo o código do
Node. Qualquer backend novo pode seguir os contratos formais primeiro e depois
escolher a implementação interna.

Em outras palavras: estas specs são o ponto de entrada mais direto para portar
o runtime para FastAPI, Nest, Spring, Go, Laravel ou qualquer outra stack.

## Limite atual das specs

O frame binário de áudio ainda não está representado em OpenAPI. Ele continua
documentado em [03-http-and-websocket-contract.md](./03-http-and-websocket-contract.md)
e em `audioProtocol.js`, porque o fluxo usa WebSocket binário com header custom.

## Recomendação prática

Se a nova API estiver sendo feita em outra linguagem:

1. implemente primeiro o HTTP a partir do OpenAPI
2. implemente depois os eventos WS usando os JSON Schemas
3. por fim, implemente o frame binário custom de áudio

Essa ordem reduz muito o risco de incompatibilidade com a extensão e com o
frontend.

## Regra simples

Se a nova API passar nestes três níveis, a migração está no caminho certo:

1. HTTP compatível
2. WebSocket compatível
3. smoke test compatível
