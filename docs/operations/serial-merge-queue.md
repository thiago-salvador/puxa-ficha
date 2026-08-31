# Fila serial e release fail-closed

## Estado seguro inicial

A automação continua desligada em duas camadas:

- `.github/serial-merge-queue.json` mantém `enabled: false`;
- a variável `SERIAL_MERGE_QUEUE_ENABLED` deve permanecer ausente ou `false`.

Enquanto qualquer uma delas estiver desligada, nenhum PR avança e o workflow
privilegiado de release não executa. Publicar o código não cria secrets, não
configura a Vercel, não promove deployment, não escreve no Supabase e não ativa
a fila.

## Arquitetura e dono do lock

Há dois workflows com responsabilidades separadas:

1. `Serial merge queue` seleciona um único PR, valida o head, faz o merge e
   reconcilia o estado. Ele não promove nem desfaz um deployment.
2. `Staged production release` recebe somente o dispatch pós-merge validado,
   prova o deployment candidato em URL isolada, permite a promoção pelo
   Deployment Check, fecha a produção pública e recupera o predecessor em caso
   de falha.

O PR com `merge-queue/active` é o único dono do slot. O lock atravessa
pre-merge, merge, stage, promoção, fechamento público, rollback e incidente.
Somente `Production release closure=success` para o SHA esperado permite
`RELEASE`. Falha ou evidência ausente nunca seleciona o próximo PR.

Todos os workflows usam `cancel-in-progress: false`. O release staged usa o
grupo próprio `staged-production-release`, portanto não há dois releases de
produção concorrentes.

## Máquina de estados

| Estado | Evidência exigida | Saída permitida |
|---|---|---|
| `IDLE` | nenhum owner ativo | selecionar o PR elegível mais antigo |
| `PRE_MERGE` | head atualizado, checks exatos e fronteira sensível válida | merge do owner |
| `POST_MERGE` | `merge_commit_sha`, ponta de `main`, deployment predecessor e dispatch válido | aguardar release staged |
| `STAGED` | candidato `READY`, SHA exato, domínio ainda no predecessor e smoke completo na URL `.vercel.app` | Deployment Check verde |
| `PUBLIC_CLOSURE` | domínio público no SHA candidato e novo smoke completo | liberar o owner |
| `ROLLBACK` | predecessor exato restaurado, SHA público anterior e smoke completo | manter incidente e recuperação auditável |
| `BLOCKED` | qualquer contradição, ausência ou falha | nenhuma liberação automática |

Labels persistidas:

| Label | Uso |
|---|---|
| `merge-queue/active` | dono exclusivo do slot |
| `merge-queue/pre-merge` | atualização e checks do head |
| `merge-queue/post-merge` | merge concluído, release ainda aberto |
| `merge-queue/rollback` | recuperação em andamento |
| `merge-queue/blocked` | incidente que exige intervenção |
| `merge-queue/rollback-pr` | PR técnico de revert, excluído do FIFO normal |

Nunca remova `merge-queue/active` para destravar a fila. Isso apagaria o lock
sem provar o estado de produção.

## Checks exatos

Os nomes são parte do protocolo e estão versionados em
`.github/serial-merge-queue.json`:

- `Vercel - puxa-ficha: staged-release`: Deployment Check obrigatório. Fica
  verde somente depois de provar candidato, predecessor e smoke staged.
- `Production release closure`: readback e smoke completos no domínio público,
  associados ao SHA candidato.
- `Production rollback recovery`: restauração e smoke completos do predecessor,
  associados ao SHA anterior.
- `Serial release orchestration`: compatibilidade histórica, não é mais um gate
  obrigatório de promoção.

Ausente, pending, skipped, neutral, stale, cancelled e timed out não são verde.
Um status do nome correto em outro SHA também não é evidência.

## Identidades que precisam coincidir

O dispatch pós-merge é aceito somente quando:

- `mergeSha`, `git.sha` e a ponta de `main` são o mesmo SHA de 40 caracteres;
- o primeiro parent de `mergeSha` é `trustedSha`;
- o PR está mergeado com o mesmo `merge_commit_sha`;
- o PR ainda possui `active` e `post-merge`;
- `environment=production` e `project.name=puxa-ficha`;
- o ator é `thiago-salvador`;
- o predecessor possui ID, URL `.vercel.app`, SHA e estado `READY` previamente
  capturados.

O candidato é pesquisado na API da Vercel por project ID, team ID,
`target=production` e `meta.githubCommitSha=mergeSha`. A URL staged nunca pode
ser `puxaficha.com.br`.

O SHA público é provado por `/api/deployment-info`, exigindo HTTP 200,
`ok=true`, `environment=production`, `commitRef=main` e `commitSha` exato.

## Caminho verde

1. O coordenador captura e valida o deployment público anterior.
2. O merge dispara `serial-merge-queue-post-merge` com o payload completo.
3. A Vercel cria um deployment de target production sem trocar o alias público,
   pois o Deployment Check permanece pending.
4. O job staged confirma que produção ainda serve o predecessor.
5. `npm run release:smoke` roda contra a URL isolada e inclui prova de
   deployment, lançamento, busca, acessibilidade e pesquisas.
6. `Vercel - puxa-ficha: staged-release` fica verde. A integração da Vercel
   pode então atribuir o domínio ao candidato.
7. `Production release closure` espera o SHA exato no domínio público e repete
   o smoke completo.
8. O coordenador só remove o lock depois de ler o fechamento público verde no
   SHA esperado.

## Falhas e recovery

### Stage falho

O domínio continua no predecessor. `Record staged release incident` cria ou
atualiza uma issue deduplicada, o owner continua com lock e nenhum rollback da
Vercel é necessário. O candidato não pode receber o alias público.

### Fechamento público falho

O candidato já pode ter recebido o domínio. `Production rollback recovery`:

1. revalida o deployment predecessor capturado;
2. chama Instant Rollback usando exatamente seu ID;
3. espera `/api/deployment-info` voltar ao SHA anterior;
4. executa o smoke completo contra o domínio restaurado;
5. publica o status no SHA anterior;
6. cria ou atualiza o incidente mantendo a fila bloqueada.

Não existe rollback para "o deployment anterior" por posição temporal. O alvo
é sempre o tuple previamente provado de ID, URL e SHA.

### Rollback falho

Produção fica em estado não comprovado. O status de recovery fica failure, o
incidente é crítico e o lock não pode ser removido. A recuperação manual deve
primeiro identificar o SHA realmente público e nunca repetir um rollback por
inferência.

### Depois de Instant Rollback

Instant Rollback desativa a atribuição automática dos domínios para deployments
seguintes. Depois do revert auditável e de seus checks, é obrigatório promover
explicitamente o deployment de recuperação e repetir o fechamento público. Sem
essa promoção explícita, a automação pode parecer verde enquanto o alias
continua preso no deployment restaurado.

## Procedimento de incidente

1. Mantenha `SERIAL_MERGE_QUEUE_ENABLED=false` se for necessário pausar novos
   ciclos. Não remova labels do owner.
2. Registre PR, `mergeSha`, `trustedSha`, SHA público observado, deployment
   candidato e predecessor.
3. Classifique a falha como stage, fechamento público ou rollback.
4. Prove o estado real pelas APIs GitHub, Vercel e `/api/deployment-info`.
5. Conclua o revert auditável quando houver mudança de código em `main`.
6. Se houve Instant Rollback, faça promoção explícita do deployment de
   recuperação.
7. Repita `npm run release:smoke` no domínio público com
   `PF_EXPECTED_DEPLOY_SHA` definido.
8. Só remova o lock quando código, deployment, readback e smokes convergirem no
   mesmo SHA e os checks exatos estiverem verdes.

Merge, deploy, rollback, promoção e alterações de configuração remota exigem
autorização explícita que nomeie a ação. Este runbook não concede autorização.

## Migrations e Supabase

Migrations não usam rollback genérico. Um PR em `supabase/migrations/**` deve
declarar `databaseRollbackMode: migration-specific` e apontar artifacts de:

- aplicação forward;
- readback pós-aplicação;
- compensação específica;
- readback pós-compensação;
- workflows e checks que produzem essas provas.

Todos os caminhos devem ser relativos, permanecer no repositório e existir. Os
checks declarados precisam aparecer na lista de verificação. O release staged
não recebe credencial de escrita no Supabase e não executa SQL.

Ausência de credencial para readback direto é limitação de auditoria, não
sucesso presumido. A auditoria vigente registra separadamente receipts dos
workflows especializados e provas SQL diretas indisponíveis.

## Secrets e permissões

| Secret | Finalidade |
|---|---|
| `MERGE_QUEUE_GH_TOKEN` | API de merge, labels, statuses, dispatch e incidentes |
| `VERCEL_TOKEN` | inspeção, rollback e promoção explícita de recovery |
| `VERCEL_ORG_ID` | equipe Vercel exata |
| `VERCEL_PROJECT_ID` | projeto Vercel exato |

O código staged que roda smokes não recebe credenciais do Supabase. Actions de
terceiros são pinadas por SHA completo. `pull_request_target` nunca faz checkout
do head não confiável com tokens de escrita.

## Dry-run, ativação e pausa

Dry-run local inerte:

```bash
node scripts/merge-queue/coordinator.mjs reconcile \
  --config .github/serial-merge-queue.json \
  --dry-run
node --test tests/merge-queue/*.test.mjs
```

A ativação remota é deliberadamente separada e está em
`docs/operations/fail-closed-release-activation.md`.

Para pausar, defina primeiro `SERIAL_MERGE_QUEUE_ENABLED=false`. A config local
continua como segundo lock. Pausar não apaga owner, incidente ou recovery.

## Limites honestos

- Merge, deploy e efeitos externos não formam uma transação distribuída. O lock
  e a compensação limitam o dano e tornam a falha observável.
- GitHub Issues notificam conforme as preferências da conta.
- O pacote local não configura secrets, Deployment Checks ou variáveis remotas.
- Produção só pode ser declarada íntegra com readback atual. CI ou relatório
  anterior, isoladamente, não provam o domínio público.
