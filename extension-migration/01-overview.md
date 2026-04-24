# 01 - Visao Geral

## Objetivo (monorepo `swift` / `enterprise-extension`)

A extensao **Transcriber ProV2** em `../enterprise-extension` grava o Meet (aba +
microfone) no **offscreen**, devolve o `ArrayBuffer` ao **service worker** e este
faz **upload HTTP** para o `enterprise-api` em `POST /transcriptions` (o fluxo
WebSocket descrito em versoes antigas desta doc **nao** e o caminho activo de
ingestao no Nest).

## Componentes

- `popup.html` + `popup.js`: `POPUP_START` / `POPUP_STOP`, **API Base URL** (host
  igual ao `PORT` do Nest, ex. `http://127.0.0.1:3000`), modo teste com
  `NO_AUTH_LOCALHOST` no servidor.
- `background.js`: `tabCapture`, offscreen, `fetch` + `FormData` para `/transcriptions`,
  ping `GET {base}/` para falhar cedo se a URL/porta estiver errada.
- `offscreen.html` + `offscreen.js`: `MediaRecorder` (sem `fetch` de rede).
- `content-script.js`: legendas (opcional para o envio de audio.

## Dependencias

- `enterprise-api` a escuta na **mesma** origem que a **API Base URL** do popup.
- Offscreen continua necessario com o popup fechado.
- `chrome.storage.local`: URL e logs.

## O que ajustar

- Porta (`.env` `PORT` no Nest, padrao 3000); JWT ou bypass local; `host_permissions`
  no `manifest.json` para o host:porta usado.

## Documentacao legada (outros projetos)

Blocos abaixo descreviam o Ghost Audio com WebSocket; mantem-se so como referencia
se fores portar o protocolo antigo.

---

## Objetivo (legado)

Portar uma extensao MV3 que captura audio de reunioes (Google Meet), envia para
um backend via WebSocket e recebe eventos de transcricao em tempo real.

## Componentes obrigatorios (legado)

- `popup.html` + `popup.js`: controle de inicio/parada e status.
- `background.js` (service worker): orquestra mensagens e ciclo de captura.
- `offscreen.html` + `offscreen.js`: captura, mixagem, gravacao e streaming WS.
- `content-meet.js`: captura de legendas no Meet e envio para background.

## Dependencias de arquitetura (legado)

- Extensao precisa de backend WS disponivel para sessao de audio.
- Offscreen e obrigatorio para manter `MediaRecorder` ativo com popup fechado.
- Persistencia local via `chrome.storage.local` para estado e log basico.

## O que adaptar no projeto destino (legado)

- URL de WebSocket e regras de autenticacao.
- Nome da extensao, icones e metadados do `manifest.json`.
- Estrutura de logs/telemetria (se houver padrao interno).
