# 01 - Visao Geral

## Objetivo

Portar uma extensao MV3 que captura audio de reunioes (Google Meet), envia para
um backend via WebSocket e recebe eventos de transcricao em tempo real.

## Componentes obrigatorios

- `popup.html` + `popup.js`: controle de inicio/parada e status.
- `background.js` (service worker): orquestra mensagens e ciclo de captura.
- `offscreen.html` + `offscreen.js`: captura, mixagem, gravacao e streaming WS.
- `content-meet.js`: captura de legendas no Meet e envio para background.

## Dependencias de arquitetura

- Extensao precisa de backend WS disponivel para sessao de audio.
- Offscreen e obrigatorio para manter `MediaRecorder` ativo com popup fechado.
- Persistencia local via `chrome.storage.local` para estado e log basico.

## O que adaptar no projeto destino

- URL de WebSocket e regras de autenticacao.
- Nome da extensao, icones e metadados do `manifest.json`.
- Estrutura de logs/telemetria (se houver padrao interno).
