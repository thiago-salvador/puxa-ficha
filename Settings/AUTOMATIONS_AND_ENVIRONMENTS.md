# Automações e ambientes

## Ambientes

| Ambiente | Uso | Regra |
|---|---|---|
| Local | Desenvolvimento, testes e auditorias | Node 24; `.env.local` fora do Git; banco remoto só com comando explicitamente seguro. |
| Preview | Revisão de PR na Vercel | Não pressupor segredos ou permissão de escrita; validar UI com dados não destrutivos. |
| Produção | `puxaficha.com.br` e Supabase ligado | Escrita apenas por workflow autorizado; sempre fazer readback. |

O projeto Vercel de produção usa Next.js, Node 24.x e região `gru1`. O Supabase
ligado é a autoridade operacional de dados; migrations locais continuam sendo a
autoridade versionada do schema e dos snapshots.

## Variáveis de ambiente

Use [`.env.example`](../.env.example) como ponto de partida e copie somente as
chaves necessárias para `.env.local`. O exemplo contém placeholders ou valores
locais inofensivos, nunca credenciais. Service role, tokens de banco e chaves de
ingestão nunca recebem prefixo `NEXT_PUBLIC_`.

O inventário abaixo cobre leituras estáticas em TypeScript, JavaScript, Python,
shell e GitHub Actions. `node scripts/check-env-contract.mjs` falha quando o
código passa a ler uma variável sem classificação, quando o exemplo ganha uma
chave sem uso real ou quando aparece um valor de exemplo fora da allowlist
segura.

<!-- env-contract:start -->

### Aplicação e integrações

**Alertas e email:** `RESEND_API_KEY`, `PF_ALERTS_FROM_EMAIL`, `SMTP_FROM`,
`PF_ALERTS_REPLY_TO_EMAIL` e `NEXT_PUBLIC_ALERTS_EMAIL_ENABLED`.

| Variáveis | Contexto | Obrigatoriedade e fallback | Responsável |
|---|---|---|---|
| `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto para aplicação e scripts | Uma das duas é obrigatória em produção. A forma sem prefixo vence; a pública é compatibilidade e cliente. | Vercel ou operador local |
| `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Leitura pública do Supabase | Uma das duas é obrigatória em produção. A forma sem prefixo vence. | Vercel ou operador local |
| `SUPABASE_SERVICE_ROLE_KEY` | Rotas e scripts privilegiados | Obrigatória em produção e em operações que escrevem. Nunca expor ao cliente. | Vercel ou GitHub secret |
| `CRON_SECRET`, `PF_REVALIDATE_SECRET` | Autenticação de crons e revalidação | Obrigatórias em produção. Ausência falha o boot porque cron ou revalidação quebrariam em silêncio. | Vercel; o mesmo valor necessário é espelhado no GitHub quando o workflow chama a rota |
| `PF_QUIZ_SHORT_LINK_SALT`, `PF_ALERTS_TOKEN_SALT`, `PF_ALERTS_TOKEN_ENCRYPTION_KEY` | Hash e criptografia de tokens | Obrigatórias em produção. A chave de criptografia precisa ter 64 caracteres hexadecimais. Em desenvolvimento existem fallbacks explícitos apenas para salts. | Vercel |
| `PF_ALERTS_IP_SALT` | Hash de IP dos limites duráveis | Opcional quando `PF_QUIZ_SHORT_LINK_SALT` existe; cai para ele. Em desenvolvimento ainda há fallback local. | Vercel |
| `RESEND_API_KEY` | Transporte de email | Degradável: sem valor, a aplicação pública sobe e o envio de alertas falha com log. | Vercel |
| `PF_ALERTS_FROM_EMAIL`, `SMTP_FROM` | Remetente dos emails | O primeiro vence e `SMTP_FROM` é alias legado. Ausência usa o fallback do código; formato inválido degrada somente email. | Vercel |
| `PF_ALERTS_REPLY_TO_EMAIL` | Endereço de Reply-To enviado ao Resend no campo `reply_to` | Obrigatória para o transporte de email e sem fallback. Aceita um único endereço simples, sem nome de exibição, lista ou caracteres de cabeçalho. Ausência ou formato inválido degrada somente email: o site continua no ar, mas cada envio aborta antes de qualquer chamada de rede. | Vercel |
| `NEXT_PUBLIC_ALERTS_EMAIL_ENABLED` | Exposição da UI de alertas por email | Opcional, habilita somente com `true`; ausente ou outro valor mantém a UI desligada. | Vercel por ambiente |
| `PF_INTERNAL_TOKEN`, `PF_PREVIEW_TOKEN` | Bootstrap das superfícies internas e preview | Opcionais no boot, mas as rotas falham fechadas. Deploy exige token com pelo menos 24 caracteres para liberar a superfície correspondente. | Vercel por ambiente |
| `PF_CRON_CHAIN_ORIGIN` | Origem do autoencadeamento dos crons | Opcional. Produção cai para `https://puxaficha.com.br`; fora dela cai para a origem da request. Só HTTPS ou loopback pode carregar segredo. | Vercel por ambiente |
| `PF_RUNTIME_SMOKE_ORIGIN` | Origem sondada pelo runtime smoke e watchdog | Opcional, cai para `https://puxaficha.com.br`. | Vercel ou workflow |
| `PF_QUIZ_SHORT_LINKS_FILE`, `PF_DOADOR_REVERSE_FIXTURE_FILE` | Stores locais para testes focados | Opcionais. Ausentes, o runtime usa Supabase; presentes, apontam para fixture local. | Teste local |
| `NEXT_PUBLIC_SITE_URL`, `VERCEL_URL` | Origem canônica, metadata e allowlist de escrita | A pública cai para `https://puxaficha.com.br`. `VERCEL_URL` é fornecida pela plataforma. | Vercel ou operador local |
| `NEXT_PUBLIC_X_HANDLE` | Metadata e compartilhamento no X | Opcional, cai para `@puxaficha`. | Vercel |
| `PF_CURATION_PHASE` | Janela de frescor editorial | Opcional na leitura, mas o valor `hardening` muda a política. Ausência segue o comportamento de launch codificado e deve ser decisão consciente. | Vercel |
| `PF_SUPABASE_FETCH_CONCURRENCY`, `PF_SUPABASE_FETCH_QUEUE_TIMEOUT_MS` | Limitador de fetch do Supabase | Opcionais; inteiros positivos. Fallbacks: 24 e 10.000 ms. | Vercel |
| `SUPABASE_ATTEMPT_TIMEOUT_MS` | Timeout por tentativa | Opcional; mínimo aceito de 1.000 ms, fallback de 15.000 ms. | Vercel |
| `PF_FORCE_PRODUCTION_SECURITY_HEADERS` | HSTS e headers de produção fora da Vercel | Opcional; só `1` ativa. Na Vercel, `VERCEL=1` já ativa. | Operador do host |
| `PF_RELEASE_VERIFY_CACHE_BYPASS` | Bypass de cache para verificação de release | Opcional e aceito somente fora de produção. Em produção é sempre ignorado. | Preview temporário |
| `PF_ALLOW_RELEASE_VERIFY_CACHE_BYPASS_IN_PRODUCTION` | Antigo opt-in de produção | Inerte no produto e mantido apenas como regressão de teste. Deve permanecer ausente na Vercel. | Higiene de configuração |

### Sentry

| Variáveis | Contexto | Obrigatoriedade e fallback | Responsável |
|---|---|---|---|
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Observabilidade server, edge e client | Degradável. A forma adequada ao runtime vence; sem as duas, o site sobe sem observabilidade e registra degradação quando possível. | Vercel |
| `SENTRY_TRACES_SAMPLE_RATE`, `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | Amostragem de traces | Opcionais, fallback `0.05`. | Vercel |
| `SENTRY_ENABLE_PREVIEW`, `NEXT_PUBLIC_SENTRY_ENABLE_PREVIEW` | Telemetria em preview | Opcionais; somente `1` habilita. Preview fica mudo por padrão. | Preview temporário |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Upload de source maps no build | Necessárias apenas quando o build deve publicar artefatos no Sentry. | Vercel build |

### Scripts de banco, ingestão e auditoria

| Variáveis | Contexto | Obrigatoriedade e fallback | Responsável |
|---|---|---|---|
| `SUPABASE_DB_URL`, `PF_DATABASE_URL` | Conexão Postgres para backup, replay, apply e readback | Obrigatória somente nos comandos que citam uma delas. Não há fallback entre os dois nomes porque os scripts têm contratos distintos. | Operador ou GitHub secret |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` | Snapshot e auditorias via Supabase CLI/API | Opcionais por script. `SUPABASE_PROJECT_REF` tem fallback codificado em duas auditorias; snapshot remoto exige credencial. | Operador local |
| `TRANSPARENCIA_API_KEY`, `PF_TRANSPARENCIA_API_BASE` | Portal da Transparência e endpoint substituto de teste | Chave obrigatória para coleta real. Base é opcional e existe para teste controlado. | Operador ou GitHub secret |
| `INSTAGRAM_APP_ID` | Enriquecimento de Instagram | Opcional; sem valor, o enriquecimento não usa o app id. | Operador local |
| `PF_DOADOR_CPF_HASH_SALT` | Hash de CPF na ingestão TSE | Obrigatória para materializar hash real; não existe fallback seguro de produção. | Operador local |
| `PF_DRY_RUN`, `PF_TSE_INGEST_DRY_RUN`, `PF_TSE_INGEST_SKIP_PATRIMONIO` | Proteções e recortes da ingestão | `PF_DRY_RUN=1` ativa blindagem fail-closed. As duas variáveis TSE aceitam `1`; ausência segue o fluxo normal do coletor. | Operador local ou workflow |
| `PF_INGEST_SLUGS`, `PF_TSE_FINANCIAMENTO_SLUGS`, `PF_TSE_PATRIMONIO_SLUGS` | Recortes nominais de ingestão | Opcionais; ausentes, o script usa seu universo canônico. | Operador local |
| `PF_CAMARA_CANDIDATE_TIMEOUT_MS`, `PF_SENADO_CANDIDATE_TIMEOUT_MS` | Timeout por candidato em recorte legislativo | Opcionais e aceitam inteiro positivo. Só podem ser usados com slugs explícitos; caso contrário o parser aborta. | Operador local |
| `PF_KEEP_TSE_DOWNLOADS` | Retenção do download TSE | Opcional; somente `1` preserva o arquivo temporário. | Operador local ou workflow |
| `PF_MANUAL_REVIEW_PERIODO_FIM_CSV_PATH` | Saída de revisão manual | Opcional; ausência usa o caminho padrão do script. | Operador local |
| `PF_AUDIT_RAIZ`, `PF_AUDIT_REPORT_MAX_AGE_MS`, `PF_AUDIT_GENERATED_AT` | Raiz, frescor e relógio de auditorias | Opcionais. Os dois primeiros ajustam o runner; o terceiro existe só na spec visual para relógio determinístico. | Auditoria local ou teste |
| `PF_EXPECTED_DEPLOY_SHA`, `PF_EXPECTED_SHA` | SHA esperado nos readbacks e applies | Obrigatórias somente para os scripts que as leem; ausência aborta o gate correspondente. | Operador ou workflow |
| `PF_PUBLIC_SITE_URL`, `PF_PUBLIC_ORIGIN`, `PF_URL_PARA_VALIDAR` | Alvo de readbacks HTTP | Opcionais ou obrigatórias conforme o script; fallbacks e validações ficam no próprio gate. | Operador local |
| `PF_OUTPUT_DIR` | Diretório de evidência do readback | Opcional, cai para o diretório datado do script. | Operador local |
| `PF_REPLAY_POSTGRES_IMAGE` | Imagem usada no replay efêmero | Opcional, cai para a imagem Postgres 17 declarada pelo script. | Operador local |
| `PF_ENV_FILE` | Arquivo carregado por utilitário Python | Opcional, aponta para um arquivo local de ambiente; nunca deve ser versionado com valores. | Operador local |

### QA e testes focados

| Variáveis | Contexto | Obrigatoriedade e fallback | Responsável |
|---|---|---|---|
| `PF_BASE_URL`, `PF_QUIZ_OG_BASE_URL` | Base URL de Playwright e quiz OG | Opcionais; caem para loopback nas configs que suportam servidor local. | Teste local ou CI |
| `PF_PLAYWRIGHT_EDITORIAL_WEBSERVER` | Sobe servidor editorial local | Opcional; somente `1` ativa. | Teste local |
| `PF_RUN_SEARCH_SMOKE`, `PF_EXPECT_PLACEHOLDER_DATA` | Seleção de cenários visuais | Opcionais; valores truthy esperados pelas specs ativam o cenário. | CI ou teste local |
| `PF_EDITORIAL_FICHA_SLUG`, `PF_EDITORIAL_RELAX_SOBER`, `PF_EDITORIAL_REQUIRE_SELLOS` | Recorte e rigor das specs editoriais | Opcionais e restritas aos testes. | Teste local |
| `PF_FIXTURE_SCENARIO`, `PF_FIXTURE_SHA` | Fixture do readback da Fase 4 | Opcionais; defaults `ok` e vazio. | Teste unitário |
| `PF_ITEM11_MUTATE_VISIBLE_CONTENT` | Perturbação deliberada do fixture | Opcional e restrita ao grader de regressão. | Teste local |

### Plataforma e GitHub Actions

Estas variáveis são fornecidas pela plataforma ou nascem dentro do próprio
workflow. Não entram em `.env.example`, porque configurá-las manualmente pode
mascarar o ambiente real.

| Variáveis | Contexto | Obrigatoriedade e fallback | Responsável |
|---|---|---|---|
| `NODE_ENV`, `NEXT_RUNTIME`, `CI` | Runtime Node, Next e CI | Fornecidas pelo runner. O código usa os valores para escolher runtime e política de segurança. | Node, Next ou GitHub |
| `VERCEL`, `VERCEL_ENV`, `NEXT_PUBLIC_VERCEL_ENV`, `VERCEL_GIT_COMMIT_REF`, `VERCEL_GIT_COMMIT_SHA` | Ambiente e identidade do deploy | Fornecidas pela Vercel. A ausência caracteriza execução local em vários guards. | Vercel |
| `HOME`, `PATH`, `TMPDIR`, `USER`, `USERNAME`, `GITHUB_PATH`, `GITHUB_REF`, `GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT`, `GITHUB_ACTOR` | Diretórios, executáveis e identidade do run | Fornecidas pelo sistema ou GitHub runner. | Sistema ou GitHub |
| `BACKUP_ENCRYPTION_KEY`, `MERGE_QUEUE_GH_TOKEN`, `PF_RUNTIME_SMOKE_SECRET`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | Segredos de backup e fila serial | Obrigatórias somente nos workflows que as referenciam. `PF_RUNTIME_SMOKE_SECRET` deve carregar o mesmo valor aceito como `CRON_SECRET`; é nome do secret do workflow, não leitura do app. | GitHub secrets |
| `GH_TOKEN`, `GITHUB_TOKEN`, `VERCEL_TEAM_ID` | Aliases consumidos pelas CLIs dentro dos workflows | Injetados pelo workflow; `VERCEL_TEAM_ID` recebe o org id já autorizado. | GitHub workflow |
| `GH_REPO`, `WATCHDOG_DRY_RUN`, `WATCHDOG_GRACE_DAYS` | Configuração do cron watchdog | Opcionais. Fallbacks: repositório canônico, `0` e 8 dias. | Workflow ou operador local |
| `DEFAULT_TAGS_JSON`, `INPUT_TAGS`, `REVALIDATE_URL`, `REVALIDATE_SECRET`, `TAGS_JSON` | Revalidação de cache | Variáveis internas montadas a partir de input e secret no mesmo job. | GitHub workflow |
| `RAW_SOURCES`, `INCREMENTAL`, `REVALIDAR`, `MANIFESTO` | Ingestão e patrimônio | Variáveis internas derivadas dos inputs ou paths do job. | GitHub workflow |
| `DISPATCH_REF`, `DISPATCH_SHA`, `EXPECTED_SHA`, `OWNER_PR`, `PRODUCTION_URL`, `TRUSTED_SHA`, `RESTORED_SHA`, `ROLLBACK_PR`, `SMOKE_JOB_RESULT` | Estado da fila serial e rollback | Variáveis efêmeras do job; valores vêm de inputs e outputs previamente validados. | GitHub workflow |
| `WATCHED_HEAD_SHA`, `WATCHED_RUN_ID`, `WATCHED_RUN_URL`, `WATCHED_RUN_CONCLUSION` | Payload do watchdog da fila | Variáveis efêmeras recebidas do workflow observado. | GitHub workflow |

### Contrato de Reply-To integrado por PF-24

`PF_ALERTS_REPLY_TO_EMAIL` é exclusiva do servidor. Ela não altera remetente,
destinatário, CC ou BCC: o valor validado é enviado somente como `reply_to`.
Aspas externas equivalentes são removidas antes da validação, mas o conteúdo
deve continuar sendo um único endereço simples válido. Configuração ausente ou
inválida é registrada como degradação no boot e impede o envio antes da chamada
ao Resend.

<!-- env-contract:end -->

## Crons da Vercel

Horários do arquivo `vercel.json`. A conversão para BRT abaixo vale fora do
horário de verão, inexistente no Brasil em 06/08/2026.

| Rota | UTC | BRT | Função |
|---|---:|---:|---|
| `/api/news/refresh` | 08:00 diária | 05:00 | Atualizar notícias. |
| `/api/news/refresh/recover` | 08:30 diária | 05:30 | Recuperar lotes pendentes sem duplicar execução. |
| `/api/internal/published-consistency` | 09:00 diária | 06:00 | Conferir consistência publicada. |
| `/api/internal/runtime-smoke` | 09:30 diária | 06:30 | Smoke operacional. |
| `/api/alerts/send-digest` | 12:00 diária | 09:00 | Enviar digest de alertas habilitados. |
| `/api/internal/revalidate-public-cache` | `*/15 * * * *` | a cada 15 min | Invalidar cache público das fichas. |

## GitHub Actions

| Workflow | Disparo | Papel |
|---|---|---|
| `ci.yml` | Push e PR | Lint, tipos, testes, build, browser smoke e acessibilidade. |
| `backup-db.yml` | 05:30 UTC diária e manual | Backup do banco. |
| `ingest.yml` | Quarta, 06:00 UTC e manual | Câmara e Senado; lotes manuais de TSE, **sanções** e notícias; revalidação após sucesso. |
| `patrimonio-rerun.yml` | Domingo, 09:00 UTC e manual (ativado em 12/08/2026; primeiro disparo 16/08) | Re-run de patrimônio do ciclo 2026 em dry-run: baixa o pacote oficial do TSE e compara por composição contra o baseline auditado. Não escreve, não recebe secret; publicar o delta continua exigindo migration com gate. |
| `data-quality.yml` | Quinta, 09:00 UTC; dia 3, 07:00 UTC; manual | Coorte, superfície pública, integridade da cadeia partidária e auditoria de identidade SQ. |
| `link-check-fontes.yml` | Segunda, 09:00 UTC e manual | Verificar links das fontes publicadas. |
| `revalidate-cache.yml` | Manual | Revalidar tags públicas autorizadas. |

No `audit:superficie`, R8 reprova reversão A→B e B→A no mesmo ano; R9 reprova
uma cadeia que não admite ordenação cronológica contínua depois da mesma
normalização usada pela ficha; R10 apenas avisa quando um partido de mudança
visível só tem suporte em trajetória despublicada. R8 e R9 de ficha pública
falham o job. Os mesmos achados em ficha não pública ficam como backlog nominal.

Automação de ingestão roda no `main` e usa segredos apenas nos contextos
autorizados. Pull requests nunca devem receber credenciais de produção.

### Fontes que o `ingest.yml` aceita, e as duas que se parecem

O input `sources` é validado contra uma allowlist no próprio workflow:
`camara`, `senado`, `tse`, `transparencia`, `sancoes`, `google-news`. Os nomes
são o vocabulário de CLI de `VALID_SOURCES` em `scripts/ingest-all.ts`, e **não**
são os `source` que os ingests declaram em `coleta_log` (o de sanções declara
`transparencia-sanctions`).

Duas fontes têm nomes parecidos e fazem coisas diferentes, e confundi-las já
produziu um run verde sem trabalho feito:

| Fonte | O que roda | Persiste? |
|---|---|---|
| `transparencia` | consulta de gastos no Portal | **não**: stub declarado |
| `sancoes` | `ingestTransparenciaSanctions` (CEIS, CNEP, CEAF) | sim, em `sancoes_administrativas` |

`sancoes` entrou na allowlist em 10/08/2026 (trilha B do lançamento). Antes
disso a recoleta de sanções era indispatchável por este workflow, e o run
`31336467753` saiu `success` sem escrever uma linha porque disparou a fonte
errada. Ver `Settings/STATUS.md`.

## Operação segura

- Jobs automáticos registram `execution_id`, resultado, volume e cursor quando
  aplicável.
- Uma execução inconclusiva não autoriza repetição cega.
- Cron de notícia, ingestão ou alerta deve ser idempotente.
- Publicação editorial nunca é automática.
- Mudança de schedule atualiza este arquivo e o catálogo de fontes no mesmo PR.
