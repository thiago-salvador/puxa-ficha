# Puxa Ficha - Plano de Auditoria Factual do Site

## Objetivo

Criar um processo confiavel para verificar se as informacoes publicadas sobre cada candidato estao factualmente corretas, com foco especial em campos sensiveis e erros de alto impacto reputacional, como partido errado, cargo errado, patrimonio errado, estado errado ou dados judiciais incorretos.

Este plano e separado do plano de pipeline/completude. O plano da pipeline resolve cobertura e ingestao. Este aqui resolve integridade factual e confianca editorial.

## Motivacao

Incidentes como partido errado em um presidenciavel mostram um risco diferente de "perfil vazio". Mesmo quando a pipeline entrega dados, o site pode continuar publicando informacao errada. Para um produto cuja proposta e justamente "consultar a ficha dos candidatos", erro factual em campo sensivel e falha de produto.

## Restricao de Arquitetura

A arquitetura do site vai mudar em outra frente de trabalho. Entao a auditoria nao pode depender dos componentes, rotas ou estrutura atual do frontend.

A auditoria deve operar em tres camadas estaveis:

1. Contrato canonico de dados do candidato
2. Fonte de verdade por campo
3. Snapshot publico renderizado no site

Se a arquitetura mudar, a auditoria continua valida desde que exista:

- um snapshot canonico do candidato
- um adaptador para a nova camada de dados
- uma checagem final do que foi efetivamente publicado

Observacao de fase:

- as camadas 1 e 2 sao prioridade imediata
- a camada 3 deve entrar como Fase 2+, quando a nova arquitetura do frontend estiver mais estavel

## Principios

- Auditoria factual e separada de auditoria de completude.
- Campo critico errado e pior que campo vazio.
- Fonte de verdade deve ser explicita por campo.
- Campos editoriais nao podem ser tratados como equivalentes a campos factuais.
- Match ambiguo deve virar revisao manual, nunca autopublicacao.
- O site precisa distinguir:
  - dado confirmado
  - dado nao encontrado
  - dado pendente de revisao

## Escopo

### P0 - Campos Criticos

Esses campos precisam de validacao forte e gate de publicacao.

- nome_completo
- nome_urna
- partido_atual
- partido_sigla
- cargo_atual
- cargo_disputado
- estado
- situacao_candidatura
- patrimonio mais recente
- financiamento mais recente
- existencia e contagem basica de processos

### P1 - Campos Factuais Relevantes

- data_nascimento
- naturalidade
- formacao
- profissao_declarada
- historico_politico
- gastos parlamentares
- votos em votacoes-chave
- projetos de lei
- foto correta do candidato

### P2 - Campos Editoriais e Derivados

- biografia curta
- pontos de atencao
- resumos interpretativos
- textos de cards e snapshots

Campos P2 exigem revisao humana sempre que forem gerados ou alterados automaticamente.

## Fonte de Verdade por Campo

O plano precisa formalizar uma matriz de fontes por campo. Exemplo inicial:

- partido_atual / partido_sigla:
  - fonte de publicacao: cadastro canonico curado com provenance
  - fonte de confirmacao: API oficial do mandato atual quando houver
- cargo_atual:
  - fonte de publicacao: snapshot canonico persistido
  - fonte de confirmacao: API oficial de Camara ou Senado com gate de mandato ativo
- cargo_disputado / estado:
  - fonte primaria: cadastro curado eleitoral
- situacao_candidatura:
  - fonte primaria: TSE
- patrimonio / financiamento:
  - fonte primaria: TSE
- processos:
  - fonte primaria: base estruturada curada com fonte anexada
- historico_politico:
  - fonte primaria: APIs oficiais
  - fallback: curadoria estruturada
- biografia factual:
  - fonte primaria: texto curado
  - fallback: fonte terciaria sinalizada como nao revisada

Essa matriz deve virar artefato de codigo, nao apenas texto.

## Arquitetura da Auditoria

### Camada 1 - Snapshot Canonico

Criar um snapshot canonico por candidato, independente da UI. Esse snapshot representa o que o produto considera "verdade publicada" em nivel de dominio.

Exemplo de shape:

```ts
interface CandidatePublicSnapshot {
  slug: string
  nome_completo: string
  nome_urna: string
  partido_sigla: string | null
  partido_atual: string | null
  cargo_atual: string | null
  cargo_disputado: string
  estado: string | null
  situacao_candidatura: string | null
  patrimonio_mais_recente: number | null
  financiamento_mais_recente: number | null
  total_processos: number
  foto_url: string | null
  auditoria_status: "auditado" | "pendente" | "reprovado"
}
```

O auditor nao deve depender de componentes React nem da estrutura de paginas. Ele deve ler esse snapshot da camada de dados.

### Camada 2 - Motor de Regras

Criar um motor de regras por campo:

- origem esperada
- nivel de criticidade
- tipo de comparacao
- tolerancia
- se exige revisao humana

Exemplo:

- `partido_sigla`
  - criticidade: critica
  - comparacao: igualdade exata
  - fonte primaria obrigatoria
- `patrimonio_mais_recente`
  - criticidade: critica
  - comparacao: valor e ano
  - permite vazio apenas se explicitamente classificado como "sem declaracao encontrada"

### Camada 3 - Verificacao Publica

Mesmo com snapshot correto, a renderizacao pode publicar algo errado. Entao precisa existir uma checagem final do site publicado:

- para um conjunto de candidatos prioritarios
- extrair os campos visiveis da pagina publica
- comparar com o snapshot canonico

Isso deve ser desacoplado da arquitetura atual. Se a UI mudar, troca-se o adaptador de extracao, nao o plano de auditoria.

Nota de rollout:

- esta camada nao precisa ser implementada na primeira fase
- a primeira fase deve concentrar esforco em snapshot canonico, regras e revisao factual
- a verificacao publica entra quando a nova arquitetura estabilizar

## Entregaveis

- `scripts/audit-factual.ts`
  - gera auditoria factual por candidato
- `scripts/sync-audit-assertions.ts`
  - aplica correcao factual curada no banco por coorte
- `scripts/check-audit-gate.ts`
  - gate leve para bloquear regressao em coortes criticas
- `scripts/lib/audit-rules.ts`
  - matriz de regras por campo
- `scripts/lib/source-of-truth.ts`
  - matriz de fontes por campo
- `scripts/lib/factual-assertions.ts`
  - assertions P0 por coorte prioritaria
- `scripts/audit-factual-report.json`
  - output machine-readable
- `scripts/audit-factual-summary.md`
  - resumo editorial legivel para triagem rapida
- `scripts/audit-factual-state.json`
  - estado persistente por candidato
- `scripts/audit-factual-history.json`
  - historico resumido das execucoes
- `docs/auditoria-factual-playbook.md`
  - playbook de revisao manual

Opcional em fase seguinte:

- tabela `auditoria_factual` no banco para historico
- dashboard de cobertura factual

## Workflow

### Etapa 1 - Definir o Contrato Canonico

Objetivo: fechar um DTO publico estavel do candidato.

Regras:

- o DTO nao pode depender da UI
- o DTO precisa cobrir todos os campos P0 e P1
- toda pagina publica deve derivar desses dados, nao de transformacoes paralelas

### Etapa 2 - Criar a Matriz de Fontes

Objetivo: para cada campo, declarar:

- fonte primaria
- fonte secundaria
- tipo de comparacao
- severidade
- se aceita fallback
- se exige revisao humana

### Etapa 3 - Auditoria Automatizada de Banco/Snapshot

Objetivo: comparar o snapshot canonico com a fonte de verdade.

Nota de fase:

- antes de a camada canônica completa estar pronta para toda a base, a auditoria pode operar com assertions curadas por coorte prioritaria
- a primeira coorte obrigatoria e a de presidenciaveis, por risco reputacional
- a segunda coorte recomendada e a de governadores prioritarios e nomes de maior trafego

Nota metodologica:

- coorte `alto-trafego` e um nome de compatibilidade para a coorte editorial de alto trafego estimado
- ela nao representa analytics reais automaticamente atualizados
- quando o site tiver analytics confiaveis no processo, essa coorte deve ser recalibrada periodicamente com dados reais de acesso

Saidas:

- `pass`
- `warning`
- `fail`
- `manual_review`
- snapshots persistidos por rodada para diff de regressão entre execuções

### Etapa 4 - Auditoria Publica do Site

Objetivo: validar que o que o usuario le no site bate com o snapshot canonico.

Escopo inicial:

- presidenciaveis
- governadores prioritarios
- candidatos com maior trafego

### Etapa 5 - Fila de Revisao Manual

Obrigatoria para:

- qualquer divergencia em campo P0
- qualquer ambiguidade de identidade
- qualquer campo P2
- qualquer dado juridico
- qualquer patrimonio/financiamento com resultado estranho ou inconsistente

Workflow minimo obrigatorio:

- owner:
  - Thiago ou editor responsavel designado
- sistema:
  - Notion, tabela interna no banco ou outro inbox estruturado
- campos minimos por item:
  - candidato
  - campo
  - valor publicado
  - valor esperado
  - fonte
  - severidade
  - status
  - responsavel
  - prazo

SLA sugerido:

- `S0`: revisao e decisao no mesmo dia
- `S1`: antes do proximo deploy editorial
- `S2`: backlog normal

### Etapa 6 - Gate de Publicacao

Regra sugerida:

- `fail` em campo P0 bloqueia publicacao daquele candidato
- `warning` em P1 nao bloqueia deploy, mas abre item de correção
- `manual_review` impede selo de "auditado"

Triggers reais:

- PR ou commit que altera `data/candidatos.json`
- PR ou commit que altera scripts de ingestao ou regras factuais
- rodagem agendada diaria ou noturna
- gate pre-deploy para campos `P0`
- diff entre a rodada anterior e a atual para detectar regressão factual antes de promover a publicação

## Classificacao de Severidade

- `S0`
  - erro em partido, cargo, estado, patrimonio, processo ou identidade do candidato
  - acao: correcao imediata
- `S1`
  - erro factual relevante em historico, biografia, formacao, situacao
  - acao: corrigir antes do proximo deploy editorial
- `S2`
  - erro menor de apresentacao, rotulo ou texto derivado
  - acao: corrigir sem urgencia critica

## Fases

### Fase 1 - Infraestrutura de Auditoria (paralela ao Pipeline Fix)

Objetivo: construir toda a infraestrutura de validacao factual enquanto o plano de pipeline fix roda em paralelo. Nenhuma etapa desta fase depende de dados corrigidos pela pipeline.

Etapas:

1. Definir o contrato canonico (`CandidatePublicSnapshot`) com todos os campos P0 e P1
2. Criar a matriz de fontes em codigo (`source-of-truth.ts`)
3. Criar o motor de regras em codigo (`audit-rules.ts`)
4. Definir o playbook de revisao manual (`auditoria-factual-playbook.md`)
5. Configurar a fila de revisao manual (owner, sistema, campos, SLAs)
6. Implementar metadados de proveniencia (`last_edited_by`, `last_edited_source`, etc.)

Entregas:

- `scripts/lib/audit-rules.ts`
- `scripts/lib/source-of-truth.ts`
- `docs/auditoria-factual-playbook.md`
- interface `CandidatePublicSnapshot` com `auditoria_status`
- fila de revisao manual configurada

O que NAO entra na Fase 1:

- rodar auditoria automatizada plena contra toda a base sem coorte curada
- revisao manual de candidatos (dados vao mudar)
- verificacao do site publicado (frontend em transicao)

Excecao operacional aplicada em 2026-03-31:

- a auditoria automatizada foi executada de forma controlada em coortes curadas (`presidenciaveis`, `governadores-prioritarios`, `alto-trafego`)
- esse modo nao depende da completude total da pipeline, porque compara snapshot + assertions P0 curadas e nao tenta validar toda a base

Leitura correta dos resultados:

- resultado `100% auditado` em coorte curada significa consistencia entre snapshot, banco/mock e assertions curadas
- isso nao substitui a verificacao humana da propria assertion
- a Fase 2a continua sendo a etapa que valida se as assertions P0 e P1 estao corretas no mundo real

#### Logs de Execucao da Fase 1

Data: `2026-03-31`

Escopo implementado:

- infraestrutura factual consolidada: contrato canonico, matriz de fontes, motor de regras, playbook, persistencia de estado e workflow de gate
- equivalencia canonica de partidos implementada para comparar sigla e nome completo sem falso positivo
- assertions P0 expandidas de `13` presidenciaveis para uma coorte editorial `alto-trafego` de `29` nomes
- `governadores-prioritarios` expandido de `8` para `16` nomes
- sincronizacao do banco e do fallback local a partir das assertions curadas
- snapshots versionados por rodada e diff factual entre execucoes

Arquivos criados ou evoluidos nesta execucao:

- `scripts/lib/audit-types.ts`
- `scripts/lib/source-of-truth.ts`
- `scripts/lib/audit-rules.ts`
- `scripts/lib/party-canonical.ts`
- `scripts/lib/factual-assertions.ts`
- `scripts/lib/audit-persistence.ts`
- `scripts/audit-factual.ts`
- `scripts/sync-audit-assertions.ts`
- `scripts/sync-mock-from-assertions.ts`
- `scripts/check-audit-gate.ts`
- `scripts/audit-factual-diff.ts`
- `.github/workflows/auditoria-factual.yml`
- `docs/auditoria-factual-playbook.md`

Correcoes factuais curadas aplicadas nesta rodada:

- `ciro-gomes` e `ciro-gomes-gov-ce` alinhados para `PSDB`
- `ronaldo-caiado` alinhado para `PSD`
- `sergio-moro-gov-pr` alinhado para `UNIAO`
- `jorginho-mello` alinhado para `PL` com `cargo_atual = "Governador de Santa Catarina"`
- `geraldo-alckmin` alinhado para `PSB`
- `cleitinho` alinhado com `nome_completo = "Cleiton Gontijo de Azevedo"` e `cargo_atual = "Senador(a)"`
- drift do fallback corrigido para `mateus-simoes` com `cargo_atual = null`

Caso especial monitorado:

- `geraldo-alckmin` e um caso atipico mas factualmente valido: `cargo_atual = "Vice-Presidente da Republica"` com `cargo_disputado = "Governador"`
- esse tipo de combinacao deve ser tratado como excecao editorial monitorada, nao como erro automatico do motor

Comandos executados:

```bash
npx tsx scripts/sync-mock-from-assertions.ts --cohort governadores-prioritarios
npx tsx scripts/sync-audit-assertions.ts --cohort governadores-prioritarios
npx tsx scripts/audit-factual.ts --cohort governadores-prioritarios --output-prefix governadores-prioritarios
npx tsx scripts/audit-factual.ts --cohort alto-trafego --output-prefix alto-trafego
npx tsx scripts/audit-factual.ts --cohort presidenciaveis --output-prefix presidenciaveis
npx tsx scripts/check-audit-gate.ts --report scripts/audit-factual-presidenciaveis-report.json --max-blocked 0 --min-assertions 13
npx tsx scripts/audit-factual-diff.ts --scope governadores-prioritarios --output-prefix governadores-prioritarios
npm run check:scripts
```

Resultados obtidos:

- `presidenciaveis`: `13/13` auditados, `0` bloqueados, gate factual verde
- `governadores-prioritarios`: `16/16` auditados, `0` bloqueados, `0` itens de revisao
- `alto-trafego` editorial: `29/29` auditados, `0` bloqueados, `0` itens de revisao
- diff de `governadores-prioritarios`: `8` nomes novos na coorte, `3` mudancas nao bloqueantes, `0` regressões
- `npm run check:scripts`: passou com a trilha factual incluida

Artefatos gerados:

- `scripts/audit-factual-presidenciaveis-report.json`
- `scripts/audit-factual-presidenciaveis-summary.md`
- `scripts/audit-factual-governadores-prioritarios-report.json`
- `scripts/audit-factual-governadores-prioritarios-summary.md`
- `scripts/audit-factual-alto-trafego-report.json`
- `scripts/audit-factual-alto-trafego-summary.md`
- `scripts/audit-factual-diff-governadores-prioritarios.json`
- `scripts/audit-factual-diff-governadores-prioritarios.md`
- `scripts/audit-factual-state.json`
- `scripts/audit-factual-history.json`
- `scripts/audit-factual-runs/`

### Fase 2 - Execucao da Auditoria (apos Pipeline Fix concluido)

Pre-requisito: Pipeline Fix Final concluido ate pelo menos Task 7 (rollout completo com `cargo_atual`, `tse_sq_candidato` e cobertura validada).

Motivo: rodar auditoria antes disso gera ruido, porque dezenas de erros que a pipeline ja vai corrigir apareceriam como falhas factuais. A auditoria deve validar o estado pos-correcao, nao o estado quebrado.

#### Fase 2a - Presidenciaveis

Objetivo: 100% de revisao factual manual e automatizada dos candidatos a presidencia.

Etapas:

1. Rodar auditoria automatizada (Etapa 3 do workflow) contra os 13 presidenciaveis
2. Revisao manual dos campos P0 e P1
3. Marcar `auditoria_status` por candidato
4. Resolver toda divergencia via fila de revisao

Criterio de conclusao:

- 0 erros P0 nos presidenciaveis
- 100% com `auditoria_status = "auditado"`

#### Fase 2b - Governadores Prioritarios

Objetivo: cobrir os estados com maior exposicao e risco reputacional.

Prioridade sugerida:

- SP
- MG
- RJ
- BA
- RS
- PR

Foco tecnico:

- expandir a auditoria automatizada para coortes maiores
- iniciar a camada 3 (verificacao publica) se a nova arquitetura do frontend ja estiver estavel

#### Fase 2c - Todos os Governadores

Objetivo: expandir a cobertura sem reduzir rigor.

#### Fase 2d - Monitoramento Continuo

Objetivo: transformar a auditoria em rotina.

Gatilhos:

- toda mudanca em `data/candidatos.json`
- toda nova ingestao
- toda alteracao em fontes criticas
- pre-deploy

Implementacao esperada:

- job em CI para PRs relevantes
- job agendado para revalidacao periodica
- gate de deploy para `P0 fail`

## Criterios de Sucesso

- 100% dos presidenciaveis auditados manualmente em campos P0 e P1
- 0 erros criticos conhecidos em campos P0 no site publico
- 100% dos campos P0 com fonte de verdade declarada em codigo
- divergencias entre snapshot e pagina publica detectadas automaticamente
- todo candidato com status de auditoria visivel internamente:
  - auditado
  - pendente
  - reprovado

## O Que Nao Entrar Neste Plano

Este plano nao substitui:

- o plano de completude/pipeline
- o plano de arquitetura do frontend
- o plano de enriquecimento editorial

Ele precisa conversar com esses planos, mas nao deve ser fundido com eles.

## Relacao com o Pipeline Fix Final

Este plano roda em duas fases justamente por causa da dependencia com o `2026-03-31-pipeline-fix-final.md`.

- **Fase 1** (infraestrutura) nao depende de dados corrigidos. Pode comecar imediatamente, em paralelo com qualquer task do pipeline fix.
- **Fase 2** (execucao) depende do pipeline fix concluido (Task 7: rollout com cobertura validada). Rodar antes gera ruido sem valor.

Pipeline melhora cobertura. Auditoria factual protege credibilidade. Os dois se complementam, mas nao devem ser confundidos.

## Proveniencia e Edicao (implementado na Fase 1, etapa 6)

Para campos P2 e qualquer campo sensivel editavel, registrar metadados minimos:

- `last_edited_by`
- `last_edited_source`
- `last_reviewed_by`
- `last_reviewed_at`

Objetivo:

- distinguir alteracao automatica de alteracao humana
- saber quando um campo exige nova revisao
- impedir que texto editorial alterado automaticamente passe como validado
