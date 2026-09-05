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
| `PF_OPERATIONAL_RETENTION_ENABLED` | Habilitação dos expurgos agendados de short-links, notification logs e assinantes pendentes | Opcional e fail-closed. Somente o valor literal `1` autoriza lotes de até 100 linhas por tabela; ausente, vazio ou qualquer outro valor mantém os expurgos desativados. | Vercel |
| `PF_ALERTS_PENDING_PURGE_ENABLED` | Modo do expurgo de assinantes de alerta nunca confirmados, com token de verificação vencido há 7 ou mais dias | Opcional e fail-closed. Sem o valor literal `1`, o cron só conta e loga quantas linhas seriam apagadas (`modo: contar`); com `1`, apaga em lotes de até 100. Depende de `PF_OPERATIONAL_RETENTION_ENABLED=1`. | Vercel |
| `PF_QUIZ_SHORT_LINK_SALT`, `PF_ALERTS_TOKEN_SALT`, `PF_ALERTS_TOKEN_ENCRYPTION_KEY` | Hash e criptografia de tokens | Obrigatórias em produção. A chave de criptografia precisa ter 64 caracteres hexadecimais. Em desenvolvimento existem fallbacks explícitos apenas para salts. | Vercel |
| `PF_ALERTS_IP_SALT` | Hash de IP dos limites duráveis | Obrigatória e dedicada em produção. Em desenvolvimento ainda pode cair para `PF_QUIZ_SHORT_LINK_SALT` ou para o fallback local. | Vercel |
| `RESEND_API_KEY` | Transporte de email | Degradável: sem valor, a aplicação pública sobe e o envio de alertas falha com log. | Vercel |
| `RESEND_WEBHOOK_SECRET` | Assinatura dos webhooks da Resend (`whsec_…`) recebidos em `/api/webhooks/resend` | Degradável: sem valor, a rota responde 503 e nenhum bounce desliga `canal_email`; com valor, `email.bounced` permanente e `email.complained` desligam o canal do assinante. | Vercel |
| `PF_ALERTS_FROM_EMAIL`, `SMTP_FROM` | Remetente dos emails | O primeiro vence e `SMTP_FROM` é alias legado. Ausência usa o fallback do código; formato inválido degrada somente email. | Vercel |
| `PF_ALERTS_REPLY_TO_EMAIL` | Endereço de Reply-To enviado ao Resend no campo `reply_to` | Obrigatória para o transporte de email e sem fallback. Aceita um único endereço simples, sem nome de exibição, lista ou caracteres de cabeçalho. Ausência ou formato inválido degrada somente email: o site continua no ar, mas cada envio aborta antes de qualquer chamada de rede. | Vercel |
| `NEXT_PUBLIC_ALERTS_EMAIL_ENABLED` | Exposição e envio de alertas por email | Opcional, habilita somente com `true`; ausente ou outro valor mantém a UI desligada e bloqueia subscribe e digest no servidor. Gestão, cancelamento e exclusão de dados continuam disponíveis. | Vercel por ambiente |
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
| `SENTRY_TRACES_SAMPLE_RATE` | Amostragem de traces no servidor e no edge | Opcional, fallback `0.05`. O cliente não faz tracing (só captura de erro), então não há variável pública equivalente. | Vercel |
| `SENTRY_ENABLE_PREVIEW`, `NEXT_PUBLIC_SENTRY_ENABLE_PREVIEW` | Telemetria em preview | Opcionais; somente `1` habilita. Preview fica mudo por padrão. | Preview temporário |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Upload de source maps no build | Necessárias apenas quando o build deve publicar artefatos no Sentry. | Vercel build |

### Scripts de banco, ingestão e auditoria

| Variáveis | Contexto | Obrigatoriedade e fallback | Responsável |
|---|---|---|---|
| `SUPABASE_DB_URL`, `PF_DATABASE_URL` | Conexão Postgres para backup, replay, apply e readback | Obrigatória somente nos comandos que citam uma delas. Não há fallback entre os dois nomes porque os scripts têm contratos distintos. | Operador ou GitHub secret |
| `PF_LEDGER_PREDECESSOR`, `PF_LEDGER_MANIFEST` | Override do predecessor e manifesto usados pelo readback público da Fase 4 | Opcionais. Ausentes, o runner usa `.github/merge-queue/irreversible-change-manifest.json`; quando fornecidos, devem apontar para o run e migrations reais. | Operador ou workflow |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Autenticação dos smokes no deployment Production ainda protegido e sem domínio público | Obrigatória no release staged protegido. Não há fallback; o preflight aborta antes do smoke quando ausente. O valor deve ser o Automation Bypass do projeto Vercel exato. | GitHub secret ou operador do release |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` | Snapshot e auditorias via Supabase CLI/API | Opcionais por script. `SUPABASE_PROJECT_REF` tem fallback codificado em duas auditorias; snapshot remoto exige credencial. | Operador local |
| `TRANSPARENCIA_API_KEY`, `PF_TRANSPARENCIA_API_BASE` | Portal da Transparência e endpoint substituto de teste | Chave obrigatória para coleta real. Base é opcional e existe para teste controlado. | Operador ou GitHub secret |
| `INSTAGRAM_APP_ID` | Enriquecimento de Instagram | Opcional; sem valor, o enriquecimento não usa o app id. | Operador local |
| `PF_DOADOR_CPF_HASH_SALT` | Hash de CPF na ingestão TSE | Obrigatória para materializar hash real; não existe fallback seguro de produção. | Operador local |
| `PF_DRY_RUN`, `PF_TSE_INGEST_DRY_RUN`, `PF_TSE_INGEST_SKIP_PATRIMONIO` | Proteções e recortes da ingestão | `PF_DRY_RUN=1` ativa blindagem fail-closed. As duas variáveis TSE aceitam `1`; ausência segue o fluxo normal do coletor. | Operador local ou workflow |
| `PF_INGEST_SLUGS`, `PF_TSE_FINANCIAMENTO_SLUGS`, `PF_TSE_PATRIMONIO_SLUGS` | Recortes nominais de ingestão | Opcionais; ausentes, o script usa seu universo canônico. | Operador local |
| `PF_INGEST_ERRO_MAX_FRACAO` | Limiar de tolerância a erro por fonte em `scripts/ingest-all.ts` | Opcional; ausente, o pipeline usa 0.25. Aceita fração entre 0 e 1 e falha fechado fora disso. Acima do limiar, ou fonte com zero sucesso, o run sai 1; abaixo, sai 0 e os erros ficam em `coleta_log`. | Operador local ou workflow |
| `PF_TSE_ANOS` | Recorte de anos da ingestão histórica TSE | Opcional; ausente ou vazia usa todos os anos canônicos. Lista explícita aceita apenas anos do universo histórico e falha fechado para item inválido ou repetido. | Operador local ou workflow |
| `PF_CAMARA_CANDIDATE_TIMEOUT_MS`, `PF_SENADO_CANDIDATE_TIMEOUT_MS` | Timeout por candidato em recorte legislativo | Opcionais e aceitam inteiro positivo. Só podem ser usados com slugs explícitos; caso contrário o parser aborta. | Operador local |
| `PF_KEEP_TSE_DOWNLOADS` | Retenção do download TSE | Opcional; somente `1` preserva o arquivo temporário. | Operador local ou workflow |
| `PF_MANUAL_REVIEW_PERIODO_FIM_CSV_PATH` | Saída de revisão manual | Opcional; ausência usa o caminho padrão do script. | Operador local |
| `PF_AUDIT_RAIZ`, `PF_AUDIT_REPORT_MAX_AGE_MS`, `PF_AUDIT_GENERATED_AT` | Raiz, frescor e relógio de auditorias | Opcionais. Os dois primeiros ajustam o runner; o terceiro existe só na spec visual para relógio determinístico. | Auditoria local ou teste |
| `PF_EXPECTED_DEPLOY_SHA`, `PF_EXPECTED_SHA` | SHA esperado nos readbacks e applies | Obrigatórias somente para os scripts que as leem; ausência aborta o gate correspondente. | Operador ou workflow |
| `REMEDIATION_MODE` | Modo do dispatch guardado do master review | Efêmera do job, derivada do input validado; aceita `dry-run`, `apply` ou `verify`. Não configurar na Vercel. | GitHub workflow de remediação |
| `PF_PROVAR_PROFISSAO_PG17` | Ativa o teste dos drivers de correção de profissão em PostgreSQL 17 descartável | O prover local define `1`; ausente ou diferente de `1`, a suíte comum pula esse teste. Não habilita escrita remota. | Script de prova local ou workflow |
| `PF_PROVAR_TEXTOS_JULGAMENTO_PG17` | Ativa a prova dos 188 campos de texto, dos drivers e dos readbacks em PostgreSQL 17 descartável | O prover define `1`; a suíte comum pula a integração quando ausente. O schema da fixture tem origem e SHA registrados. Não habilita escrita remota. | `scripts/audit/provar-textos-julgamento-pg17.sh` e workflows de apply/rollback |
| `PF_FAKE_LEDGER`, `PF_FAKE_LOG`, `PF_FAKE_SQL` | Estado e arquivos temporários do simulador de psql | Exclusivas de `tests/textos-julgamento-driver.test.ts`; criadas por execução em diretório descartável, sem conexão ao banco. Não configurar em produção. | Teste local de drivers |
| `PF_PUBLIC_SITE_URL`, `PF_PUBLIC_ORIGIN`, `PF_URL_PARA_VALIDAR` | Alvo de readbacks HTTP | Opcionais ou obrigatórias conforme o script; fallbacks e validações ficam no próprio gate. | Operador local |
| `PF_OUTPUT_DIR` | Diretório de evidência do readback | Opcional, cai para o diretório datado do script. | Operador local |
| `PF_BACKUP_PATH` | Caminho do backup read-only anterior ao apply ou rollback da migration 30002 | Obrigatória nos workflows fechados da issue 138. O workflow aponta para `runner.temp`; o artefato é validado antes de qualquer mutação e preservado pelo GitHub Actions. | Workflow de produção |
| `PF_REPLAY_POSTGRES_IMAGE` | Override diagnóstico da imagem usada no replay efêmero | Opcional. Ausente ou vazia, preserva o digest Postgres 17 fixado pelos scripts; não usar tag móvel como `postgres:17-alpine`. | Operador local |
| `PF_ENV_FILE` | Arquivo carregado por utilitário Python | Opcional, aponta para um arquivo local de ambiente; nunca deve ser versionado com valores. | Operador local |

### Batch de programas de governo 2026

| Variáveis | Contexto | Obrigatoriedade e fallback | Responsável |
|---|---|---|---|
| `PF_QWEN_MODEL` | Modelo do runner legado Qwen | Obrigatório, sem default. A identidade é registrada em stderr; a allowlist do batch preserva a variável. | Operador local |
| `PF_QWEN_CLI`, `PF_QWEN_EXTRA_ARGS`, `PF_QWEN_TIMEOUT_MS` | Runner legado Qwen | Opcionais. O CLI cai para `qwen`, safe mode é obrigatório e o timeout padrão é 900.000 ms. `PF_QWEN_EXTRA_ARGS` não aceita `--model` ou `-m`, para não substituir a identidade explícita. | Operador local |
| `PF_CODEX_CLI`, `PF_CODEX_EXTRA_ARGS`, `PF_CODEX_MODEL`, `PF_CODEX_REASONING_EFFORT`, `PF_CODEX_TIMEOUT_MS`, `PF_JUDGE_MODEL` | Runner direto Codex para geração ou julgamento | Opcionais. O CLI cai para `codex`; modelo, esforço e timeout têm defaults explícitos nos wrappers. Argumentos extras não substituem sandbox, config limpa nem web desabilitada. | Operador local |
| `PF_CLAUDE_CLI`, `PF_CLAUDE_JUDGE_MODEL`, `PF_CLAUDE_MAX_BUDGET_USD`, `PF_CLAUDE_TIMEOUT_MS` | Judge direto Claude | Opcionais. Defaults: CLI `claude`, modelo `sonnet`, orçamento máximo de US$ 5 e timeout de 900.000 ms. | Operador local |
| `PF_OPENCODE_GO`, `PF_OPENCODE_TIMEOUT_MS`, `PF_OPENCODE_TIMEOUT_PADDING_MS`, `PF_OPENCODE_GRACE_MS` | Compatibilidade dos runners OpenCode históricos | Restritas a retomadas históricas que selecionem esses wrappers; não são usadas pela pipeline final Codex Luna mais Claude. `PF_OPENCODE_GO` é **obrigatória** quando um desses runners roda: sem ela o runner aborta antes de qualquer chamada de modelo, porque não existe mais caminho padrão. As três de tempo continuam opcionais. | Operador local |
| `PF_EXECUTION_ID`, `PF_CANDIDATO_CHAVE`, `PF_CANDIDATO_SQ`, `PF_CANDIDATO_UF`, `PF_CANDIDATO_REGIAO`, `PF_MODEL_TELEMETRY_PATH` | Contexto e telemetria de cada subprocesso do batch | Internas. O driver define valores por tentativa; configuração manual é proibida porque quebraria identidade e rastreabilidade. | Driver do batch |

### QA e testes focados

`PF_PROVAR_CRON_RECEIPTS_PG17`, `PF_PROVAR_PUBLICATION_PG17` e
`PF_PROVAR_QUOTA_PG17` habilitam, somente com valor `1`, fixtures locais
descartáveis PostgreSQL 17 de recibos, publicação e cota. O wrapper
`scripts/audit/provar-master-review-remediation-pg17.sh` define as três;
não configurar essas variáveis em produção.

| Variáveis | Contexto | Obrigatoriedade e fallback | Responsável |
|---|---|---|---|
| `PUXAFICHA_DEV_NO_KILL_PORT` | Proteção do servidor local contra encerramento do processo que ocupa a porta 3000 | Opcional; somente `1` impede `scripts/dev.sh` de encerrar o processo existente. Ausente, o script preserva o comportamento padrão de liberar a porta. | Desenvolvimento local |
| `PF_BASE_URL`, `PF_QUIZ_OG_BASE_URL` | Base URL de Playwright e quiz OG | Opcionais; caem para loopback nas configs que suportam servidor local. | Teste local ou CI |
| `PF_VISUAL_FIXTURE_BUILD` | Build isolado com fixtures de dados para Playwright | Opcional; somente `1`, junto de `CI=true`, sem Vercel e com URL placeholder, habilita o alias de teste e a saída `.next-e2e`. Ausente mantém o build normal. Não configurar em produção. | Teste local ou CI |
| `PF_PESQUISAS_EMPTY_SLUG` | Controle negativo do smoke de pesquisas em produção | Opcional; ausência usa `ciro-gomes-gov-ce`. Restrita ao teste. | Teste local ou CI |
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
| `HOME`, `PATH`, `TMPDIR`, `USER`, `USERNAME`, `GITHUB_PATH`, `GITHUB_OUTPUT`, `GITHUB_STEP_SUMMARY`, `GITHUB_REF`, `GITHUB_REPOSITORY`, `GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT`, `GITHUB_ACTOR` | Diretórios, arquivos de saída e resumo, repositório e identidade do run | Fornecidas pelo sistema ou GitHub runner. `GITHUB_OUTPUT` e `GITHUB_STEP_SUMMARY` apontam para arquivos efêmeros do step; `GITHUB_REPOSITORY` identifica o repositório no formato `owner/name`. | Sistema ou GitHub |
| `BACKUP_ENCRYPTION_KEY`, `MERGE_QUEUE_GH_TOKEN`, `CRON_SECRET`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | Segredos de backup e fila serial | Obrigatórias somente nos workflows que as referenciam. `CRON_SECRET` é o mesmo valor usado pela rota de runtime smoke e pelo workflow; não há secret alternativo. | GitHub secrets |
| `GH_TOKEN`, `GITHUB_TOKEN`, `VERCEL_TEAM_ID` | Aliases consumidos pelas CLIs dentro dos workflows | Injetados pelo workflow; `VERCEL_TEAM_ID` recebe o org id já autorizado. | GitHub workflow |
| `GITLEAKS_CONFIG`, `GITLEAKS_ENABLE_COMMENTS`, `GITLEAKS_ENABLE_SUMMARY`, `GITLEAKS_ENABLE_UPLOAD_ARTIFACT`, `GITLEAKS_VERSION` | Configuração fixa da action de secret scanning | Definidas no próprio workflow. Fixam o arquivo de regras, desabilitam comentários, resumo e upload de artefato, e selecionam a versão do scanner; não são configuração de operador e não entram em `.env.example`. | GitHub workflow |
| `BASE_SHA`, `HEAD_SHA` | Limites do intervalo auditado pelo Gitleaks | Derivadas do evento de PR ou push dentro do job. Ambas são obrigatórias para validar o intervalo completo e extrair a árvore final; não são fornecidas manualmente. | GitHub workflow |
| `PF_CANDIDATE_ASSET_BASELINE_SHA` | Baseline imutável do gate de remoção de fotos | Obrigatória somente no step `Referências runtime das fotos de candidato`. O workflow deriva o SHA da base do PR ou do commit anterior do push; não há configuração manual nem entrada correspondente em `.env.example`. | GitHub workflow |
| `GH_REPO`, `WATCHDOG_DRY_RUN`, `WATCHDOG_GRACE_DAYS`, `WATCHDOG_FRESHNESS_MAX_HOURS`, `WATCHDOG_DRIFT_MAX_HOURS` | Configuração do cron watchdog | Opcionais. Fallbacks: repositório canônico, `0`, 8 dias, 36 horas (frescor dos crons da Vercel com rastro) e 24 horas (`main` à frente de produção). | Workflow ou operador local |
| `DEFAULT_TAGS_JSON`, `INPUT_TAGS`, `REVALIDATE_URL`, `REVALIDATE_SECRET`, `TAGS_JSON` | Revalidação de cache | Variáveis internas montadas a partir de input e secret no mesmo job. | GitHub workflow |
| `RAW_SOURCES`, `INCREMENTAL`, `REVALIDAR`, `MANIFESTO` | Ingestão e patrimônio | Variáveis internas derivadas dos inputs ou paths do job. | GitHub workflow |
| `DISPATCH_REF`, `DISPATCH_SHA`, `DISPATCH_ENVIRONMENT`, `DISPATCH_GIT_SHA`, `DISPATCH_PROJECT`, `EXPECTED_SHA`, `OWNER_PR`, `PRODUCTION_URL`, `TRUSTED_SHA`, `CANDIDATE_DEPLOYMENT_ID`, `CANDIDATE_DEPLOYMENT_URL`, `PREVIOUS_DEPLOYMENT_ID`, `PREVIOUS_DEPLOYMENT_SHA`, `PREVIOUS_DEPLOYMENT_URL`, `INCIDENT_LABEL`, `JOB_STATUS`, `ROLLBACK_OUTCOME`, `VERIFY_OUTCOME` | Estado da fila serial, promoção e rollback | Variáveis efêmeras do job; valores vêm de inputs, outputs e recursos remotos previamente validados. | GitHub workflow |
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
| `/api/internal/published-consistency` | 09:00 diária | 06:00 | Conferir consistência publicada. Mantém a retenção de `analytics_launch_events`; short-links e `notification_log` só são expurgados, em lotes de até 100, com `PF_OPERATIONAL_RETENTION_ENABLED=1`. `candidate_changes` e `coleta_log` ficam de fora. |
| `/api/internal/runtime-smoke` | 09:30 diária | 06:30 | Smoke operacional. |
| `/api/alerts/send-digest` | 12:00 diária | 09:00 | Enviar digest de alertas habilitados. |
| `/api/internal/revalidate-public-cache` | `*/15 * * * *` | a cada 15 min | Invalidar cache público das fichas. |

## Recibos privados dos crons

A migration `20260905220200_private_cron_execution_receipts.sql` prepara
`cron_execution_receipts`, com RLS e acesso somente por service role, limitada
a uma linha por cron. Aplicar antes do código que a utiliza, após aprovação de
banco separada. Os handlers gravam apenas depois de conclusão HTTP 200; falha
de gravação retorna 503, sem alegar prova de execução. A sonda de frescor não
escreve e não dispara os handlers. O watchdog diário detecta ausência ou idade
excessiva na próxima sonda, não promete detecção em tempo real.

Readback: `scripts/audit/readback-private-cron-execution-receipts.sql`.
Rollback: primeiro reverter os handlers e a sonda; depois executar
`scripts/audit/rollback-private-cron-execution-receipts.sql`, que preserva os
recibos em tabela renomeada. Nenhum recibo é evidência de proveniência eleitoral.

## GitHub Actions

A tabela registra as rotinas recorrentes e os principais workflows operacionais.
Os one-offs históricos continuam versionados no diretório. Conferir o inventário com
`ls .github/workflows/*.yml`; os agendados saem de
`grep -l 'schedule:' .github/workflows/*.yml`. Schedule de workflow é UTC.

| Workflow | Disparo | Papel |
|---|---|---|
| `ci.yml` | Push e PR | Lint, tipos, testes, build, browser smoke e acessibilidade. |
| `codeql.yml` | Push, PR e segunda, 06:12 UTC | Análise estática de segurança (CodeQL) em JavaScript/TypeScript e Python. |
| `gitleaks.yml` | Push e PR | Secret scanning do intervalo auditado e da árvore final. |
| `replay-migrations.yml` | Push, PR e manual | Replay real das migrations e gates de schema; não usa secret e não toca produção. |
| `backup-db.yml` | 05:30 UTC diária e manual | Backup do banco. |
| `ledger-guard.yml` | 06:10 UTC diária, push em `main` e manual | `audit:ledger:gate` do banco contra `supabase/migrations`; nunca roda em PR, porque PR de fork não recebe secret. |
| `ingest.yml` | Quarta, 06:00 UTC e manual | Câmara e Senado; lotes manuais de TSE, **sanções** e notícias; revalidação após sucesso. |
| `patrimonio-rerun.yml` | Domingo, 09:00 UTC e manual (ativado em 12/08/2026; primeiro disparo 16/08) | Re-run de patrimônio do ciclo 2026 em dry-run: baixa o pacote oficial do TSE e compara por composição contra o baseline auditado. Não escreve, não recebe secret; publicar o delta continua exigindo migration com gate. |
| `data-quality.yml` | Quinta, 09:00 UTC; dia 3, 07:00 UTC; manual | Coorte, superfície pública, integridade da cadeia partidária e auditoria de identidade SQ. |
| `data-freshness-audit.yml` | 11:37 UTC diária e manual | `audit:data-freshness --strict` sobre fonte oficial, candidaturas e SLA; publica o relatório como artefato. |
| `refresh-destaques-votacoes.yml` | Segunda, 12:17 UTC e manual | Duas leituras oficiais de proveniência, comparação de hashes e artefato, sem escrita no banco (`PF_DRY_RUN=1`). |
| `pesquisas-monitoramento.yml` | 10:17 UTC diária e manual | Coleta e verificação das pesquisas eleitorais da matriz aprovada (`verify:pesquisas`). |
| `link-check-fontes.yml` | Segunda, 09:00 UTC e manual | Verificar links das fontes publicadas. |
| `alerts-nightly.yml` | 03:17 UTC diária e manual | Pipeline de alertas ponta a ponta em ambiente local, sem envio real de email. |
| `cron-watchdog.yml` | 08:00 UTC diária, manual e evento de issue | Sonda os workflows agendados do GitHub; na Vercel, `runtime-smoke` ao vivo e `/api/internal/cron-freshness` somente leitura. `news/refresh`, `send-digest` e `published-consistency` têm limite de 36h; `revalidate-public-cache`, 1h. Os dois últimos gravam recibo privado após sucesso e ausência de recibo também gera issue. Sonda ainda o drift quando `main` está à frente da produção há mais de 24h. |
| `a11y-producao-diaria.yml` | 06:15 UTC diária e manual | Axe contra o alias público `puxaficha.com.br`, seja qual for o SHA no ar (registrado no log). Existe porque `a11y-producao.yml` depende de o `deployment_status` coincidir com a promoção, que é manual. |
| `a11y-producao.yml` | `deployment_status` de Production | Axe contra `puxaficha.com.br` depois do deploy alcançar o alias público, não no push. |
| `revalidate-cache.yml` | Manual | Revalidar tags públicas autorizadas. |
| `serial-merge-queue.yml` | A cada 5 min, `pull_request_target`, `workflow_run`, `deployment_status` e manual | Coordenador da fila de merge serial: enfileira, promove o deploy e faz o readback público. |
| `serial-merge-queue-watchdog.yml` | `workflow_run` do coordenador e evento de issue | Abre issue quando um run da fila termina sem sucesso. |
| `apply-issue-96-production.yml` | Manual | One-off fechado: aplicar a correção de fontes da issue 96. |
| `apply-issue-138-production.yml` | Manual | One-off fechado: aplicar identidade de proposição por fonte (issue 138). |
| `rollback-issue-138-production.yml` | Manual | Rollback de dados da issue 138. |
| `apply-candidate-roster-integrity-production.yml` | Manual | One-off fechado: aplicar integridade do roster de candidatos. |
| `rollback-candidate-roster-integrity-production.yml` | Manual | Rollback da integridade do roster de candidatos. |
| `apply-chapas-2026.yml` | Manual | One-off fechado: aplicar release de chapas 2026. |
| `apply-chapas-2026-biografias.yml` | Manual | One-off fechado: aplicar correção de biografias das chapas 2026. |

Os sete `apply-*`/`rollback-*` são one-off de produção: rodam por
`workflow_dispatch`, com gate e autorização nomeada, e não têm agendamento.

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
