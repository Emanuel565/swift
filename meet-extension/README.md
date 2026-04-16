# Meet Transcriber Pro Extension

Extensao Chrome/Edge (Manifest V3) para captura de legendas nativas do Google Meet em tempo real, com envio resiliente para o backend da plataforma.

## Objetivo

- Capturar closed captions do Google Meet direto no DOM da reuniao.
- Enviar eventos de legenda em tempo real para a API via WebSocket.
- Bufferizar no backend para baixa latencia e tolerancia a perda de conexao.
- Preparar o pipeline de finalizacao para consolidacao e vetorizacao posterior.

## Arquitetura Atual

### Camadas

1. Popup UI (`popup.html`, `popup.css`, `popup.js`)
   - Interface de controle da extensao.
   - Exibe estado da sessao, meeting id e fila pendente.
   - Exibe aviso explicito quando a captura estiver ativa na reuniao.
   - Sincroniza automaticamente autenticacao da sessao web (sem colar token manual).
   - Exibe estado de acesso, consentimento e controles de captura.
   - Reunioes salvas ficam no frontend (aba Legendas Meet), nao na popup da extensao.

2. Service Worker (`background.js`)
   - Orquestra sessao por aba do Meet.
   - Mantem conexao WebSocket com reconexao por backoff.
   - Gerencia fila local de eventos + ACK.
   - Busca token automaticamente da sessao web via cookie `access_token`.
   - Exige login na interface web quando nao houver sessao valida.
   - Encaminha comandos START/STOP para o Content Script.

3. Content Script (`content-script.js`)
   - Observa alteracoes no DOM com `MutationObserver`.
   - Extrai segmentos de legenda (speaker/text/timestamp/sequence).
   - Extrai contexto da pagina (titulo da reuniao + participantes detectados).
   - Emite `MEET_CAPTION_SEGMENT` e heartbeat para o worker.

4. Ghost Extractor Lite (embutido no `content-script.js` + `background.js`)
   - Snapshot periodico do Meet com deduplicacao de mudancas.
   - Coleta somente metadados operacionais da reuniao (sem bypass de protecao):
     - `meetingTitle`
     - `participants[]`
     - `participantCount`
     - `captionsEnabledLikely`
   - Estado exibido no popup para facilitar monitoramento em tempo real.

## Fluxo Realtime

1. Usuario abre uma aba `https://meet.google.com/...`.
2. Usuario abre popup; extensao tenta sincronizar token automaticamente da sessao web.
3. Popup envia comando ao Service Worker.
4. Se nao houver sessao web valida, popup ainda permite abrir o painel web para login e sincronizacao.
5. Usuario aprova consentimento de direitos.
6. Worker valida autenticacao + consentimento e cria sessao.
7. Worker conecta em `/ws/meet-captions` e envia `SESSION_START`.
8. Worker ativa captura no Content Script.
9. Content Script detecta legendas e envia segmentos.
10. Worker enfileira eventos e envia para API com controle de ACK.
11. Em caso de queda, worker reconecta e continua envio da fila pendente.
12. Encerramento envia `SESSION_END`.

### Ativacao Automatica de Legendas

- A extensao tambem tenta configurar o idioma das legendas para Portugues (pt-BR/Portugues) durante a sessao.

### Roteamento do WebSocket

12. Encerramento envia `SESSION_END`.
13. Backend finaliza automaticamente a sessao e grava na tabela para acesso posterior.

- Em localhost, a extensao publica eventos no WS da API local: `ws://localhost:22211/ws/meet-captions`.
- Em producao, mesmo autenticando no site web, o WS de ingestao usa `wss://api.enterprise.swiftsoft.com.br/ws/meet-captions`.
- Isso evita handshake `200` quando o socket tenta abrir no host do frontend (`enterprise.swiftsoft.com.br`).

### Inicio Automatico da Captura

- O codigo ja contem suporte de auto-start por aba do Meet, mas no estado atual essa flag esta desativada por padrao no worker.
- O fluxo principal segue manual pela popup (`Iniciar captura`) apos autenticacao + consentimento.
- Quando o auto-start for habilitado, ele exigira sessao autenticada valida + consentimento aprovado.

## Autenticacao Automatica da Extensao

- A extensao nao depende mais de campo manual de token.
- O worker tenta ler cookie `access_token` nas origens autorizadas do site/API e sincroniza para uso interno.
- A extensao tenta validar a sessao em endpoint real (`/auth/me` ou `/api/auth/me`) antes de liberar uso.
- Em ambiente de teste local, a prioridade de autenticacao e `http://localhost:22211` (API local).
- Se existir sessao web valida, o status da popup mostra sessao verificada, a chave e a origem autenticada.
- Se nao existir sessao valida, a popup orienta login na interface web para ativar a extensao.

## Consentimento de Direitos

- A captura so inicia com consentimento aprovado no popup.
- O aceite fica salvo localmente com versao de politica.
- A data/hora do ultimo aceite aprovado e exibida na popup.
- Existe botao de revogacao para remover o consentimento a qualquer momento.
- Se o consentimento nao estiver aprovado, o worker retorna `consent_required`.
- Esse fluxo acompanha o padrao de governanca dos demais modulos (acao explicita do usuario antes da captura).

## Aviso de Captura Ativa

- Durante sessao ativa, a popup exibe o aviso: "Captura ativa nesta reunião".
- O aviso reforca para o usuario que a coleta de legendas esta em andamento naquela aba.

## Mensagens da Extensao

Envelope padrao:

```json
{
  "type": "CAPTION_SEGMENT",
  "eventId": "uuid",
  "payload": {
    "sessionId": "uuid",
    "meetingId": "abc-defg-hij",
    "speaker": "Nome",
    "text": "Trecho da legenda",
    "sequence": 42,
    "timestampMs": 1713180000000,
    "location": "https://meet.google.com/abc-defg-hij"
  }
}
```

Tipos de evento enviados:

- `SESSION_START`
- `CAPTION_SEGMENT`
- `HEARTBEAT`
- `SESSION_END`

## Padrao de UI da Extensao

A interface da extensao segue a direcao visual do `enterprise-web`:

- Base neutra zinc clara (`#ffffff`, `#f7f7f7`, `#e5e7eb`).
- Destaque primario em azul (`#1677ff`, `#0958d9`).
- Tipografia: `Inter` para texto de interface e `Merriweather` para titulo principal.
- Cartoes com borda suave, brilho leve e hierarquia limpa.
- Feedback de estado com chips semaforicos (inativo, ativo, erro).

## Estrutura da Pasta

```text
meet-extension/
	manifest.json
	background.js
	content-script.js
	offscreen.html
	offscreen.js
	popup.html
	popup.css
	popup.js
	README.md
```

## Versionamento no Git

- `meet-extension/node_modules` nao deve ser versionado.
- Instale dependencias localmente com `npm install` dentro da pasta `meet-extension`.
- O lockfile (`package-lock.json`) permanece versionado para garantir reprodutibilidade.

## Fluxo de commit neste workspace (multi-repo)

- Alteracoes deste diretorio (`swift/meet-extension`) devem ser commitadas no repositorio raiz `swift`.
- Alteracoes em `enterprise-api` e `enterprise-web` devem ser commitadas dentro de cada repositorio interno, nao aqui.
- Se `git status` na raiz mostrar `M enterprise-api` ou `M enterprise-web`, isso representa atualizacao de ponteiro (gitlink), e nao duplicacao de branch.

## Configuracao Local

1. Abra `chrome://extensions`.
2. Ative Modo de desenvolvedor.
3. Clique em Carregar sem compactacao e selecione `meet-extension`.
4. Garanta que o backend esteja ativo em `http://localhost:3000`.
5. Garanta que o backend esteja ativo em `http://localhost:22211`.
6. Suba o frontend em `http://localhost:5173` (ou outra porta livre de localhost).
7. Faça login na interface web da plataforma (mesmo ambiente da API).
8. Na popup, clique em `Sincronizar sessão web` se necessario.
9. Marque e clique em `Aprovar consentimento`.
10. Opcionalmente, revise os links `Privacidade` e `Termos` na popup.

## Testes Recomendados

Para validar o fluxo mais realista, priorize este caminho:

1. Acesse `https://enterprise.swiftsoft.com.br/transcriptions` e faça login.
2. Abra Google Meet em outra aba.
3. Abra popup da extensao e clique em `Sincronizar sessão web`.
4. Confirme se aparece `Sessão web verificada` e `Origem autenticada`.
5. Aprove consentimento e inicie a captura.

Esse teste e melhor que token manual porque valida o comportamento real de producao (sessao ativa do usuario no site + extensao).

## Testes Automatizados (Node)

Na pasta `meet-extension`, os scripts atuais sao:

```powershell
npm run test:content
npm run test:ws
npm test
```

### Variaveis de ambiente para `test:ws`

O teste de pipeline WebSocket nao usa mais credenciais hardcoded. Antes de rodar:

```powershell
$env:MEET_TEST_EMAIL="seu-email"
$env:MEET_TEST_PASSWORD="sua-senha"
npm run test:ws
```

Sem essas variaveis, o teste falha de forma explicita para evitar uso acidental de segredos no codigo.

## Comandos de Instalacao (PowerShell)

```powershell
# 1) Subir dependencias de infraestrutura
Set-Location C:\Users\manuc\OneDrive\Desktop\swift\postgre
docker compose up -d --build

Set-Location C:\Users\manuc\OneDrive\Desktop\swift\redis
docker compose up -d --build

# 2) Subir API
Set-Location C:\Users\manuc\OneDrive\Desktop\swift\enterprise-api
npm install
npm run start:dev
```

## Comandos de Visualizacao e Diagnostico

```powershell
# Verificar status dos containers
Set-Location C:\Users\manuc\OneDrive\Desktop\swift\postgre
docker compose ps

Set-Location C:\Users\manuc\OneDrive\Desktop\swift\redis
docker compose ps

# Log da API em execucao
Set-Location C:\Users\manuc\OneDrive\Desktop\swift\enterprise-api
npm run start:dev
```

No Chrome:

1. Abra `chrome://extensions`.
2. Ative `Modo de desenvolvedor`.
3. Clique em `Carregar sem compactacao` e escolha a pasta `meet-extension`.
4. Em `Meet Transcriber Pro`, clique em `Service worker` para inspecionar logs do background.

## Checklist de Uso

1. Entrar em uma reuniao Google Meet.
2. A extensao tenta ativar legendas automaticamente ao iniciar captura.
3. Abrir popup da extensao.
4. Verificar se o status de acesso mostra sessao web ativa.
5. Se necessario, clicar em `Sincronizar sessão web`.
6. Marcar o checkbox e clicar em `Aprovar consentimento`.
7. Confirmar data/hora do aceite na sessao de consentimento.
8. Validar status da aba, aviso de captura e meeting id.
9. Clicar em `Iniciar captura`.
10. Encerrar captura ao fim da reuniao.
11. Se necessario, usar `Revogar` para remover o consentimento salvo.

## Proximos Passos

- Finalizador backend: flush Redis -> persistencia relacional.
- Vetorizacao: embeddings e pgvector para busca semantica.
- Melhorias de UX no atalho popup -> painel web de Legendas Meet.

## Monitoramento Pela Interface

Para o fluxo operacional completo no frontend (lista, detalhe e snapshot ativo quase em tempo real), consulte:

- `enterprise-web/docs/meet-captions-monitoring-readme.md`
