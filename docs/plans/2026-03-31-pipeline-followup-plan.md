# Puxa Ficha - Plano de Follow-up do Pipeline

## Objetivo

Fechar a segunda etapa do trabalho de pipeline apos o fix estrutural de `SQ_CANDIDATO`, `cargo_atual`, `patrimonio` e `financiamento`.

Este plano junta:

- o que faz sentido da leitura do Claude
- o que a triagem local mostrou no repositorio e no banco

Meta pratica:

- separar backlog real de backlog aparente
- atacar o proximo gargalo estrutural do pipeline
- restaurar capacidade de validacao tecnica do projeto
- registrar a divida de arquitetura que apareceu no build

## Status de Execucao

Status consolidado em `2026-04-01`:

- `Step 0` concluido
  - fix anterior commitado em `473cd13`
- `Fase 1` concluida
  - triagem materializada em `scripts/pipeline-followup-triage.json`
  - resultado final:
    - `duplicata=2`
    - `tem-dinheiro-sem-sq-validado=0`
    - `tem-dinheiro-sem-sq-sob-revisao=1`
    - `vazio-real=16`
- `Fase 2` executada com auditoria
  - `ingest-tse-situacao.ts` passou a usar o resolvedor TSE compartilhado
  - `dry-run` validado antes da persistencia
  - auditoria salva em `scripts/tse-situacao-audit.json`
  - `com_cpf` subiu de `68` para `116`
  - conflitos reais bloqueados:
    - `maria-do-carmo`
    - `joao-roma`
    - `rafael-greca`
- `Fase 3` concluida
  - `persist-sq-candidato.ts` rerodado com prioridade `sq-preloaded > cpf > nome`
  - `data/candidatos.json` consolidado para os slugs canonicos `tarcisio` e `ciro-gomes`
  - `gilberto-kassab` voltou para revisao manual apos detectar provenance incorreta
  - `SQ_CANDIDATO` persistido em `125/144`
  - `patrimonio` ficou em `123/144`
  - `financiamento` ficou em `117/144`
  - `cargo_atual` ficou em `67/144`
- `Fase 4` concluida
  - `npm run check:scripts` voltou a passar
- `Fase 5` concluida
  - ADR criada em `docs/adr/2026-03-31-build-rendering-strategy.md`
  - `npm run build` continua expondo timeouts de `fetch` durante o SSG, mas fecha com sucesso

## Estado Atual Consolidado

### Resultado do fix anterior

- `patrimonio`: `60/144 -> 125/144`
- `financiamento`: `56/144 -> 104/144`
- `cargo_atual`: `39/144 -> 62/144`
- `SQ_CANDIDATO`: `0/144 -> 114/144`

### Leitura correta dos 30 sem `SQ_CANDIDATO`

Os 30 restantes nao formam um unico problema.

#### Grupo A - Duplicata de pessoa por slug

Esses casos nao estao vazios. O `SQ_CANDIDATO` ja existe em outro slug da mesma pessoa.

- `tarcisio`
  - duplicado de `tarcisio-gov-sp`
- `ciro-gomes`
  - duplicado de `ciro-gomes-gov-ce`

Decisao pendente de modelagem:

- definir um outcome explicito para cada duplicata:
  - redirecionar o slug sem sufixo para o slug canonico
  - consolidar os dados do slug com sufixo no slug principal
  - deprecar um dos dois slugs

Regra:

- Grupo A nao pode ficar apenas "diagnosticado"
- cada caso precisa sair desta fase com destino definido e documentado

#### Grupo B - Sem `SQ_CANDIDATO`, mas com dinheiro ja presente

Esses casos precisam de triagem, mas nao bloqueiam o objetivo principal de "perfil vazio".

- `aldo-rebelo`
- `gilberto-kassab`
- `rafael-greca`
- `paulo-martins-gov-pr`
- `joao-rodrigues`
- `marcos-vieira`
- `eduardo-paes`
- `garotinho`
- `jeronimo`
- `lucas-ribeiro`
- `renan-filho`
- `maria-do-carmo`

#### Grupo C - Sem `SQ_CANDIDATO` e realmente vazios na parte TSE

Esses sao o backlog real prioritario do follow-up.

Prioridade interna:

- presidenciavel primeiro
- governadores depois

- `rui-costa-pimenta`
- `evandro-augusto`
- `mateus-simoes`
- `gabriel-azevedo`
- `pazolini`
- `paulo-hartung`
- `orleans-brandao`
- `alysson-bezerra`
- `mailza-assis`
- `andre-kamai`
- `simao-jatene`
- `ricardo-cappelli`
- `adriana-accorsi`
- `jose-eliton`
- `joao-henrique-catan`
- `natasha-slhessarenko`

## Principios

- Nao tratar todos os 30 sem `SQ_CANDIDATO` como bug do mesmo tipo.
- Duplicata de pessoa deve ser resolvida como problema de modelagem, nao de matching.
- Caso com dinheiro presente mas sem `SQ_CANDIDATO` nao pode ser automaticamente rebaixado sem checar a proveniencia do dado.
- O proximo gargalo estrutural real e `ingest-tse-situacao.ts`.
- `npm run check:scripts` precisa voltar a ser confiavel antes de abrir nova frente grande.

## Prioridades

### P0 - Fechar backlog real dos "vazios"

Objetivo:

- explicar e classificar os 30 sem `SQ_CANDIDATO`
- reduzir o grupo realmente vazio
- validar se o Grupo B veio de match confiavel ou de legado por nome

Entregavel:

- uma tabela ou JSON com classificacao por slug:
  - `duplicata`
  - `tem-dinheiro-sem-sq`
  - `tem-dinheiro-sem-sq-validado`
  - `tem-dinheiro-sem-sq-sob-revisao`
  - `vazio-real`
  - `ambiguo-real`

### P1 - Corrigir `ingest-tse-situacao.ts`

Objetivo:

- remover o filtro de cargo historico que hoje impede captura de CPF valida
- aumentar `cpf` no banco
- destravar melhor resolucao TSE nos proximos ciclos

Motivo:

- hoje `com_cpf = 68/144`
- esse e o principal gargalo remanescente de matching

### P2 - Restaurar `check:scripts`

Objetivo:

- impedir que erros antigos continuem mascarando regressao nova

Escopo minimo:

- isolar ou corrigir:
  - `scripts/lib/enrich-wikipedia.ts`
  - `scripts/lib/ingest-capag.ts`
  - `scripts/lib/ingest-ipea.ts`

### P3 - Registrar divida de build/SSG

Objetivo:

- documentar o timeout de rede em build como divida tecnica
- nao misturar isso com bug do pipeline

Escopo:

- registrar que rotas com `revalidate` ainda fazem fetch em build-time
- apontar opcoes futuras:
  - reduzir ou remover `generateStaticParams`
  - migrar paginas para ISR menos acoplado ao build
  - usar rota/API com cache e invalidacao explicita

## Plano de Execucao

### Step 0 - Fechar o ciclo anterior

Objetivo:

- nao iniciar o novo ciclo em cima de um fix local ainda nao consolidado

Passos:

1. revisar o diff do fix anterior
2. salvar os artefatos de validacao relevantes
3. commitar o fix anterior antes de abrir a execucao deste plano

Pre-condicao para seguir:

- o fix de `SQ_CANDIDATO`, `cargo_atual`, `audit-completude` e `ingest-tse` precisa estar commitado
- o estado de validacao antes/depois precisa estar preservado no repo

### Fase 1 - Triagem dos 30 sem `SQ_CANDIDATO`

Objetivo:

- fechar o diagnostico fino antes de mexer no pipeline de novo

Passos:

1. Gerar lista dos 30 sem `SQ_CANDIDATO`.
2. Separar duplicatas por `nome_completo`.
3. Cruzar com `completude-report.json` para identificar quem ja tem `patrimonio` ou `financiamento`.
4. Para o Grupo B, checar a origem real dos registros de `patrimonio` e `financiamento`.
5. Confirmar se os dados do Grupo B vieram de caminho confiavel:
   - `SQ_CANDIDATO` valido em algum slug correlato
   - `CPF`
   - ou outra prova forte de match correto
6. Se houver indicio de legado por nome fragil, promover o caso para revisao junto com o Grupo C.
7. Isolar o subconjunto realmente vazio.
8. Para esse subconjunto, rodar debug do resolvedor por slug e por ano.
9. Fechar uma decisao de modelagem para cada caso do Grupo A.

Saida esperada:

- backlog dividido em grupos acionaveis
- fim da confusao entre "sem SQ" e "sem dados"
- Grupo B separado em:
  - casos confiaveis
  - casos que sobem para revisao
- Grupo A com outcome definido por slug

### Fase 2 - Fix do `ingest-tse-situacao.ts`

Objetivo:

- aumentar cobertura de CPF

Mudancas propostas:

- remover o gate de cargo historico que compara `DS_CARGO` com `cargo_disputado` atual
- manter apenas salvaguardas defensivas que nao bloqueiem candidatura historica valida
- continuar usando:
  - nome
  - UF
  - preferencia por ano mais recente
  - preferencia por entrada com CPF

Salvaguardas obrigatorias:

- logar os matches candidatos antes do upsert em modo de auditoria
- comparar o resultado novo com o estado anterior para detectar explosao de matches improvaveis
- nao persistir silenciosamente se um slug passar a apontar para CPF inconsistente ou inesperado
- manter possibilidade de executar em dry-run antes de gravar

Rollback minimo:

- salvar snapshot do estado anterior dos slugs afetados antes da persistencia
- se o delta vier inconsistente, restaurar o estado anterior e marcar os casos para revisao manual

Validacao:

- rodar primeiro em dry-run
- rodar `ingest-tse-situacao.ts`
- medir delta em `com_cpf`
- reexecutar `persist-sq-candidato.ts`
- comparar se o grupo C diminuiu
- revisar matches novos antes de considerar o rollout encerrado

### Fase 3 - Repersistencia e nova auditoria

Objetivo:

- medir ganho real apos o fix de CPF

Passos:

1. Rodar `persist-sq-candidato.ts`.
2. Rodar `ingest-tse.ts` nos anos necessarios.
3. Rodar `audit-completude.ts`.
4. Atualizar a classificacao dos faltantes.
5. Se os dados no banco estiverem validados, disparar rebuild ou deploy para refletir o estado novo no site.

Saida esperada:

- menos candidatos no grupo `vazio-real`
- mais `SQ_CANDIDATO` persistido via CPF
- dados validados refletidos no site apos rebuild ou deploy

### Fase 4 - Limpeza de `check:scripts`

Objetivo:

- reativar o sinal do check global

Opcoes aceitaveis:

- corrigir os 3 arquivos com erro
- ou exclui-los temporariamente do check com comentario explicito e ticket de retorno

Regra:

- nao deixar o check quebrado sem dono

### Fase 5 - Documentacao de divida tecnica

Objetivo:

- registrar o problema de build/SSG de forma objetiva

Entregavel:

- issue ou ADR criada no repo com:
  - sintoma
  - rotas afetadas
  - causa provavel
  - opcoes de mitigacao
  - estimativa inicial de esforco

Critério de encerramento:

- issue ou ADR criada e linkada a este plano
- as 3 opcoes de mitigacao ficam registradas com tradeoff minimo

## Critérios de Sucesso

### Minimo para fechar este follow-up

- o fix anterior esta commitado antes da execucao
- os 30 sem `SQ_CANDIDATO` estao classificados em grupos corretos
- o Grupo B foi auditado em termos de proveniencia
- o Grupo A tem resolucao de modelagem definida
- o grupo `vazio-real` tem dono e criterio de resolucao
- `ingest-tse-situacao.ts` deixa de bloquear CPF por cargo historico
- `com_cpf` sobe em relacao ao baseline atual
- `npm run check:scripts` volta a ser usavel ou fica explicitamente particionado

### Ideal

- o grupo `vazio-real` cai de `16` para um numero residual pequeno
- `rui-costa-pimenta` sai do estado de perfil vazio ou fica explicitamente classificado como ausencia real de dados
- pelo menos parte dos casos prioritarios do grupo C ganha `SQ_CANDIDATO`
- o backlog remanescente vira lista curta de revisao manual, nao problema estrutural

## Ordem Recomendada

0. Commitar o fix anterior.
1. Triar os 30 sem `SQ_CANDIDATO`.
2. Corrigir `ingest-tse-situacao.ts` com dry-run e rollback.
3. Reexecutar persistencia TSE, auditoria e rebuild ou deploy.
4. Limpar `check:scripts`.
5. Documentar a divida de SSG/build.

## Decisao Pratica

O proximo ciclo deve focar em:

- backlog real dos casos ainda vazios
- captura de CPF
- restauracao de ferramentas de validacao

O item que nao deve ser tratado como encerrado sem revisao e o grupo C dos 16 ainda vazios.
