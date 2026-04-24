# Documentação do Projeto Radiante

Esta pasta contém a documentação técnica detalhada do projeto.

## Índice

| Documento                                                        | Descrição                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [ARCHITECTURE.md](./ARCHITECTURE.md)                             | Visão geral da arquitetura do monorepo (frontend + backend + extensão)         |
| [GHOST_AUDIO.md](./GHOST_AUDIO.md)                               | Pipeline completo de captura, transmissão e persistência de áudio              |
| [WHISPER.md](./WHISPER.md)                                       | Configuração do Whisper local (transcrição offline)                            |
| [EXTENSION.md](./EXTENSION.md)                                   | Como a extensão Chrome funciona por dentro (offscreen, mix, WebSocket)         |
| [extension-migration/README.md](./extension-migration/README.md) | Guia prático para portar a extensão para outro projeto                         |
| [api-migration/README.md](./api-migration/README.md)             | Guia prático para portar a API do Ghost Audio e o contrato dela com a extensão |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)                       | Problemas comuns e soluções rápidas                                            |
| [TESTING.md](./TESTING.md)                                       | Bots de teste automatizados (flow, speech, check-extension)                    |
| [CHANGELOG.md](./CHANGELOG.md)                                   | Histórico das correções e melhorias                                            |

## Quick links

- **Código fonte do backend**: [`../valorantapi/src/`](../valorantapi/src/)
- **Código fonte da extensão**: [`../extension/`](../extension/)
- **Código fonte do frontend**: [`../src/`](../src/)
- **Scripts de teste**: [`../valorantapi/scripts/`](../valorantapi/scripts/)
