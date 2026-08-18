# Fase 4: duas proveniências do Orleans gravadas em chaves que ninguém lê

Data: 12/08/2026

## Resultado

O ato autorizado anterior foi executado por inteiro. A PR #181 corrigiu o pin de
topo do readback da `20260812123000`, foi mergeada em `main` no SHA
`5abcb53e6f987c7d20ce9d01b9414ef5ee3a02bf` e produção passou a servir esse SHA.

A Fase 4, run `31633733621`, foi muito mais longe que as anteriores e parou na
primeira divergência, como exigido:

```text
FALHA FINAL: fichas=194/194, células=970/970, silenciosas=2/0, vazias honestas=29/29.
orleans-brandao:sancoes:nunca_verificado
orleans-brandao:processos:nunca_verificado
```

O ledger gate passou (394 versões, topo `20260812124000`, 23 versões do release) e
os 23 readbacks canônicos passaram. Restam duas células silenciosas.

## Causa

Esta não é prova envelhecida, é defeito de dado da `20260812124000`, já aplicada.

Ela registrou as cinco proveniências do novo perfil Orleans, mas gravou duas
delas sob chaves de fonte que a superfície não consulta. O leitor da ficha
resolve cada célula por uma chave própria:

| célula | chave que a superfície lê | chave que a 124000 gravou |
|---|---|---|
| trajetória | `destaques-trajetoria` | `destaques-trajetoria` |
| patrimônio | `destaques-patrimonio` | `destaques-patrimonio` |
| votações | `destaques-votacoes` | `destaques-votacoes` |
| **sanções** | **`transparencia-sanctions`** | `destaques-sancoes` |
| **processos** | **`processos-curadoria`** | `destaques-processos` |

Três das cinco acertaram porque o prefixo `destaques-` é mesmo a convenção
delas. As outras duas não: sanções e processos têm chave própria, herdada dos
coletores que as alimentam.

Medição nominal em produção que fecha o diagnóstico:

- Orleans tem **zero** linhas em `transparencia-sanctions` e em
  `processos-curadoria`;
- `transparencia-sanctions` cobre **193 das 194** fichas públicas, e a única
  faltante é exatamente esta;
- `destaques-sancoes` e `destaques-processos` têm **uma linha cada, as duas do
  Orleans**, e nenhuma outra ficha do banco usa essas chaves. Elas nunca foram
  convenção: nasceram nesta migration.

## Correção

A `20260812125000` corrige **somente a chave de roteamento**. Resultado,
detalhe, url, volume, data, execução e natureza ficam idênticos, porque o
conteúdo da proveniência já estava certo: `indeterminado` mapeia para "não foi
possível verificar" no DTO, que é estado honesto e não ausência afirmada.

Nenhuma ausência é fabricada, nenhum dado do governador homônimo é transferido e
nenhuma célula vira zero. O `UPDATE` escreve um único campo, `fonte`, e o teste
focal falha se qualquer outra coluna entrar no `SET`.

Guardas fail-closed, todas provadas: dependência `20260812124000` no ledger,
identidade nominal do Orleans, exatamente duas linhas nas chaves antigas e
nenhuma fora dele, payload das linhas a mover conferido campo a campo, e destino
livre para não duplicar proveniência.

O readback da própria `20260812124000` passa a aceitar **dois estados nomeados**,
antes e depois desta correção, condicionado à presença da `125000` no ledger,
recusando qualquer outro. Isso segue a mesma disciplina das correções anteriores
e evita a quebra em cadeia que já custou três rodadas: quem escreve dado atualiza
a expectativa do readback afetado na mesma PR.

## Provas

- **dry-run completo contra a produção real**, em `begin`/`rollback`: a migration
  aplica, ledger vai a 395 com topo `20260812125000`, chaves antigas vão a zero,
  Orleans passa a ter as duas canônicas, e **os dois readbacks rodam sem levantar**
  dentro da mesma transação. Resíduo depois do rollback conferido: nenhum
  (ledger de volta a 394, as duas linhas antigas intactas);
- readback corrigido da `124000` executado read-only contra a produção **no estado
  atual**, sem a `125000`: PASS, ou seja o contrato continua válido antes da
  correção;
- harness PostgreSQL 17 com dez cenários, exit 0: pré-estado reconhecido, chaves
  movidas com payload intacto, os dois readbacks no pós-estado, reaplicação
  abortando, chave antiga ressuscitada abortando, conteúdo adulterado e ausência
  fabricada abortando, rollback exato, destino ocupado abortando, chave antiga
  fora do Orleans abortando e dependência ausente abortando;
- replay linear `--gate`: **297 aplicadas + 103 falhas = 400**, conjunto batendo
  com o manifesto. A falha da `125000` é deliberada e medida, não presumida: no
  replay a `124000` falha fechado, sua versão nunca entra no ledger, e a `125000`
  aborta na dependência em vez de rodar sobre um universo sem as linhas a mover;
- allowlist e recorte próprios, com o gate sem flag verde;
- testes focais 8/8 e os três contratos operacionais atualizados na mesma PR
  (Fase 4 passa a exigir ledger 395, topo `20260812125000` e 24 readbacks).

## Estado

Produção segue íntegra e não precisa de rollback. Falta integrar esta correção,
publicar o mesmo SHA, aplicar a `20260812125000` com transação, ledger e readback
imediato, e repetir a Fase 4. Nenhuma coleta, cron ou backfill foi executado.
