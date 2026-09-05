# Runbook de remediação do master review

Este documento prepara a operação; não autoriza nem afirma aplicação remota.
Preserva o estado incorporado até a PR #262, base
`0430436b9d79da1d2fb0c08a5bd7eacc8208e30e`, e não repete ingestão, julgamento,
sanções, profissão ou os campos textuais já tratados pela sessão anterior.

## Fronteiras

Separar aprovação de merge, aplicação de migrations, deploy/promoção, purge de
cache e expurgo de registros. Não executar emails reais nem inferir autorização
de conta, DNS, proxy ou retenção a partir da aprovação das correções locais.

Os drivers existentes da PR #262 foram a referência de segurança. O novo
`scripts/audit/apply-master-review-remediation-production.sh` conserva as guardas
de SHA exato, checkout limpo, main remoto, projeto Supabase exato e TLS. O
compositor `scripts/audit/apply-master-review-remediation.ts` não conecta ao
banco: produz a transação inteira antes de enviá-la ao psql.

## 1. Fechar os gates locais

Em Node 24, executar instalação limpa, lint, TypeScript, suíte unitária completa,
build, gates de ambiente/escrita/allowlists, browsers e provas PostgreSQL 17.
Não promover resultados de fixture a resultado de produção.

```bash
bash scripts/audit/replay-migrations.sh --gate
bash scripts/audit/replay-migrations.sh --schema-gate
bash scripts/audit/provar-master-review-remediation-pg17.sh
```

O último wrapper inclui as três migrations e a transação integrada. Seus
controles exercitam grants, RLS, concorrência da cota, recibos, digest do ledger,
falha intermediária, dry-run e rollback. Parser de wrappers rejeita controle de
transação adicional, sem remover os blocos PL/pgSQL.

Antes do release, repetir axe completo e os fluxos Playwright; verificar as
quatro imagens responsivas, instalação/offline e ausência de cache de dados
eleitorais. `settings:check` com skip não substitui revisão dos arquivos atuais.

## 2. Preparar o estado remoto, somente leitura

Reabrir checkout/SHA, main remoto, PR e checks, decisão da fila, deployment e
`/api/deployment-info`. Registrar separadamente SHA local, SHA mergeado e SHA
servido. Não assumir que a produção permanece na base citada neste documento.

Reconfirmar o ledger e o digest do predecessor `20260905150000`. O driver recusa
predecessor diferente, versão do pacote já presente ou drift de digest. Se outro
trabalho avançou o ledger, parar e reconciliar; não afrouxar a guarda para passar.
Checar a disponibilidade do backup e do caminho de restauração sem gerar dump
sensível em local não aprovado.

## 3. Banco antes do código dependente

Após autorização que nomeie a aplicação das três migrations, usar o driver
versionado, com `PF_DATABASE_URL`, `PF_EXPECTED_SHA` e `GITHUB_REF` fornecidos pelo
ambiente autorizado. Não colocar valores de segredos em comandos, artefatos ou
logs. O SHA esperado deve ser o commit limpo e aprovado em main, não o SHA base
deste plano.

| Ordem | Migration | Mudança e readback |
|---|---|---|
| 1 | `20260905220000_publicacao_tabelas_filhas.sql` | Acrescenta três policies restrictive sem apagar registros. Readback em `supabase/readback/20260905220000_publicacao_tabelas_filhas.readback.sql` confere ledger, policies e conjuntos de leitura anon/authenticated. |
| 2 | `20260905220100_request_ip_quota.sql` | Tabela/RPC privada de cota. `scripts/audit/readback-request-ip-quota.sql` confere função, grants, RLS e configuração de segurança. |
| 3 | `20260905220200_private_cron_execution_receipts.sql` | Tabela privada de recibos. `scripts/audit/readback-private-cron-execution-receipts.sql` reprova RLS/grants divergentes, inclusive grant público com RLS ainda ativa. |

```bash
bash scripts/audit/apply-master-review-remediation-production.sh dry-run
bash scripts/audit/apply-master-review-remediation-production.sh apply
bash scripts/audit/apply-master-review-remediation-production.sh verify
```

Cada comando acima pertence à operação de banco autorizada. `dry-run` executa o
pacote com rollback final; não é mera leitura e não deve ser usado como sonda
sem autorização. O apply grava as três versões, SQL original, autoria, digest e
rollback no ledger junto da DDL. Falha em qualquer readback ou inserção de ledger
aborta o pacote. `verify` é somente leitura. Não usar `db push` para aplicar outras
migrations por acidente.

Ainda sem executar crons reais: `published-consistency` contém manutenção que
pode apagar registros conforme flags existentes. A sonda de frescor apenas lê.

## 4. Deploy e promoção

Com banco/readbacks aprovados, seguir a fila e
`.github/workflows/staged-production-release.yml`, sem bypass manual dos gates.
Reconfirmar `VERCEL_AUTOMATION_BYPASS_SECRET` para o deployment protegido e o
deployment anterior. O preflight deve conferir o SHA imutável do merge antes do
smoke e da promoção. Não alterar o proxy da Cloudflare neste release.

O novo código depende da RPC de cota e da tabela de recibos: deploy anterior ao
banco causaria falha segura de requisições ou 503 dos crons. Não reverter essa
proteção para esconder ambiente incompleto.

## 5. Cache e comprovação pública

Após aprovação que nomeie o purge, usar `POST /api/revalidate` autenticado, com
tags da whitelist em `src/lib/revalidate-cache.ts`. Para o fechamento da falha de
publicação, conferir ficha, comparador e DTO após expiração das tags pertinentes;
o cron de 15 minutos usa stale-while-revalidate e não é purge imediato.

Provar que despublicados não são legíveis anonimamente, que registros válidos
continuam públicos, que os conjuntos históricos e a proveniência não foram
apagados e que `/api/deployment-info` retorna o SHA aprovado. Readback de banco
sozinho não prova cache, DTO ou HTML.

Observar o próximo ciclo dos crons: recibo só aparece depois de HTTP bem-sucedido.
O watchdog diário exige quatro nomes, denuncia ausência dos dois recibos e aplica
limites de 36h para consistência e 1h para cache. Esses limites não tornam a sonda
diária uma detecção em tempo real. Notificação externa permanece prova separada.

## 6. Recuperação

Preferir reverter o deployment mantendo a barreira de publicação no banco,
quando o defeito for da aplicação. Tabelas operacionais privadas podem permanecer
sem uso até a investigação. Reverter a policy de publicação reabre a exposição
original; portanto rollback integral de banco exige decisão explícita adicional,
não é reação automática a um teste visual vermelho.

Se o rollback integral tiver sido expressamente aprovado, primeiro retirar o
código dependente e depois usar o mesmo driver em modo `rollback`. Ele verifica
as três versões/digests e readbacks antes de reverter, em ordem inversa, numa
transação. Recibos são renomeados e preservados; contadores efêmeros da cota são
removidos. O ledger volta ao predecessor. Nenhuma linha eleitoral é apagada.
Não reexecutar apply cegamente após rollback: a tabela de recibos arquivada é
estado real a reconciliar antes de nova tentativa de reversão.

## 7. Pendências que não se resolvem com edição local

### MR06: assinantes nunca confirmados

Recontar no momento da operação com
`scripts/audit/readback-alerts-pending-retention.sql`, somente leitura e sem PII.
O total 17 é histórico do review. O código já
separa contagem de deleção e exige `PF_OPERATIONAL_RETENTION_ENABLED=1` mais
`PF_ALERTS_PENDING_PURGE_ENABLED=1` para apagar. A carência existente é de sete
dias após expiração, não uma nova política escolhida neste trabalho. Recomenda-se
autorizar somente o expurgo desse recorte após conferir a contagem atual e provar
a exclusão dos assinantes verificados. Não ligar flags nem chamar o cron agora.

### MR13: histórico de auditoria

Recomendação única: preparar arquivamento verificável sem exclusão e manter todo
o acervo até Thiago definir a janela e o destino privado. Antes de qualquer
descarte, exigir inventário, hashes, amostra restaurada e aprovação nomeada. Não
estabelecer TTL ou destino presumido para `candidate_changes` e `coleta_log`.

### MR16: integridade do analytics

A [FAQ oficial da Cloudflare](https://developers.cloudflare.com/web-analytics/faq/#how-can-i-enforce-subresource-integrity-sri-with-the-js-beacon)
informa que o embed manual não oferece version-pinning para SRI seguro; a injeção
automática acrescenta integridade. O modo automático exige domínio já proxied.
Recomendação única: confirmar a elegibilidade da conta e, se já compatível,
submeter a configuração automática com SRI à aprovação específica. Não mudar DNS,
ativar proxy, fixar hash de URL mutável ou desligar analytics por conta própria.

## Fontes do procedimento

- `Settings/WORKFLOWS.md` e `Settings/AUTOMATIONS_AND_ENVIRONMENTS.md`.
- `docs/RUNBOOK-DR.md`.
- `scripts/audit/apply-textos-julgamento-production.sh`, guardas da PR #262.
- Migrations, readbacks e rollbacks enumerados neste documento.
- `.github/workflows/staged-production-release.yml` e `src/app/api/revalidate/route.ts`.

Este documento não substitui os logs dos gates nem uma releitura do estado real
imediatamente antes de aplicar, promover, purgar ou reverter.
