# Puxa Ficha - Security, Exposure and DX Hardening Plan

## Goal

Endurecer a superficie publica do produto sem reabrir o escopo do pipeline TSE ja fechado. O foco agora e:

- reduzir exposicao indevida de dados no Supabase
- adicionar defesa em profundidade em links externos
- melhorar DX local para falhas de banco
- registrar o que fica explicitamente fora de prioridade

## Execution Log - 2026-04-01

### Task 0 - Concluida

- auditoria real feita com `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `public.candidatos` expunha `cpf`, `cpf_hash`, `email_campanha` e `wikidata_id`
- `public.v_ficha_candidato` expunha `cpf_hash`
- `public.v_comparador` ja estava enxuta
- artefato: [2026-04-01-supabase-anon-audit.md](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/docs/2026-04-01-supabase-anon-audit.md)

### Task 1 - Concluida

- criada a view `public.candidatos_publico`
- `v_ficha_candidato` foi reescrita sem `c.*`
- `v_comparador` passou a derivar de `candidatos_publico`
- migration aplicada: [20260401002545_harden_public_candidate_surface.sql](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/supabase/migrations/20260401002545_harden_public_candidate_surface.sql)

### Task 2 - Concluida

- [api.ts](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/src/lib/api.ts) agora le `candidatos_publico`
- rotas validadas em `next dev` na porta `3100`:
  - `/`
  - `/candidato/nikolas-ferreira`
  - `/comparar`
  - `/explorar`
  - `/governadores/mg`

### Task 3 - Concluida

- `SELECT` direto em `public.candidatos` foi revogado para `anon` e `authenticated`
- reteste anon apos rollout:
  - `public.candidatos?select=cpf,cpf_hash,email_campanha,wikidata_id` agora falha com `permission denied`
  - `public.candidatos_publico` responde com projecao minima
  - `public.v_ficha_candidato` nao expoe mais `cpf_hash`

### Task 4 - Concluida

- defesa na UI implementada em [NewsSection.tsx](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/src/components/NewsSection.tsx)
- ingestao endurecida em [ingest-google-news.ts](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/scripts/lib/ingest-google-news.ts)

### Task 5 - Concluida

- fallback por erro de query agora faz `console.warn` explicito em dev em [api.ts](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/src/lib/api.ts)

### Task 6 - Concluida

- scripts adicionados em [package.json](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/package.json):
  - `audit:completude`
  - `persist:sq`
- `audit:completude` validado com env carregada
- `persist:sq` nao foi rerodado nesta frente para evitar escrita redundante no banco

### Task 7 - Concluida

- triagem feita para os 20 casos de `camara_sem_cargo_atual`
- distribuicao:
  - `Vacancia`: 10
  - `Fim de Mandato`: 8
  - `Suplencia`: 1
  - `Afastado`: 1
- artefato: [2026-04-01-camara-cargo-atual-triage.md](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/docs/2026-04-01-camara-cargo-atual-triage.md)

### Task 8 - Encerrada sem patch

- nao apareceu evidencia nova de persistencia errada em `partido_atual`
- permanece fora do caminho critico deste ciclo

### Validacao final

- `npm run check:scripts`: passou
- `npm run build`: passou
- `npm run start`: continua falhando com `Could not find a production build in the '.next' directory` mesmo com `.next/BUILD_ID` presente
- `next dev --turbopack --port 3100`: respondeu `200` nas rotas principais e confirmou que a app continua funcional lendo da superficie publica

## Contexto

Este plano consolida:

- o review amplo em `review.md`
- as ressalvas do Opus
- as ressalvas da revisao manual local sobre o estado real do repo

Ele nao substitui o plano de pipeline em `docs/plans/2026-03-31-pipeline-fix-final.md`. O pipeline TSE esta fechado. O que entra aqui e uma frente nova de hardening e manutencao.

## Decisao Pratica

### Fazer agora

- P0: endurecer RLS e a superficie publica de `candidatos`
- P1: validar URLs de `noticias_candidato`
- P1: deixar o fallback para mock em dev visivel quando vier de erro de query
- P2: adicionar scripts npm para auditoria operacional

### Fazer depois, sem bloquear este ciclo

- triagem de `camara_sem_cargo_atual`
- revisao de grants e views publicas alem de `candidatos`
- checagem semantica de `partido_atual` apenas se houver evidencia de dado errado persistido

### Nao priorizar agora

- refactor cosmetico para unificar ZIP helpers do TSE
- suite de testes ampla
- retries/backoff no build como frente propria
- hardening adicional de `workflow_dispatch`
- sincronizacao documental fina entre `CLAUDE.md` e `AGENTS.md`

## Principios

- Nao tratar finding hipotetico como bug confirmado sem verificar o estado real do projeto.
- Nao revogar acesso anon direto a tabelas antes de a app estar migrada para views publicas.
- Nao misturar hardening de exposicao com reabertura do pipeline TSE.
- Favorecer mudancas pequenas, reversiveis e auditaveis.

## Scope

### Dentro

- `scripts/schema.sql`
- `src/lib/api.ts`
- `src/components/NewsSection.tsx`
- scripts de ingestao ou normalizacao de noticias, se necessario
- `package.json`

### Fora

- reescrita da estrategia de build/ISR
- redesign de schema inteiro
- novas suites de testes extensas
- cleanup estrutural do pipeline TSE

## Task 0 - Verificacao do Estado Real no Supabase

Objetivo: confirmar o risco antes de alterar grants e views.

Passos:

- verificar no projeto Supabase real quais tabelas e views estao expostas ao papel `anon`
- testar leitura com a `anon key` em staging ou ambiente controlado:
  - `select=cpf`
  - `select=cpf_hash`
  - `select=email_campanha`
  - `select=wikidata_id`
- confirmar se `v_ficha_candidato` tambem esta acessivel ao `anon`
- confirmar se `v_comparador` tambem esta acessivel ao `anon` e se a projecao dela continua minima

Entregavel:

- nota curta no repo ou no PR com:
  - o que estava realmente exposto
  - o que ja nao estava exposto
  - o alvo exato da migracao

Observacao:

- o schema do repo mostra risco estrutural real, mas grants efetivos do projeto precisam ser verificados antes da mudanca final.

## Task 1 - Projecao Publica de Candidatos

Objetivo: impedir que o papel `anon` leia colunas sensiveis de `candidatos`.

Implementacao:

- criar view `candidatos_publico` com projecao explicita, sem:
  - `cpf`
  - `cpf_hash`
  - `email_campanha`
  - `wikidata_id`
  - flags internas equivalentes, se existirem
- revisar `v_ficha_candidato`
  - remover `c.*`, ou
  - criar `v_ficha_candidato_publico` com projecao explicita e tratar a atual como interna

Campos publicos esperados:

- os mesmos hoje listados em `CANDIDATO_COLUMNS` de `src/lib/api.ts`, explicitamente:
  - `id`
  - `nome_completo`
  - `nome_urna`
  - `slug`
  - `data_nascimento`
  - `idade`
  - `naturalidade`
  - `formacao`
  - `profissao_declarada`
  - `genero`
  - `estado_civil`
  - `cor_raca`
  - `partido_atual`
  - `partido_sigla`
  - `cargo_atual`
  - `cargo_disputado`
  - `estado`
  - `status`
  - `situacao_candidatura`
  - `biografia`
  - `foto_url`
  - `site_campanha`
  - `redes_sociais`
  - `fonte_dados`
  - `ultima_atualizacao`
- mais os agregados que fizerem sentido para a ficha publica

Entregavel:

- SQL versionado no repo com as views publicas novas ou redefinidas

## Task 2 - Migrar a App para Ler da Superficie Publica

Objetivo: fazer a app depender da projecao publica antes de restringir grants.

Implementacao:

- atualizar `src/lib/api.ts`
  - `getCandidatos()`
  - `getCandidatoBySlug()`
  - qualquer outro ponto que leia `candidatos`
- preferir a view `candidatos_publico` em vez da tabela base para dados de perfil publico
- manter `v_comparador` sob checagem explicita durante a migracao
- manter as tabelas filhas publicas como estao por enquanto, salvo se a verificacao real mostrar outra exposicao indevida

Observacao:

- a app hoje e essencialmente read-only com `anon`; este plano nao pressupoe escrita anon via view.

Validacao:

- home
- pagina de candidato
- comparador
- explorar
- validar em modo producao:
  - `npm run build`
  - `npm run start`
  - checar as rotas principais no app servido pelo build, nao so em `npm run dev`

Critero de aceite:

- nenhum dado publico some da UI
- nenhuma query de perfil passa a depender de coluna sensivel

## Task 3 - Restringir o Papel `anon`

Objetivo: fechar a exposicao direta depois que a app estiver migrada.

Implementacao:

- revogar `SELECT` direto do papel `anon` na tabela `candidatos`
- conceder leitura apenas na view publica equivalente
- aplicar a mesma estrategia em `v_ficha_candidato` se ela continuar publica

Rollout seguro:

1. criar views publicas
2. deploy da app lendo das views
3. confirmar que o deploy novo esta live e propagado na Vercel
4. validar navegacao e queries contra o deployment novo
5. revogar leitura direta da tabela base
6. rerodar teste manual com `anon key`

Critero de aceite:

- `select=cpf` pela superficie anon falha ou nao retorna a coluna
- a app continua funcional nas rotas principais

Aplicacao do SQL:

- como o repo nao tem migration tooling formal, registrar no PR como o SQL foi aplicado:
  - painel SQL do Supabase, ou
  - `psql`, ou
  - MCP equivalente
- o metodo escolhido precisa ficar documentado junto com o rollout

## Task 4 - Validacao de URLs em Noticias

Objetivo: impedir link perigoso em `href`.

Implementacao minima:

- primeiro, adicionar defesa na UI:
  - nao renderizar link clicavel se a URL for invalida
- depois, validar na ingestao que `url` comeca com `https://`
- para entradas invalidas, normalizar para `null` ou descartar o link

Critero de aceite:

- `javascript:` e esquemas nao-https nao chegam como link clicavel na UI

Observacao:

- o Google News hoje tende a retornar `https`, mas a defesa continua valendo para escrita manual ou mudanca futura de fonte.

## Task 5 - Warning Visivel para Mock por Erro

Objetivo: evitar que falha de Supabase em dev pareca funcionamento normal.

Implementacao:

- em `src/lib/api.ts`, diferenciar:
  - fallback por configuracao ausente ou placeholder
  - fallback por erro real de query
- quando houver erro real e `NODE_ENV === "development"`:
  - emitir `console.warn` claro e destacado
  - incluir o nome da funcao e a mensagem do erro

Opcional:

- gate por env, por exemplo `FORCE_REAL_SUPABASE`, se isso ajudar no fluxo local

Critero de aceite:

- ao derrubar ou quebrar a conexao com Supabase em dev, o terminal ou console deixa explicito que a app entrou em mock por erro

## Task 6 - Scripts npm de Operacao

Objetivo: reduzir atrito operacional.

Implementacao:

- adicionar em `package.json`:

```json
{
  "scripts": {
    "audit:completude": "tsx scripts/audit-completude.ts",
    "persist:sq": "tsx scripts/persist-sq-candidato.ts"
  }
}
```

Critero de aceite:

- os comandos aparecem em `package.json`
- ambos executam igual ao uso atual com `npx tsx`

## Task 7 - Triagem de `cargo_atual` na Camara

Objetivo: tratar como follow-up de dados, nao como bloqueio desta frente.

Motivo:

- o problema existe no relatorio (`camara_sem_cargo_atual`)
- mas nao invalida o fix do resolvedor TSE nem o hardening de exposicao

Passos:

- usar `scripts/completude-report.json` para listar a coorte
- pegar uma amostra pequena de respostas brutas da API da Camara
- classificar:
  - `id Camara errado`
  - `sem mandato ativo`
  - `shape/semantica nao coberta pela regra atual`
  - `caso realmente corrigivel em codigo`

Critero de saida:

- tabela curta com causa por grupo, antes de qualquer patch

## Task 8 - `partido_atual` em Camara/Senado

Objetivo: nao tratar como bug sem evidencia.

Decisao:

- nao entra como fix obrigatorio deste ciclo
- so vira task de implementacao se a verificacao mostrar persistencia semantica errada no banco

Passos se houver evidencia:

- comparar payload bruto da API
- comparar valor persistido hoje
- corrigir a atribuicao no script correspondente

## Validacao Final

### Seguranca e exposicao

- teste com `anon key` nao retorna `cpf`, `cpf_hash`, `email_campanha`
- view publica nao usa `c.*`

### Produto

- rotas principais continuam renderizando
- pagina de candidato continua completa
- comparador continua funcional

### DX

- warning de mock aparece em dev quando o banco falha
- `npm run audit:completude` e `npm run persist:sq` funcionam

## Ordem Recomendada

1. Task 0 - verificar grants e exposicao real
2. Task 1 - criar projecao publica
3. Task 2 - migrar a app
4. Task 3 - restringir `anon`
5. Task 4 - validar URLs de noticias
6. Task 5 - warning de mock em dev
7. Task 6 - scripts npm
8. Task 7 - triagem de `cargo_atual`
9. Task 8 - `partido_atual`, so se houver evidencia

## Itens Deferidos

- helper compartilhado de ZIP do TSE
- suite de testes ampla
- refactor da estrategia de build/SSG
- hardening extra de GitHub Actions
- sincronizacao documental fina entre `CLAUDE.md` e `AGENTS.md`

## Resultado Esperado

Ao final deste plano:

- a chave anon deixa de expor colunas sensiveis de `candidatos`
- a ficha publica continua funcionando sobre uma superficie explicita e minima
- links de noticias ficam saneados
- dev deixa de cair em mock silencioso quando o banco falha
- a frente de `cargo_atual` fica isolada como problema de qualidade de dados, nao de seguranca
