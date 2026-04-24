# 02 - Permissoes e Manifest

## Base de permissoes

Permissoes usadas pela extensao:

- `offscreen`
- `tabCapture`
- `storage`
- `activeTab`
- `tabs`
- `notifications` (opcional; atualmente desativada no fluxo principal)

Hosts necessarios:

- `https://meet.google.com/*`
- `http://127.0.0.1:3000/*` (ou host HTTP do backend destino)
- `ws://127.0.0.1:3000/*` (ou host WS do backend destino)

## Exemplo de bloco principal

```json
{
  "manifest_version": 3,
  "permissions": ["offscreen", "tabCapture", "storage", "activeTab", "tabs"],
  "host_permissions": [
    "https://meet.google.com/*",
    "http://127.0.0.1:3000/*",
    "ws://127.0.0.1:3000/*"
  ],
  "content_scripts": [
    {
      "matches": ["https://meet.google.com/*"],
      "js": ["content-meet.js"]
    }
  ]
}
```

## Decisoes de portabilidade

- Em producao, preferir `wss://` para WebSocket.
- Manter `content_scripts` restrito ao dominio necessario.
- Revisar se `activeTab` e `tabs` continuam essenciais no projeto alvo.
