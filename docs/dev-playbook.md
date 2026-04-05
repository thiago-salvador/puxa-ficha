# Playbook de Desenvolvimento

Guia operacional curto para novas sessoes de trabalho no Puxa Ficha.

Use este documento para lembrar o fluxo de execucao, validacao e fechamento. Regras estaveis do projeto continuam em `AGENTS.md` e `CLAUDE.md`. Auditorias longas ficam nos documentos de auditoria, nao aqui.

## 1. Como comecar uma sessao

1. Ler `AGENTS.md` e este playbook.
2. Fazer uma passada rapida no estado atual antes de editar:
   - `git status --short`
   - ler os arquivos diretamente afetados
   - se a mudanca tocar deploy, dados ou auditoria, revisar tambem os scripts relacionados
3. Classificar a mudanca antes de mexer:
   - UI publica
   - data layer / tipos
   - schema / Supabase
   - pipeline / auditoria factual
   - deploy / Vercel / GitHub

## 2. Regra do Gemma

Use Gemma para trabalho limitado, mecanico e de baixo risco. Quando a tarefa for roteada para Gemma:

1. subir ou verificar com `/Users/thiagosalvador/Documents/Apps/Tools/gemma-ensure.sh`
2. aguardar o retorno do Gemma, mesmo que demore um pouco mais
3. so desistir ou cair para o modelo principal se houver falha clara:
   - `GEMMA_OFFLINE`
   - timeout real e repetido
   - resposta inutilizavel apos validacao
4. validar manualmente o output antes de aplicar

Regra pratica:

- se decidiu usar Gemma, espere primeiro
- nao trocar de volta por impaciencia

## 2.1 Fluxo para tarefas complexas

Quando a tarefa for complexa, cara em tokens ou exigir muito contexto, usar este fluxo:

1. Codex enquadra o problema e define o objetivo
2. Codex quebra em subtarefa(s) delimitada(s)
3. Gemma executa o levantamento mecanico, o rascunho ou a analise operacional
4. Codex revisa criticamente a saida
5. Codex decide o patch, a execucao final ou o bloqueio

Use esse fluxo especialmente para:

- drift de migrations
- reconciliação entre schema, app e scripts
- refactors mecanicos grandes
- leitura de logs extensos
- consolidacao de docs e relatorios

Regra adicional:

- nao usar Gemma como autoridade final
- usar Gemma como worker de contexto e execucao bounded

## 3. Matriz de validacao por tipo de mudanca

### UI publica

Rodar:

```bash
npm run lint
npm run build
```

Verificar tambem:

- estados vazios
- contadores
- textos de CTA
- mobile e desktop quando a mudanca for estrutural

### Data layer, `src/lib/api.ts`, helpers compartilhados ou tipos

Rodar:

```bash
npm run test
npm run check:scripts
npm run build
```

Verificar tambem:

- caminho live
- fallback mock
- comportamento degradado, se existir

### Schema, views, migrations ou semantica de contadores

Obrigatorio:

- criar migration nova em `supabase/migrations/`
- atualizar `scripts/schema.sql`
- alinhar consumidores no app e scripts

Rodar:

```bash
npm run check:scripts
npm run build
```

Se depender do banco remoto:

- validar `supabase migration list`
- so aplicar migration se o historico remoto estiver consistente
- se houver drift, registrar o bloqueio e garantir fallback seguro no app

### Timeline dedicada (`/candidato/{slug}/timeline`)

- Rota publica no App Router com ISR 1h e OG em `.../timeline/opengraph-image`. O deploy em producao precisa incluir essa rota; ate la, `https://puxa-ficha.vercel.app/candidato/{slug}/timeline` pode responder **404** mesmo com `/candidato/{slug}` em 200.
- Apos promover deploy: conferir **HTTP 200** em pelo menos um slug publico (ex.: `curl -sI` ou `npm run audit:release-verify` com `VERIFY_URL` da producao). O `release-verify` valida a timeline para cada slug publico do coorte do relatorio factual.

### Quiz (`/quiz`) e producao

- Rotas do quiz existem no App Router; o dominio publico so as expoe apos **deploy** da branch correta (nao confundir worktree local com producao ate promover).
- Tabela `posicoes_declaradas`: migration em `supabase/migrations/` deve estar **aplicada** no projeto Supabase remoto; sem ela o PostgREST pode reportar tabela ausente e o score de posicoes fica degradado.
- Testes visuais do quiz com `npm run start` + `http://127.0.0.1`: headers agressivos de HTTPS nao sao aplicados fora da Vercel (ver `next.config.ts`); ainda e necessario `playwright install webkit` para o preset mobile.

### Pipeline, auditoria factual e release verify

Rodar conforme o caso:

```bash
npm run check:scripts
npm run audit:factual
npm run audit:release-verify
```

Ou as variantes parciais/coortes quando a mudanca for localizada.

## 4. Regras que sempre valem

- nao acessar Supabase direto das paginas; usar `src/lib/api.ts`
- nao expor `SUPABASE_SERVICE_ROLE_KEY` no client
- nao usar heuristica textual para classificar fatos editoriais se existir campo estrutural
- toda mudanca de schema precisa de migration e atualizacao do schema canonico
- toda mudanca que altera semantica de contador precisa alinhar UI, app server e verificadores
- toda mudanca editorial em `pontos_atencao` deve respeitar `categoria`

## 5. Quando atualizar documentacao

Atualize `AGENTS.md` ou `CLAUDE.md` apenas se a regra:

- vale para sessoes futuras
- e objetiva
- e verificavel
- ja custou bug, retrabalho ou ambiguidade real

Use a auditoria longa para evidencia historica, nao como prompt base.

## 6. Fechamento da sessao

Antes de considerar uma sessao encerrada:

1. revisar `git diff --stat`
2. executar a matriz de validacao proporcional ao risco
3. mencionar bloqueios externos de forma explicita
4. registrar se faltou aplicar algo em Supabase, Vercel ou GitHub
5. so commitar depois da validacao minima do tipo de mudanca
