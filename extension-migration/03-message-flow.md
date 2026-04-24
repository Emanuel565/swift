# 03 - Fluxo de Mensagens

## Fluxo principal

1. Popup envia `POPUP_START` para o background.
2. Background gera `streamId` com `tabCapture.getMediaStreamId`.
3. Background garante documento offscreen e envia `OFFSCREEN_START`.
4. Offscreen conecta no backend WS e inicia envio de audio.
5. Content script envia `MEET_CAPTION_PARTIAL` para o background.
6. Background repassa como `OFFSCREEN_CAPTION` para o offscreen.
7. Popup envia `POPUP_STOP`; background envia `OFFSCREEN_STOP`.

## Contratos internos minimos

- Popup -> Background:
  - `POPUP_START` (`includeMic`, `wsUrl`)
  - `POPUP_STOP`
- Background -> Offscreen:
  - `OFFSCREEN_START` (`streamId`, `includeMic`)
  - `OFFSCREEN_CAPTION` (`text`)
  - `OFFSCREEN_STOP`
- Offscreen -> Popup/Background:
  - `GHOST_AUDIO_LEVEL`
  - `GHOST_SERVER_EVENT`

## Recomendacao para projeto destino

- Centralizar nomes de eventos em constantes para evitar drift entre arquivos.
- Versionar payloads (ex.: `schemaVersion`) quando evoluir mensagens.
