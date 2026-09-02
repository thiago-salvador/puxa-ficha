# Migrations escritas e ainda não aceitas pelo gate

Este diretório NÃO é lido por nenhum runner. O que está aqui foi escrito,
revisado e preservado, mas não passou no `replay-migrations.sh --gate` e por
isso não pode entrar em `supabase/migrations/` sem travar o CI inteiro.

## vocabulário de `situacao_candidatura` (16/08/2026)

Duas migrations que fecham o vocabulário do campo `situacao_candidatura` em três
valores mais NULL, com CHECK constraint. O diagnóstico que as motivou continua
válido e é forte: o pacote `consulta_cand` de 2026 traz
`DS_SITUACAO_CANDIDATURA = "#NE"` em **20.456 de 20.456** candidaturas, ou seja,
a fonte não distingue nada. As sete grafias que a base usava eram três redações
do mesmo fato único, inventando distinção que a fonte não faz.

**Por que saíram daqui:** o gate do replay linear as marca como falha NOVA. Em
17/08/2026 gastei três rodadas de CI tentando descobrir o motivo e o gate não
consegue dizer: ele lê os nomes de um arquivo e os erros de outro, e a junção
não casa, então o motivo sai vazio. Duas melhorias já foram feitas no script
nesse caminho (capturar `FATAL` e `PANIC` além de `ERROR`, e imprimir o motivo
junto do nome), mas a junção continua quebrada e é um defeito próprio do gate,
não das migrations.

**Para retomar**, nesta ordem:
1. Consertar a junção nome/erro no `--gate` de `scripts/audit/replay-migrations.sh`.
2. Rodar o replay e ler o motivo real destas duas.
3. Se falharem por guard deliberado, elas entram no manifesto congelado
   `scripts/audit/falhas-replay-linear.json` de propósito, que é o trinco 2.
   Se falharem por defeito, corrigir a migration.
4. Só então mover de volta para `supabase/migrations/`.

Nada aqui foi aplicado no banco de produção.

### Diagnóstico de 02/09/2026 (antes de retomar)

O gate foi rodado localmente em PostgreSQL 17 nesta data: a junção nome/erro
já imprime o motivo (`GATE: falha NOVA ... motivo: ...`), então o passo 1 acima
está feito. O que impede a retomada agora não é o gate, é o dado:

- A tabela `candidatos` tem **328 linhas** (eram 296 em 16/08), e o censo exato
  da migration 1 (154/79/19/44) só vale para 296; ela ignora o censo em outro
  tamanho, então não quebra, mas a evidência do cabeçalho está desatualizada.
- Duas grafias novas entraram depois de 16/08 e **não estão mapeadas** pela
  migration 1, então a migration 2 (o CHECK) falharia na aplicação:
  - `pedido de registro no TSE; código oficial -3 (#NE) no snapshot de 27/08/2026`
    em 2 fichas publicáveis (`rico-pinheiro` e `well-macedo`, gravadas em
    29/08 pela migration de integridade do roster). É o mesmo fato `#NE`, e o
    destino natural é `aguardando julgamento`.
  - `renúncia` em 1 ficha não publicável (`cleber-rabelo`, `status = removido`),
    o mesmo caso de `desistente`: valor de `status` na coluna errada, destino
    NULL.
- A migration de 29/08 mostra que ainda existe caminho de escrita que grava
  texto livre nesta coluna. Fechar o CHECK sem antes fazer esse caminho
  escrever só o vocabulário quebraria a próxima ingestão.

Para retomar: (a) mapear as duas grafias na migration 1 e atualizar o censo;
(b) localizar o ponto de escrita da grafia de 27/08 e fazê-lo emitir o
vocabulário; (c) só então rodar o replay, tratar o resultado pelo passo 3 acima
e mover o par de volta. Nada disso foi feito nesta data.

## O teste que acompanha

`situacao-candidatura-dominio.test.ts.pendente` veio junto, com a extensão
trocada para não ser coletado pelo runner. Ele confere que o CHECK do banco e a
lista de `src/lib/situacao-candidatura.ts` são o mesmo conjunto na mesma ordem,
que a migration não carimba `ultima_atualizacao`, que o bloco de conferência
falha alto, e que o par dado/DDL continua separado. É teste bom e deve voltar
junto com as migrations, renomeado de volta para `.test.ts` em `app/tests/`.

`src/lib/situacao-candidatura.ts` FICA onde está: é só a lista do domínio e já
é importada por `published-consistency.ts`. Sem o CHECK no banco ela não mente,
apenas ainda não é garantida pelo schema.

## A autorização de escrita

`allowlist-vocabulario-situacao-20260816.json` veio junto, e o recorte
`vocabulario-situacao-20260816` saiu de `scripts/audit/recortes.json`. O gate
`audit:cobertura:allowlist` reprova allowlist declarada que não confere escrita
nenhuma, com a razão certa: "autorização que ninguém checou". Como as migrations
que ela autorizava saíram do diretório, ela deixou de exercitar qualquer coisa.
Ao retomar, os três voltam juntos: as duas migrations, a allowlist e a entrada
em `recortes.json`.
