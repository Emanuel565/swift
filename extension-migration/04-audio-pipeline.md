# 04 - Pipeline de Audio

## Captura e mixagem

- Captura da aba via `getUserMedia` com `chromeMediaSourceId` (stream da tab).
- Captura opcional de microfone via `getUserMedia({ audio: true })`.
- Mixagem em `AudioContext` com `MediaStreamDestinationNode`.
- `MediaRecorder` grava stream mixado em `audio/webm;codecs=opus`.

## Regras criticas (nao quebrar)

1. Incrementar `seq` de chunk de forma sincrona dentro de `ondataavailable`.
2. Enfileirar chunks em FIFO e enviar um por vez no worker.
3. Ao parar sessao, drenar fila antes de fechar WebSocket.
4. Nao chamar `requestData()` antes de `stop()` para evitar duplicacao.

## Telemetria recomendada

- Medidor RMS a cada ~300ms para UX de nivel de audio.
- Alerta de silencio apos janela continua (ex.: 3s).
- Logar inicio, stop, erros de permissao e erros de rede.

## Validacao minima

- Teste solo (sem outros participantes): sua voz precisa chegar no backend.
- Teste com audio da aba: audio remoto precisa chegar no backend.
- Teste de stop: ultimo chunk precisa ser persistido sem perda.
