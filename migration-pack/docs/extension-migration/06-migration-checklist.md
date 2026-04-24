# 06 - Checklist de Migracao

Use esta lista para portar a extensao para outro projeto.

## 1) Estrutura da extensao

- [ ] Criar pasta da extensao MV3 no projeto destino.
- [ ] Copiar `popup`, `background`, `offscreen` e `content script`.
- [ ] Ajustar nome, icones e metadados do manifest.

## 2) Permissoes e hosts

- [ ] Configurar `permissions` (`offscreen`, `tabCapture`, `storage`, etc.).
- [ ] Configurar `host_permissions` para Meet e backend alvo.
- [ ] Validar carregamento da extensao sem erros em `chrome://extensions`.

## 3) Contrato WS com backend

- [ ] Implementar handshake `auth` e `session-start`.
- [ ] Garantir suporte a frames binarios de audio.
- [ ] Implementar `session-stop` e eventos de retorno.

## 4) Pipeline de audio

- [ ] Confirmar captura da aba.
- [ ] Confirmar captura do microfone quando `includeMic=true`.
- [ ] Confirmar envio FIFO e drenagem no stop.

## 5) Legendas e eventos

- [ ] Capturar `aria-live` do Meet com dedupe.
- [ ] Encaminhar `caption-partial` para o backend.
- [ ] Exibir eventos de status no popup.

## 6) Testes finais

- [ ] Reuniao curta com voz local e remota.
- [ ] Encerramento com persistencia do ultimo chunk.
- [ ] Transcricao final recebida e exibida no destino.
- [ ] Sem erros de permissao nem `Extension context invalidated`.
