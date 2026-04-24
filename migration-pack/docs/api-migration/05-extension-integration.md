# 05 - Como a API Funciona com a Nossa Extensão

## Ponto de integração principal

A nossa extensão não conversa com o Express por rotas REST para capturar áudio.
Ela fala diretamente com a API por WebSocket em `/ws/audio` a partir do
`offscreen.js`.

## Papel de cada parte

| Parte                                 | Função                                                           |
| ------------------------------------- | ---------------------------------------------------------------- |
| `extension/popup.js`                  | coleta configuração do usuário e inicia/paralisa a sessão        |
| `extension/background.js`             | obtém `streamId`, garante o offscreen e repassa comandos         |
| `extension/offscreen.js`              | captura, mixa, abre WS e envia áudio binário                     |
| `extension/content-meet.js`           | lê legendas do Meet e envia parciais                             |
| `valorantapi/src/ghostAudioEngine.js` | valida a sessão, salva áudio, agenda transcrição e emite eventos |

## Sequência real de uma sessão com a extensão

1. usuário clica em iniciar no popup
2. `background.js` obtém o `streamId` do `tabCapture`
3. `background.js` cria ou reutiliza `offscreen.html`
4. `offscreen.js` captura aba e microfone, mistura os streams e abre `/ws/audio`
5. `offscreen.js` envia `auth`
6. `offscreen.js` envia `session-start`
7. `offscreen.js` envia chunks binários codificados por `encodeAudioChunk`
8. `content-meet.js` envia legendas ao background, que repassa ao offscreen
9. `offscreen.js` envia `caption-partial` para a API
10. ao parar, `offscreen.js` drena a fila, envia `session-stop` e fecha a sessão

## O que a API devolve que a extensão usa

- confirmação de autenticação: `auth-ok`
- confirmação da sessão: `session-ok`
- status de persistência: `recording_saved`
- status de transcrição: `transcript-status`
- resultado final: `transcript-ready`
- erros operacionais: `error`

## O que o frontend usa em paralelo

Enquanto a extensão grava, o frontend pode abrir `/ws/live-transcripts` para
mostrar eventos de sessão e transcrição. Depois, a tela de transcrições busca o
resultado consolidado em `/api/recordings`.

## Dependências de configuração entre extensão e API

Para a migração funcionar sem surpresa, alinhe estes pontos:

- `manifest.json` precisa permitir o host HTTP/WS da API migrada
- `popup.js` e `offscreen.js` precisam apontar para a nova `wsUrl`
- a API precisa aceitar `auth` em modo `dev` ou com JWT válido
- a API precisa responder com o mesmo contrato atual de eventos

## Compatibilidade mínima que não pode quebrar

Se você quiser trocar a implementação interna do backend, mantenha pelo menos:

- `/ws/audio` com a mesma sequência de handshake
- parse do protocolo binário atual
- `/ws/live-transcripts` com eventos JSON compatíveis
- `/api/recordings` e `/api/transcripts` com o formato consumido pelo frontend

Se qualquer um desses quatro pontos mudar, a migração deixa de ser transparente
para a extensão e para o painel.
