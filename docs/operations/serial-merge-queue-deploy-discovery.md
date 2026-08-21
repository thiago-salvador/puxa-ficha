# Descoberta de deploy, smoke e rollback da fila serial

Data da leitura: 2026-08-21. Escopo: GitHub, Vercel, produção pública e
artefatos locais do Supabase. Toda a descoberta foi somente leitura. Nenhum
deploy, promoção, rollback, push, comentário ou escrita de banco foi executado.

## Decisão

A fila só é segura se separar **build** de **publicação**. O merge continua
ocupando o único slot até que o CI do SHA mergeado, o deployment Vercel desse
mesmo SHA e os smokes executados depois da publicação passem. Se qualquer etapa
falhar, o slot muda para recuperação e não pode selecionar outro PR.

O comportamento atual não basta: o push em `main` dispara CI e deploy Vercel em
paralelo. Assim, um build pode receber o domínio de produção antes do CI da
`main` terminar. A implantação da fila precisa reter a atribuição do domínio,
por Vercel Deployment Checks ou por um deployment de produção com
`--skip-domain`, e promover somente depois dos gates. A documentação oficial
confirma tanto o deploy automático da production branch quanto a possibilidade
de criar build sem atribuir o domínio:

- <https://vercel.com/docs/git>
- <https://vercel.com/docs/deployment-checks>
- <https://vercel.com/docs/cli/deploying-from-cli>

## Estado observado

| Superfície | Evidência de 2026-08-21 |
|---|---|
| Repositório | `thiago-salvador/puxa-ficha`, branch padrão `main` |
| Gatilho de deploy | integração Git da Vercel: não existe workflow Vercel no repositório; `vercel[bot]` cria GitHub Deployments em `Preview` e `Production` |
| Projeto Vercel | `thiagosalvador/puxa-ficha`, Next.js, raiz `.`, Node 24.x, região de funções `gru1` no `vercel.json` |
| `main` observada | `ca2a0c8b6bc7c02a0123ab7c3fe3eab15e43638d` |
| Production observada | GitHub Deployment `6029867815`, estado `success`, mesmo SHA da `main` |
| Deployment Vercel | `dpl_3mPLgNFgoi1ZCdvQhjckFEXyTC3Q`, `Ready`, URL `https://puxa-ficha-fw605pzot-thiagosalvador.vercel.app` |
| Domínio público | `https://puxaficha.com.br` respondeu HTTP 200, `server: Vercel`; `/api/deployment-info` respondeu `ok=true`, `environment=production`, `commitRef=main` e o mesmo SHA |
| Production anterior | GitHub Deployment `6028111410`, SHA `8e30f5e6bfc5448bf4dfa383d414694eff26d563`, URL `https://puxa-ficha-q58kpbxdl-thiagosalvador.vercel.app`, estado `success` |

`vercel inspect` mostra os aliases no deployment atual, mas o endpoint
`/api/deployment-info` devolve `deploymentId=null`. Portanto, a prova canônica
do código no domínio deve usar o SHA do endpoint, não depender desse campo
nulo.

## Gate que prova produção

Um SHA `S` só pode ser declarado publicado quando todas as condições abaixo
forem verdadeiras na mesma execução:

1. `S` é o SHA mergeado e ainda é a ponta da `main`.
2. Todos os check runs e check suites aplicáveis a `S` terminaram em estado
   aceito. Check ausente, pendente, cancelado, expirado ou neutro não vira verde
   por interpretação.
3. Existe GitHub Deployment em ambiente `Production`, com `sha=S`, cujo status
   mais recente é `success` e fornece `environment_url`.
4. `vercel inspect <environment_url>` mostra `target=production` e
   `status=Ready`.
5. `https://puxaficha.com.br/api/deployment-info` responde HTTP 200 com
   `ok=true`, `environment=production`, `commitRef=main` e `commitSha=S`.
6. Os smokes abaixo rodam depois das condições 3 a 5 e passam contra o domínio
   público:

   ```bash
   npx tsx scripts/smoke-lancamento.ts
   npm run test:search-smoke
   PF_BASE_URL=https://puxaficha.com.br npm run test:a11y
   ```

7. Quando o secret de runtime estiver disponível no Actions, o endpoint
   privado também passa com `.ok == true` e `.total == 5`:

   ```bash
   curl -fsS -H "Authorization: Bearer ${PF_RUNTIME_SMOKE_SECRET}" \
     https://puxaficha.com.br/api/internal/runtime-smoke |
     jq -e '.ok == true and .total == 5'
   ```

O workflow atual `a11y-producao.yml` não serve sozinho como prova pós-deploy.
Ele dispara no mesmo `push` da `main` e não espera a Vercel, portanto pode testar
o deployment anterior. A fila deve executar a mesma suíte depois de confirmar o
SHA público.

## Recuperação sem liberar o slot

Antes do merge, o coordenador grava um snapshot imutável:

- `main_before_sha`;
- GitHub Deployment de produção anterior;
- URL e ID Vercel do deployment anterior;
- resposta válida de `/api/deployment-info`;
- assinatura dos smokes verdes anteriores.

### Build ou deployment falhou antes de assumir o domínio

1. Manter o slot no estado `RECOVERING`.
2. Confirmar que o domínio continua respondendo o `main_before_sha`. Se sim,
   não executar rollback Vercel redundante.
3. Criar o revert do merge em PR de recuperação, sem pular branch protection.
4. Esperar checks do PR, merge do revert, checks da nova `main` e deployment do
   SHA de revert.
5. Provar que a árvore do SHA de revert é igual à árvore anterior e executar o
   gate de produção completo.

Falha de build não altera um deployment imutável já publicado, mas a restauração
do código ainda é necessária porque a `main` já contém o merge que falhou.

### Smoke falhou depois de o novo deployment assumir o domínio

1. Manter o slot no estado `RECOVERING` e notificar a assinatura da falha.
2. Executar Instant Rollback para o deployment anterior conhecido como verde.
3. Esperar `vercel rollback status puxa-ficha` terminar sem erro.
4. Provar no domínio público que o SHA voltou para `main_before_sha` e repetir
   os smokes.
5. Criar e concluir o PR de revert do código, mantendo o mesmo slot.
6. Esperar o deployment Vercel do SHA de revert ficar `Ready`.
7. Promover explicitamente esse deployment e repetir o gate completo.

A etapa 7 é obrigatória. Segundo a Vercel, Instant Rollback desliga a
atribuição automática de domínios de produção. `vercel promote` desfaz o estado
de rollback e reativa a atribuição automática:
<https://vercel.com/docs/instant-rollback>.

Os comandos mutáveis abaixo pertencem à futura automação e **não foram
executados nesta descoberta**:

```bash
vercel rollback <previous-production-deployment> --scope thiagosalvador --yes
vercel rollback status puxa-ficha --scope thiagosalvador
vercel promote <revert-deployment> --scope thiagosalvador --yes
```

Se rollback, revert, promoção ou smoke de restauração falhar, o slot permanece
preso no mesmo PR. A fila não tem caminho de `finally` que selecione o próximo
PR.

## Banco e efeitos externos

Rollback Vercel troca ponteiros entre deployments imutáveis. Ele não desfaz
Postgres, email enviado, chamada de API externa, objeto em Storage, revalidação
de cache ou trabalho iniciado por cron.

A varredura estática encontrou 425 migrations versionadas. Entre elas, ao menos
30 contêm DDL destrutivo, 33 contêm `DELETE`, 105 contêm `UPDATE` e 218 contêm
`INSERT`. Há 63 migrations com `@write`, zero com anotação genérica
`@rollback`, e apenas dois scripts cujo nome contém `rollback`. As categorias se
sobrepõem e os números são um detector conservador, não uma prova semântica.

O gate atual `audit:cobertura:allowlist` prova que escritas declaradas estão no
recorte autorizado de tabela, identidade, campos e cardinalidade. Ele não prova
reversibilidade. O workflow `replay-migrations.yml` executa SQL em Postgres 17
descartável e também não restaura produção. O único
`scripts/audit/provar-rollback.sh` inspecionado prova uma migration específica,
não a árvore inteira.

Existem ainda superfícies com efeito externo:

- `apply-chapas-2026.yml` e `apply-chapas-2026-biografias.yml` escrevem no banco
  por dispatch manual;
- os crons definidos em `vercel.json` chamam envio de digest, atualização de
  notícias, consistência publicada, runtime smoke e revalidação de cache;
- `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` e
  `PF_REVALIDATE_SECRET` habilitam operações que um rollback de código não
  desfaz;
- o backup lógico diário roda às 02:30 de Brasília e tem retenção de 14 dias. As
  cinco execuções mais recentes observadas estavam verdes, mas esse snapshot
  pode perder alterações posteriores e só tem procedimento documentado para
  restaurar em projeto novo;
- o próprio repositório contém afirmações conflitantes sobre PITR: o cabeçalho
  de `backup-db.yml` diz que Point in Time foi visto no painel, enquanto
  `scripts/backup-supabase.sh` diz que a ativação e retenção ainda não foram
  confirmadas. A automação deve tratar PITR como indisponível até uma prova viva
  e versionada resolver a divergência.

O checkout não está ligado a um projeto Supabase. `supabase migration list
--linked` falhou antes de consultar o remoto. Isso reforça que o histórico local
não prova o ledger de produção.

## Contrato fail-closed para PR irreversível

Qualquer PR que tocar uma superfície de risco fica bloqueado antes do merge:

- `supabase/migrations/**`, `supabase/migrations-pendentes/**` ou
  `supabase/rollback/**`;
- workflows ou scripts que usem `SUPABASE_DB_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `CRON_SECRET` ou façam POST de
  produção;
- `vercel.json`, rotas de cron, revalidação, ingestão, email, Storage ou APIs
  externas com escrita;
- configuração de domínio, ambiente, billing, DNS ou credenciais.

Para sair do bloqueio, o PR precisa trazer um manifesto versionado e validado
que contenha:

1. classificação `reversible-code`, `database-change` ou `external-effect`;
2. inventário exato do que muda e da identidade dos registros afetados;
3. pré-condições e pós-condições executáveis;
4. compensação ou rollback específico, idempotente e com guardas de
   cardinalidade;
5. prova em ambiente descartável de aplicar, ler, compensar e comparar o estado
   final com o baseline;
6. prova de backup restaurável e janela máxima de perda quando houver dados;
7. aprovação nomeada para qualquer escrita remota ou outro efeito irreversível.

Sem manifesto, sem grader verde, sem autorização nomeada ou sem recuperação
verificável, o PR recebe feedback, permanece como o PR ativo e não é mergeado.
Backup genérico, `@write`, replay local ou a frase “há rollback” não satisfazem
esse contrato.

## Credenciais por nome

Secrets do GitHub Actions observados, sem leitura de valores:

- `BACKUP_ENCRYPTION_KEY`
- `PF_REVALIDATE_SECRET`
- `SUPABASE_ANON_KEY`
- `SUPABASE_DB_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL`
- `TRANSPARENCIA_API_KEY`

Nomes relevantes observados na Vercel Production:

- `CRON_SECRET`
- `PF_INTERNAL_TOKEN`
- `PF_REVALIDATE_SECRET`
- `RESEND_API_KEY`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL`

A futura automação de recuperação ainda precisa provisionar, sem copiar valores
para o repositório:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `PF_RUNTIME_SMOKE_SECRET`, com o mesmo valor autorizado de `CRON_SECRET`

A autenticação local atual da Vercel não é credencial portátil para GitHub
Actions. O worktree também não contém `.vercel/project.json`, portanto o
workflow deve usar IDs e escopo explícitos.

## Critério de liberação do próximo PR

O próximo PR só pode ser selecionado em um destes estados finais:

- `PUBLISHED`: SHA mergeado é a `main`, é o SHA público e todos os checks e
  smokes estão verdes;
- `RECOVERED`: SHA de revert é a `main`, sua árvore é igual à árvore anterior, é
  o SHA público, a atribuição automática de domínio está reativada e todos os
  checks e smokes estão verdes.

Não existe liberação em `FAILED`, `TIMED_OUT`, `ROLLBACK_PENDING`,
`REVERT_PENDING`, `PROMOTION_PENDING` ou com prova ausente.
