# 02 - Permissoes e Manifest

## Base de permissoes

Permissoes usadas pela extensao:

- `offscreen`
- `tabCapture`
- `storage`
- `activeTab`
- `tabs`
- `notifications` (opcional; atualmente desativada no fluxo principal)

Hosts necessarios (repo `enterprise-extension` actual):

- `https://meet.google.com/*`
- `http://127.0.0.1/*` e `http://localhost/*` (qualquer porta; use a mesma do `PORT` do `enterprise-api`)
- Para backend remoto HTTP(S), adicionar o origin explicitamente em `host_permissions`.

Legado (Ghost Audio com WebSocket): incluir tambem `ws://` / `wss://` do servidor se aplicavel.

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
