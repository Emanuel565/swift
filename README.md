# Swift Workspace (Multi-repo)

Este workspace usa modelo **multi-repo**.

## Regra de commit por pasta

- `swift/enterprise-api`: mudanças de backend/API.
- `swift/enterprise-web`: mudanças de frontend web.
- `swift/postgre` e `swift/redis`: infraestrutura e docker/serviços locais.

## Repositório da extensão Meet

- O código da extensão foi separado para: `https://github.com/Emanuel565/meet-extension` (temporário).
- Commits de evolução da extensão devem acontecer nesse repositório dedicado.
- Este repositório `swift` mantém apenas o workspace agregador dos projetos.

## Quando commitar na raiz `swift`

Use commit na raiz apenas para:

- ajustes de documentação/higiene do próprio workspace (ex.: `.gitignore`, este `README`);
- atualização dos ponteiros dos repositórios internos quando necessário.

## Como ler mudanças de ponteiro (gitlink)

Se `git status` na raiz mostrar algo como:

- `M enterprise-api`
- `M enterprise-web`

isso indica que houve novos commits dentro desses repositórios internos.
Não significa duplicação de branch.

## Checklist rápido pré-commit

- confirmar que não entrou `node_modules` em nenhum commit;
- remover credenciais hardcoded e usar variáveis de ambiente;
- validar se o commit será na raiz `swift` ou no repositório interno correto;
- revisar `git status` antes de commitar;
- se alterar repositório interno, commitar nele primeiro e depois atualizar ponteiro na raiz (quando aplicável).
