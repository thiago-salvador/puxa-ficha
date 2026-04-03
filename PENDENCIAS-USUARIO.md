# Pendências Para Confirmar Manualmente

Este arquivo existe para registrar informações simples de confirmar fora do pipeline quando a execução travar em um detalhe factual.

Regra de uso:
- eu só adiciono uma linha aqui quando a busca automática ficar inconclusiva
- você pode responder com o valor e, se possível, com a fonte
- se vier sem fonte, eu uso como pista operacional e tento confirmar depois
- se vier com fonte, eu consigo fechar o campo com muito menos risco

Prioridade:
- `P0`: bloqueia publicação ou gate factual
- `P1`: não bloqueia publicação, mas deixa warning relevante
- `P2`: melhoria editorial

Status:
- `aberto`: ainda preciso da informação
- `respondido`: você trouxe o valor, falta eu aplicar/confirmar
- `fechado`: valor aplicado e registrado

| Prioridade | Status | Slug | Nome | Estado | Partido | Campo | Valor atual no banco | Informação necessária | Motivo do bloqueio | Fontes sugeridas |
|---|---|---|---|---|---|---|---|---|---|---|
| P1 | fechado | `evandro-augusto` | Evandro Augusto | `RS` | `MISSAO` | `data_nascimento` | `null` | Data de nascimento exata | Busca encerrada por ora. O campo pode permanecer vazio até confirmação oficial futura. | perfil oficial, entrevista com idade/data, currículo/Lattes, página pública confiável |
| P2 | fechado | `orleans-brandao` | Orleans Brandao | `MA` | `MDB` | `profissao_declarada` | `Administrador` | Profissão declarada confirmada com ressalva editorial | Match forte com ressalva: imprensa de referência convergente aponta "graduado em Administracao" e "jovem administrador"; sem fonte primária institucional direta, mas consistência alta entre fontes. | Boletim do Sertao, G1, EXTRA Sao Luis |
| P2 | fechado | `lucien-rezende` | Lucien Rezende | `MS` | `PSOL` | `profissao_declarada` | `Empresario` | Profissão declarada confirmada | Match forte via O Tempo Eleições 2024 com dados do TSE. | O Tempo Eleições 2024 (dados TSE), ALEMS, perfil oficial |
| P2 | fechado | `marcelo-brigadeiro` | Marcelo Brigadeiro | `SC` | `MISSAO` | `profissao_declarada` | `Medico Veterinario` | Profissão declarada confirmada | Match forte via perfil institucional da Fesporte-SC, orgão público estadual, com formacao explicita em Medicina Veterinaria pela UFF. | Fesporte-SC, Facebook oficial |
| P2 | fechado | `joao-henrique-catan` | Joao Henrique Catan | `MS` | `NOVO` | `profissao_declarada` | `Advogado` | Profissão declarada confirmada | Match forte por convergência entre G1 MS, ALEMS, site oficial e Partido NOVO. | G1 MS, ALEMS, site oficial, Partido NOVO |
| P2 | fechado | `alysson-bezerra` | Alysson Bezerra | `RN` | `UNIAO` | `profissao_declarada` | `Servidor Publico Federal` | Profissão declarada confirmada | Match forte via O Tempo Eleições 2024 com dados do TSE. | O Tempo Eleições 2024 (dados TSE), perfil oficial |
| P2 | fechado | `andre-kamai` | Andre Kamai | `AC` | `PT` | `profissao_declarada` | `Sociologo` | Profissão declarada confirmada | Match forte via O Tempo Eleições 2024 com dados do TSE e confirmação institucional na Câmara. | O Tempo Eleições 2024 (dados TSE), SAPL Camara de Rio Branco |

## Como responder

Formato ideal:

```md
Slug: evandro-augusto
Campo: data_nascimento
Valor: 1982-05-17
Fonte: https://exemplo.com/perfil-oficial
Observação: menciona a data explicitamente
```

Formato mínimo:

```md
Slug: evandro-augusto
Campo: data_nascimento
Valor: 17/05/1982
```

## Histórico de uso

- 2026-04-02: arquivo criado durante a execução do plano de auditoria total 144/144
- 2026-04-02: `evandro-augusto.data_nascimento` deixou de bloquear o audit; pendência encerrada por ora e mantida como possível confirmação futura

## Fila congelada por política editorial

Decisão vigente:
- manter oculto indefinidamente até confirmação forte do próximo cargo realmente disputado
- se a corrida real passar a ser `Senador`, manter oculto até decisão editorial explícita sobre incluir ou não senadores no site

Os casos abaixo não estão mais em backlog ativo de promoção. Eles permanecem ocultos por escolha editorial, não por falta de código.

| Prioridade | Status | Slug | Tipo | Condição para reabrir | Motivo |
|---|---|---|---|---|---|
| P0 | congelado | `arnaldinho-borgo` | escopo | confirmação forte da corrida principal | Cobertura recente indica retirada da disputa principal em 2026. |
| P0 | congelado | `silvio-mendes` | escopo | confirmação forte da corrida principal | Cobertura recente aponta que não disputará o governo do PI em 2026. |
| P0 | congelado | `sergio-vidigal` | escopo | confirmação forte da corrida principal | A cobertura recente enfraquece a tese de candidatura própria. |
| P0 | congelado | `gilson-machado` | cargo_disputado | confirmação forte do cargo real; se Senado, continua oculto | A corrida tratada na imprensa recente parece ser outra, não governo estadual. |
| P0 | congelado | `garotinho` | cargo_disputado | confirmação forte do cargo real | A movimentação recente não fecha governo do RJ com segurança. |
| P0 | congelado | `da-vitoria` | cargo_disputado | confirmação forte do cargo real; se Senado, continua oculto | A cobertura recente do ES oscila entre Senado e outras composições. |
| P0 | congelado | `washington-reis` | cargo_disputado | confirmação forte do cargo real; se Senado, continua oculto | A cobertura do RJ está ambígua sobre a corrida real dele em 2026. |
| P0 | congelado | `andre-do-prado` | cargo_disputado | confirmação forte do cargo real | Há sinais de composição, mas não prova sólida de cabeça de chapa. |
| P0 | congelado | `marcio-franca` | cargo_disputado | confirmação forte do cargo real; se Senado, continua oculto | O cargo atual é claro, mas a corrida de 2026 segue ambígua. |
| P1 | congelado | `arthur-henrique` | partido/corrida | confirmação forte de partido atual e corrida | Fontes abertas aparecem conflitantes sobre partido e projeção eleitoral. |
| P1 | congelado | `rodrigo-bacellar` | corrida | confirmação forte da corrida principal | Cobertura recente mistura crise institucional e ambição eleitoral. |
| P1 | congelado | `tarcisio-motta` | cargo_disputado | confirmação forte do cargo real; se Senado, continua oculto | Há prova do mandato atual, mas não de candidatura consolidada. |
| P1 | congelado | `paulo-hartung` | âncora | encontrar âncora oficial mínima recente | Sem âncora oficial já amarrada no cadastro. |
| P1 | congelado | `simao-jatene` | âncora | encontrar âncora oficial mínima recente | Sem âncora oficial já amarrada no cadastro. |
| P1 | congelado | `evandro-augusto` | âncora | confirmar âncora mínima de identidade/campanha | O perfil segue sem âncora oficial suficiente. |
