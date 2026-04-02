# Puxa Ficha - Plano Fail-Closed e Auditoria Total da Base

## Goal

Garantir que o site so publique informacao factual auditada, consistente entre todas as abas e sustentada por fonte rastreavel, com auditoria real de `144/144` candidatos antes de considerar o produto pronto para ir ao ar sem ressalvas editoriais.

Este plano parte do principio de produto que faltava nas frentes anteriores:

- dado nao verificado nao publica
- placeholder fraco nao publica
- aviso publico nao substitui correcao
- inconsistencia entre abas e `fail` de publicacao
- candidato sem fechamento de P0 e P1 nao entra no ar em producao publica

## Relacao com os Planos Anteriores

Este plano usa como pre-condicoes:

- [2026-03-31-pipeline-fix-final.md](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/docs/plans/2026-03-31-pipeline-fix-final.md)
  - resolveu cobertura estrutural de pipeline
- [2026-04-01-hardening-plan.md](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/docs/plans/2026-04-01-hardening-plan.md)
  - endureceu superficie publica e DX
- [2026-03-31-auditoria-factual-site.md](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/docs/plans/2026-03-31-auditoria-factual-site.md)
  - abriu a base de snapshot, regras e playbook

Este plano nao reabre o pipeline TSE nem o hardening de exposicao. Ele muda a regra de publicacao do produto e fecha a auditoria factual total da base.

## Diagnostico Confirmado

Estado real que motivou este plano:

- a base atual tem `144` candidatos em [data/candidatos.json](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/data/candidatos.json)
- existem `207` registros em `historico_politico` derivados de `Wikipedia (categorias)` com `periodo_inicio = 0`
- existem divergencias reais entre `partido_sigla` atual e a ultima entrada de `mudancas_partido` em parte da base
- a UI ja mostrou contradicoes internas no mesmo candidato:
  - bio/hero coerentes com partido atual
  - timeline partidaria parada em partido antigo
  - historico politico com cargos inferidos por categoria e publicados como se fossem fatos
- as rodadas verdes da Fase 1 significaram consistencia entre snapshot e assertions curadas, nao validacao factual independente de toda a base

Conclusao:

- o problema nao e mais so de cobertura
- o problema nao e mais so de pipeline
- o problema agora e de regra de publicacao, camada canonica e fechamento editorial de `100%` da base

## Regra de Produto

O produto passa a operar em modo `fail-closed`.

Isso significa:

- nenhuma secao publica pode ler dado bruto de baixa confianca
- nenhuma aba pode montar narrativa propria fora do snapshot canonico
- nenhum candidato publico pode ter P0 ou P1 em estado `pendente`
- nenhum candidato publico pode ter contradicao entre hero, bio, cards, tabs, comparador e explorar
- se o dado nao estiver fechado, o candidato nao publica em producao publica

Observacao importante:

- warning continua existindo como ferramenta interna de auditoria
- warning nao aparece para usuario final
- em producao, a saida e binaria:
  - `publicavel`
  - `nao publicavel`

## Definicao de "Completo"

Para este plano nao virar meta infinita, "completo" precisa ser definido.

### Core obrigatorio para todos os 144 candidatos

- nome_completo
- nome_urna
- partido_atual
- partido_sigla
- cargo_disputado
- estado ou `null` justificado para presidenciavel
- situacao_candidatura
- cargo_atual quando houver mandato ou funcao publica relevante atual
- foto correta
- biografia factual curta coerente com os demais campos
- historico partidario coerente com o partido atual
- historico politico sem placeholders fracos publicados

### Dominio obrigatorio quando existir fonte publica confiavel

- patrimonio mais recente
- financiamento mais recente
- total de processos com fonte
- gastos parlamentares para quem tiver mandato coberto pela API
- projetos e votacoes para quem tiver mandato coberto pela API

### Regra editorial

- secao com dado publico inexistente pode ficar ausente do produto
- secao com dado publico existente mas nao verificado bloqueia publicacao
- secao baseada em fonte fraca nao publica

## Arquitetura Alvo

### Camada 1 - Raw

Tabelas de ingestao e scripts atuais continuam existindo como origem tecnica.

Exemplos:

- `candidatos`
- `historico_politico`
- `mudancas_partido`
- `patrimonio`
- `financiamento`

Essa camada deixa de ter permissao implicita de ir para a UI so porque existe.

### Camada 2 - Factual Curada

Criar uma camada canonica e rastreavel para publicacao.

Recomendacao:

- manter raw e factual separadas
- nao sobrescrever silenciosamente a origem bruta
- usar tabelas ou overlays curados por dominio

Shape minimo por registro factual:

- `source_type`
- `source_label`
- `source_ref`
- `verified_by`
- `verified_at`
- `review_status`
- `publicavel`
- `confidence`
- `notes`

Dominios que precisam de camada factual propria:

- identidade do candidato
- partido atual
- historico partidario
- cargo atual
- historico politico
- biografia factual curta
- patrimonio/financiamento mais recente
- processos basicos

### Camada 3 - Snapshot Publicavel

Toda a UI passa a ler um snapshot unico por candidato, derivado apenas da camada factual curada.

Esse snapshot precisa carregar:

- todos os campos P0
- todos os campos P1 publicaveis
- status interno de auditoria
- status binario de publicacao
- hash ou timestamp de revisao para invalidar cache

### Camada 4 - Gate de Publicacao

Build, deploy e publicacao ficam subordinados a um gate tecnico.

A regra e:

- se um candidato publico falhar em P0 ou P1, a producao falha
- se a UI divergir do snapshot canonico, a producao falha
- se houver secao publica lendo fonte quarentenada, a producao falha

## Scope

### Dentro

- superficie publica de ficha, comparador, home, explorar e listas estaduais
- snapshot canonico do candidato
- camada factual curada
- gate pre-deploy e gate de producao
- auditoria factual `144/144`
- auditoria de consistencia entre todas as abas e superficies publicas

### Fora

- redesign visual
- novas analises editoriais por IA
- expansao livre de fontes de baixa confianca
- publicar antes de fechar a base inteira

## Quarentena Imediata

Antes do backfill total, a base precisa parar de promover lixo para a superficie publica.

Itens a quarentenar:

- `historico_politico` com `eleito_por = "Wikipedia (categorias)"` e `periodo_inicio <= 0`
- timelines partidarias cuja ultima troca conflita com `partido_sigla` atual
- biografias ou cards derivados de campos em conflito
- qualquer secao que hoje dependa de inferencia bruta e nao de fato auditado

Regra:

- quarentena e interna
- nao resolve o problema
- so impede que o dado fraco continue contaminando o site enquanto a auditoria total roda

## Fases de Execucao

## Fase 0 - Congelar Fonte Fraca na Superficie Publica

Objetivo: impedir regressao enquanto a auditoria total e executada.

Passos:

- identificar todas as rotas e componentes que ainda leem historico ou timeline de partido sem gate factual
- impedir leitura publica de rows quarentenadas
- criar relatorio de tudo que foi removido da superficie publica por baixa confianca
- garantir que nenhum componente monte bio ou timeline por transformacao paralela fora do snapshot

Entregaveis:

- lista de dominios quarentenados
- relatorio de rows removidas
- contrato temporario de leitura da UI so a partir do snapshot publicavel

## Fase 1 - Criar a Camada Canonica de Publicacao

Objetivo: separar o que e dado bruto do que e dado pronto para publicar.

Passos:

- modelar tabelas ou overlays factuais por dominio
- criar ou reescrever a view/snapshot unico de publicacao
- adicionar provenance e revisao por campo ou por bloco
- garantir que o snapshot tem uma unica resposta para:
  - hero
  - bio
  - cards
  - tabs
  - comparador
  - explorar

Arquivos e areas candidatas:

- `supabase/migrations/*`
- [scripts/schema.sql](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/scripts/schema.sql)
- [src/lib/api.ts](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/src/lib/api.ts)
- [src/lib/types.ts](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/src/lib/types.ts)
- [src/lib/candidate-integrity.ts](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/src/lib/candidate-integrity.ts)

Entregaveis:

- snapshot canonico auditavel
- status binario `publicavel`
- modelo de provenance rastreavel

## Fase 2 - Auditoria Automatizada de Todos os 144 Candidatos

Objetivo: produzir um inventario factual real da base inteira, nao so coortes.

Passos:

- criar um script de auditoria global que rode em `144/144`
- medir por candidato:
  - identidade
  - partido atual
  - cargo atual
  - cargo disputado
  - estado
  - situacao
  - foto
  - biografia factual curta
  - historico politico
  - historico partidario
  - patrimonio
  - financiamento
  - processos
- classificar cada candidato em:
  - `ready`
  - `needs_curation`
  - `blocked_source`
  - `conflict`
  - `non_publishable`

Artefatos esperados:

- `scripts/audit-total-candidatos.ts`
- `scripts/audit-total-report.json`
- `scripts/audit-total-summary.md`
- `scripts/audit-total-queue.json`

Regras:

- nao basta contar rows
- precisa validar coerencia entre dominios
- precisa validar se a ultima filiacao bate com o partido atual
- precisa validar se a bio nao afirma cargo contraditorio ao historico auditado

## Fase 3 - Backfill e Curadoria Editorial 144/144

Objetivo: fechar os conflitos e pendencias ate a base inteira ficar publicavel.

Ordem recomendada:

1. presidenciaveis
2. governadores prioritarios e nomes de maior impacto
3. candidatos com mandato atual
4. demais governadores
5. long tail ate fechar `144/144`

Regras operacionais:

- cada candidato precisa de fechamento P0 e P1
- cada candidato precisa de um responsavel por revisao
- cada alteracao factual precisa carregar fonte e data
- party history precisa terminar no partido atual ou ficar fora da publicacao ate ser corrigido
- historico politico nao pode publicar cargo sem periodo e sem fonte forte

Saidas:

- fila editorial real de revisao
- dossier por candidato ou por lote
- status consolidado por coorte e por base total

## Fase 4 - Auditoria Real da UI para Todos os Candidatos

Objetivo: provar que o que foi publicado bate exatamente com o snapshot canonico.

Passos:

- crawlear todas as paginas de candidato publicaveis
- extrair de forma estruturada os campos visiveis de:
  - hero
  - bio
  - indicadores principais
  - historico politico
  - historico partidario
  - comparador
  - explorar
- comparar cada superficie com o snapshot canonico
- marcar qualquer contradicao como `fail`

Artefatos esperados:

- `scripts/audit-ui-candidatos.ts`
- `scripts/audit-ui-report.json`
- `scripts/audit-ui-summary.md`

Regras:

- heroi dizendo uma coisa e aba dizendo outra e `fail`
- home/comparador/explorar divergindo da ficha e `fail`
- secao ausente por regra de produto e aceitavel
- secao publicada com valor errado e `fail`

## Fase 5 - Gate Duro de Publicacao

Objetivo: impedir que o site volte a publicar erro factual ou inconsistencia interna.

Implementacao minima:

- comando unico de gate:
  - `npm run audit:publish`
- gate falha se houver:
  - qualquer candidato publico com `publicavel = false`
  - qualquer candidato com P0 ou P1 reprovado
  - qualquer divergencia UI x snapshot
  - qualquer leitura publica de fonte quarentenada

Pontos de execucao:

- local antes de deploy
- CI
- pre-deploy em preview critica
- producao

## Fase 6 - Operacao Continua

Objetivo: manter a base confiavel apos o fechamento inicial.

Triggers:

- mudanca em `data/candidatos.json`
- mudanca em scripts de ingestao
- mudanca em assertions ou curadoria factual
- mudanca em componentes que renderizam campos P0/P1
- sincronizacao de banco antes de deploy

Saidas:

- diff entre rodadas
- regressao por candidato
- log de campos alterados
- lista de candidatos que perderam status `publicavel`

## Auditoria Real de Todos os Candidatos

Este plano exige duas coisas separadas e obrigatorias:

### 1. Auditoria automatizada `144/144`

Medir toda a base, detectar conflito e organizar fila.

### 2. Auditoria editorial `144/144`

Fechar manualmente ou assistidamente todos os candidatos ate zerar:

- partido errado
- cargo errado
- estado errado
- bio contraditoria
- historico politico placeholder
- timeline partidaria desatualizada
- foto errada

O site nao e considerado pronto para ir ao ar enquanto essa segunda camada nao estiver fechada.

## File Map Proposto

- `supabase/migrations/*`
  - camada factual e view de publicacao
- [scripts/schema.sql](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/scripts/schema.sql)
  - refletir novo modelo
- `scripts/audit-total-candidatos.ts`
  - auditoria automatizada `144/144`
- `scripts/audit-ui-candidatos.ts`
  - auditoria da superficie publicada `144/144`
- `scripts/check-publication-gate.ts`
  - gate duro de publicacao
- `scripts/build-public-candidate-snapshot.ts`
  - monta snapshot canonico
- `scripts/lib/factual-sources.ts`
  - matriz de fonte por campo
- `scripts/lib/factual-queue.ts`
  - fila editorial consolidada
- [scripts/lib/enrich-wiki-historico.ts](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/scripts/lib/enrich-wiki-historico.ts)
  - rebaixar para sugestao interna ou retirar do caminho de publicacao
- [src/lib/api.ts](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/src/lib/api.ts)
  - ler apenas a superficie auditada
- componentes de ficha/comparador/explorar/home
  - parar de derivar fatos fora do snapshot

## Criterios de Sucesso

Para considerar este plano concluido:

- `144/144` candidatos auditados
- `144/144` candidatos com fechamento P0
- `144/144` candidatos com fechamento P1 aplicavel
- `0` rows publicadas com fonte quarentenada
- `0` contradicoes entre hero, bio, tabs, cards, comparador e explorar
- `0` candidatos publicos com timeline partidaria divergente do partido atual
- `0` cargos placeholder do tipo `0 - atual`
- gate de publicacao obrigatorio passando em CI e pre-deploy

## Decisao de Lancamento

Se o objetivo editorial e colocar o produto no ar com confianca real, o lancamento fica subordinado a este plano.

Isso significa:

- preview interna pode continuar existindo para trabalho
- producao publica so abre quando a base inteira estiver fechada
- se a auditoria total encontrar lacunas sem fonte confiavel, o lancamento atrasa; o site nao publica "mais ou menos"

## Ordem Pratica de Execucao

1. quarentenar definitivamente fonte fraca da superficie publica
2. criar camada factual e snapshot publicavel
3. rodar auditoria automatizada `144/144`
4. abrir fila editorial total
5. fechar a base por lotes ate `144/144`
6. rodar auditoria de UI `144/144`
7. ligar gate duro de publicacao

## Nota de Metodo

Este plano e deliberadamente mais duro que os anteriores.

Os planos anteriores resolveram:

- cobertura
- matching
- hardening de exposicao
- infraestrutura de auditoria

Este plano resolve a pergunta final do produto:

- "o que esta escrito no site esta certo de ponta a ponta?"

Enquanto essa resposta nao for `sim` para `144/144`, o produto nao deve ser tratado como pronto para lancamento publico definitivo.
