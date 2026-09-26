# Automações e ambientes

## Busca de pesquisas eleitorais

A automação Codex `pesquisas-de-voto-presidente-e-27-ufs` pesquisa presidente e
as 27 UFs às segundas e quintas, às 9h de São Paulo, com o ambiente local
disponível. Antes dela, o GitHub Actions executa a descoberta econômica às
8h de São Paulo (11h UTC), por script, para entregar o resumo e a fila à
revisão das 9h no Codex. O procedimento está em
[pesquisas econômicas](../docs/operations/pesquisas-economia.md). O estado por abrangência fica em
`scripts/data/pesquisas-busca-semanal.json`; o procedimento e as provas exigidas
estão em [busca semanal](../docs/operations/pesquisas-busca-semanal.md).
O monitor diário existente no GitHub verifica suas fontes cadastradas e tem
função distinta desta descoberta jornalística.

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
| `SENADO_ENABLED` | Exposição pública da coorte do Senado 2026: rotas, links, sitemap, busca, alertas e consumidores genéricos de candidato | Opcional e fail-closed. Somente `true` (espaços aparados, sem diferenciar maiúsculas) habilita; ausente ou qualquer outro valor mantém candidaturas ao Senado fora das superfícies públicas. | Vercel por ambiente |
| `PF_INTERNAL_TOKEN`, `PF_PREVIEW_TOKEN` | Bootstrap das superfícies internas e preview | Opcionais no boot, mas as rotas falham fechadas. Deploy exige token com pelo menos 24 caracteres para liberar a superfície correspondente. | Vercel por ambiente |
| `PF_CRON_CHAIN_ORIGIN` | Origem do autoencadeamento dos crons | Opcional. Produção cai para `https://puxaficha.com.br`; fora dela cai para a origem da request. Só HTTPS ou loopback pode carregar segredo. | Vercel por ambiente |
| `PF_RUNTIME_SMOKE_ORIGIN` | Origem sondada pelo runtime smoke e watchdog | Opcional, cai para `https://puxaficha.com.br`. | Vercel ou workflow |
| `PF_QUIZ_SHORT_LINKS_FILE`, `PF_DOADOR_REVERSE_FIXTURE_FILE` | Stores locais para testes focados | Opcionais. Ausentes, o runtime usa Supabase; presentes, apontam para fixture local. | Teste local |
| `PF_REP_ETICA_GOLDEN` | Golden alternativo do coletor de representações ao Conselho de Ética (`tests/representacoes-etica-coleta.test.ts`) | Opcional e só para o controle negativo: aponta para um golden adulterado que precisa reprovar. Ausente, o teste usa `tests/fixtures/representacoes-etica/golden.json`. | Teste local |
| `NEXT_PUBLIC_SITE_URL`, `SITE_URL`, `VERCEL_URL` | Origem canônica, metadata, colinha compartilhável e allowlist de escrita | A URL da colinha usa `NEXT_PUBLIC_SITE_URL`, depois `SITE_URL`, depois a origem da request. `VERCEL_URL` é fornecida pela plataforma. | Vercel ou operador local |
| `PF_DEPUTADOS_ROSTER_PUBLIC_RELATION` | View de leitura do roster usada pela lista e pelo card da colinha | Opcional para teste local de cobertura parcial; ausente usa `candidatos_roster_2026_publico`. Não configurar em produção. | Teste local |
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
| `PF_APPLY_SQL`, `PF_READBACK_SQL` | Caminhos do apply.sql/readback.sql gerados por `generate-destaques-evidence-refresh.ts` para `apply-destaques-evidence-refresh-production.sh` | Obrigatórias; o script aborta se o arquivo apontado não existir. Sem fallback — o job `publish` de `refresh-destaques-votacoes.yml` sempre os define a partir do `--out` da geração. | Workflow `refresh-destaques-votacoes.yml`, job `publish` |
| `PGDATABASE`, `PGHOST`, `PGPORT`, `PGUSER`, `PGSSLMODE`, `PGSSLROOTCERT` | Conexão libpq do backup restrito | Derivadas e fechadas pelo driver após validar a URI de produção. O helper exige banco postgres, projeto exato e TLS verify-full; não são configuração alternativa à URI. | Driver de produção |
| `PF_LEDGER_PREDECESSOR`, `PF_LEDGER_MANIFEST` | Override do predecessor e manifesto usados pelo readback público da Fase 4 | Opcionais. Ausentes, o runner usa `.github/merge-queue/irreversible-change-manifest.json`; quando fornecidos, devem apontar para o run e migrations reais. | Operador ou workflow |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Autenticação dos smokes no deployment Production ainda protegido e sem domínio público | Obrigatória no release staged protegido. Não há fallback; o preflight aborta antes do smoke quando ausente. O valor deve ser o Automation Bypass do projeto Vercel exato. | GitHub secret ou operador do release |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` | Snapshot e auditorias via Supabase CLI/API | Opcionais por script. `SUPABASE_PROJECT_REF` tem fallback codificado em duas auditorias; snapshot remoto exige credencial. | Operador local |
| `TRANSPARENCIA_API_KEY`, `PF_TRANSPARENCIA_API_BASE` | Portal da Transparência e endpoint substituto de teste | Chave obrigatória para coleta real. Base é opcional e existe para teste controlado. | Operador ou GitHub secret |
| `PF_TRANSPARENCIA_CACHE_DIR` | Cache em disco das respostas da API do Portal da Transparência (cartões, viagens e contratos) | Opcional; ausente usa `.transparencia-cache`, ignorado pelo Git. | Operador local ou workflow |
| `PF_TRANSPARENCIA_SANCTIONS_CACHE_DIR`, `PF_TRANSPARENCIA_SANCTIONS_PAUSE_MS` | Cache e ritmo da coleta de sanções do Portal da Transparência | Opcionais. Sem diretório, a coleta não grava cache em disco. A pausa entre candidatos usa 1500 ms quando ausente ou não numérica; valor negativo vira 0. | Operador local ou workflow |
| `PF_TRANSPARENCIA_EXPORT_BASE`, `PF_TRANSPARENCIA_EXPORT_DATE` | Exportações públicas ZIP/CSV de sanções, caminho usado sem `TRANSPARENCIA_API_KEY` | Opcionais e voltadas a teste controlado. A base cai para `https://portaldatransparencia.gov.br/download-de-dados`; a data só vale no formato AAAAMMDD e, ausente ou inválida, é descoberta na listagem pública. | Teste local ou operador |
| `INSTAGRAM_APP_ID` | Enriquecimento de Instagram | Opcional; sem valor, o enriquecimento não usa o app id. | Operador local |
| `PF_DOADOR_CPF_HASH_SALT` | Hash de CPF na ingestão TSE | Obrigatória para materializar hash real; não existe fallback seguro de produção. | Operador local |
| `PF_DRY_RUN`, `PF_TSE_INGEST_DRY_RUN`, `PF_TSE_INGEST_SKIP_PATRIMONIO` | Proteções e recortes da ingestão | `PF_DRY_RUN=1` ativa blindagem fail-closed. As duas variáveis TSE aceitam `1`; ausência segue o fluxo normal do coletor. | Operador local ou workflow |
| `PF_CONSULTA_CAND_2026_ZIP` | Pacote oficial TSE usado no teste de reconciliação do número de urna | Opcional no teste. Ausente, o teste procura o pacote no caminho temporário padrão e é pulado se ele não existir. Não configurar na Vercel. | Operador local ou CI com pacote verificado |
| `PF_NUMERO_URNA_APPLY_CONFIRM`, `PF_NUMERO_URNA_ROLLBACK_CONFIRM` | Confirmações dos comandos de escrita e reversão do backfill do número de urna | Obrigatórias somente com `--apply`: a aplicação exige I_CONFIRM_CAS e a reversão exige I_CONFIRM_ROLLBACK. Ausência ou valor diferente aborta antes de escrever. Não configurar na Vercel. | Operador local autorizado |
| `PF_FRENTE5_SCREENSHOT_DIR` | Diretório opcional das capturas do teste visual de busca por número de urna | Ausente, o teste executa sem gravar capturas extras. Quando definido, aponta para um diretório local existente. Não configurar na Vercel. | Teste visual local |
| `SOURCEPACK_CANDIDATES`, `SOURCEPACK_OUTPUT_DIR` | Recorte e destino do sourcepack TSE manual | Opcionais e restritas ao job manual de diagnóstico. `SOURCEPACK_CANDIDATES` aceita apenas `SQ:UF:slug` separados por vírgula, com validação estrita e sem fallback para entrada vazia inválida. `SOURCEPACK_OUTPUT_DIR` define o diretório do artifact; ausente, preserva o caminho local padrão. Não configurar em produção. | Workflow manual |
| `PF_INGEST_SLUGS`, `PF_TSE_FINANCIAMENTO_SLUGS`, `PF_TSE_PATRIMONIO_SLUGS` | Recortes nominais de ingestão | Opcionais; ausentes, o script usa seu universo canônico. | Operador local |
| `PF_INGEST_ERRO_MAX_FRACAO` | Limiar de tolerância a erro por fonte em `scripts/ingest-all.ts` | Opcional; ausente, o pipeline usa 0.25. Aceita fração entre 0 e 1 e falha fechado fora disso. Acima do limiar, ou fonte com zero sucesso, o run sai 1; abaixo, sai 0 e os erros ficam em `coleta_log`. | Operador local ou workflow |
| `PF_TSE_ANOS` | Recorte de anos da ingestão histórica TSE | Opcional; ausente ou vazia usa todos os anos canônicos. Lista explícita aceita apenas anos do universo histórico e falha fechado para item inválido ou repetido. | Operador local ou workflow |
| `PF_CAMARA_CANDIDATE_TIMEOUT_MS`, `PF_SENADO_CANDIDATE_TIMEOUT_MS` | Timeout por candidato em recorte legislativo | Opcionais e aceitam inteiro positivo. Só podem ser usados com slugs explícitos; caso contrário o parser aborta. | Operador local |
| `PF_JARBAS_TIMEOUT_MS` | Timeout das consultas à API Jarbas de reembolsos da Câmara | Opcional; ausente usa o timeout padrão de fetch dos scripts de ingestão. | Operador local ou workflow |
| `PF_LOCAL_KEY_FILE` | Arquivo de env com chaves do Supabase local para `scripts/enrich-senado.ts` e `scripts/apply-financiamento-nao-aplicavel.ts` | Opcional; `--key-file` vence. Ausente, os scripts usam o ambiente já carregado. Em `enrich-senado.ts`, caminho inexistente aborta. | Operador local |
| `PF_KEEP_TSE_DOWNLOADS` | Retenção do download TSE | Opcional; somente `1` preserva o arquivo temporário. | Operador local ou workflow |
| `PF_MANUAL_REVIEW_PERIODO_FIM_CSV_PATH` | Saída de revisão manual | Opcional; ausência usa o caminho padrão do script. | Operador local |
| `PF_AUDIT_RAIZ`, `PF_AUDIT_REPORT_MAX_AGE_MS`, `PF_AUDIT_GENERATED_AT` | Raiz, frescor e relógio de auditorias | Opcionais. Os dois primeiros ajustam o runner; o terceiro existe só na spec visual para relógio determinístico. | Auditoria local ou teste |
| `PF_EXPECTED_DEPLOY_SHA`, `PF_EXPECTED_SHA` | SHA esperado nos readbacks e applies | Obrigatórias somente para os scripts que as leem; ausência aborta o gate correspondente. | Operador ou workflow |
| `PF_FALAS_QUOTE_IDS` | IDs de citações para readback público, separados por vírgula | Opcional; ausente, a suíte visual de publicação de falas é pulada. Com IDs, exige SHA e confere texto, data e fonte no perfil público. | Teste local ou rotina de falas |
| `PF_TSE2026_EVENTO`, `PF_TSE2026_APLICAR`, `PF_EXPECTED_PLAN_SHA`, `PF_REHASH_ANO`, `PF_REHASH_APLICAR`, `PF_EXPECTED_PLAN_SHAS` | Dispatch dos workflows `tse-2026-financas` e `rehash-doador-cpf-v2` | Efêmeras do job, derivadas dos inputs. Aplicar manual exige o `plano_sha256` do dry-run (sha de 64 hex, ou `ano=sha` separados por vírgula no rehash); sha ausente ou diferente do plano recalculado não grava. Não configurar na Vercel. | Workflows `tse-2026-financas` e `rehash-doador-cpf-v2` |
| `PF_MODE` | Modo do dispatch guardado do apply das issues #378 e #383 | Efêmera do job, derivada do input validado; aceita `dry-run` ou `apply`. O ensaio roda sempre, e só `apply` libera o passo que grava. Não configurar na Vercel. | GitHub workflow `apply-issues-378-383-production` |
| `REMEDIATION_MODE` | Modo do dispatch guardado do master review | Efêmera do job, derivada do input validado; aceita `dry-run`, `apply` ou `verify`. Não configurar na Vercel. | GitHub workflow de remediação |
| `PF_SNAPSHOT_DIRECT_PG17` | Ativa a prova do snapshot de candidaturas com fonte direta em PostgreSQL 17 descartável | Com valor `1`, testa o SQL anterior e posterior à migração; ausente, a suíte comum pula a integração. Não habilita escrita remota. | Teste local `tests/data-freshness-snapshot-direct.test.ts` |
| `PF_PROVAR_PROFISSAO_PG17` | Ativa o teste dos drivers de correção de profissão em PostgreSQL 17 descartável | O prover local define `1`; ausente ou diferente de `1`, a suíte comum pula esse teste. Não habilita escrita remota. | Script de prova local ou workflow |
| `PF_PROVAR_TEXTOS_JULGAMENTO_PG17` | Ativa a prova dos 188 campos de texto, dos drivers e dos readbacks em PostgreSQL 17 descartável | O prover define `1`; a suíte comum pula a integração quando ausente. O schema da fixture tem origem e SHA registrados. Não habilita escrita remota. | `scripts/audit/provar-textos-julgamento-pg17.sh` e workflows de apply/rollback |
| `PF_PROVAR_SENADO_RELEASE_PG17` | Ativa a prova do release de schema do Senado 2026 em PostgreSQL 17 descartável (`scripts/audit/provar-senado-2026-release-pg17.sh`) | Somente `1` executa o teste de `tests/apply-senado-2026-release.test.ts`; ausente, a suíte comum pula a integração. Não habilita escrita remota. | Teste local |
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
| `PF_PROMESSA_VERIFICADOR_MODEL` | Verificador independente da cascata promessa x evidência (`npm run data:promessa-evidencia:cascata`) | Opcional. Sem valor, usa o modelo fixado em `scripts/promessa-jev/verificador.mjs`; trocar o modelo exige rodar de novo o golden da cascata antes de publicar. | Operador local |
| `PF_COMPROMISSO_EVIDENCIA_FIXTURE` | Caminho de um JSON com linhas da view `compromisso_evidencia_publica`, para ver a seção de evidências relacionadas no dev local antes da migration | Opcional e só local. Ignorado fora de `NODE_ENV=development`; sem valor, a ficha lê a view. Nunca configurar na Vercel. | Operador local |
| `PF_COMPROMISSO_RECIBO_FIXTURE` | Caminho de um JSON `{ slug: linha de coleta_log_ultima }` com recibos da fonte `promessa-evidencia`, para ver os estados vazios da seção de evidências relacionadas no dev local | Opcional e só local. Ignorado fora de `NODE_ENV=development`; sem valor, a ficha lê `coleta_log_ultima`. Nunca configurar na Vercel. | Operador local |
| `PF_CLAUDE_CLI`, `PF_CLAUDE_JUDGE_MODEL`, `PF_CLAUDE_MAX_BUDGET_USD`, `PF_CLAUDE_TIMEOUT_MS` | Judge direto Claude | Opcionais. Defaults: CLI `claude`, modelo `sonnet`, orçamento máximo de US$ 5 e timeout de 900.000 ms. | Operador local |
| `PF_OPENCODE_GO`, `PF_OPENCODE_TIMEOUT_MS`, `PF_OPENCODE_TIMEOUT_PADDING_MS`, `PF_OPENCODE_GRACE_MS` | Compatibilidade dos runners OpenCode históricos | Restritas a retomadas históricas que selecionem esses wrappers; não são usadas pela pipeline final Codex Luna mais Claude. `PF_OPENCODE_GO` é **obrigatória** quando um desses runners roda: sem ela o runner aborta antes de qualquer chamada de modelo, porque não existe mais caminho padrão. As três de tempo continuam opcionais. | Operador local |
| `PF_EXECUTION_ID`, `PF_CANDIDATO_CHAVE`, `PF_CANDIDATO_SQ`, `PF_CANDIDATO_UF`, `PF_CANDIDATO_REGIAO`, `PF_MODEL_TELEMETRY_PATH` | Contexto e telemetria de cada subprocesso do batch | Internas. O driver define valores por tentativa; configuração manual é proibida porque quebraria identidade e rastreabilidade. | Driver do batch |

### QA e testes focados

`PF_PROVAR_CRON_RECEIPTS_PG17`, `PF_PROVAR_PUBLICATION_PG17` e
`PF_PROVAR_QUOTA_PG17` habilitam, somente com valor `1`, fixtures locais
descartáveis PostgreSQL 17 de recibos, publicação e cota. O wrapper
`scripts/audit/provar-master-review-remediation-pg17.sh` define as três;
não configurar essas variáveis em produção.

`PF_PROVAR_FRESHNESS_CLOSEOUT_PG17` habilita, somente com valor `1`, as
fixtures PostgreSQL 17 descartáveis de admissão, despublicação preservadora
e guarda da view de chapas. O workflow
`.github/workflows/apply-freshness-closeout-production.yml` define o valor
no passo de prova local, antes de disponibilizar a conexão remota ao driver.
A ausência pula essas integrações na suíte comum; não configurar na Vercel
nem em runtime de produção. Não autoriza aplicação de migrations.

| Variáveis | Contexto | Obrigatoriedade e fallback | Responsável |
|---|---|---|---|
| `PUXAFICHA_DEV_NO_KILL_PORT` | Proteção do servidor local contra encerramento do processo que ocupa a porta 3000 | Opcional; somente `1` impede `scripts/dev.sh` de encerrar o processo existente. Ausente, o script preserva o comportamento padrão de liberar a porta. | Desenvolvimento local |
| `PF_BASE_URL`, `PF_QUIZ_OG_BASE_URL` | Base URL de Playwright e quiz OG | Opcionais; caem para loopback nas configs que suportam servidor local. | Teste local ou CI |
| `PF_VISUAL_FIXTURE_BUILD` | Build isolado com fixtures de dados para Playwright | Opcional; somente `1`, junto de `CI=true`, sem Vercel e com URL placeholder, habilita o alias de teste e a saída `.next-e2e`. Ausente mantém o build normal. Não configurar em produção. | Teste local ou CI |
| `PF_BROWSER_EXECUTABLE_PATH` | Navegador alternativo para `npm run test:playwright:senado` | Opcional; ausente usa o navegador instalado pelo Playwright. | Teste local |
| `PF_PLAYWRIGHT_EDITORIAL_WEBSERVER` | Sobe servidor editorial local | Opcional; somente `1` ativa. | Teste local |
| `PF_RUN_SEARCH_SMOKE`, `PF_EXPECT_PLACEHOLDER_DATA` | Seleção de cenários visuais | Opcionais; valores truthy esperados pelas specs ativam o cenário. | CI ou teste local |
| `PESQUISAS_I1_RECEIPTS`, `PESQUISAS_I2_DOCUMENTS` | Replay de recibos e relatórios de pesquisas | Opcionais; caminhos locais dos recibos capturados e dos PDFs. O replay exige ambos e é omitido quando ausentes. Não configurar em produção. | Teste local |
| `PF_EDITORIAL_FICHA_SLUG`, `PF_EDITORIAL_RELAX_SOBER`, `PF_EDITORIAL_REQUIRE_SELLOS` | Recorte e rigor das specs editoriais | Opcionais e restritas aos testes. | Teste local |
| `PF_FIXTURE_SCENARIO`, `PF_FIXTURE_SHA` | Fixture do readback da Fase 4 | Opcionais; defaults `ok` e vazio. | Teste unitário |
| `PF_ITEM11_MUTATE_VISIBLE_CONTENT` | Perturbação deliberada do fixture | Opcional e restrita ao grader de regressão. | Teste local |
| `PF_GOLDEN`, `PF_PERGUNTAS`, `PF_SAIDA` | Avaliação e rastreio locais da extração de pesquisas | Opcionais; sobrescrevem os nomes dos arquivos de golden, perguntas e saída. Na ausência, os scripts usam seus nomes padrão versionados. Não configurar em produção. | Teste local |

### Plataforma e GitHub Actions

Estas variáveis são fornecidas pela plataforma ou nascem dentro do próprio
workflow. Não entram em `.env.example`, porque configurá-las manualmente pode
mascarar o ambiente real.

| Variáveis | Contexto | Obrigatoriedade e fallback | Responsável |
|---|---|---|---|
| `NODE_ENV`, `NEXT_RUNTIME`, `CI` | Runtime Node, Next e CI | Fornecidas pelo runner. O código usa os valores para escolher runtime e política de segurança. | Node, Next ou GitHub |
| `VERCEL`, `VERCEL_ENV`, `NEXT_PUBLIC_VERCEL_ENV`, `VERCEL_GIT_COMMIT_REF`, `VERCEL_GIT_COMMIT_SHA` | Ambiente e identidade do deploy | Fornecidas pela Vercel. A ausência caracteriza execução local em vários guards. | Vercel |
| `HOME`, `PATH`, `TMPDIR`, `RUNNER_TEMP`, `USER`, `USERNAME`, `GITHUB_PATH`, `GITHUB_OUTPUT`, `GITHUB_STEP_SUMMARY`, `GITHUB_REF`, `GITHUB_REPOSITORY`, `GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT`, `GITHUB_ACTOR` | Diretórios, arquivos de saída e resumo, repositório e identidade do run | Fornecidas pelo sistema ou GitHub runner. `RUNNER_TEMP` guarda temporariamente o backup cifrado antes do upload; `GITHUB_OUTPUT` e `GITHUB_STEP_SUMMARY` apontam para arquivos efêmeros do step; `GITHUB_REPOSITORY` identifica o repositório no formato `owner/name`. | Sistema ou GitHub |
| `BACKUP_ENCRYPTION_KEY`, `MERGE_QUEUE_GH_TOKEN`, `CRON_SECRET`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | Segredos de backup e fila serial | Obrigatórias somente nos workflows que as referenciam. `CRON_SECRET` é o mesmo valor usado pela rota de runtime smoke e pelo workflow; não há secret alternativo. | GitHub secrets |
| `GH_TOKEN`, `GITHUB_TOKEN`, `VERCEL_TEAM_ID` | Aliases consumidos pelas CLIs dentro dos workflows | Injetados pelo workflow; `VERCEL_TEAM_ID` recebe o org id já autorizado. | GitHub workflow |
| `GITLEAKS_CONFIG`, `GITLEAKS_ENABLE_COMMENTS`, `GITLEAKS_ENABLE_SUMMARY`, `GITLEAKS_ENABLE_UPLOAD_ARTIFACT`, `GITLEAKS_VERSION` | Configuração fixa da action de secret scanning | Definidas no próprio workflow. Fixam o arquivo de regras, desabilitam comentários, resumo e upload de artefato, e selecionam a versão do scanner; não são configuração de operador e não entram em `.env.example`. | GitHub workflow |
| `BASE_SHA`, `HEAD_SHA` | Limites do intervalo auditado pelo Gitleaks | Derivadas do evento de PR ou push dentro do job. Ambas são obrigatórias para validar o intervalo completo e extrair a árvore final; não são fornecidas manualmente. | GitHub workflow |
| `PF_CANDIDATE_ASSET_BASELINE_SHA` | Baseline imutável do gate de remoção de fotos | Obrigatória somente no step `Referências runtime das fotos de candidato`. O workflow deriva o SHA da base do PR ou do commit anterior do push; não há configuração manual nem entrada correspondente em `.env.example`. | GitHub workflow |
| `GH_REPO`, `WATCHDOG_DRY_RUN`, `WATCHDOG_GRACE_DAYS`, `WATCHDOG_FRESHNESS_MAX_HOURS`, `WATCHDOG_DRIFT_MAX_HOURS`, `WATCHDOG_RECEIPT_MAX_JOBS`, `WATCHDOG_RECEIPT_MAX_LINES` | Configuração do cron watchdog | Opcionais. Fallbacks: repositório canônico, `0`, 8 dias, 36 horas (frescor dos crons da Vercel com rastro), 24 horas (`main` à frente de produção) e os tetos do recibo de falha anexado à issue: 3 jobs e 8 linhas de log. | Workflow ou operador local |
| `DEFAULT_TAGS_JSON`, `INPUT_TAGS`, `REVALIDATE_URL`, `REVALIDATE_SECRET`, `TAGS_JSON` | Revalidação de cache | Variáveis internas montadas a partir de input e secret no mesmo job. | GitHub workflow |
| `RAW_SOURCES`, `INCREMENTAL`, `REVALIDAR`, `MANIFESTO` | Ingestão e patrimônio | Variáveis internas derivadas dos inputs ou paths do job. | GitHub workflow |
| `DISPATCH_REF`, `DISPATCH_SHA`, `DISPATCH_ENVIRONMENT`, `DISPATCH_GIT_SHA`, `DISPATCH_PROJECT`, `EXPECTED_SHA`, `OWNER_PR`, `PRODUCTION_URL`, `TRUSTED_SHA`, `CANDIDATE_DEPLOYMENT_ID`, `CANDIDATE_DEPLOYMENT_URL`, `PREVIOUS_DEPLOYMENT_ID`, `PREVIOUS_DEPLOYMENT_SHA`, `PREVIOUS_DEPLOYMENT_URL`, `INCIDENT_LABEL`, `JOB_STATUS`, `ROLLBACK_OUTCOME`, `VERIFY_OUTCOME` | Estado da fila serial, promoção e rollback | Variáveis efêmeras do job; valores vêm de inputs, outputs e recursos remotos previamente validados. | GitHub workflow |
| `CHECK_NAME`, `DEP_ID`, `RUN_ID`, `RUN_URL`, `SMOKE` | Deployment Check `smoke-producao` da Vercel | Efêmeras de `production-deployment-check.yml`: nome do check, id do deploy candidato, id do check run, link do run e desfecho da suíte de smoke. | GitHub workflow |
| `WATCHED_HEAD_SHA`, `WATCHED_RUN_ID`, `WATCHED_RUN_URL`, `WATCHED_RUN_CONCLUSION` | Payload do watchdog da fila | Variáveis efêmeras recebidas do workflow observado. | GitHub workflow |
| `POLL_REPOSITORY`, `POLL_BASE_SHA`, `POLL_RUN_ID`, `POLL_AUTHOR_LOGIN` | Identidade e controle de concorrência da publicação validada de pesquisas | Fornecidas pelo workflow: repositório atual, SHA atual de `main`, ID do run e login fixo `thiago-salvador`. Não há fallback para outro repositório, commit, run ou autor; ausência ou formato inesperado aborta antes de qualquer mutação. | GitHub workflow |

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
| `observe-home-updates.yml` | Quarta, 08:00 UTC e manual | Confirma patrimônio e situação do ciclo atual na fonte e na ficha; escreve somente referências/eventos do H12. Primeiro registro é baseline. Divergências aguardam revisão dos fatos. Compartilha o lock da ingestão. |
| `tse-2026-financas.yml` | 10:40 UTC diária e manual | Reconfere o pacote TSE 2026 (receita parcial e bens) contra as fichas públicas: grava financiamento novo ou atualizado de linha de máquina, remove ausência desmentida, insere bens onde havia ausência e registra recibo `tse-financiamento`/`tse-patrimonio` por ficha. Agendado só aplica se as travas do plano passarem; manual exige o `plano_sha256` do dry-run. |
| `rehash-doador-cpf-v2.yml` | Manual | Acrescenta `cpf_hash` v2 a doador pessoa física sem hash nas prestações publicadas (#409), sem reingerir o pleito; dry-run por ano e escrita só com o sha do plano. |
| `patrimonio-rerun.yml` | Domingo, 09:00 UTC e manual (ativado em 12/08/2026; primeiro disparo 16/08) | Re-run de patrimônio do ciclo 2026 em dry-run: baixa o pacote oficial do TSE e compara por composição contra o baseline auditado. Não escreve, não recebe secret; publicar o delta continua exigindo migration com gate. |
| `data-quality.yml` | Quinta, 09:00 UTC; dia 3, 07:00 UTC; manual | Coorte, superfície pública, integridade da cadeia partidária e auditoria de identidade SQ. |
| `data-freshness-audit.yml` | 11:37 UTC diária e manual | `audit:data-freshness --strict` sobre fonte oficial, candidaturas e SLA; publica o relatório como artefato. |
| `refresh-destaques-votacoes.yml` | Segunda, 12:17 UTC e manual | Duas leituras oficiais de proveniência, comparação de hashes e artefato, sem escrita no banco (`PF_DRY_RUN=1`). |
| `pesquisas-descoberta-economica.yml` | Segunda e quinta, 11:00 UTC (08:00 São Paulo); manual | Descoberta por RSS para presidente e 27 UFs, com cache e artefatos; somente scripts, sem modelo, publicação ou escrita no banco. |
| `pesquisas-monitoramento.yml` | 10:17 UTC diária e manual | Coleta e verificação das pesquisas eleitorais da matriz aprovada (`verify:pesquisas`). |
| `falas-monitoramento.yml` | Segunda e quinta, 11:17 UTC; manual | Coleta falas na imprensa nos últimos 14 dias, guarda evidências e pendências. Proposta de PR depende de `FALAS_DRAFT_PR_ENABLED=true`; sem merge ou escrita no banco. |
| `link-check-fontes.yml` | Segunda, 09:00 UTC e manual | Verificar links das fontes publicadas. |
| `alerts-nightly.yml` | 03:17 UTC diária e manual | Pipeline de alertas ponta a ponta em ambiente local, sem envio real de email. |
| `cron-watchdog.yml` | 08:00 UTC diária, manual e evento de issue | Sonda os workflows agendados do GitHub; na Vercel, `runtime-smoke` ao vivo e `/api/internal/cron-freshness` somente leitura. `news/refresh`, `send-digest` e `published-consistency` têm limite de 36h; `revalidate-public-cache`, 1h. Os dois últimos gravam recibo privado após sucesso e ausência de recibo também gera issue. Sonda ainda o drift quando `main` está à frente da produção há mais de 24h. |
| `a11y-producao-diaria.yml` | 06:15 UTC diária e manual | Axe contra o alias público `puxaficha.com.br`, seja qual for o SHA no ar (registrado no log). Existe porque `a11y-producao.yml` depende de o `deployment_status` coincidir com a promoção, que é manual. |
| `a11y-producao.yml` | `deployment_status` de Production | Axe contra `puxaficha.com.br` depois do deploy alcançar o alias público, não no push. |
| `revalidate-cache.yml` | Manual | Revalidar tags públicas autorizadas. |
| `production-deployment-check.yml` | Push em `main` e manual (`sha`) | Roda `release:smoke` contra o deploy de produção candidato e reporta o check run `smoke-producao` da Vercel, que bloqueia a atribuição de `puxaficha.com.br` até passar (fail-closed). |
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
